/**
 * RankForge Worker — SSRF protection for every outbound crawl request.
 * Resolves DNS and rejects any non-public address, so a public-looking hostname
 * pointing at an internal service is blocked as well as a literal private IP.
 * Mirrors apps/api/src/lib/ssrf.ts; each app builds from its own Docker context.
 *
 * Residual risk: fetch resolves the name again when it connects, so DNS rebinding
 * between this check and the connection is not closed here. Production must also
 * deny the Worker's egress to private ranges at the network layer.
 */

import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

const BLOCKED_IPV4_CIDRS: Array<[string, number]> = [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16],
  ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.88.99.0', 24], ['192.168.0.0', 16],
  ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4],
];

function ipv4ToInt(ip: string): number {
  return ip.split('.').reduce((acc, part) => ((acc << 8) | Number(part)) >>> 0, 0);
}

function isBlockedIpv4(ip: string): boolean {
  const value = ipv4ToInt(ip);
  return BLOCKED_IPV4_CIDRS.some(([network, prefix]) => {
    const mask = (~0 << (32 - prefix)) >>> 0;
    return (value & mask) >>> 0 === (ipv4ToInt(network) & mask) >>> 0;
  });
}

/** Expands an IPv6 literal to its eight hextets, including embedded IPv4 forms. */
function expandIpv6(ip: string): number[] {
  let text = ip.toLowerCase().split('%')[0];
  const dotted = text.match(/(\d+\.\d+\.\d+\.\d+)$/);
  if (dotted) {
    const v = ipv4ToInt(dotted[1]);
    text = text.slice(0, -dotted[1].length) + `${(v >>> 16).toString(16)}:${(v & 0xffff).toString(16)}`;
  }
  const [head, tail] = text.split('::');
  const left = head ? head.split(':') : [];
  const right = tail ? tail.split(':') : [];
  const zeros = text.includes('::') ? 8 - left.length - right.length : 0;
  return [...left, ...Array(zeros).fill('0'), ...right].map((part) => parseInt(part, 16));
}

function isBlockedIpv6(ip: string): boolean {
  const h = expandIpv6(ip);
  const embedded = () => `${h[6] >>> 8}.${h[6] & 255}.${h[7] >>> 8}.${h[7] & 255}`;
  if (h.slice(0, 7).every((x) => x === 0) && h[7] <= 1) return true;                         // :: and ::1
  if (h.slice(0, 5).every((x) => x === 0) && (h[5] === 0xffff || h[5] === 0)) return isBlockedIpv4(embedded()); // mapped / compatible
  if (h[0] === 0x64 && h[1] === 0xff9b) return isBlockedIpv4(embedded());                    // NAT64
  if (h[0] === 0x2002) return isBlockedIpv4(`${h[1] >>> 8}.${h[1] & 255}.${h[2] >>> 8}.${h[2] & 255}`); // 6to4
  if ((h[0] & 0xfe00) === 0xfc00) return true;                                               // fc00::/7
  if ((h[0] & 0xffc0) === 0xfe80) return true;                                               // fe80::/10
  if ((h[0] & 0xff00) === 0xff00) return true;                                               // ff00::/8
  return h[0] === 0x2001 && h[1] === 0xdb8;                                                  // documentation
}

export function isBlockedIp(ip: string): boolean {
  const version = isIP(ip);
  if (version === 4) return isBlockedIpv4(ip);
  if (version === 6) return isBlockedIpv6(ip);
  return true;
}

function isBlockedHostname(hostname: string): boolean {
  const lower = hostname.toLowerCase().replace(/\.$/, '');
  return lower === 'localhost' || lower.endsWith('.localhost') || lower.endsWith('.internal')
    || lower.endsWith('.local') || lower === 'instance-data';
}

export async function validateUrlForSSRF(url: string): Promise<void> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`Invalid URL: ${url} — VALIDATION_ERROR`);
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error(`Blocked protocol: ${parsed.protocol} — SECURITY_ERROR`);
  }
  const hostname = parsed.hostname.replace(/^\[|\]$/g, '');
  if (isBlockedHostname(hostname)) {
    throw new Error(`Blocked hostname: ${hostname} — SECURITY_ERROR`);
  }
  if (isIP(hostname)) {
    if (isBlockedIp(hostname)) throw new Error(`Blocked IP: ${hostname} — SECURITY_ERROR`);
    return;
  }
  const addresses = await lookup(hostname, { all: true });
  if (addresses.length === 0) throw new Error(`DNS returned no address for ${hostname}`);
  for (const { address } of addresses) {
    if (isBlockedIp(address)) {
      throw new Error(`Hostname ${hostname} resolves to a blocked address — SECURITY_ERROR`);
    }
  }
}

/**
 * RankForge — SSRF Protection
 * Production-grade SSRF defense for crawler and any outbound HTTP
 *
 * Blocks:
 * - Private IPs: 127.0.0.0/8, 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16
 * - Link-local: 169.254.0.0/16 (includes AWS metadata 169.254.169.254)
 * - IPv6: ::1, fc00::/7, fe80::/10
 * - Reserved ranges, multicast, etc.
 *
 * Validates:
 * - DNS resolution before connect
 * - IP after DNS
 * - Re-validates after redirects
 * - Protocol whitelist (http/https only)
 */
import { lookup } from 'dns/promises';
import { isIP } from 'net';
const BLOCKED_RANGES = [
    { cidr: '127.0.0.0/8', description: 'Loopback' },
    { cidr: '10.0.0.0/8', description: 'Private Class A' },
    { cidr: '172.16.0.0/12', description: 'Private Class B' },
    { cidr: '192.168.0.0/16', description: 'Private Class C' },
    { cidr: '169.254.0.0/16', description: 'Link-local (AWS metadata)' },
    { cidr: '0.0.0.0/8', description: 'Software' },
    { cidr: '100.64.0.0/10', description: 'CGNAT' },
    { cidr: '192.0.2.0/24', description: 'TEST-NET-1' },
    { cidr: '192.88.99.0/24', description: '6to4 relay' },
    { cidr: '198.18.0.0/15', description: 'Benchmark testing' },
    { cidr: '198.51.100.0/24', description: 'TEST-NET-2' },
    { cidr: '203.0.113.0/24', description: 'TEST-NET-3' },
    { cidr: '224.0.0.0/4', description: 'Multicast' },
    { cidr: '240.0.0.0/4', description: 'Reserved' },
];
const BLOCKED_IPV6_RANGES = [
    { cidr: '::1/128', description: 'IPv6 Loopback' },
    { cidr: 'fc00::/7', description: 'IPv6 Unique Local' },
    { cidr: 'fe80::/10', description: 'IPv6 Link-local' },
    { cidr: '::/128', description: 'Unspecified' },
    { cidr: '::ffff:0:0/96', description: 'IPv4-mapped' },
    { cidr: 'ff00::/8', description: 'Multicast' },
];
function ipToInt(ip) {
    const parts = ip.split('.').map(Number);
    return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}
function parseCidr(cidr) {
    const [ip, prefixStr] = cidr.split('/');
    const prefix = parseInt(prefixStr, 10);
    const ipInt = ipToInt(ip);
    const mask = prefix === 0 ? 0 : (~0 << (32 - prefix)) >>> 0;
    const network = ipInt & mask;
    return { network, mask };
}
function isIpInCidr(ip, cidr) {
    try {
        const { network, mask } = parseCidr(cidr);
        const ipInt = ipToInt(ip);
        return (ipInt & mask) === network;
    }
    catch {
        return false;
    }
}
function isIPv6Blocked(ip) {
    const lower = ip.toLowerCase();
    // Simple checks for IPv6 blocked ranges
    if (lower === '::1' || lower === '::')
        return true;
    if (lower.startsWith('fc') || lower.startsWith('fd'))
        return true; // fc00::/7
    if (lower.startsWith('fe80:'))
        return true;
    if (lower.startsWith('ff'))
        return true; // multicast
    if (lower.startsWith('::ffff:')) {
        // IPv4-mapped, check inner IPv4
        const ipv4 = lower.split(':').pop();
        if (ipv4 && isIP(ipv4) === 4) {
            return isIPv4Blocked(ipv4);
        }
        return true;
    }
    return false;
}
export function isIPv4Blocked(ip) {
    if (isIP(ip) !== 4)
        return false;
    for (const range of BLOCKED_RANGES) {
        if (isIpInCidr(ip, range.cidr)) {
            return true;
        }
    }
    return false;
}
export function isPrivateIP(ip) {
    const version = isIP(ip);
    if (version === 4) {
        return isIPv4Blocked(ip);
    }
    if (version === 6) {
        return isIPv6Blocked(ip);
    }
    return true; // Unknown = block
}
export class SSRFError extends Error {
    blockedIP;
    constructor(message, blockedIP) {
        super(message);
        this.blockedIP = blockedIP;
        this.name = 'SSRFError';
    }
}
/**
 * Validate URL before fetching — protocol, hostname, IP
 */
export async function validateUrlForSSRF(inputUrl) {
    let parsed;
    try {
        parsed = new URL(inputUrl);
    }
    catch {
        throw new SSRFError(`Invalid URL: ${inputUrl}`);
    }
    // Protocol whitelist
    if (!['http:', 'https:'].includes(parsed.protocol)) {
        throw new SSRFError(`Blocked protocol: ${parsed.protocol}. Only http/https allowed`);
    }
    const hostname = parsed.hostname;
    // Block obvious private hostnames
    const lowerHost = hostname.toLowerCase();
    if (['localhost', 'metadata.google.internal'].includes(lowerHost)) {
        throw new SSRFError(`Blocked hostname: ${hostname}`);
    }
    if (lowerHost.endsWith('.internal') || lowerHost.endsWith('.local')) {
        throw new SSRFError(`Blocked internal hostname: ${hostname}`);
    }
    // If hostname is already an IP, check directly
    const ipVersion = isIP(hostname);
    if (ipVersion !== 0) {
        if (isPrivateIP(hostname)) {
            throw new SSRFError(`Blocked private IP: ${hostname}`, hostname);
        }
        return { hostname, ips: [hostname] };
    }
    // DNS resolution and validation
    try {
        const results = await lookup(hostname, { all: true });
        const ips = results.map(r => r.address);
        if (ips.length === 0) {
            throw new SSRFError(`DNS resolution failed for ${hostname}`);
        }
        for (const ip of ips) {
            if (isPrivateIP(ip)) {
                throw new SSRFError(`DNS resolved to private IP ${ip} for ${hostname}`, ip);
            }
        }
        return { hostname, ips };
    }
    catch (error) {
        if (error instanceof SSRFError)
            throw error;
        throw new SSRFError(`DNS lookup failed for ${hostname}: ${error instanceof Error ? error.message : String(error)}`);
    }
}
/**
 * Validate redirect target — re-validate IP after redirect
 */
export async function validateRedirectUrl(originalUrl, redirectUrl) {
    // Resolve relative redirects
    let absoluteRedirect;
    try {
        absoluteRedirect = new URL(redirectUrl, originalUrl).toString();
    }
    catch {
        throw new SSRFError(`Invalid redirect URL: ${redirectUrl}`);
    }
    await validateUrlForSSRF(absoluteRedirect);
}
export async function safeFetch(url, options = {}) {
    const { method = 'GET', headers = {}, timeout = 30000, maxRedirects = 5, maxResponseSize = 10 * 1024 * 1024, // 10MB
    userAgent = 'RankForge/1.0 (+https://rankforge.io/bot)', } = options;
    // Initial validation
    await validateUrlForSSRF(url);
    let currentUrl = url;
    let redirectCount = 0;
    while (redirectCount <= maxRedirects) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);
        try {
            const response = await fetch(currentUrl, {
                method,
                headers: {
                    'User-Agent': userAgent,
                    ...headers,
                },
                redirect: 'manual',
                signal: controller.signal,
            });
            clearTimeout(timeoutId);
            // Handle redirects manually with re-validation
            if (response.status >= 300 && response.status < 400) {
                const location = response.headers.get('location');
                if (!location) {
                    return response;
                }
                redirectCount++;
                if (redirectCount > maxRedirects) {
                    throw new SSRFError(`Too many redirects (${maxRedirects})`);
                }
                const nextUrl = new URL(location, currentUrl).toString();
                await validateRedirectUrl(currentUrl, nextUrl);
                currentUrl = nextUrl;
                continue;
            }
            // Check content length
            const contentLength = response.headers.get('content-length');
            if (contentLength && parseInt(contentLength, 10) > maxResponseSize) {
                throw new SSRFError(`Response too large: ${contentLength} bytes`);
            }
            return response;
        }
        catch (error) {
            clearTimeout(timeoutId);
            if (error instanceof SSRFError)
                throw error;
            if (error instanceof Error && error.name === 'AbortError') {
                throw new SSRFError(`Request timeout after ${timeout}ms for ${currentUrl}`);
            }
            throw error;
        }
    }
    throw new SSRFError(`Too many redirects for ${url}`);
}
//# sourceMappingURL=ssrf.js.map
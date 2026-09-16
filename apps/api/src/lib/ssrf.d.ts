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
export declare function isIPv4Blocked(ip: string): boolean;
export declare function isPrivateIP(ip: string): boolean;
export declare class SSRFError extends Error {
    readonly blockedIP?: string;
    constructor(message: string, blockedIP?: string);
}
/**
 * Validate URL before fetching — protocol, hostname, IP
 */
export declare function validateUrlForSSRF(inputUrl: string): Promise<{
    hostname: string;
    ips: string[];
}>;
/**
 * Validate redirect target — re-validate IP after redirect
 */
export declare function validateRedirectUrl(originalUrl: string, redirectUrl: string): Promise<void>;
/**
 * Safe fetch with SSRF protection
 */
export interface SafeFetchOptions {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    timeout?: number;
    maxRedirects?: number;
    maxResponseSize?: number;
    userAgent?: string;
}
export declare function safeFetch(url: string, options?: SafeFetchOptions): Promise<Response>;

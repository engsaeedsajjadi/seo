/**
 * RankForge — Production Crawler
 * Real HTTP crawler with SSRF protection, robots.txt, sitemap.xml, concurrency control
 */
export interface CrawlOptions {
    maxPages?: number;
    maxDepth?: number;
    concurrency?: number;
    delay?: number;
    userAgent?: string;
    respectRobotsTxt?: boolean;
    followSitemaps?: boolean;
    includeSubdomains?: boolean;
    timeout?: number;
    organizationId: string;
    projectId: string;
}
export interface CrawlPage {
    url: string;
    normalizedUrl: string;
    statusCode: number;
    contentType?: string;
    title?: string;
    metaDescription?: string;
    h1?: string;
    h2: string[];
    h3: string[];
    wordCount: number;
    responseTime: number;
    isIndexable: boolean;
    canonical?: string;
    robotsMeta?: string;
    hreflang: Array<{
        lang: string;
        href: string;
    }>;
    structuredData: any[];
    images: Array<{
        src: string;
        alt?: string;
        width?: number;
        height?: number;
    }>;
    links: Array<{
        href: string;
        text: string;
        isInternal: boolean;
        rel?: string;
    }>;
    headers: Record<string, string>;
    depth: number;
    parentUrl?: string;
}
export interface CrawlResult {
    pages: CrawlPage[];
    sitemapUrls: string[];
    robotsTxt?: string;
    errors: Array<{
        url: string;
        error: string;
    }>;
    stats: {
        totalDiscovered: number;
        crawled: number;
        failed: number;
        duration: number;
    };
}
export declare class Crawler {
    private options;
    private visited;
    private queue;
    private pages;
    private errors;
    private robotsRules;
    private robotsContent?;
    private sitemapUrls;
    constructor(options: CrawlOptions);
    crawl(startUrl: string): Promise<CrawlResult>;
    private crawlPage;
}

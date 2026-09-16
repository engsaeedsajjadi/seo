/**
 * RankForge — SEO Audit Rule Engine
 * Modular rules with severity, category, evidence
 */
export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'notice';
export type Category = 'crawlability' | 'indexability' | 'metadata' | 'content' | 'links' | 'images' | 'performance' | 'security' | 'structured_data' | 'international';
export interface AuditRule {
    id: string;
    name: string;
    description: string;
    category: Category;
    severity: Severity;
    documentationUrl?: string;
    check: (context: AuditContext) => AuditFinding | null;
}
export interface AuditContext {
    pages: Array<{
        url: string;
        statusCode: number;
        title?: string;
        metaDescription?: string;
        h1?: string;
        h2: string[];
        wordCount: number;
        isIndexable: boolean;
        canonical?: string;
        robotsMeta?: string;
        structuredData: any[];
        images: Array<{
            src: string;
            alt?: string;
        }>;
        links: Array<{
            href: string;
            isInternal: boolean;
            rel?: string;
        }>;
        responseTime: number;
        headers: Record<string, string>;
    }>;
    domain: string;
    sitemapUrls: string[];
    robotsTxt?: string;
}
export interface AuditFinding {
    ruleId: string;
    severity: Severity;
    category: Category;
    title: string;
    description: string;
    evidence: Record<string, any>;
    affectedUrls: string[];
    recommendation: string;
    documentationUrl?: string;
}
export declare const missingTitleRule: AuditRule;
export declare const duplicateTitleRule: AuditRule;
export declare const titleTooLongRule: AuditRule;
export declare const missingMetaDescriptionRule: AuditRule;
export declare const missingH1Rule: AuditRule;
export declare const thinContentRule: AuditRule;
export declare const imagesWithoutAltRule: AuditRule;
export declare const brokenLinksRule: AuditRule;
export declare const noindexRule: AuditRule;
export declare const missingCanonicalRule: AuditRule;
export declare const slowPagesRule: AuditRule;
export declare const missingStructuredDataRule: AuditRule;
export declare const insecureLinksRule: AuditRule;
export declare const ALL_RULES: AuditRule[];
export declare function runAudit(context: AuditContext): AuditFinding[];
export declare function calculateSeoScore(findings: AuditFinding[]): {
    overall: number;
    categories: Record<Category, number>;
};

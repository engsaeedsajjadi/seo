/**
 * RankForge — SEO Audit Rule Engine
 * Modular rules with severity, category, evidence
 */
// Individual Rules
export const missingTitleRule = {
    id: 'missing_title',
    name: 'Missing Title Tag',
    description: 'Pages without a title tag cannot rank effectively',
    category: 'metadata',
    severity: 'critical',
    documentationUrl: 'https://developers.google.com/search/docs/crawling-indexing/special-tags',
    check: (ctx) => {
        const affected = ctx.pages.filter(p => !p.title || p.title.trim().length === 0);
        if (affected.length === 0)
            return null;
        return {
            ruleId: 'missing_title',
            severity: 'critical',
            category: 'metadata',
            title: 'Missing Title Tag',
            description: `${affected.length} page(s) are missing a title tag`,
            evidence: { count: affected.length, examples: affected.slice(0, 3).map(p => p.url) },
            affectedUrls: affected.map(p => p.url),
            recommendation: 'Add unique, descriptive title tags (50-60 characters) to all pages',
            documentationUrl: 'https://developers.google.com/search/docs/crawling-indexing/special-tags',
        };
    },
};
export const duplicateTitleRule = {
    id: 'duplicate_title',
    name: 'Duplicate Title Tags',
    description: 'Duplicate titles confuse search engines',
    category: 'metadata',
    severity: 'high',
    check: (ctx) => {
        const titleMap = new Map();
        ctx.pages.forEach(p => {
            if (p.title) {
                const normalized = p.title.toLowerCase().trim();
                if (!titleMap.has(normalized))
                    titleMap.set(normalized, []);
                titleMap.get(normalized).push(p.url);
            }
        });
        const duplicates = Array.from(titleMap.entries()).filter(([_, urls]) => urls.length > 1);
        if (duplicates.length === 0)
            return null;
        return {
            ruleId: 'duplicate_title',
            severity: 'high',
            category: 'metadata',
            title: 'Duplicate Title Tags',
            description: `${duplicates.length} duplicate title(s) found across ${duplicates.reduce((acc, [_, urls]) => acc + urls.length, 0)} pages`,
            evidence: { duplicates: duplicates.slice(0, 5).map(([title, urls]) => ({ title, urls: urls.slice(0, 3) })) },
            affectedUrls: duplicates.flatMap(([_, urls]) => urls),
            recommendation: 'Make each title tag unique and descriptive',
        };
    },
};
export const titleTooLongRule = {
    id: 'title_too_long',
    name: 'Title Too Long',
    description: 'Titles longer than 60 characters may be truncated',
    category: 'metadata',
    severity: 'medium',
    check: (ctx) => {
        const affected = ctx.pages.filter(p => p.title && p.title.length > 60);
        if (affected.length === 0)
            return null;
        return {
            ruleId: 'title_too_long',
            severity: 'medium',
            category: 'metadata',
            title: 'Title Tag Too Long',
            description: `${affected.length} title(s) exceed 60 characters`,
            evidence: { count: affected.length, examples: affected.slice(0, 3).map(p => ({ url: p.url, length: p.title.length, title: p.title.slice(0, 100) })) },
            affectedUrls: affected.map(p => p.url),
            recommendation: 'Keep titles under 60 characters to avoid truncation in SERPs',
        };
    },
};
export const missingMetaDescriptionRule = {
    id: 'missing_meta_description',
    name: 'Missing Meta Description',
    description: 'Meta descriptions improve CTR',
    category: 'metadata',
    severity: 'medium',
    check: (ctx) => {
        const affected = ctx.pages.filter(p => !p.metaDescription);
        if (affected.length === 0)
            return null;
        return {
            ruleId: 'missing_meta_description',
            severity: 'medium',
            category: 'metadata',
            title: 'Missing Meta Description',
            description: `${affected.length} page(s) missing meta description`,
            evidence: { count: affected.length },
            affectedUrls: affected.map(p => p.url),
            recommendation: 'Add compelling meta descriptions (150-160 chars) with target keywords',
        };
    },
};
export const missingH1Rule = {
    id: 'missing_h1',
    name: 'Missing H1',
    description: 'Every page should have one H1',
    category: 'content',
    severity: 'high',
    check: (ctx) => {
        const affected = ctx.pages.filter(p => !p.h1);
        if (affected.length === 0)
            return null;
        return {
            ruleId: 'missing_h1',
            severity: 'high',
            category: 'content',
            title: 'Missing H1 Heading',
            description: `${affected.length} page(s) missing H1`,
            evidence: { count: affected.length },
            affectedUrls: affected.map(p => p.url),
            recommendation: 'Add a single, descriptive H1 to each page containing primary keyword',
        };
    },
};
export const thinContentRule = {
    id: 'thin_content',
    name: 'Thin Content',
    description: 'Pages with low word count may not rank',
    category: 'content',
    severity: 'medium',
    check: (ctx) => {
        const affected = ctx.pages.filter(p => p.wordCount < 300 && p.statusCode === 200 && p.isIndexable);
        if (affected.length === 0)
            return null;
        return {
            ruleId: 'thin_content',
            severity: 'medium',
            category: 'content',
            title: 'Thin Content',
            description: `${affected.length} page(s) have less than 300 words`,
            evidence: { count: affected.length, examples: affected.slice(0, 3).map(p => ({ url: p.url, words: p.wordCount })) },
            affectedUrls: affected.map(p => p.url),
            recommendation: 'Expand thin pages to at least 300-500 words of valuable content',
        };
    },
};
export const imagesWithoutAltRule = {
    id: 'images_without_alt',
    name: 'Images Without Alt Text',
    description: 'Alt text helps SEO and accessibility',
    category: 'images',
    severity: 'low',
    check: (ctx) => {
        const pagesWithMissingAlt = [];
        let totalMissing = 0;
        ctx.pages.forEach(p => {
            const missing = p.images.filter(img => !img.alt || img.alt.trim() === '').length;
            if (missing > 0) {
                pagesWithMissingAlt.push(p.url);
                totalMissing += missing;
            }
        });
        if (pagesWithMissingAlt.length === 0)
            return null;
        return {
            ruleId: 'images_without_alt',
            severity: 'low',
            category: 'images',
            title: 'Images Without Alt Text',
            description: `${totalMissing} image(s) missing alt text across ${pagesWithMissingAlt.length} page(s)`,
            evidence: { totalMissing, pagesAffected: pagesWithMissingAlt.length },
            affectedUrls: pagesWithMissingAlt,
            recommendation: 'Add descriptive alt text to all images for accessibility and SEO',
        };
    },
};
export const brokenLinksRule = {
    id: 'broken_links',
    name: 'Broken Internal Links',
    description: 'Broken links hurt UX and crawlability',
    category: 'links',
    severity: 'high',
    check: (ctx) => {
        // In real crawl, we'd have status codes for linked pages. For now, detect placeholder.
        // This rule will be enriched by actual crawl data where we track 4xx
        const brokenPages = ctx.pages.filter(p => p.statusCode >= 400);
        if (brokenPages.length === 0)
            return null;
        return {
            ruleId: 'broken_links',
            severity: 'high',
            category: 'links',
            title: 'Broken Pages (4xx/5xx)',
            description: `${brokenPages.length} page(s) return error status`,
            evidence: { examples: brokenPages.slice(0, 5).map(p => ({ url: p.url, status: p.statusCode })) },
            affectedUrls: brokenPages.map(p => p.url),
            recommendation: 'Fix or redirect broken URLs, update internal links',
        };
    },
};
export const noindexRule = {
    id: 'noindex_pages',
    name: 'Noindex Pages',
    description: 'Pages with noindex will not appear in search',
    category: 'indexability',
    severity: 'notice',
    check: (ctx) => {
        const affected = ctx.pages.filter(p => !p.isIndexable);
        if (affected.length === 0)
            return null;
        return {
            ruleId: 'noindex_pages',
            severity: 'notice',
            category: 'indexability',
            title: 'Noindex Pages',
            description: `${affected.length} page(s) are noindex`,
            evidence: { count: affected.length },
            affectedUrls: affected.map(p => p.url),
            recommendation: 'Review noindex pages — ensure important pages are indexable',
        };
    },
};
export const missingCanonicalRule = {
    id: 'missing_canonical',
    name: 'Missing Canonical',
    description: 'Canonical tags prevent duplicate content issues',
    category: 'indexability',
    severity: 'low',
    check: (ctx) => {
        const affected = ctx.pages.filter(p => !p.canonical && p.isIndexable);
        if (affected.length === 0)
            return null;
        return {
            ruleId: 'missing_canonical',
            severity: 'low',
            category: 'indexability',
            title: 'Missing Canonical Tag',
            description: `${affected.length} indexable page(s) missing canonical`,
            evidence: { count: affected.length },
            affectedUrls: affected.map(p => p.url),
            recommendation: 'Add self-referencing canonical tags to all indexable pages',
        };
    },
};
export const slowPagesRule = {
    id: 'slow_pages',
    name: 'Slow Pages',
    description: 'Slow pages hurt rankings and UX',
    category: 'performance',
    severity: 'medium',
    check: (ctx) => {
        const affected = ctx.pages.filter(p => p.responseTime > 2000);
        if (affected.length === 0)
            return null;
        return {
            ruleId: 'slow_pages',
            severity: 'medium',
            category: 'performance',
            title: 'Slow Response Time',
            description: `${affected.length} page(s) respond slower than 2s`,
            evidence: { examples: affected.slice(0, 5).map(p => ({ url: p.url, time: p.responseTime })) },
            affectedUrls: affected.map(p => p.url),
            recommendation: 'Optimize server response time, enable caching, compress assets',
        };
    },
};
export const missingStructuredDataRule = {
    id: 'missing_structured_data',
    name: 'Missing Structured Data',
    description: 'Structured data enhances SERP appearance',
    category: 'structured_data',
    severity: 'low',
    check: (ctx) => {
        const affected = ctx.pages.filter(p => p.structuredData.length === 0 && p.isIndexable && p.wordCount > 200);
        if (affected.length === 0)
            return null;
        return {
            ruleId: 'missing_structured_data',
            severity: 'low',
            category: 'structured_data',
            title: 'Missing Structured Data',
            description: `${affected.length} content page(s) without structured data`,
            evidence: { count: affected.length },
            affectedUrls: affected.map(p => p.url),
            recommendation: 'Add JSON-LD structured data (Article, Product, FAQ, Breadcrumb, etc)',
        };
    },
};
export const insecureLinksRule = {
    id: 'insecure_links',
    name: 'Insecure HTTP Links',
    description: 'HTTPS is a ranking factor',
    category: 'security',
    severity: 'medium',
    check: (ctx) => {
        const insecurePages = ctx.pages.filter(p => {
            const hasHttpLinks = p.links.some(l => l.href.startsWith('http://') && l.isInternal);
            return hasHttpLinks;
        });
        if (insecurePages.length === 0)
            return null;
        return {
            ruleId: 'insecure_links',
            severity: 'medium',
            category: 'security',
            title: 'Insecure Internal HTTP Links',
            description: `${insecurePages.length} page(s) contain internal HTTP links`,
            evidence: { count: insecurePages.length },
            affectedUrls: insecurePages.map(p => p.url),
            recommendation: 'Update all internal links to HTTPS',
        };
    },
};
// All rules registry
export const ALL_RULES = [
    missingTitleRule,
    duplicateTitleRule,
    titleTooLongRule,
    missingMetaDescriptionRule,
    missingH1Rule,
    thinContentRule,
    imagesWithoutAltRule,
    brokenLinksRule,
    noindexRule,
    missingCanonicalRule,
    slowPagesRule,
    missingStructuredDataRule,
    insecureLinksRule,
];
export function runAudit(context) {
    const findings = [];
    for (const rule of ALL_RULES) {
        try {
            const finding = rule.check(context);
            if (finding)
                findings.push(finding);
        }
        catch (error) {
            console.error(`Audit rule ${rule.id} failed:`, error);
        }
    }
    return findings;
}
export function calculateSeoScore(findings) {
    // Transparent scoring: start at 100, deduct based on severity
    let score = 100;
    const categoryScores = {};
    const deductions = {
        critical: 10,
        high: 5,
        medium: 2,
        low: 1,
        notice: 0,
    };
    for (const finding of findings) {
        const deduction = deductions[finding.severity] * Math.min(finding.affectedUrls.length, 5); // cap per rule
        score -= deduction;
        if (!categoryScores[finding.category]) {
            categoryScores[finding.category] = { total: 100, count: 0 };
        }
        categoryScores[finding.category].total -= deduction;
        categoryScores[finding.category].count++;
    }
    score = Math.max(0, Math.min(100, score));
    const categories = {};
    for (const [cat, data] of Object.entries(categoryScores)) {
        categories[cat] = Math.max(0, Math.min(100, data.total));
    }
    // Ensure all categories have at least a default
    const allCategories = ['crawlability', 'indexability', 'metadata', 'content', 'links', 'images', 'performance', 'security', 'structured_data', 'international'];
    for (const cat of allCategories) {
        if (!(cat in categories))
            categories[cat] = 100;
    }
    return { overall: Math.round(score), categories: categories };
}
//# sourceMappingURL=audit.js.map
/**
 * RankForge — Configuration
 * Fail-fast for missing secrets in production
 */
export declare function getEnv(name: string, required?: boolean, defaultValue?: string): string;
export declare function requireEnv(name: string): string;
export declare const config: {
    nodeEnv: string;
    port: number;
    appUrl: string;
    corsOrigins: string[];
    database: {
        url: string;
        password: string;
    };
    redis: {
        url: string;
    };
    auth: {
        jwtSecret: string;
        encryptionKey: string;
    };
    providers: {
        dataforseo: {
            login: string;
            password: string;
        };
        serpapi: string;
        openai: string;
        anthropic: string;
        googleAi: string;
        openrouter: string;
        perplexity: string;
        google: {
            clientId: string;
            clientSecret: string;
        };
        pagespeed: string;
        stripe: {
            secretKey: string;
            webhookSecret: string;
            publishableKey: string;
        };
        s3: {
            endpoint: string;
            accessKey: string;
            secretKey: string;
            bucket: string;
            region: string;
        };
    };
    worker: {
        concurrency: number;
        timeout: number;
    };
    crawler: {
        maxConcurrency: number;
        defaultDelay: number;
        userAgent: string;
        timeout: number;
    };
    rateLimit: {
        windowMs: number;
        maxRequests: number;
    };
    features: {
        aiEnabled: boolean;
        geoEnabled: boolean;
        aeoEnabled: boolean;
        advancedCrawling: boolean;
        mcpEnabled: boolean;
    };
    isProduction: boolean;
    isDevelopment: boolean;
};
export declare function isProviderConfigured(provider: keyof typeof config.providers): boolean;

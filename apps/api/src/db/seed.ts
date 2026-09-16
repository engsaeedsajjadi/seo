/**
 * RankForge — Database Seeder
 * Seeds initial data: plans, audit rules, feature flags
 * Executable via: npm run db:seed
 */

import { query, getPool, closePool } from './client.js';

async function seed() {
  console.log('🌱 Starting database seeding...');

  try {
    const pool = getPool();
    await pool.query('SELECT 1');
    console.log('✅ Database connection OK');

    // Seed plans
    console.log('📦 Seeding plans...');
    await query(`
      INSERT INTO plans (id, name, description, price_monthly_cents, price_annual_cents, limits, features, is_active)
      VALUES 
        ('FREE', 'Free', 'Perfect for trying RankForge', 0, 0, 
         '{"projects": 1, "keywords": 10, "crawledPages": 100, "rankChecks": 100, "aiOperations": 10, "reports": 5, "users": 1, "apiRequests": 100, "competitors": 2, "backlinks": 100, "crawlDepth": 2, "historyMonths": 1}',
         '["1 Project", "10 Keywords", "Basic Crawl", "Community Support"]', true),
        ('STARTER', 'Starter', 'For small websites and bloggers', 2900, 29000,
         '{"projects": 3, "keywords": 100, "crawledPages": 1000, "rankChecks": 1000, "aiOperations": 100, "reports": 20, "users": 2, "apiRequests": 1000, "competitors": 5, "backlinks": 1000, "crawlDepth": 3, "historyMonths": 3}',
         '["3 Projects", "100 Keywords", "GSC Integration", "Email Reports", "API Access"]', true),
        ('PRO', 'Professional', 'For growing businesses and SEO pros', 7900, 79000,
         '{"projects": 10, "keywords": 500, "crawledPages": 10000, "rankChecks": 5000, "aiOperations": 500, "reports": 100, "users": 5, "apiRequests": 5000, "competitors": 10, "backlinks": 10000, "crawlDepth": 5, "historyMonths": 12}',
         '["10 Projects", "500 Keywords", "AI Content", "GEO/AEO Tracking", "White-label Reports", "Priority Support"]', true),
        ('AGENCY', 'Agency', 'For agencies managing multiple clients', 19900, 199000,
         '{"projects": 50, "keywords": 2500, "crawledPages": 50000, "rankChecks": 25000, "aiOperations": 2500, "reports": 500, "users": 20, "apiRequests": 25000, "competitors": 25, "backlinks": 50000, "crawlDepth": 10, "historyMonths": 24}',
         '["50 Projects", "2500 Keywords", "Agency Mode", "Client Portal", "White-label", "Team Management", "API + Webhooks"]', true),
        ('ENTERPRISE', 'Enterprise', 'For large organizations with custom needs', 49900, 499000,
         '{"projects": 200, "keywords": 10000, "crawledPages": 200000, "rankChecks": 100000, "aiOperations": 10000, "reports": 2000, "users": 100, "apiRequests": 100000, "competitors": 100, "backlinks": 200000, "crawlDepth": 15, "historyMonths": 36}',
         '["200 Projects", "Unlimited Keywords", "SSO", "Custom Integrations", "Dedicated Support", "SLA", "On-premise Option"]', true)
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        description = EXCLUDED.description,
        price_monthly_cents = EXCLUDED.price_monthly_cents,
        price_annual_cents = EXCLUDED.price_annual_cents,
        limits = EXCLUDED.limits,
        features = EXCLUDED.features,
        is_active = EXCLUDED.is_active
    `);
    console.log('✅ Plans seeded');

    // Seed audit rules
    console.log('📦 Seeding audit rules...');
    await query(`
      INSERT INTO audit_rules (id, name, description, category, severity, documentation_url, enabled)
      VALUES
        ('missing_title', 'Missing Title Tag', 'Pages without a title tag cannot rank effectively', 'metadata', 'critical', 'https://developers.google.com/search/docs/crawling-indexing/special-tags', true),
        ('duplicate_title', 'Duplicate Title Tags', 'Duplicate titles confuse search engines', 'metadata', 'high', null, true),
        ('title_too_long', 'Title Too Long', 'Titles longer than 60 characters may be truncated', 'metadata', 'medium', null, true),
        ('missing_meta_description', 'Missing Meta Description', 'Meta descriptions improve CTR', 'metadata', 'medium', null, true),
        ('missing_h1', 'Missing H1', 'Every page should have one H1', 'content', 'high', null, true),
        ('thin_content', 'Thin Content', 'Pages with low word count may not rank', 'content', 'medium', null, true),
        ('images_without_alt', 'Images Without Alt Text', 'Alt text helps SEO and accessibility', 'images', 'low', null, true),
        ('broken_links', 'Broken Pages', 'Broken links hurt UX and crawlability', 'links', 'high', null, true),
        ('noindex_pages', 'Noindex Pages', 'Pages with noindex will not appear in search', 'indexability', 'notice', null, true),
        ('missing_canonical', 'Missing Canonical', 'Canonical tags prevent duplicate content', 'indexability', 'low', null, true),
        ('slow_pages', 'Slow Pages', 'Slow pages hurt rankings and UX', 'performance', 'medium', null, true),
        ('missing_structured_data', 'Missing Structured Data', 'Structured data enhances SERP appearance', 'structured_data', 'low', null, true),
        ('insecure_links', 'Insecure HTTP Links', 'HTTPS is a ranking factor', 'security', 'medium', null, true),
        ('multiple_h1', 'Multiple H1 Tags', 'Pages should have single H1', 'content', 'medium', null, true),
        ('redirect_chain', 'Redirect Chain', 'Long redirect chains waste crawl budget', 'crawlability', 'medium', null, true)
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        description = EXCLUDED.description,
        category = EXCLUDED.category,
        severity = EXCLUDED.severity,
        documentation_url = EXCLUDED.documentation_url,
        enabled = EXCLUDED.enabled
    `);
    console.log('✅ Audit rules seeded');

    // Seed feature flags
    console.log('📦 Seeding feature flags...');
    await query(`
      INSERT INTO feature_flags (key, name, description, enabled, organization_overrides)
      VALUES
        ('ai_enabled', 'AI Features', 'Enable AI content generation and analysis', true, '{}'),
        ('geo_enabled', 'GEO Tracking', 'Enable Generative Engine Optimization tracking', true, '{}'),
        ('aeo_enabled', 'AEO Tracking', 'Enable Answer Engine Optimization', true, '{}'),
        ('advanced_crawling', 'Advanced Crawling', 'Enable JS rendering and advanced crawl features', true, '{}'),
        ('mcp_enabled', 'MCP Server', 'Enable Model Context Protocol server', true, '{}'),
        ('white_label', 'White Label', 'Enable white-label customization', true, '{}'),
        ('agency_mode', 'Agency Mode', 'Enable agency and client management', true, '{}')
      ON CONFLICT (key) DO UPDATE SET
        name = EXCLUDED.name,
        description = EXCLUDED.description,
        enabled = EXCLUDED.enabled
    `);
    console.log('✅ Feature flags seeded');

    // Seed test organization and user for development (only if not production)
    if (process.env.NODE_ENV !== 'production') {
      console.log('📦 Seeding dev test data (non-production only)...');
      
      // Check if test user exists
      const existingUser = await query('SELECT id FROM users WHERE email = $1', ['test@rankforge.io']);
      if (existingUser.rows.length === 0) {
        console.log('Creating test user...');
        const bcrypt = await import('bcryptjs');
        const passwordHash = await bcrypt.hash('TestPassword123!', 12);
        
        const userResult = await query(`
          INSERT INTO users (email, name, password_hash, email_verified)
          VALUES ('test@rankforge.io', 'Test User', $1, true)
          RETURNING id
        `, [passwordHash]);
        
        const userId = userResult.rows[0].id;
        console.log(`✅ Test user created: ${userId}`);

        // Create test organization
        const orgResult = await query(`
          INSERT INTO organizations (name, slug, plan, owner_id)
          VALUES ('Test Organization', 'test-org', 'PRO', $1)
          RETURNING id
        `, [userId]);
        
        const orgId = orgResult.rows[0].id;
        console.log(`✅ Test organization created: ${orgId}`);

        // Create membership
        await query(`
          INSERT INTO organization_members (organization_id, user_id, role)
          VALUES ($1, $2, 'Owner')
        `, [orgId, userId]);
        console.log('✅ Test membership created');

        // Create credit wallet
        await query(`
          INSERT INTO credit_wallets (organization_id, balance, total_granted, total_consumed)
          VALUES ($1, 1000, 1000, 0)
        `, [orgId]);
        console.log('✅ Test credit wallet created');

        // Create test project
        await query(`
          INSERT INTO projects (organization_id, name, domain, normalized_domain, country, language)
          VALUES ($1, 'Example Project', 'example.com', 'example.com', 'US', 'en')
        `, [orgId]);
        console.log('✅ Test project created');

        console.log('✅ Dev test data seeded');
        console.log('Test credentials: test@rankforge.io / TestPassword123!');
      } else {
        console.log('⏭️  Test user already exists, skipping dev seed');
      }
    }

    console.log('✅ Seeding completed successfully');

  } catch (error) {
    console.error('❌ Seeding failed:', error);
    process.exit(1);
  } finally {
    await closePool();
  }
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('seed.ts')) {
  seed();
}

export { seed };

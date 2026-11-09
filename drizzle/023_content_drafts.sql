-- Migration 023: full article drafts written from a content brief.
--
-- The AI writes a Markdown draft; a person edits it in the app and decides when to send it to
-- WordPress, where the plugin creates an unpublished post. Nothing is published automatically.

ALTER TABLE content_briefs
  ADD COLUMN IF NOT EXISTS draft_status TEXT NOT NULL DEFAULT 'none' CHECK (draft_status IN ('none', 'writing', 'ready', 'failed')),
  ADD COLUMN IF NOT EXISTS draft_markdown TEXT CHECK (draft_markdown IS NULL OR length(draft_markdown) <= 100000),
  ADD COLUMN IF NOT EXISTS draft_word_count INTEGER,
  ADD COLUMN IF NOT EXISTS draft_error TEXT CHECK (draft_error IS NULL OR length(draft_error) <= 500),
  ADD COLUMN IF NOT EXISTS draft_updated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS wp_status TEXT NOT NULL DEFAULT 'none' CHECK (wp_status IN ('none', 'requested', 'sent', 'failed')),
  ADD COLUMN IF NOT EXISTS wp_post_id BIGINT,
  ADD COLUMN IF NOT EXISTS wp_edit_url TEXT CHECK (wp_edit_url IS NULL OR length(wp_edit_url) <= 2048),
  ADD COLUMN IF NOT EXISTS wp_error TEXT CHECK (wp_error IS NULL OR length(wp_error) <= 500);

-- The worker reads the outline and writes only the draft columns.
GRANT SELECT (outline, status) ON content_briefs TO rankforge_worker;
GRANT UPDATE (draft_status, draft_markdown, draft_word_count, draft_error, draft_updated_at) ON content_briefs TO rankforge_worker;

ALTER TABLE jobs DROP CONSTRAINT IF EXISTS jobs_type_check;
ALTER TABLE jobs ADD CONSTRAINT jobs_type_check CHECK (type IN (
  'SITE_CRAWL','SEO_AUDIT','AUDIT','RANK_CHECK','KEYWORD_REFRESH','BACKLINK_REFRESH','BACKLINK_SYNC','GSC_SYNC','GA4_SYNC',
  'PAGESPEED_CHECK','COMPETITOR_CHECK','AI_VISIBILITY_CHECK','CONTENT_BRIEF','REPORT_GENERATION','ALERT_EVALUATION',
  'ALERT_PROCESSING','WEBHOOK_DELIVERY','FIX_SUGGESTIONS','CONTENT_DRAFT'));

-- Migration 022: two more kinds of site fix the WordPress plugin applies.
--   local_business_schema: LocalBusiness JSON-LD on the home page (value: JSON object).
--   redirect: a 301 from a broken address to a working one (page_url: broken, value: target).
-- A schema is longer than a title, so values may now hold up to 4000 characters.

ALTER TABLE site_fixes DROP CONSTRAINT IF EXISTS site_fixes_kind_check;
ALTER TABLE site_fixes ADD CONSTRAINT site_fixes_kind_check
  CHECK (kind IN ('meta_title', 'meta_description', 'image_alt', 'local_business_schema', 'redirect'));

ALTER TABLE site_fixes DROP CONSTRAINT IF EXISTS site_fixes_proposed_value_check;
ALTER TABLE site_fixes ADD CONSTRAINT site_fixes_proposed_value_check CHECK (length(proposed_value) BETWEEN 1 AND 4000);
ALTER TABLE site_fixes DROP CONSTRAINT IF EXISTS site_fixes_current_value_check;
ALTER TABLE site_fixes ADD CONSTRAINT site_fixes_current_value_check CHECK (current_value IS NULL OR length(current_value) <= 4000);
ALTER TABLE site_fixes DROP CONSTRAINT IF EXISTS site_fixes_previous_value_check;
ALTER TABLE site_fixes ADD CONSTRAINT site_fixes_previous_value_check CHECK (previous_value IS NULL OR length(previous_value) <= 4000);

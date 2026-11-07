#!/bin/bash
# End-to-end test of the WordPress plugin against a real WordPress (SQLite) and the local API on :3001.
# Needs PHP 8 with pdo_sqlite, dom and gd, psql, and the API and worker running (see the stack used by the journey test).
# Usage: tests/wordpress/run.sh [work-dir]
set -e
HERE=$(cd "$(dirname "$0")" && pwd)
REPO=$(cd "$HERE/../.." && pwd)
S=${1:-/tmp/seoyar-wp}
DB=${DATABASE_URL:-postgresql://rankforge:devpass@localhost:5432/rankforge}
mkdir -p "$S" && cp "$HERE"/wp-*.php "$HERE"/wp-*.mjs "$S"/
[ -d "$S/wp" ] || git clone -q --depth 1 --branch 6.8.3 https://github.com/WordPress/WordPress.git "$S/wp"
[ -d "$S/sqlite" ] || git clone -q --depth 1 https://github.com/WordPress/sqlite-database-integration.git "$S/sqlite"
fuser -k 8088/tcp 2>/dev/null || true
rm -rf "$S/wpsite" && cp -r "$S/wp" "$S/wpsite" && rm -rf "$S/wpsite/.git"
cp -rL "$S/sqlite/packages/plugin-sqlite-database-integration" "$S/wpsite/wp-content/plugins/sqlite-database-integration"
sed "s#{SQLITE_IMPLEMENTATION_FOLDER_PATH}#$S/wpsite/wp-content/plugins/sqlite-database-integration#" \
  "$S/wpsite/wp-content/plugins/sqlite-database-integration/db.copy" > "$S/wpsite/wp-content/db.php"
ln -s "$REPO/plugins/wordpress/seoyar" "$S/wpsite/wp-content/plugins/seoyar"
cat > "$S/wpsite/wp-config.php" <<'CONF'
<?php
define('DB_NAME','wp'); define('DB_USER',''); define('DB_PASSWORD',''); define('DB_HOST',''); define('DB_CHARSET','utf8'); define('DB_COLLATE','');
define('DB_DIR', __DIR__ . '/wp-content/database/'); define('DB_FILE','wp.sqlite');
foreach (['AUTH_KEY','SECURE_AUTH_KEY','LOGGED_IN_KEY','NONCE_KEY','AUTH_SALT','SECURE_AUTH_SALT','LOGGED_IN_SALT','NONCE_SALT'] as $k) define($k, 'local-test-only-' . $k);
$table_prefix = 'wp_';
define('WP_DEBUG', true); define('WP_DEBUG_LOG', true); define('WP_DEBUG_DISPLAY', false); define('DISABLE_WP_CRON', true);
define('WP_HOME','http://localhost:8088'); define('WP_SITEURL','http://localhost:8088');
if (!defined('ABSPATH')) define('ABSPATH', __DIR__ . '/');
require_once ABSPATH . 'wp-settings.php';
CONF
php "$S/wp-install.php" "$S/wpsite" >/dev/null
(cd "$REPO" && node "$S/wp-api-setup.mjs" > "$S/wp-ctx.json")
php "$S/wp-seed.php" "$S/wpsite" "$S/wp-ctx.json" > "$S/wp-seed.json"
eval "$(node -e "const c=require('$S/wp-ctx.json'); console.log('PID='+c.pid+' ORG='+c.org)")"
# Synthetic proposals, as the AI job would write them.
psql -q "$DB" -c "INSERT INTO site_fixes (organization_id, project_id, kind, page_url, current_value, proposed_value, source) VALUES
('$ORG','$PID','meta_title','http://localhost:8088/tours/','تورهای کیش – سایت آزمایشی','تور کیش ۱۴۰۵ | قیمت و رزرو آنلاین تورهای کیش','rule'),
('$ORG','$PID','meta_description','http://localhost:8088/tours/',NULL,'مقایسه‌ی قیمت تورهای کیش با هتل و پرواز، رزرو آنلاین و پشتیبانی ۲۴ ساعته. بهترین زمان سفر و جاذبه‌های دیدنی کیش را ببینید.','rule'),
('$ORG','$PID','meta_title','http://localhost:8088/no-such-page/',NULL,'صفحه‌ای که وجود ندارد','rule')" >/dev/null
(cd "$S/wpsite" && setsid nohup php -S 127.0.0.1:8088 -t "$S/wpsite" "$S/wp-router.php" > "$S/wp-server.log" 2>&1 < /dev/null &)
sleep 2
node "$S/wp-e2e.mjs" "$S"
if [ -s "$S/wpsite/wp-content/debug.log" ]; then echo "WordPress logged warnings:"; cat "$S/wpsite/wp-content/debug.log"; exit 1; fi

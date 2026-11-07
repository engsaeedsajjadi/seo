<?php
define('WP_INSTALLING', true);
$_SERVER['HTTP_HOST'] = 'localhost:8088';
require $argv[1] . '/wp-load.php';
require_once ABSPATH . 'wp-admin/includes/upgrade.php';
$r = wp_install('سایت آزمایشی', 'admin', 'admin@example.test', true, '', 'test-admin-' . bin2hex(random_bytes(4)));
echo "installed user {$r['user_id']}\n";

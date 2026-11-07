<?php
$_SERVER['HTTP_HOST'] = 'localhost:8088';
require $argv[1] . '/wp-load.php';
if (isset($argv[2]) && $argv[2] === 'reset-scan') delete_option('seoyar_images_scanned_at');
if (isset($argv[3])) update_option('seoyar_api_key', $argv[3]);
do_action('seoyar_sync_event');
$last = get_option('seoyar_last_sync');
$att = (int) ($argv[4] ?? 4);
echo json_encode(array('message' => $last['message'], 'attachmentAlt' => get_post_meta($att, '_wp_attachment_image_alt', true),
  'content' => get_post_field('post_content', 5, 'raw'), 'title' => get_post_meta(5, '_seoyar_title', true)), JSON_UNESCAPED_UNICODE), "\n";

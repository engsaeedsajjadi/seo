<?php
$_SERVER['HTTP_HOST'] = 'localhost:8088';
require $argv[1] . '/wp-load.php';
require_once ABSPATH . 'wp-admin/includes/image.php';
require_once ABSPATH . 'wp-admin/includes/plugin.php';
$ctx = json_decode(file_get_contents($argv[2]), true);
update_option('permalink_structure', '/%postname%/');
$upload = wp_upload_dir();
$file = $upload['path'] . '/beach-sunset.jpg';
$im = imagecreatetruecolor(800, 600); imagefill($im, 0, 0, imagecolorallocate($im, 240, 140, 40)); imagejpeg($im, $file); imagedestroy($im);
$att = wp_insert_attachment(array('post_title' => 'غروب ساحل کیش', 'post_mime_type' => 'image/jpeg', 'post_status' => 'inherit'), $file);
wp_update_attachment_metadata($att, wp_generate_attachment_metadata($att, $file));
$small = wp_get_attachment_image_src($att, 'medium')[0];
$page = wp_insert_post(array('post_type' => 'page', 'post_status' => 'publish', 'post_name' => 'tours', 'post_title' => 'تورهای کیش',
  'post_content' => "<!-- wp:paragraph --><p>متن صفحه</p><!-- /wp:paragraph -->\n<!-- wp:image --><figure class=\"wp-block-image\"><img src=\"$small\" class=\"wp-image-$att\"/></figure><!-- /wp:image -->\n<p><img src=\"http://localhost:8088/wp-content/uploads/IMG_2041.jpg\" data-x=\"keep\"></p>"));
activate_plugin('seoyar/seoyar.php');
update_option('seoyar_api_url', 'http://localhost:3001');
update_option('seoyar_project_id', $ctx['pid']);
update_option('seoyar_api_key', $ctx['key']);
echo json_encode(array('page' => $page, 'pageUrl' => get_permalink($page), 'att' => $att, 'small' => $small, 'active' => is_plugin_active('seoyar/seoyar.php'), 'cron' => (bool) wp_next_scheduled('seoyar_sync_event'))), "\n";

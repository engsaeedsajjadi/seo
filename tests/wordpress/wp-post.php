<?php
// Reads (or publishes) the WordPress post created for a SeoYar article: wp-post.php <wp-dir> <brief-id> [publish]
$_SERVER['HTTP_HOST'] = 'localhost:8088';
require $argv[1] . '/wp-load.php';
$ids = get_posts(array('post_type' => 'post', 'post_status' => 'any', 'numberposts' => 10, 'meta_key' => '_seoyar_brief_id', 'meta_value' => $argv[2], 'fields' => 'ids'));
if (isset($argv[3]) && $argv[3] === 'publish' && $ids) {
    wp_update_post(array('ID' => $ids[0], 'post_status' => 'publish'));
}
$id = $ids ? $ids[0] : 0;
echo json_encode(array('id' => $id, 'count' => count($ids), 'status' => get_post_status($id), 'title' => get_the_title($id), 'content' => (string) get_post_field('post_content', $id, 'raw'),
  'metaTitle' => get_post_meta($id, '_seoyar_title', true), 'metaDescription' => get_post_meta($id, '_seoyar_description', true)), JSON_UNESCAPED_UNICODE), "\n";

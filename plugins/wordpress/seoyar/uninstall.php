<?php
// Removes the plugin's settings, its redirects and its business schema. Titles, descriptions and alt texts
// already written into posts stay on the site.
if (!defined('WP_UNINSTALL_PLUGIN')) {
    exit;
}
foreach (array('seoyar_api_url', 'seoyar_project_id', 'seoyar_api_key', 'seoyar_last_sync', 'seoyar_images_scanned_at', 'seoyar_redirects', 'seoyar_local_business') as $option) {
    delete_option($option);
}
wp_clear_scheduled_hook('seoyar_sync_event');

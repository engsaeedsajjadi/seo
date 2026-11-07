<?php
/**
 * Plugin Name:       سئویار
 * Plugin URI:        https://github.com/engsaeedsajjadi/seo
 * Description:       اصلاح‌هایی را که در سئویار تأیید کرده‌اید روی سایت اعمال می‌کند: عنوان صفحه، توضیحات متا و متن جایگزین تصاویر. هر تغییر قابل بازگشت است.
 * Version:           1.0.0
 * Requires at least: 6.2
 * Requires PHP:      7.4
 * Author:            SeoYar
 * License:           GPL-2.0-or-later
 * Text Domain:       seoyar
 */

if (!defined('ABSPATH')) {
    exit;
}

define('SEOYAR_VERSION', '1.0.0');
define('SEOYAR_CRON_HOOK', 'seoyar_sync_event');

// ---------------------------------------------------------------- settings

function seoyar_option($name, $default = '')
{
    $value = get_option('seoyar_' . $name, $default);
    return is_string($value) ? $value : $default;
}

/** Only HTTPS may carry the API key, except to a local test server. */
function seoyar_url_allowed($url)
{
    $parts = wp_parse_url($url);
    if (empty($parts['scheme']) || empty($parts['host'])) {
        return false;
    }
    if ($parts['scheme'] === 'https') {
        return true;
    }
    $local = in_array($parts['host'], array('localhost', '127.0.0.1', 'host.docker.internal'), true)
        || substr($parts['host'], -6) === '.local' || substr($parts['host'], -5) === '.test';
    return $parts['scheme'] === 'http' && $local;
}

add_action('admin_init', function () {
    register_setting('seoyar', 'seoyar_api_url', array(
        'type' => 'string',
        'sanitize_callback' => function ($value) {
            $value = esc_url_raw(trim((string) $value));
            if ($value !== '' && !seoyar_url_allowed($value)) {
                add_settings_error('seoyar_api_url', 'seoyar_https', 'نشانی سئویار باید با https شروع شود.');
                return seoyar_option('api_url');
            }
            return untrailingslashit($value);
        },
    ));
    register_setting('seoyar', 'seoyar_project_id', array(
        'type' => 'string',
        'sanitize_callback' => function ($value) {
            $value = strtolower(trim((string) $value));
            if ($value !== '' && !preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/', $value)) {
                add_settings_error('seoyar_project_id', 'seoyar_project', 'شناسه‌ی پروژه معتبر نیست. آن را از صفحه‌ی «اصلاح خودکار» در سئویار کپی کنید.');
                return seoyar_option('project_id');
            }
            return $value;
        },
    ));
    register_setting('seoyar', 'seoyar_api_key', array(
        'type' => 'string',
        'sanitize_callback' => function ($value) {
            $value = trim((string) $value);
            // An empty field keeps the saved key, because the key is never printed back.
            if ($value === '') {
                return seoyar_option('api_key');
            }
            if (!preg_match('/^rf_[A-Za-z0-9_\-]{16,200}$/', $value)) {
                add_settings_error('seoyar_api_key', 'seoyar_key', 'کلید API معتبر نیست.');
                return seoyar_option('api_key');
            }
            return $value;
        },
    ));
});

add_action('admin_menu', function () {
    add_options_page('سئویار', 'سئویار', 'manage_options', 'seoyar', 'seoyar_render_settings');
});

function seoyar_render_settings()
{
    if (!current_user_can('manage_options')) {
        return;
    }
    $last = get_option('seoyar_last_sync', array());
    $notice = (string) get_transient('seoyar_notice_' . get_current_user_id());
    delete_transient('seoyar_notice_' . get_current_user_id());
    ?>
    <div class="wrap" dir="rtl">
        <h1>سئویار</h1>
        <p>اصلاح‌هایی که در سئویار تأیید می‌کنید، هر ۵ دقیقه یک بار روی سایت اعمال می‌شود. هیچ تغییری بدون تأیید شما انجام نمی‌شود.</p>
        <?php if ($notice !== '') : ?>
            <div class="notice notice-info"><p><?php echo esc_html($notice); ?></p></div>
        <?php endif; ?>
        <form method="post" action="options.php">
            <?php settings_fields('seoyar'); ?>
            <table class="form-table" role="presentation">
                <tr>
                    <th scope="row"><label for="seoyar_api_url">نشانی سئویار</label></th>
                    <td><input name="seoyar_api_url" id="seoyar_api_url" type="url" dir="ltr" class="regular-text" value="<?php echo esc_attr(seoyar_option('api_url')); ?>" placeholder="https://app.example.com"></td>
                </tr>
                <tr>
                    <th scope="row"><label for="seoyar_project_id">شناسه‌ی پروژه</label></th>
                    <td><input name="seoyar_project_id" id="seoyar_project_id" type="text" dir="ltr" class="regular-text" value="<?php echo esc_attr(seoyar_option('project_id')); ?>"></td>
                </tr>
                <tr>
                    <th scope="row"><label for="seoyar_api_key">کلید API</label></th>
                    <td>
                        <input name="seoyar_api_key" id="seoyar_api_key" type="password" dir="ltr" class="regular-text" autocomplete="off" value="" placeholder="<?php echo seoyar_option('api_key') !== '' ? 'ذخیره شده است؛ برای تغییر، کلید جدید را وارد کنید' : 'rf_...'; ?>">
                        <p class="description">کلیدی با دسترسی read و write که در سئویار ساخته‌اید.</p>
                    </td>
                </tr>
            </table>
            <?php submit_button('ذخیره‌ی تنظیمات'); ?>
        </form>
        <form method="post" action="<?php echo esc_url(admin_url('admin-post.php')); ?>">
            <input type="hidden" name="action" value="seoyar_sync_now">
            <?php wp_nonce_field('seoyar_sync_now'); ?>
            <?php submit_button('همگام‌سازی الان', 'secondary'); ?>
        </form>
        <?php if (!empty($last['time'])) : ?>
            <h2>آخرین همگام‌سازی</h2>
            <p><?php echo esc_html(wp_date('Y/m/d H:i', (int) $last['time'])); ?> — <?php echo esc_html(isset($last['message']) ? $last['message'] : ''); ?></p>
        <?php endif; ?>
    </div>
    <?php
}

add_action('admin_post_seoyar_sync_now', function () {
    if (!current_user_can('manage_options')) {
        wp_die('دسترسی ندارید.', 403);
    }
    check_admin_referer('seoyar_sync_now');
    delete_option('seoyar_images_scanned_at');
    $result = seoyar_sync();
    set_transient('seoyar_notice_' . get_current_user_id(), $result['message'], 60);
    wp_safe_redirect(admin_url('options-general.php?page=seoyar'));
    exit;
});

// ---------------------------------------------------------------- schedule

add_filter('cron_schedules', function ($schedules) {
    $schedules['seoyar_five_minutes'] = array('interval' => 300, 'display' => 'هر ۵ دقیقه (سئویار)');
    return $schedules;
});

register_activation_hook(__FILE__, function () {
    if (!wp_next_scheduled(SEOYAR_CRON_HOOK)) {
        wp_schedule_event(time() + 60, 'seoyar_five_minutes', SEOYAR_CRON_HOOK);
    }
});

register_deactivation_hook(__FILE__, function () {
    wp_clear_scheduled_hook(SEOYAR_CRON_HOOK);
});

add_action(SEOYAR_CRON_HOOK, 'seoyar_sync');

// ---------------------------------------------------------------- API

function seoyar_request($method, $path, $body = null)
{
    $base = seoyar_option('api_url');
    $project = seoyar_option('project_id');
    $key = seoyar_option('api_key');
    if ($base === '' || $project === '' || $key === '') {
        return new WP_Error('seoyar_settings', 'تنظیمات افزونه کامل نیست.');
    }
    if (!seoyar_url_allowed($base)) {
        return new WP_Error('seoyar_https', 'نشانی سئویار باید با https شروع شود.');
    }
    $args = array(
        'method' => $method,
        'timeout' => 20,
        'redirection' => 0,
        'headers' => array(
            'Authorization' => 'Bearer ' . $key,
            'Content-Type' => 'application/json',
            'User-Agent' => 'SeoYar-WordPress/' . SEOYAR_VERSION,
        ),
    );
    if ($body !== null) {
        $args['body'] = wp_json_encode($body);
    }
    $response = wp_remote_request($base . '/api/v1/projects/' . rawurlencode($project) . $path, $args);
    if (is_wp_error($response)) {
        return new WP_Error('seoyar_network', 'اتصال به سئویار برقرار نشد.');
    }
    $code = wp_remote_retrieve_response_code($response);
    $data = json_decode(wp_remote_retrieve_body($response), true);
    if ($code === 401) {
        return new WP_Error('seoyar_auth', 'کلید API نامعتبر یا لغوشده است.');
    }
    if ($code === 403) {
        return new WP_Error('seoyar_scope', 'کلید API باید دسترسی read و write داشته باشد.');
    }
    if ($code === 404) {
        return new WP_Error('seoyar_project', 'پروژه پیدا نشد. شناسه‌ی پروژه را بررسی کنید.');
    }
    if ($code < 200 || $code >= 300 || !is_array($data)) {
        return new WP_Error('seoyar_http', 'سئویار پاسخ نامعتبر داد (' . (int) $code . ').');
    }
    return isset($data['data']) ? $data['data'] : array();
}

// ---------------------------------------------------------------- sync

function seoyar_sync()
{
    $pending = seoyar_request('GET', '/wp/pending?version=' . SEOYAR_VERSION);
    if (is_wp_error($pending)) {
        return seoyar_record_sync($pending->get_error_message());
    }
    $results = array();
    $applied = 0;
    $failed = 0;
    foreach ((isset($pending['fixes']) && is_array($pending['fixes'])) ? $pending['fixes'] : array() as $fix) {
        $result = seoyar_handle_fix($fix);
        $results[] = $result;
        if ($result['status'] === 'failed') {
            $failed++;
        } else {
            $applied++;
        }
    }
    if ($results) {
        $sent = seoyar_request('POST', '/wp/results', array('results' => $results));
        if (is_wp_error($sent)) {
            return seoyar_record_sync('تغییرها اعمال شد ولی گزارش به سئویار نرسید: ' . $sent->get_error_message());
        }
    }
    $images = seoyar_report_images();
    $message = sprintf('%s تغییر انجام شد، %s ناموفق.', number_format_i18n($applied), number_format_i18n($failed));
    if ($images > 0) {
        $message .= sprintf(' %s تصویر بدون متن جایگزین برای بررسی فرستاده شد.', number_format_i18n($images));
    }
    return seoyar_record_sync($message);
}

function seoyar_record_sync($message)
{
    update_option('seoyar_last_sync', array('time' => time(), 'message' => $message), false);
    return array('message' => $message);
}

function seoyar_handle_fix($fix)
{
    $id = isset($fix['id']) ? (string) $fix['id'] : '';
    $kind = isset($fix['kind']) ? (string) $fix['kind'] : '';
    $rollback = isset($fix['status']) && $fix['status'] === 'rollback_requested';
    $value = $rollback ? (string) (isset($fix['previousValue']) ? $fix['previousValue'] : '') : sanitize_text_field((string) (isset($fix['value']) ? $fix['value'] : ''));
    try {
        if ($kind === 'image_alt') {
            $previous = seoyar_apply_image_alt((string) $fix['target'], (string) $fix['pageUrl'], sanitize_text_field($value), $rollback ? (string) $fix['value'] : null);
        } elseif ($kind === 'meta_title' || $kind === 'meta_description') {
            $previous = seoyar_apply_meta((string) $fix['pageUrl'], $kind, sanitize_text_field($value));
        } else {
            throw new Exception('این نوع اصلاح پشتیبانی نمی‌شود.');
        }
        return $rollback
            ? array('id' => $id, 'status' => 'rolled_back')
            : array('id' => $id, 'status' => 'applied', 'previousValue' => mb_substr((string) $previous, 0, 1000));
    } catch (Exception $e) {
        return array('id' => $id, 'status' => 'failed', 'error' => mb_substr($e->getMessage(), 0, 500));
    }
}

/** The post behind a public address, or 'home' for a home page that lists posts. */
function seoyar_find_post($url)
{
    $id = url_to_postid($url);
    if ($id) {
        return $id;
    }
    if (untrailingslashit(set_url_scheme($url, 'https')) === untrailingslashit(set_url_scheme(home_url('/'), 'https'))) {
        $front = (int) get_option('page_on_front');
        return (get_option('show_on_front') === 'page' && $front) ? $front : 'home';
    }
    return 0;
}

function seoyar_seo_plugin()
{
    if (defined('WPSEO_VERSION')) {
        return 'yoast';
    }
    if (defined('RANK_MATH_VERSION')) {
        return 'rankmath';
    }
    return '';
}

function seoyar_meta_key($kind)
{
    $keys = array(
        'yoast' => array('meta_title' => '_yoast_wpseo_title', 'meta_description' => '_yoast_wpseo_metadesc'),
        'rankmath' => array('meta_title' => 'rank_math_title', 'meta_description' => 'rank_math_description'),
        '' => array('meta_title' => '_seoyar_title', 'meta_description' => '_seoyar_description'),
    );
    return $keys[seoyar_seo_plugin()][$kind];
}

/** Writes a title or description where the active SEO plugin reads it; returns the old value. */
function seoyar_apply_meta($url, $kind, $value)
{
    $post = seoyar_find_post($url);
    if ($post === 0) {
        throw new Exception('صفحه‌ای با این نشانی در وردپرس پیدا نشد.');
    }
    if ($post === 'home') {
        if (seoyar_seo_plugin() !== '') {
            throw new Exception('این صفحه‌ی اصلی را در تنظیمات افزونه‌ی سئوی خود تغییر دهید.');
        }
        $option = $kind === 'meta_title' ? 'seoyar_home_title' : 'seoyar_home_description';
        $previous = (string) get_option($option, '');
        $value === '' ? delete_option($option) : update_option($option, $value, false);
        return $previous;
    }
    $key = seoyar_meta_key($kind);
    $previous = (string) get_post_meta($post, $key, true);
    $value === '' ? delete_post_meta($post, $key) : update_post_meta($post, $key, $value);
    return $previous;
}

function seoyar_same_image($a, $b)
{
    $strip = function ($src) {
        $path = (string) wp_parse_url($src, PHP_URL_PATH);
        return preg_replace('/-\d+x\d+(?=\.[a-z0-9]+$)/i', '', $path);
    };
    return $strip($a) !== '' && $strip($a) === $strip($b);
}

/**
 * Sets the alt text of an image in the media library and in the page that shows it.
 * The page content is written directly, so no content filter can strip other markup.
 */
function seoyar_apply_image_alt($src, $page_url, $value, $only_if = null)
{
    $previous = '';
    $attachment = attachment_url_to_postid($src);
    if (!$attachment) {
        $attachment = attachment_url_to_postid(preg_replace('/-\d+x\d+(?=\.[a-z0-9]+$)/i', '', $src));
    }
    if ($attachment) {
        $previous = (string) get_post_meta($attachment, '_wp_attachment_image_alt', true);
        if ($only_if === null || $previous === $only_if) {
            $value === '' ? delete_post_meta($attachment, '_wp_attachment_image_alt') : update_post_meta($attachment, '_wp_attachment_image_alt', $value);
        }
    }
    $changed = false;
    $post = seoyar_find_post($page_url);
    if (is_int($post) && $post > 0 && class_exists('WP_HTML_Tag_Processor')) {
        global $wpdb;
        $content = (string) get_post_field('post_content', $post, 'raw');
        $tags = new WP_HTML_Tag_Processor($content);
        while ($tags->next_tag('img')) {
            $current = (string) $tags->get_attribute('alt');
            $wanted = $only_if === null ? '' : $only_if;
            if (seoyar_same_image((string) $tags->get_attribute('src'), $src) && $current === $wanted) {
                $tags->set_attribute('alt', $value);
                $changed = true;
            }
        }
        if ($changed) {
            $wpdb->update($wpdb->posts, array('post_content' => $tags->get_updated_html()), array('ID' => $post));
            clean_post_cache($post);
        }
    }
    if (!$attachment && !$changed) {
        throw new Exception('این تصویر در کتابخانه‌ی رسانه یا محتوای صفحه پیدا نشد.');
    }
    return $previous;
}

/** Sends images without alt text from recent pages so the customer can approve a text for each. */
function seoyar_report_images()
{
    $last = (int) get_option('seoyar_images_scanned_at', 0);
    if ($last > time() - 12 * HOUR_IN_SECONDS || !class_exists('WP_HTML_Tag_Processor')) {
        return 0;
    }
    update_option('seoyar_images_scanned_at', time(), false);
    $images = array();
    $posts = get_posts(array('post_type' => array('post', 'page', 'product'), 'post_status' => 'publish', 'numberposts' => 100, 'orderby' => 'modified'));
    foreach ($posts as $post) {
        $tags = new WP_HTML_Tag_Processor((string) $post->post_content);
        while ($tags->next_tag('img') && count($images) < 200) {
            $alt = $tags->get_attribute('alt');
            $src = (string) $tags->get_attribute('src');
            if (($alt !== null && trim((string) $alt) !== '') || !wp_http_validate_url($src)) {
                continue;
            }
            $text = seoyar_suggest_alt($src, $post);
            if ($text !== '') {
                $images[] = array('pageUrl' => get_permalink($post), 'src' => $src, 'proposedValue' => $text);
            }
        }
    }
    if (!$images) {
        return 0;
    }
    $sent = seoyar_request('POST', '/wp/images', array('images' => $images));
    return is_wp_error($sent) ? 0 : (int) (isset($sent['created']) ? $sent['created'] : 0);
}

/** A starting text for the customer to edit: the media title, else a readable file name, else the page title. */
function seoyar_suggest_alt($src, $post)
{
    $attachment = attachment_url_to_postid(preg_replace('/-\d+x\d+(?=\.[a-z0-9]+$)/i', '', $src));
    $candidates = array();
    if ($attachment) {
        $candidates[] = get_the_title($attachment);
    }
    $name = pathinfo((string) wp_parse_url($src, PHP_URL_PATH), PATHINFO_FILENAME);
    $candidates[] = trim(preg_replace('/[-_]+/', ' ', preg_replace('/-\d+x\d+$|-scaled$|-\d+$/', '', urldecode($name))));
    $candidates[] = get_the_title($post);
    foreach ($candidates as $text) {
        $text = sanitize_text_field((string) $text);
        // Camera names and hashes such as IMG 2041 or 6f3b4510 are not descriptions.
        if (mb_strlen($text) >= 3 && preg_match('/\p{L}{3,}/u', $text) && !preg_match('/^(img|dsc|image|photo|screenshot)\b/i', $text)) {
            return mb_substr($text, 0, 150);
        }
    }
    return '';
}

// ---------------------------------------------------------------- output when no SEO plugin is active

add_filter('pre_get_document_title', function ($title) {
    if (seoyar_seo_plugin() !== '') {
        return $title;
    }
    if (is_front_page() && is_home()) {
        $custom = (string) get_option('seoyar_home_title', '');
    } elseif (is_singular()) {
        $custom = (string) get_post_meta(get_queried_object_id(), '_seoyar_title', true);
    } else {
        $custom = '';
    }
    return $custom !== '' ? $custom : $title;
}, 20);

add_action('wp_head', function () {
    if (seoyar_seo_plugin() !== '') {
        return;
    }
    if (is_front_page() && is_home()) {
        $description = (string) get_option('seoyar_home_description', '');
    } elseif (is_singular()) {
        $description = (string) get_post_meta(get_queried_object_id(), '_seoyar_description', true);
    } else {
        $description = '';
    }
    if ($description !== '') {
        echo '<meta name="description" content="' . esc_attr($description) . '">' . "\n";
    }
}, 1);

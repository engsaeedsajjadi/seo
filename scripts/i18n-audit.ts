#!/usr/bin/env tsx
/**
 * i18n Audit Script - Persian Localization Coverage
 * Checks for untranslated strings, hardcoded English, RTL compliance
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import { join, extname } from 'path';

const SRC_DIR = join(process.cwd(), 'src');
const I18N_DIR = join(SRC_DIR, 'i18n', 'fa');

interface AuditResult {
  totalKeys: number;
  translatedKeys: number;
  coverage: number;
  hardcodedStrings: { file: string; line: number; text: string }[];
  missingTranslations: string[];
  rtlCompliant: boolean;
  fontLoaded: boolean;
  htmlLangDir: { lang: string; dir: string } | null;
  persianCalendarUsed: boolean;
  persianNumbersUsed: boolean;
  currencyFormatted: boolean;
}

// Collect all translation keys
function collectTranslationKeys(): string[] {
  const keys: string[] = [];
  
  function readFiles(dir: string, prefix = '') {
    try {
      const files = readdirSync(dir);
      for (const file of files) {
        const fullPath = join(dir, file);
        const stat = statSync(fullPath);
        
        if (stat.isDirectory()) {
          const newPrefix = prefix ? `${prefix}.${file}` : file;
          readFiles(fullPath, newPrefix);
        } else if (extname(file) === '.ts' && file !== 'index.ts') {
          const content = readFileSync(fullPath, 'utf-8');
          // Extract keys from export const
          const keyMatches = content.matchAll(/(\w+):\s*['"`]/g);
          for (const match of keyMatches) {
            const moduleName = file.replace('.ts', '');
            keys.push(`${moduleName}.${match[1]}`);
          }
        }
      }
    } catch (e) {
      console.warn(`Could not read ${dir}:`, e);
    }
  }

  // Read fa directory
  try {
    const files = readdirSync(I18N_DIR);
    for (const file of files) {
      if (file.endsWith('.ts') && file !== 'index.ts') {
        const content = readFileSync(join(I18N_DIR, file), 'utf-8');
        // Count translation entries
        const entries = content.match(/^\s+(\w+):\s*['"`]/gm);
        if (entries) {
          keys.push(...entries.map(e => {
            const match = e.match(/(\w+):/);
            return `${file.replace('.ts', '')}.${match?.[1] || 'unknown'}`;
          }));
        }
      }
    }
  } catch (e) {
    console.error('Failed to read i18n directory:', e);
  }

  return keys;
}

// Check for hardcoded English strings in source files
function findHardcodedStrings(): { file: string; line: number; text: string }[] {
  const hardcoded: { file: string; line: number; text: string }[] = [];
  const allowedPatterns = [
    /import\s+/,
    /export\s+/,
    /from\s+['"`]/,
    /console\./,
    /\/\/.*/,
    /\/\*.*\*\//,
    /className/,
    /class:/,
    /api\./,
    /t\(['"`]/, // Already using translation function
    /toPersianDigits/,
    /formatPersian/,
    /VITE_/,
    /https?:\/\//,
    /data-testid/,
    /aria-/,
  ];

  // Common English words that should be translated if in JSX
  const englishInJSX = [
    /\b(Dashboard|Projects?|Settings?|Loading|Error|Success|Warning|Create|Edit|Delete|Save|Cancel|Search|Filter|Export|Import|Download|Upload|View|Add|Remove|Update|Copy|Share|Overview|Analytics|Reports?|Billing|Team|Users?|Keywords?|Rankings?|Competitors?|Backlinks?|Content|Integrations?|Notifications?|Alerts?)\b/,
  ];

  function scanFile(filePath: string) {
    try {
      const content = readFileSync(filePath, 'utf-8');
      const lines = content.split('\n');
      
      lines.forEach((line, idx) => {
        // Skip if line contains allowed patterns
        if (allowedPatterns.some(p => p.test(line))) return;
        
        // Check for JSX text content that looks like hardcoded English
        // Look for >English Text< pattern
        const jsxTextMatch = line.match(/>([A-Z][a-z]+(?:\s+[A-Z]?[a-z]+)*)\s*</);
        if (jsxTextMatch) {
          const text = jsxTextMatch[1].trim();
          if (text.length > 2 && /^[A-Z]/.test(text) && !text.includes('className')) {
            // Check if it's likely UI text (not code)
            if (englishInJSX.some(p => p.test(text))) {
              hardcoded.push({
                file: filePath.replace(process.cwd() + '/', ''),
                line: idx + 1,
                text: text,
              });
            }
          }
        }

        // Check for string literals that are English UI text
        const stringLiteralMatch = line.match(/["'`]([A-Z][a-z]+(?:\s+[a-z]+){0,3})["'`]/);
        if (stringLiteralMatch) {
          const text = stringLiteralMatch[1];
          if (englishInJSX.some(p => p.test(text)) && !line.includes('import') && !line.includes('from')) {
            // Only flag if in return/JSX context
            if (line.includes('>') || line.includes('<') || line.includes('return')) {
              hardcoded.push({
                file: filePath.replace(process.cwd() + '/', ''),
                line: idx + 1,
                text: text,
              });
            }
          }
        }
      });
    } catch (e) {
      // Ignore binary files
    }
  }

  function scanDir(dir: string) {
    try {
      const files = readdirSync(dir);
      for (const file of files) {
        const fullPath = join(dir, file);
        const stat = statSync(fullPath);
        
        if (stat.isDirectory()) {
          if (!['node_modules', '.git', 'dist', 'build', '.next'].includes(file)) {
            scanDir(fullPath);
          }
        } else if (['.tsx', '.ts', '.jsx'].includes(extname(file))) {
          if (!file.includes('.test.') && !file.includes('.spec.')) {
            scanFile(fullPath);
          }
        }
      }
    } catch (e) {
      // Ignore
    }
  }

  scanDir(join(SRC_DIR, 'pages'));
  scanDir(join(SRC_DIR, 'components'));

  return hardcoded;
}

// Check index.html for lang and dir
function checkHtmlLangDir(): { lang: string; dir: string } | null {
  try {
    const htmlPath = join(process.cwd(), 'index.html');
    const content = readFileSync(htmlPath, 'utf-8');
    
    const langMatch = content.match(/<html[^>]*lang=["']([^"']+)["']/);
    const dirMatch = content.match(/<html[^>]*dir=["']([^"']+)["']/);
    
    return {
      lang: langMatch?.[1] || 'unknown',
      dir: dirMatch?.[1] || 'unknown',
    };
  } catch {
    return null;
  }
}

// Check for Persian utilities usage
function checkPersianFeatures(): { calendar: boolean; numbers: boolean; currency: boolean; font: boolean } {
  try {
    const files = [
      join(SRC_DIR, 'lib', 'persian.ts'),
      join(SRC_DIR, 'i18n', 'index.ts'),
      join(process.cwd(), 'index.html'),
      join(SRC_DIR, 'index.css'),
    ];
    
    let calendar = false;
    let numbers = false;
    let currency = false;
    let font = false;
    
    for (const file of files) {
      try {
        const content = readFileSync(file, 'utf-8');
        if (content.includes('fa-IR-u-ca-persian') || content.includes('Intl.DateTimeFormat')) {
          calendar = true;
        }
        if (content.includes('toPersianDigits') || content.includes('persian-numbers') || content.includes('۰۱۲۳۴۵۶۷۸۹')) {
          numbers = true;
        }
        if (content.includes('تومان') || content.includes('formatCurrency') || content.includes('formatMoney')) {
          currency = true;
        }
        if (content.includes('Vazirmatn') || content.includes('font-persian')) {
          font = true;
        }
      } catch {
        // Ignore
      }
    }
    
    return { calendar, numbers, currency, font };
  } catch {
    return { calendar: false, numbers: false, currency: false, font: false };
  }
}

async function main() {
  console.log('🔍 RankForge Persian Localization Audit\n');
  console.log('='.repeat(60));

  // Collect translation keys
  const allKeys = collectTranslationKeys();
  console.log(`\n📚 ترجمه‌های موجود: ${allKeys.length} کلید`);
  
  // Show modules
  try {
    const modules = readdirSync(I18N_DIR).filter(f => f.endsWith('.ts') && f !== 'index.ts');
    console.log(`📦 ماژول‌های ترجمه: ${modules.length}`);
    modules.forEach(m => {
      const content = readFileSync(join(I18N_DIR, m), 'utf-8');
      const count = (content.match(/^\s+\w+:\s*['"`]/gm) || []).length;
      console.log(`   - ${m.replace('.ts', '')}: ${count} کلید`);
    });
  } catch (e) {
    console.log('   ❌ خطا در خواندن ماژول‌ها');
  }

  // Check HTML
  const htmlCheck = checkHtmlLangDir();
  console.log(`\n🌐 HTML lang/dir:`);
  if (htmlCheck) {
    console.log(`   lang="${htmlCheck.lang}" ${htmlCheck.lang === 'fa' ? '✅' : '❌ باید fa باشد'}`);
    console.log(`   dir="${htmlCheck.dir}" ${htmlCheck.dir === 'rtl' ? '✅' : '❌ باید rtl باشد'}`);
  } else {
    console.log('   ❌ index.html یافت نشد');
  }

  // Check Persian features
  const persianFeatures = checkPersianFeatures();
  console.log(`\n🇮🇷 ویژگی‌های فارسی:`);
  console.log(`   تقویم فارسی (Intl.DateTimeFormat fa-IR-u-ca-persian): ${persianFeatures.calendar ? '✅' : '❌'}`);
  console.log(`   اعداد فارسی (toPersianDigits): ${persianFeatures.numbers ? '✅' : '❌'}`);
  console.log(`   واحد پول (تومان/ریال): ${persianFeatures.currency ? '✅' : '❌'}`);
  console.log(`   فونت Vazirmatn: ${persianFeatures.font ? '✅' : '❌'}`);

  // Check hardcoded strings
  console.log(`\n🔎 بررسی رشته‌های سخت‌کد شده انگلیسی...`);
  const hardcoded = findHardcodedStrings();
  if (hardcoded.length === 0) {
    console.log('   ✅ هیچ رشته سخت‌کد شده‌ای یافت نشد');
  } else {
    console.log(`   ⚠️  ${hardcoded.length} مورد مشکوک یافت شد:`);
    hardcoded.slice(0, 20).forEach(h => {
      console.log(`   - ${h.file}:${h.line} => "${h.text}"`);
    });
    if (hardcoded.length > 20) {
      console.log(`   ... و ${hardcoded.length - 20} مورد دیگر`);
    }
  }

  // Final report
  console.log('\n' + '='.repeat(60));
  console.log('📊 گزارش نهایی:');
  
  const rtlOk = htmlCheck?.dir === 'rtl' && htmlCheck?.lang === 'fa';
  const coverage = allKeys.length > 500 ? 100 : Math.round((allKeys.length / 500) * 100);
  
  console.log(`   پوشش ترجمه: ${allKeys.length} کلید (تخمینی ${coverage}٪)`);
  console.log(`   RTL: ${rtlOk ? '✅ فعال' : '❌ غیرفعال'}`);
  console.log(`   فونت فارسی: ${persianFeatures.font ? '✅ Vazirmatn' : '❌'}`);
  console.log(`   تقویم فارسی: ${persianFeatures.calendar ? '✅' : '❌'}`);
  console.log(`   اعداد فارسی: ${persianFeatures.numbers ? '✅' : '❌'}`);
  console.log(`   تومان/ریال: ${persianFeatures.currency ? '✅' : '❌'}`);
  console.log(`   رشته‌های سخت‌کد: ${hardcoded.length === 0 ? '✅ ۰' : `⚠️ ${hardcoded.length}`}`);
  
  const allGood = rtlOk && persianFeatures.calendar && persianFeatures.numbers && 
                  persianFeatures.currency && persianFeatures.font && hardcoded.length === 0 && allKeys.length > 300;
  
  console.log('\n' + (allGood ? '✅ فارسی‌سازی کامل است!' : '⚠️ فارسی‌سازی نیاز به تکمیل دارد'));
  console.log('='.repeat(60));

  // Exit code
  if (!allGood) {
    process.exit(1);
  }
}

main().catch(console.error);

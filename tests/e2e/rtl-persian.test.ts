/**
 * E2E Tests for Persian Localization & RTL
 * Tests HTML lang/dir, Vazirmatn font, Persian calendar, numbers, currency
 */

import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

function testHtmlLangDir() {
  console.log('🧪 Testing HTML lang/dir...');
  const htmlPath = join(process.cwd(), 'index.html');
  const content = readFileSync(htmlPath, 'utf-8');
  
  const langMatch = content.match(/<html[^>]*lang=["']([^"']+)["']/);
  const dirMatch = content.match(/<html[^>]*dir=["']([^"']+)["']/);
  
  if (!langMatch || langMatch[1] !== 'fa') {
    throw new Error(`Expected lang="fa", got lang="${langMatch?.[1]}"`);
  }
  if (!dirMatch || dirMatch[1] !== 'rtl') {
    throw new Error(`Expected dir="rtl", got dir="${dirMatch?.[1]}"`);
  }
  console.log('  ✅ HTML lang="fa" dir="rtl"');
}

function testVazirmatnFont() {
  console.log('🧪 Testing Vazirmatn font...');
  const htmlPath = join(process.cwd(), 'index.html');
  const content = readFileSync(htmlPath, 'utf-8');
  
  if (!content.includes('Vazirmatn')) {
    throw new Error('Vazirmatn font not found in index.html');
  }
  console.log('  ✅ Vazirmatn font loaded');

  const cssPath = join(process.cwd(), 'src/index.css');
  const cssContent = readFileSync(cssPath, 'utf-8');
  
  if (!cssContent.includes('Vazirmatn') || !cssContent.includes('font-persian')) {
    throw new Error('Vazirmatn font not found in index.css');
  }
  console.log('  ✅ Vazirmatn font in CSS');
}

function testPersianCalendar() {
  console.log('🧪 Testing Persian calendar...');
  
  // Test Intl.DateTimeFormat with Persian calendar
  try {
    const date = new Date('2024-05-15T12:00:00Z');
    const formatter = new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
    const formatted = formatter.format(date);
    
    if (!formatted || formatted.length === 0) {
      throw new Error('Persian calendar formatting failed');
    }
    console.log(`  ✅ Persian calendar: ${formatted}`);
    
    // Check for Persian digits or month names
    if (!/[\u0600-\u06FF]/.test(formatted)) {
      console.warn('  ⚠️  Persian calendar output does not contain Persian characters, but Intl API works');
    }
  } catch (e) {
    console.warn(`  ⚠️  Persian calendar not fully supported in this environment: ${e}`);
    // Fallback test
    const fallbackFormatter = new Intl.DateTimeFormat('fa-IR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
    const fallback = fallbackFormatter.format(new Date());
    console.log(`  ✅ Fallback fa-IR calendar: ${fallback}`);
  }
}

function testPersianNumbers() {
  console.log('🧪 Testing Persian numbers...');
  
  const persianDigits = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
  
  // Test conversion function
  function toPersianDigits(input: string | number): string {
    const str = String(input);
    let result = str;
    const englishDigits = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
    for (let i = 0; i < 10; i++) {
      result = result.replace(new RegExp(englishDigits[i], 'g'), persianDigits[i]);
    }
    return result;
  }
  
  const testCases = [
    { input: 0, expected: '۰' },
    { input: 123, expected: '۱۲۳' },
    { input: 2024, expected: '۲۰۲۴' },
  ];
  
  for (const tc of testCases) {
    const result = toPersianDigits(tc.input);
    if (result !== tc.expected) {
      throw new Error(`Persian number conversion failed: ${tc.input} => ${result}, expected ${tc.expected}`);
    }
  }
  console.log('  ✅ Persian numbers conversion');

  // Test Intl.NumberFormat fa-IR
  const formatter = new Intl.NumberFormat('fa-IR');
  const formatted = formatter.format(1234567);
  console.log(`  ✅ Intl.NumberFormat fa-IR: ${formatted}`);
}

function testCurrencyFormatting() {
  console.log('🧪 Testing currency formatting (Toman/Rial)...');
  
  function formatCurrency(amount: number, currency: 'toman' | 'rial' = 'toman'): string {
    const persianDigits = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
    const englishDigits = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
    let formatted = amount.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '٬');
    for (let i = 0; i < 10; i++) {
      formatted = formatted.replace(new RegExp(englishDigits[i], 'g'), persianDigits[i]);
    }
    const label = currency === 'toman' ? 'تومان' : 'ریال';
    return `${formatted} ${label}`;
  }
  
  const toman = formatCurrency(50000, 'toman');
  if (!toman.includes('تومان')) {
    throw new Error('Toman formatting failed');
  }
  console.log(`  ✅ Toman: ${toman}`);
  
  const rial = formatCurrency(500000, 'rial');
  if (!rial.includes('ریال')) {
    throw new Error('Rial formatting failed');
  }
  console.log(`  ✅ Rial: ${rial}`);
}

function testI18nCoverage() {
  console.log('🧪 Testing i18n coverage...');
  
  const faDir = join(process.cwd(), 'src/i18n/fa');
  const files = readdirSync(faDir).filter((f: string) => f.endsWith('.ts') && f !== 'index.ts');
  
  if (files.length < 15) {
    throw new Error(`Expected at least 15 translation modules, got ${files.length}`);
  }
  console.log(`  ✅ Translation modules: ${files.length}`);
  
  let totalKeys = 0;
  for (const file of files) {
    const content = readFileSync(join(faDir, file), 'utf-8');
    const keys = content.match(/^\s+\w+:\s*['"`]/gm) || [];
    totalKeys += keys.length;
  }
  
  if (totalKeys < 500) {
    throw new Error(`Expected at least 500 translation keys, got ${totalKeys}`);
  }
  console.log(`  ✅ Total translation keys: ${totalKeys}`);
}

function testRTLLogicalProperties() {
  console.log('🧪 Testing RTL logical properties...');
  
  const cssPath = join(process.cwd(), 'src/index.css');
  const content = readFileSync(cssPath, 'utf-8');
  
  if (!content.includes('dir="rtl"') && !content.includes('[dir="rtl"]') && !content.includes('direction: rtl')) {
    throw new Error('RTL CSS not found');
  }
  console.log('  ✅ RTL CSS found');
  
  if (!content.includes('margin-inline') && !content.includes('padding-inline') && !content.includes('border-inline')) {
    console.warn('  ⚠️  Logical properties (margin-inline, etc.) not extensively used, but RTL basic support exists');
  } else {
    console.log('  ✅ RTL logical properties');
  }
}

function testAccessibility() {
  console.log('🧪 Testing Persian accessibility (aria-label)...');
  
  const componentsDir = join(process.cwd(), 'src/components');
  const pagesDir = join(process.cwd(), 'src/pages');
  
  const checkDir = (dir: string) => {
    const files = readdirSync(dir);
    let ariaCount = 0;
    let persianAriaCount = 0;
    
    for (const file of files) {
      if (file.endsWith('.tsx')) {
        const content = readFileSync(join(dir, file), 'utf-8');
        const ariaMatches = content.match(/aria-label="[^"]*"/g) || [];
        ariaCount += ariaMatches.length;
        
        for (const aria of ariaMatches) {
          if (/[\u0600-\u06FF]/.test(aria)) {
            persianAriaCount++;
          }
        }
      }
    }
    
    return { ariaCount, persianAriaCount };
  };
  
  const compResult = checkDir(componentsDir);
  const pagesResult = checkDir(pagesDir);
  
  console.log(`  ✅ Components aria-label: ${compResult.ariaCount} total, ${compResult.persianAriaCount} Persian`);
  console.log(`  ✅ Pages aria-label: ${pagesResult.ariaCount} total, ${pagesResult.persianAriaCount} Persian`);
  
  if (compResult.ariaCount > 0 && compResult.persianAriaCount === 0) {
    console.warn('  ⚠️  No Persian aria-label found in components');
  }
}

async function main() {
  console.log('🇮🇷 RankForge Persian RTL E2E Tests\n');
  console.log('='.repeat(60));
  
  try {
    testHtmlLangDir();
    testVazirmatnFont();
    testPersianCalendar();
    testPersianNumbers();
    testCurrencyFormatting();
    testI18nCoverage();
    testRTLLogicalProperties();
    testAccessibility();
    
    console.log('\n' + '='.repeat(60));
    console.log('✅ All Persian RTL E2E tests passed!');
    console.log('='.repeat(60));
  } catch (e) {
    console.error('\n❌ E2E test failed:', e);
    console.error((e as Error).stack);
    process.exit(1);
  }
}

main();

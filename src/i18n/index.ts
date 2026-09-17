/**
 * RankForge i18n - Persian Localization Core
 * Default language: fa-IR, RTL direction
 * Centralized translation system with type safety
 */

import { fa } from './fa';

export type Locale = 'fa-IR' | 'en-US';
export const DEFAULT_LOCALE: Locale = 'fa-IR';
export const SUPPORTED_LOCALES: Locale[] = ['fa-IR', 'en-US'];

export interface I18nConfig {
  locale: Locale;
  direction: 'rtl' | 'ltr';
  calendar: 'persian' | 'gregorian';
}

export const LOCALE_CONFIG: Record<Locale, I18nConfig> = {
  'fa-IR': {
    locale: 'fa-IR',
    direction: 'rtl',
    calendar: 'persian',
  },
  'en-US': {
    locale: 'en-US',
    direction: 'ltr',
    calendar: 'gregorian',
  },
};

// All translations - currently only fa-IR is fully supported, en-US falls back to fa-IR
const translations: Record<Locale, typeof fa> = {
  'fa-IR': fa,
  'en-US': fa, // Fallback to Persian for now, English support can be added later
} as const;

type NestedKeyOf<ObjectType extends object> = {
  [Key in keyof ObjectType & (string | number)]: ObjectType[Key] extends object
    ? `${Key}` | `${Key}.${NestedKeyOf<ObjectType[Key] & object>}`
    : `${Key}`;
}[keyof ObjectType & (string | number)];

type TranslationValue = string | number | boolean | object;

/**
 * Get nested value from object by dot notation path
 */
function getNestedValue(obj: Record<string, unknown>, path: string): TranslationValue | undefined {
  const keys = path.split('.');
  let current: unknown = obj;

  for (const key of keys) {
    if (current === null || current === undefined || typeof current !== 'object') {
      return undefined;
    }
    current = (current as Record<string, unknown>)[key];
  }

  return current as TranslationValue | undefined;
}

/**
 * Interpolate template string with variables
 * Supports {variable} and {count} patterns
 */
function interpolate(template: string, variables?: Record<string, string | number>): string {
  if (!variables) return template;

  return template.replace(/\{(\w+)\}/g, (match, key) => {
    const value = variables[key];
    if (value !== undefined) {
      return String(value);
    }
    return match;
  });
}

/**
 * Main translation function
 * Usage: t('common.dashboard') or t('auth.loginTitle') or t('common.minutesAgo', { count: 5 })
 */
export function t(key: string, variables?: Record<string, string | number>, locale: Locale = DEFAULT_LOCALE): string {
  const localeTranslations = translations[locale] || translations[DEFAULT_LOCALE];
  
  if (!localeTranslations) {
    console.warn(`[i18n] Locale ${locale} not found, falling back to key: ${key}`);
    return key;
  }

  const value = getNestedValue(localeTranslations as unknown as Record<string, unknown>, key);

  if (value === undefined) {
    console.warn(`[i18n] Translation key not found: ${key} for locale ${locale}`);
    return key;
  }

  if (typeof value !== 'string') {
    console.warn(`[i18n] Translation key ${key} is not a string, got: ${typeof value}`);
    return key;
  }

  return interpolate(value, variables);
}

/**
 * Check if translation exists
 */
export function hasTranslation(key: string, locale: Locale = DEFAULT_LOCALE): boolean {
  const localeTranslations = translations[locale] || translations[DEFAULT_LOCALE];
  if (!localeTranslations) return false;
  const value = getNestedValue(localeTranslations as unknown as Record<string, unknown>, key);
  return value !== undefined;
}

/**
 * Get all translation keys for audit
 */
export function getAllTranslationKeys(locale: Locale = DEFAULT_LOCALE): string[] {
  const localeTranslations = translations[locale] || translations[DEFAULT_LOCALE];
  if (!localeTranslations) return [];

  const keys: string[] = [];

  function collectKeys(obj: Record<string, unknown>, prefix = ''): void {
    for (const [key, value] of Object.entries(obj)) {
      const fullKey = prefix ? `${prefix}.${key}` : key;
      if (typeof value === 'string') {
        keys.push(fullKey);
      } else if (typeof value === 'object' && value !== null) {
        collectKeys(value as Record<string, unknown>, fullKey);
      }
    }
  }

  collectKeys(localeTranslations as unknown as Record<string, unknown>);
  return keys;
}

/**
 * Hook for using translations in components
 */
export function useTranslation(locale: Locale = DEFAULT_LOCALE) {
  return {
    t: (key: string, variables?: Record<string, string | number>) => t(key, variables, locale),
    hasTranslation: (key: string) => hasTranslation(key, locale),
    locale,
    direction: LOCALE_CONFIG[locale].direction,
    isRTL: LOCALE_CONFIG[locale].direction === 'rtl',
  };
}

// Export translations for direct access
export { fa };
export * from './fa';

// Re-export for convenience
export default {
  t,
  hasTranslation,
  getAllTranslationKeys,
  useTranslation,
  DEFAULT_LOCALE,
  SUPPORTED_LOCALES,
  LOCALE_CONFIG,
};

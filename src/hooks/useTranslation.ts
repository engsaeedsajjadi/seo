import { useMemo } from 'react';
import { t as translateFn, DEFAULT_LOCALE, LOCALE_CONFIG, type Locale } from '../i18n';
import { isRTL, getDirection } from '../lib/persian';

/**
 * Hook for using translations with RTL support
 * Default locale is fa-IR with RTL direction
 */
export function useTranslation(locale: Locale = DEFAULT_LOCALE) {
  const config = LOCALE_CONFIG[locale];
  
  const translation = useMemo(() => {
    return {
      t: (key: string, variables?: Record<string, string | number>) => 
        translateFn(key, variables, locale),
      locale,
      direction: config.direction,
      isRTL: config.direction === 'rtl',
      calendar: config.calendar,
    };
  }, [locale, config]);

  return translation;
}

/**
 * Hook for RTL utilities
 */
export function useRTL(locale: Locale = DEFAULT_LOCALE) {
  const direction = getDirection(locale);
  const rtl = isRTL(locale);

  return {
    isRTL: rtl,
    direction,
    rtlClass: (ltrClass: string, rtlClassName: string) => rtl ? rtlClassName : ltrClass,
    // Logical properties helpers
    start: rtl ? 'right' : 'left',
    end: rtl ? 'left' : 'right',
    marginStart: rtl ? 'margin-right' : 'margin-left',
    marginEnd: rtl ? 'margin-left' : 'margin-right',
    paddingStart: rtl ? 'padding-right' : 'padding-left',
    paddingEnd: rtl ? 'padding-left' : 'padding-right',
    borderStart: rtl ? 'border-right' : 'border-left',
    borderEnd: rtl ? 'border-left' : 'border-right',
  };
}

export default useTranslation;

export const SUPPORTED_LOCALES = ['en', 'my', 'id', 'th'] as const;

export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

const HOST_LOCALE_MAP: Record<string, SupportedLocale> = {
  'tripcanvas.co': 'en',
  'www.tripcanvas.co': 'en',
  'malaysia.tripcanvas.co': 'my',
  'indonesia.tripcanvas.co': 'id',
  'thailand.tripcanvas.co': 'th',
};

export const LOCALE_SUBDOMAIN_MAP: Record<SupportedLocale, string> = {
  en: 'tripcanvas.co',
  my: 'malaysia.tripcanvas.co',
  id: 'indonesia.tripcanvas.co',
  th: 'thailand.tripcanvas.co',
};

const SUPPORTED_LOCALE_SET = new Set<string>(SUPPORTED_LOCALES);

export function normalizeHost(value: string | null): string {
  return (value || '').split(':')[0].toLowerCase().trim();
}

export function isSupportedLocale(value: string | null | undefined): value is SupportedLocale {
  return !!value && SUPPORTED_LOCALE_SET.has(value.toLowerCase());
}

export function normalizeLocale(value: string | null | undefined, fallback: SupportedLocale = 'en'): SupportedLocale {
  if (!value) return fallback;
  const locale = value.toLowerCase();
  return isSupportedLocale(locale) ? locale : fallback;
}

export function localeFromHost(host: string): SupportedLocale {
  return HOST_LOCALE_MAP[host] || 'en';
}

export function splitLocaleFromPath(pathname: string): {
  pathLocale: SupportedLocale | null;
  pathWithoutLocale: string;
} {
  const segments = pathname.split('/').filter(Boolean);
  const first = segments[0]?.toLowerCase();

  if (isSupportedLocale(first)) {
    const rest = segments.slice(1).join('/');
    return {
      pathLocale: first,
      pathWithoutLocale: rest ? `/${rest}` : '/',
    };
  }

  return {
    pathLocale: null,
    pathWithoutLocale: pathname || '/',
  };
}

// Builds a full URL switching to a different locale's subdomain.
// e.g. on malaysia.tripcanvas.co, buildLocaleUrl('/blog/foo', 'id', host)
//      → 'https://indonesia.tripcanvas.co/blog/foo'
// On non-production hosts (dev workers.dev), falls back to path prefix.
export function buildLocaleUrl(pathname: string, targetLocale: SupportedLocale, _currentHost: string): string {
  const { pathWithoutLocale } = splitLocaleFromPath(pathname || '/');
  const cleanPath = pathWithoutLocale.startsWith('/') ? pathWithoutLocale : `/${pathWithoutLocale}`;
  const targetSubdomain = LOCALE_SUBDOMAIN_MAP[targetLocale];
  return `https://${targetSubdomain}${cleanPath}`;
}

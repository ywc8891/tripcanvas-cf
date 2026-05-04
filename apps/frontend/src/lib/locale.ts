export const SUPPORTED_LOCALES = ['en', 'my', 'id', 'th', 'zh'] as const;

export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];
export type MarketLocale = 'en' | 'my' | 'id' | 'th';

// All non-English locales are path-prefixed (e.g. /id/, /th/, /my/, /zh/)
export const LANGUAGE_PATH_LOCALES: readonly string[] = ['my', 'id', 'th', 'zh'];

export function isLanguagePathLocale(locale: string): boolean {
  return LANGUAGE_PATH_LOCALES.includes(locale);
}

// Which locales each market supports (for locale switcher UI)
export const MARKET_LOCALES: Record<MarketLocale, readonly SupportedLocale[]> = {
  en: ['en'],
  my: ['en', 'my', 'zh'],
  id: ['en', 'id', 'zh'],
  th: ['en', 'th', 'zh', 'id'],
};

// Returns the market for a given locale (non-market locales like zh fall back to 'en')
export function marketLocaleOf(locale: SupportedLocale): MarketLocale {
  if (locale === 'zh') return 'en';
  return locale as MarketLocale;
}

// Maps hostname → market (country). All markets default to 'en' locale.
const HOST_MARKET_MAP: Record<string, MarketLocale> = {
  // Production subdomains
  'tripcanvas.co': 'en',
  'www.tripcanvas.co': 'en',
  'malaysia.tripcanvas.co': 'my',
  'indonesia.tripcanvas.co': 'id',
  'thailand.tripcanvas.co': 'th',
  // Staging named workers
  'tripcanvas.academyt.workers.dev': 'en',
  'tripcanvas-my.academyt.workers.dev': 'my',
  'tripcanvas-id.academyt.workers.dev': 'id',
  'tripcanvas-th.academyt.workers.dev': 'th',
  'tripcanvas-my-zh.academyt.workers.dev': 'my',
  'tripcanvas-th-zh.academyt.workers.dev': 'th',
  'tripcanvas-th-id.academyt.workers.dev': 'th',
};

export const LOCALE_SUBDOMAIN_MAP: Record<MarketLocale, string> = {
  en: 'tripcanvas.co',
  my: 'malaysia.tripcanvas.co',
  id: 'indonesia.tripcanvas.co',
  th: 'thailand.tripcanvas.co',
};

// Staging workers map — mirrors production subdomain routing
const STAGING_WORKER_MAP: Record<MarketLocale, string> = {
  en: 'tripcanvas.academyt.workers.dev',
  my: 'tripcanvas-my.academyt.workers.dev',
  id: 'tripcanvas-id.academyt.workers.dev',
  th: 'tripcanvas-th.academyt.workers.dev',
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

// Returns the market (country) for a given host — NOT the content locale.
export function marketFromHost(host: string): MarketLocale {
  return HOST_MARKET_MAP[host] || 'en';
}

// Default locale is always 'en' for all markets.
// Kept for backward compatibility but now always returns 'en'.
export function localeFromHost(_host: string): SupportedLocale {
  return 'en';
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

// Returns true when running on a known staging worker host.
export function isStagingWorker(host: string): boolean {
  return Object.values(STAGING_WORKER_MAP).includes(host);
}

// Returns true when running on a local dev host (not staging workers).
export function isDevHost(host: string): boolean {
  if (isStagingWorker(host)) return false;
  return host.endsWith('.workers.dev') || host.startsWith('localhost') || host.startsWith('127.');
}

// Returns a locale-aware path. Non-English locales get path prefix: /id/blog/foo, /zh/blog/foo, etc.
export function localePath(path: string, locale: string): string {
  const clean = path.startsWith('/') ? path : `/${path}`;
  if (isLanguagePathLocale(locale)) return `/${locale}${clean}`;
  return clean;
}

// Returns the canonical post URL: /[primaryCategory]/[slug] with optional /zh/ prefix.
// Falls back to /blog/[slug] if no category is available.
export function getPostUrl(
  slug: string,
  locale: string,
  primaryCategorySlug?: string | null,
): string {
  const path = primaryCategorySlug
    ? `/${primaryCategorySlug}/${slug}`
    : `/blog/${slug}`;
  return localePath(path, locale);
}

// Extract the primary category slug from a post's categories array.
export function primaryCategory(
  categories?: { slug?: string }[] | null,
): string | null {
  const first = categories?.[0];
  return first?.slug ?? null;
}

// Builds a URL that switches locale within the same market host.
// All non-English locales use path prefix (/id/, /th/, /my/, /zh/).
// English (default) has no prefix.
export function buildLocaleUrl(pathname: string, targetLocale: SupportedLocale, currentHost: string): string {
  // Strip any existing locale prefix from the path
  const strippedPath = stripLocalePrefix(pathname);
  const cleanPath = strippedPath.startsWith('/') ? strippedPath : `/${strippedPath}`;

  // Non-English locales get path prefix, stay on same host
  if (isLanguagePathLocale(targetLocale)) {
    return `/${targetLocale}${cleanPath}`;
  }

  // English = no prefix
  return cleanPath;
}

// Strip any leading locale prefix from a path (e.g. /zh/blog/foo → /blog/foo)
export function stripLocalePrefix(pathname: string): string {
  const match = pathname.match(/^\/([a-z]{2})(\/.*)?$/);
  if (match && LANGUAGE_PATH_LOCALES.includes(match[1])) {
    return match[2] || '/';
  }
  return pathname;
}

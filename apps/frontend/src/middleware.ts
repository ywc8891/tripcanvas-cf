import { getPostBySlug } from './lib/payload';
import {
  isSupportedLocale,
  isDevHost,
  normalizeHost,
  isLanguagePathLocale,
  getPostUrl,
  primaryCategory,
  marketFromHost,
  type SupportedLocale,
} from './lib/locale';

// Returns the language path prefix if the pathname starts with a known path locale (/zh/).
function extractPathLocale(pathname: string): { pathLocale: string; strippedPath: string } | null {
  const match = pathname.match(/^\/([a-z]{2})(\/.*)?$/);
  if (!match) return null;
  const candidate = match[1];
  if (!isLanguagePathLocale(candidate)) return null;
  return { pathLocale: candidate, strippedPath: match[2] || '/' };
}

function shouldHandleLegacyRedirect(pathname: string): boolean {
  if (!pathname || pathname === '/' || pathname === '/404') return false;
  if (pathname === '/blog' || pathname.startsWith('/blog/')) return false;
  if (pathname.startsWith('/api/')) return false;
  if (pathname.startsWith('/_astro/') || pathname.startsWith('/_image/')) return false;
  if (pathname.startsWith('/admin')) return false;
  if (pathname === '/favicon.svg' || pathname === '/robots.txt' || pathname === '/sitemap.xml') return false;

  const segments = pathname.split('/').filter(Boolean);
  // 2-segment paths are canonical post URLs (/[location]/[slug]) — serve directly
  if (segments.length === 2) return false;

  const lastSegment = segments[segments.length - 1] || '';
  if (/\.[a-z0-9]+$/i.test(lastSegment)) return false;

  return true;
}

export async function onRequest(
  context: {
    request: Request;
    locals?: {
      runtime?: { env?: Record<string, unknown> };
      locale?: string;
      host?: string;
    };
  },
  next: () => Promise<Response>,
): Promise<Response> {
  const locals = (context.locals || {}) as {
    runtime?: { env?: Record<string, unknown> };
    locale?: string;
    host?: string;
  };
  const env = locals.runtime?.env;
  const host = normalizeHost(context.request.headers.get('x-tc-host') || context.request.headers.get('host'));
  const url = new URL(context.request.url);

  const headerLocaleRaw = context.request.headers.get('x-tc-locale');
  const headerLocale = isSupportedLocale(headerLocaleRaw) ? headerLocaleRaw.toLowerCase() : null;

  const queryLocaleRaw = isDevHost(host) ? url.searchParams.get('locale') : null;
  const queryLocale = isSupportedLocale(queryLocaleRaw) ? queryLocaleRaw!.toLowerCase() : null;

  // _lp is set internally when a path-locale rewrite is in progress
  // (middleware re-runs on rewritten URL)
  const internalLocaleRaw = url.searchParams.get('_lp');
  const internalLocale = isSupportedLocale(internalLocaleRaw) ? (internalLocaleRaw!.toLowerCase() as string) : null;

  const pathLocaleMatch = extractPathLocale(url.pathname);

  // Locale priority: header override > internal rewrite > query param > path prefix > default (en)
  const locale = headerLocale || internalLocale || queryLocale || (pathLocaleMatch?.pathLocale as any) || 'en';

  // Market is always derived from the host (en/my/id/th), independent of locale
  const market = marketFromHost(host);

  locals.locale = locale;
  locals.host = host;

  if (env) {
    (globalThis as unknown as {
      __CMS_ENV__?: {
        CMS_SERVICE?: unknown;
        locale?: string;
        host?: string;
        market?: string;
      };
    }).__CMS_ENV__ = {
      CMS_SERVICE: (env as { CMS_SERVICE?: unknown }).CMS_SERVICE,
      locale,
      host,
      market,
    };
  }

  // For path-locale URLs (e.g. /id/blog/foo, /zh/blog/foo), rewrite to the
  // canonical path (/blog/foo?_lp=id) so Astro routes match. The _lp param
  // carries the locale through the second middleware run.
  if (pathLocaleMatch && !internalLocale && (context.request.method === 'GET' || context.request.method === 'HEAD')) {
    const rewriteUrl = new URL(url);
    rewriteUrl.pathname = pathLocaleMatch.strippedPath;
    rewriteUrl.searchParams.set('_lp', pathLocaleMatch.pathLocale);
    return (context as any).rewrite(rewriteUrl);
  }

  if (context.request.method === 'GET' || context.request.method === 'HEAD') {
    const pathname = url.pathname;

    if (shouldHandleLegacyRedirect(pathname)) {
      const segments = pathname.split('/').filter(Boolean);
      const finalSlug = segments[segments.length - 1];

      if (finalSlug) {
        const legacyPost = await getPostBySlug(finalSlug, locale);
        if (legacyPost?.slug) {
          const canonicalPath = getPostUrl(legacyPost.slug, locale, primaryCategory(legacyPost.categories));
          return Response.redirect(new URL(canonicalPath, url).toString(), 301);
        }
      }
    }
  }

  return next();
}

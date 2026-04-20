import { getPostBySlug } from './lib/payload';
import {
  isSupportedLocale,
  isDevHost,
  localeFromHost,
  normalizeHost,
} from './lib/locale';

// Expose Cloudflare bindings to non-Astro modules (e.g. src/lib/payload.ts)
// via a global. The Cloudflare adapter places bindings on
// `locals.runtime.env`. We surface only what we need.
//
// Typed loosely to avoid depending on `astro:middleware` virtual types here.
function shouldHandleLegacyRedirect(pathname: string): boolean {
  if (!pathname || pathname === '/' || pathname === '/404') return false;
  if (pathname === '/blog' || pathname.startsWith('/blog/')) return false;
  if (pathname.startsWith('/api/')) return false;
  if (pathname.startsWith('/_astro/') || pathname.startsWith('/_image/')) return false;
  if (pathname.startsWith('/admin')) return false;
  if (pathname === '/favicon.svg' || pathname === '/robots.txt' || pathname === '/sitemap.xml') return false;

  const lastSegment = pathname.split('/').filter(Boolean).pop() || '';
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

  const locale = headerLocale || queryLocale || localeFromHost(host);

  locals.locale = locale;
  locals.host = host;

  if (env) {
    (globalThis as unknown as {
      __CMS_ENV__?: {
        CMS_SERVICE?: unknown;
        locale?: string;
        host?: string;
      };
    }).__CMS_ENV__ = {
      CMS_SERVICE: (env as { CMS_SERVICE?: unknown }).CMS_SERVICE,
      locale,
      host,
    };
  }

  if (context.request.method === 'GET' || context.request.method === 'HEAD') {
    const pathname = url.pathname;

    if (shouldHandleLegacyRedirect(pathname)) {
      const segments = pathname.split('/').filter(Boolean);
      const finalSlug = segments[segments.length - 1];

      if (finalSlug) {
        const legacyPost = await getPostBySlug(finalSlug, locale);
        if (legacyPost?.slug) {
          return Response.redirect(new URL(`/blog/${legacyPost.slug}`, url).toString(), 301);
        }
      }
    }
  }

  return next();
}

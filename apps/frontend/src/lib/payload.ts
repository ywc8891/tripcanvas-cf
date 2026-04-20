// Types for Payload collections
export interface Post {
  id: string | number;
  wpId?: number;
  title: string;
  slug: string;
  content: unknown;
  createdAt: string;
  updatedAt: string;
}

export interface Category {
  id: string | number;
  name: string;
  slug: string;
}

export interface Tag {
  id: string | number;
  name: string;
  slug: string;
}

export interface Media {
  id: string | number;
  url: string;
  alt?: string;
  filename: string;
}

const DEFAULT_LOCALE = 'en';

function getRuntimeLocale(): string {
  const env = (globalThis as unknown as { __CMS_ENV__?: { locale?: string } }).__CMS_ENV__;
  const locale = env?.locale;
  if (locale === 'en' || locale === 'my' || locale === 'id' || locale === 'th') {
    return locale;
  }
  return DEFAULT_LOCALE;
}

// Simple fetch with retry for handling transient errors
async function fetchWithRetry(
  url: string,
  fetcher: typeof fetch,
  retries = 2,
): Promise<Response> {
  let lastError: Error | null = null;

  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetcher(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
      });
      return response;
    } catch (error) {
      lastError = error as Error;
      // Wait a bit before retry
      await new Promise(resolve => setTimeout(resolve, 100 * (i + 1)));
    }
  }
  throw lastError;
}

// Resolve which fetcher and base URL to use.
// Inside the Cloudflare Worker, fetching another *.workers.dev URL fails
// (CF error 1042). Use the CMS_SERVICE service binding instead when present.
function resolveCmsClient(): { baseUrl: string; fetcher: typeof fetch } {
  const publicUrl = 'https://tripcanvas-cms.academyt.workers.dev';

  // Astro Cloudflare adapter exposes bindings via Astro.locals.runtime.env,
  // but here we read from a global set by middleware (see middleware.ts).
  const env = (globalThis as unknown as { __CMS_ENV__?: { CMS_SERVICE?: { fetch: typeof fetch } } }).__CMS_ENV__;
  const binding = env?.CMS_SERVICE;

  if (binding && typeof binding.fetch === 'function') {
    return {
      // Service-binding fetch ignores hostname but URL must be absolute.
      baseUrl: 'https://cms.internal',
      fetcher: binding.fetch.bind(binding) as typeof fetch,
    };
  }

  return { baseUrl: publicUrl, fetcher: fetch };
}

// Payload REST API helper
export async function fetchPayload<T>(
  collection: string,
  query: Record<string, unknown> = {}
): Promise<{ docs: T[]; totalDocs: number }> {
  const { baseUrl, fetcher } = resolveCmsClient();

  const params = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      value.forEach(v => params.append(key, String(v)));
    } else if (value !== undefined && value !== null) {
      params.set(key, String(value));
    }
  });

  const url = `${baseUrl}/api/${collection}?${params}`;

  try {
    const response = await fetchWithRetry(url, fetcher);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`HTTP ${response.status} fetching ${collection}:`, errorText);
      return { docs: [], totalDocs: 0 };
    }

    return response.json();
  } catch (error) {
    console.error(`Error fetching ${collection}:`, String(error));
    return { docs: [], totalDocs: 0 };
  }
}

// Helper functions
export async function getPosts(locale?: string): Promise<Post[]> {
  const resolvedLocale = locale || getRuntimeLocale();
  const result = await fetchPayload<Post>('posts', {
    locale: resolvedLocale,
    depth: 1,
    sort: '-createdAt',
    'where[title][exists]': 'true',
  });
  return result.docs;
}

export async function getPostBySlug(slug: string, locale?: string): Promise<Post | null> {
  const resolvedLocale = locale || getRuntimeLocale();
  const result = await fetchPayload<Post>('posts', {
    locale: resolvedLocale,
    'where[slug][equals]': slug,
    depth: 2,
  });
  return result.docs[0] || null;
}

export async function getPostByWpId(wpId: number, locale?: string): Promise<Post | null> {
  const resolvedLocale = locale || getRuntimeLocale();
  const result = await fetchPayload<Post>('posts', {
    locale: resolvedLocale,
    'where[wpId][equals]': wpId,
    depth: 0,
    limit: 1,
  });
  return result.docs[0] || null;
}

export async function getCategories(locale?: string): Promise<Category[]> {
  const resolvedLocale = locale || getRuntimeLocale();
  const result = await fetchPayload<Category>('categories', {
    locale: resolvedLocale,
    depth: 0,
    sort: 'name',
    'where[name][exists]': 'true',
  });
  return result.docs;
}

export async function getTags(locale?: string): Promise<Tag[]> {
  const resolvedLocale = locale || getRuntimeLocale();
  const result = await fetchPayload<Tag>('tags', {
    locale: resolvedLocale,
    depth: 0,
    sort: 'name',
  });
  return result.docs;
}

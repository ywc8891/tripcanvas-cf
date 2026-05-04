// Types for Payload collections
export interface PostCategory {
  id: string | number;
  slug: string;
  name: string;
}

export interface Post {
  id: string | number;
  wpId?: number;
  title: string;
  slug: string;
  excerpt?: string;
  publishedAt?: string;
  content: unknown;
  createdAt: string;
  updatedAt: string;
  market?: string;
  categories?: PostCategory[];
}

export interface PostsResult {
  docs: Post[];
  totalDocs: number;
  totalPages: number;
  page: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
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
  if (locale === 'en' || locale === 'my' || locale === 'id' || locale === 'th' || locale === 'zh') {
    return locale;
  }
  return DEFAULT_LOCALE;
}

// Returns the market (country) for the current context — always host-derived (en/my/id/th).
// Independent of content locale (a post can be in locale 'en' on the 'id' market).
function getRuntimeMarket(): string {
  const env = (globalThis as unknown as { __CMS_ENV__?: { market?: string } }).__CMS_ENV__;
  const market = env?.market;
  if (market === 'en' || market === 'my' || market === 'id' || market === 'th') {
    return market;
  }
  return DEFAULT_LOCALE; // 'en'
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
  
  const finalQuery = { ...query };
  if (!('fallback-locale' in finalQuery)) {
    finalQuery['fallback-locale'] = 'en';
  }

  Object.entries(finalQuery).forEach(([key, value]) => {
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

const R2_IMG_RE = /\(r2:\/\/[^/]+\/([^)]+)\)/;
const R2_PUBLIC_URL = 'https://pub-2faca0649c2047a1859536a3114d3f95.r2.dev';

type LexicalLike = { type?: string; wp_url?: string; value?: unknown; children?: LexicalLike[]; root?: LexicalLike };

function findFirstImageInNodes(nodes: LexicalLike[] | undefined): string | null {
  if (!Array.isArray(nodes)) return null;
  for (const node of nodes) {
    if (!node || typeof node !== 'object') continue;
    if (node.type === 'placeholder-image') {
      const url = node.wp_url;
      if (typeof url === 'string' && url.startsWith('https://')) return url;
    }
    if (node.type === 'upload') {
      const v = node.value as { url?: string } | null;
      if (v && typeof v.url === 'string' && v.url.startsWith('https://')) return v.url;
    }
    const fromChildren = findFirstImageInNodes(node.children);
    if (fromChildren) return fromChildren;
  }
  return null;
}

export function firstImageUrl(content: unknown): string | null {
  if (!content || typeof content !== 'object') return null;
  const root = (content as LexicalLike).root;
  if (root) {
    const fromNodes = findFirstImageInNodes(root.children);
    if (fromNodes) return fromNodes;
  }
  const json = JSON.stringify(content);
  const m = R2_IMG_RE.exec(json);
  return m ? `${R2_PUBLIC_URL}/${m[1]}` : null;
}

// Helper functions
export async function getPosts(
  locale?: string,
  page = 1,
  limit = 12,
  options?: { fallbackLocale?: string },
): Promise<PostsResult> {
  const resolvedLocale = locale || getRuntimeLocale();
  // Market is always host-derived, independent of content locale
  const market = getRuntimeMarket();
  const marketFilter = market !== 'en' ? { 'where[market][equals]': market } : {};
  const fallbackOverride = options?.fallbackLocale !== undefined
    ? { 'fallback-locale': options.fallbackLocale }
    : {};
  const result = await fetchPayload<Post>('posts', {
    locale: resolvedLocale,
    depth: 1,
    sort: '-createdAt',
    limit,
    page,
    ...marketFilter,
    ...fallbackOverride,
  });
  return {
    docs: result.docs,
    totalDocs: result.totalDocs ?? 0,
    totalPages: (result as unknown as { totalPages?: number }).totalPages ?? 1,
    page: (result as unknown as { page?: number }).page ?? page,
    hasNextPage: (result as unknown as { hasNextPage?: boolean }).hasNextPage ?? false,
    hasPrevPage: (result as unknown as { hasPrevPage?: boolean }).hasPrevPage ?? false,
  };
}

export async function getPostsByCategory(
  categorySlug: string,
  locale?: string,
  page = 1,
  limit = 12,
): Promise<PostsResult> {
  const resolvedLocale = locale || getRuntimeLocale();
  const market = getRuntimeMarket();
  const marketFilter = market !== 'en' ? { 'where[market][equals]': market } : {};
  const result = await fetchPayload<Post>('posts', {
    locale: resolvedLocale,
    depth: 1,
    sort: '-createdAt',
    limit,
    page,
    'where[categories.slug][equals]': categorySlug,
    ...marketFilter,
  });
  return {
    docs: result.docs,
    totalDocs: result.totalDocs ?? 0,
    totalPages: (result as unknown as { totalPages?: number }).totalPages ?? 1,
    page: (result as unknown as { page?: number }).page ?? page,
    hasNextPage: (result as unknown as { hasNextPage?: boolean }).hasNextPage ?? false,
    hasPrevPage: (result as unknown as { hasPrevPage?: boolean }).hasPrevPage ?? false,
  };
}

export async function getPostBySlug(slug: string, locale?: string): Promise<Post | null> {
  const resolvedLocale = locale || getRuntimeLocale();
  const result = await fetchPayload<Post>('posts', {
    locale: resolvedLocale,
    'where[slug][equals]': slug,
    depth: 1,
  });
  return result.docs[0] || null;
}

export async function getPostByWpId(wpId: number, locale?: string): Promise<Post | null> {
  const resolvedLocale = locale || getRuntimeLocale();
  const result = await fetchPayload<Post>('posts', {
    locale: resolvedLocale,
    'where[wpId][equals]': wpId,
    depth: 1,
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
  });
  return result.docs;
}

const MARKET_CATEGORY_SLUGS: Record<string, string[]> = {
  my: ['inspiration', 'johor', 'kedah', 'kuala-lumpur', 'melaka', 'negeri-sembilan', 'others', 'pahang', 'penang', 'perak', 'sabah', 'shopping', 'terengganu', 'best-of-malaysia'],
  id: ['bali', 'bandung', 'banyuwangi', 'bintan-batam', 'bogor', 'flores', 'health-wellness', 'inspiration', 'jakarta', 'java', 'jogja', 'lombok', 'malang', 'nusa-tenggara', 'semarang', 'shopping', 'sulawesi', 'sumatra', 'surabaya', 'west-papua', 'best-of-indonesia'],
  th: ['bangkok', 'chiang-mai', 'chiang-rai', 'chonburi', 'hat-yai', 'hua-hin', 'kanchanaburi', 'khao-yai', 'krabi', 'nan', 'phang-nga', 'phetchabun', 'phuket', 'ratchaburi', 'satun', 'shopping', 'koh-samui', 'surat-thani', 'best-of-thailand', 'southern-thailand', 'central-thailand', 'northern-thailand'],
};

export async function getCategoriesByMarket(locale: string, market: string): Promise<Category[]> {
  const allCats = await getCategories(locale);
  const allowedSlugs = MARKET_CATEGORY_SLUGS[market];
  if (!allowedSlugs) return allCats;
  return allCats.filter(c => allowedSlugs.includes(c.slug));
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

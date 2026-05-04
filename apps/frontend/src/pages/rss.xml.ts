import type { APIRoute } from 'astro';
import { getPosts } from '../lib/payload';
import { getPostUrl, primaryCategory, marketFromHost } from '../lib/locale';
import rss from '@astrojs/rss';

export const GET: APIRoute = async (context) => {
  const host = (context.locals as { host?: string }).host || context.url.hostname;
  const locale = (context.locals as { locale?: string }).locale || 'en';
  const market = marketFromHost(host);
  const { docs: posts } = await getPosts(locale, 1, 20);

  const siteUrl = `https://${host}`;

  return rss({
    title: `TripCanvas ${market.toUpperCase()} RSS Feed`,
    description: `Latest travel stories from TripCanvas ${market.toUpperCase()}`,
    site: siteUrl,
    items: posts.map((post: any) => ({
      title: post.title || '',
      pubDate: new Date(post.publishedAt || post.createdAt),
      link: new URL(getPostUrl(post.slug, locale, primaryCategory(post.categories)), siteUrl).toString(),
    })),
    customData: `<language>${locale}</language>`,
  });
};

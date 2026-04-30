// Simple i18n utility for UI strings.
// Market locales (en/my/id/th) use their own labels.
// ZH locale uses Chinese translations.

type TranslationKey =
  | 'nav.home'
  | 'nav.stories'
  | 'brand.tagline'
  | 'sidebar.destinations'
  | 'sidebar.recentPosts'
  | 'related.title'
  | 'post.readMore'
  | 'post.backToAll'
  | 'home.featured'
  | 'home.browseCategory'
  | 'home.viewAll'
  | 'home.noStories';

const translations: Record<string, Record<TranslationKey, string>> = {
  en: {
    'nav.home': 'Home',
    'nav.stories': 'Stories',
    'brand.tagline': 'Travel stories across Southeast Asia',
    'sidebar.destinations': 'Destinations',
    'sidebar.recentPosts': 'Recent Posts',
    'related.title': 'You Might Also Like',
    'post.readMore': 'Read More',
    'post.backToAll': '← Back to all stories',
    'home.featured': 'Featured',
    'home.browseCategory': 'Browse by category',
    'home.viewAll': 'View all stories →',
    'home.noStories': 'No stories found for this locale yet.',
  },
  my: {
    'nav.home': 'Utama',
    'nav.stories': 'Cerita',
    'brand.tagline': 'Cerita perjalanan di Asia Tenggara',
    'sidebar.destinations': 'Destinasi',
    'sidebar.recentPosts': 'Artikel Terbaru',
    'related.title': 'Anda Mungkin Suka',
    'post.readMore': 'Baca Lagi',
    'post.backToAll': '← Kembali ke semua cerita',
    'home.featured': 'Pilihan',
    'home.browseCategory': 'Layari mengikut kategori',
    'home.viewAll': 'Lihat semua cerita →',
    'home.noStories': 'Tiada cerita ditemui untuk lokasi ini.',
  },
  id: {
    'nav.home': 'Beranda',
    'nav.stories': 'Cerita',
    'brand.tagline': 'Cerita perjalanan di Asia Tenggara',
    'sidebar.destinations': 'Destinasi',
    'sidebar.recentPosts': 'Artikel Terbaru',
    'related.title': 'Mungkin Anda Suka',
    'post.readMore': 'Baca Selengkapnya',
    'post.backToAll': '← Kembali ke semua cerita',
    'home.featured': 'Pilihan',
    'home.browseCategory': 'Jelajahi berdasarkan kategori',
    'home.viewAll': 'Lihat semua cerita →',
    'home.noStories': 'Belum ada cerita untuk lokasi ini.',
  },
  th: {
    'nav.home': 'หน้าแรก',
    'nav.stories': 'เรื่องราว',
    'brand.tagline': 'เรื่องราวการเดินทางในเอเชียตะวันออกเฉียงใต้',
    'sidebar.destinations': 'จุดหมายปลายทาง',
    'sidebar.recentPosts': 'บทความล่าสุด',
    'related.title': 'คุณอาจชอบ',
    'post.readMore': 'อ่านต่อ',
    'post.backToAll': '← กลับไปที่เรื่องทั้งหมด',
    'home.featured': 'แนะนำ',
    'home.browseCategory': 'เรียกดูตามหมวดหมู่',
    'home.viewAll': 'ดูเรื่องทั้งหมด →',
    'home.noStories': 'ยังไม่พบเรื่องราวสำหรับภาษานี้',
  },
  zh: {
    'nav.home': '首页',
    'nav.stories': '文章',
    'brand.tagline': '东南亚旅行故事',
    'sidebar.destinations': '目的地',
    'sidebar.recentPosts': '最新文章',
    'related.title': '你可能也喜欢',
    'post.readMore': '阅读更多',
    'post.backToAll': '← 返回所有文章',
    'home.featured': '精选',
    'home.browseCategory': '按类别浏览',
    'home.viewAll': '查看所有文章 →',
    'home.noStories': '暂时没有找到文章。',
  },
};

export function t(key: TranslationKey, locale: string): string {
  return translations[locale]?.[key] ?? translations.en[key] ?? key;
}

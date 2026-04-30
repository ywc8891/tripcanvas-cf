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
  | 'home.noStories'
  | 'search.placeholder';

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
    'search.placeholder': 'What are you looking for?',
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
    'search.placeholder': 'Apa yang anda cari?',
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
    'search.placeholder': 'Apa yang anda cari?',
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
    'search.placeholder': 'คุณกำลังมองหาอะไร?',
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
    'search.placeholder': '您在找什么？',
  },
};

export function t(key: TranslationKey, locale: string): string {
  return translations[locale]?.[key] ?? translations.en[key] ?? key;
}

export interface NavItem {
  label: string;
  href: string;
  children?: NavItem[];
}

export interface MarketNav {
  topLevel: NavItem[];
  staticPages: NavItem[];
}

export interface SocialLinks {
  facebook: string;
  twitter: string;
  youtube: string;
  instagram: string;
}

export const MARKET_SOCIAL: Record<string, SocialLinks> = {
  my: {
    facebook: 'https://www.facebook.com/tripcanvas.malaysia',
    twitter: 'https://twitter.com/tripcanvas',
    youtube: 'https://www.youtube.com/channel/UCMR27IYwg4JOlEHrs0K0ODQ',
    instagram: 'https://instagram.com/tripcanvas.travel',
  },
  id: {
    facebook: 'https://www.facebook.com/tripcanvas',
    twitter: 'https://twitter.com/tripcanvas',
    youtube: 'https://www.youtube.com/channel/UCMR27IYwg4JOlEHrs0K0ODQ',
    instagram: 'https://instagram.com/tripcanvas.travel',
  },
  th: {
    facebook: 'https://www.facebook.com/tripcanvas.thailand',
    twitter: 'https://twitter.com/tripcanvas',
    youtube: 'https://www.youtube.com/channel/UCMR27IYwg4JOlEHrs0K0ODQ',
    instagram: 'https://instagram.com/tripcanvas.travel',
  },
};

export const MARKET_NAV: Record<string, MarketNav> = {
  my: {
    topLevel: [
      { label: 'KL & Selangor', href: '/kuala-lumpur/' },
      { label: 'Johor', href: '/johor/' },
      { label: 'Melaka', href: '/melaka/' },
      { label: 'Kedah & Langkawi', href: '/kedah/' },
      { label: 'Penang', href: '/penang/' },
      { label: 'Perak', href: '/perak/' },
      { label: 'Pahang', href: '/pahang/' },
      { label: 'Sabah', href: '/sabah/' },
      { label: 'Terengganu', href: '/terengganu/' },
      { label: 'Negeri Sembilan', href: '/negeri-sembilan/' },
      { label: 'Best of Malaysia', href: '/best-of-malaysia/' },
      { label: 'Inspiration', href: '/inspiration/' },
    ],
    staticPages: [
      { label: 'About Us', href: '/about-us/' },
      { label: 'Contact Us', href: '/contact/' },
      { label: 'Terms & Conditions', href: '/terms-and-conditions/' },
      { label: 'Privacy Policy', href: '/privacy-policy/' },
    ],
  },
  id: {
    topLevel: [
      {
        label: 'Bali', href: '/bali/', children: [
          { label: 'Where to stay', href: '/hotels-villas-bali/' },
          { label: 'Things to do', href: '/attractions-activities-bali/' },
          { label: 'Where to eat', href: '/restaurants-cafes-bars-bali/' },
          { label: 'Guides & Tips', href: '/travel-guide-tips-bali/' },
          { label: 'Itineraries', href: '/itineraries/' },
          { label: 'Our hotel reviews', href: '/hotel-experience-reviews/' },
        ]
      },
      {
        label: 'Java', href: '/java/', children: [
          { label: 'Jakarta', href: '/jakarta/' },
          { label: 'Yogyakarta', href: '/jogja/' },
          { label: 'Bandung', href: '/bandung/' },
          { label: 'Malang', href: '/malang/' },
          { label: 'Surabaya', href: '/surabaya/' },
          { label: 'Semarang', href: '/semarang/' },
          { label: 'Bogor', href: '/bogor/' },
          { label: 'Banyuwangi', href: '/banyuwangi/' },
        ]
      },
      { label: 'Lombok', href: '/lombok/' },
      { label: 'Medan & Lake Toba', href: '/sumatra/' },
      { label: 'Bintan & Batam', href: '/bintan-batam/' },
      { label: 'Flores', href: '/flores/' },
      { label: 'Sulawesi', href: '/sulawesi/' },
      { label: 'West Papua', href: '/west-papua/' },
      { label: 'Best of Indonesia', href: '/best-of-indonesia/' },
      { label: 'Inspiration', href: '/inspiration/' },
    ],
    staticPages: [
      { label: 'About Us', href: '/about-us/' },
      { label: 'Contact Us', href: '/contact/' },
      { label: 'Terms & Conditions', href: '/terms-and-conditions/' },
      { label: 'Privacy Policy', href: '/privacy-policy/' },
    ],
  },
  th: {
    topLevel: [
      { label: 'Bangkok', href: '/bangkok/' },
      {
        label: 'Southern Thailand', href: '/southern-thailand/', children: [
          { label: 'Phuket', href: '/phuket/' },
          { label: 'Hat Yai', href: '/hat-yai/' },
          { label: 'Krabi', href: '/krabi/' },
          { label: 'Koh Lipe & Satun', href: '/satun/' },
          { label: 'Phang Nga', href: '/phang-nga/' },
          { label: 'Koh Samui', href: '/koh-samui/' },
          { label: 'Surat Thani', href: '/surat-thani/' },
        ]
      },
      {
        label: 'Central Thailand', href: '/central-thailand/', children: [
          { label: 'Khao Yai', href: '/khao-yai/' },
          { label: 'Hua Hin', href: '/hua-hin/' },
          { label: 'Kanchanaburi', href: '/kanchanaburi/' },
          { label: 'Pattaya & Chonburi', href: '/chonburi/' },
          { label: 'Ratchaburi', href: '/ratchaburi/' },
        ]
      },
      {
        label: 'Northern Thailand', href: '/northern-thailand/', children: [
          { label: 'Chiang Mai', href: '/chiang-mai/' },
          { label: 'Chiang Rai', href: '/chiang-rai/' },
          { label: 'Phetchabun', href: '/phetchabun/' },
          { label: 'Nan', href: '/nan/' },
        ]
      },
      { label: 'Best of Thailand', href: '/best-of-thailand/' },
      { label: 'Inspiration', href: '/inspiration/' },
    ],
    staticPages: [
      { label: 'About Us', href: '/about-us/' },
      { label: 'Contact Us', href: '/contact/' },
      { label: 'Terms & Conditions', href: '/terms-and-conditions/' },
      { label: 'Privacy Policy', href: '/privacy-policy/' },
    ],
  },
};

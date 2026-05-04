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
  | 'search.placeholder'
  | 'static.about.title'
  | 'static.about.content'
  | 'static.privacy.title'
  | 'static.privacy.content'
  | 'static.terms.title'
  | 'static.terms.content'
  | 'static.contact.title'
  | 'static.contact.content'
  | 'home.covid.title'
  | 'home.covid.content'
  | 'home.covid.link'
  | 'home.followUs'
  | 'home.tagline'
  | 'home.categorySection.more'
  | 'home.mostPopular.title';

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
    'static.about.title': 'About TripCanvas',
    'static.about.content': '<p>We are a team of travel enthusiasts dedicated to bringing you unique travel stories from Southeast Asia...</p>',
    'static.privacy.title': 'Privacy Policy',
    'static.privacy.content': '<p>Your privacy matters to us...</p>',
    'static.terms.title': 'Terms and Conditions',
    'static.terms.content': '<p>By using this website, you agree to the following terms...</p>',
    'static.contact.title': 'Contact TripCanvas',
    'static.contact.content': '<p>We\'d love to hear from you!...</p>',
    'home.covid.title': 'COVID-19 Updates',
    'home.covid.content': 'Here is our coverage on COVID-19 (FAQs, facts, good news, etc)',
    'home.covid.link': 'View COVID-19 Updates',
    'home.followUs': 'Follow us to discover',
    'home.tagline': 'Not Your Usual {country} Travel Guide',
    'home.categorySection.more': 'More {destination} travel stories',
    'home.mostPopular.title': 'Most Popular',
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
    'static.about.title': 'About TripCanvas Malaysia',
    'static.about.content': '<p>We share unique information on hotels, villas, things to do and dining places in Malaysia...</p>',
    'static.privacy.title': 'Privacy Policy',
    'static.privacy.content': '<p>Malaysia privacy policy...</p>',
    'static.terms.title': 'Terms and Conditions',
    'static.terms.content': '<p>Malaysia terms...</p>',
    'static.contact.title': 'Contact TripCanvas Malaysia',
    'static.contact.content': '<p>Hubungi kami...</p>',
    'home.covid.title': 'COVID-19 Updates',
    'home.covid.content': 'Here is our coverage on COVID-19 (FAQs, useful info, etc)',
    'home.covid.link': 'View COVID-19 Updates',
    'home.followUs': 'Follow us to discover',
    'home.tagline': 'Not Your Usual Malaysia Travel Guide',
    'home.categorySection.more': 'More {destination} travel stories',
    'home.mostPopular.title': 'Most Popular',
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
    'static.about.title': 'Tentang TripCanvas Indonesia',
    'static.about.content': '<p>Kami berbagi informasi unik...</p>',
    'static.privacy.title': 'Kebijakan Pribadi',
    'static.privacy.content': '<p>Kebijakan privasi...</p>',
    'static.terms.title': 'Syarat & Ketentuan',
    'static.terms.content': '<p>Syarat dan ketentuan...</p>',
    'static.contact.title': 'Hubungi TripCanvas Indonesia',
    'static.contact.content': '<p>Hubungi kami untuk pertanyaan atau kerja sama.</p>',
    'home.covid.title': 'Pembaruan COVID-19',
    'home.covid.content': 'Here is our coverage on COVID-19 (FAQs, facts/myths, good news, etc)',
    'home.covid.link': 'Lihat Pembaruan COVID-19',
    'home.followUs': 'Ikuti kami untuk berlibur di',
    'home.tagline': 'Not Your Usual Indonesia Travel Guide',
    'home.categorySection.more': 'More {destination} travel stories',
    'home.mostPopular.title': 'Terpopuler',
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
    'static.about.title': 'เกี่ยวกับ TripCanvas Thailand',
    'static.about.content': '<p>เนื้อหภาษาไทย...</p>',
    'static.privacy.title': 'นโยบายความเป็นส่วนตัว',
    'static.privacy.content': '<p>นโยบายความเป็นส่วนตัว...</p>',
    'static.terms.title': 'ข้อกำหนดและเงื่อนไข',
    'static.terms.content': '<p>ข้อกำหนดและเงื่อนไข...</p>',
    'static.contact.title': 'ติดต่อ TripCanvas Thailand',
    'static.contact.content': '<p>ติดต่อเรา...</p>',
    'home.covid.title': 'อัปเดต COVID-19',
    'home.covid.content': 'Here is our coverage on COVID-19 (FAQs, useful info, etc)',
    'home.covid.link': 'ดูอัปเดต COVID-19',
    'home.followUs': 'ติดตามเราเพื่อค้นพบ',
    'home.tagline': 'Not Your Usual Thailand Travel Guide',
    'home.categorySection.more': 'More {destination} travel stories',
    'home.mostPopular.title': 'แนะนำ',
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
    'static.about.title': '关于我们',
    'static.about.content': '<p>我们是一群热爱旅游的伙伴...</p>',
    'static.privacy.title': '隐私政策',
    'static.privacy.content': '<p>隐私政策内容...</p>',
    'static.terms.title': '条款和条件',
    'static.terms.content': '<p>条款和条件内容...</p>',
    'static.contact.title': '联系我们',
    'static.contact.content': '<p>欢迎联系我们！...</p>',
    'home.covid.title': 'COVID-19 最新资讯',
    'home.covid.content': 'Here is our coverage on COVID-19 (FAQs, useful info, etc)',
    'home.covid.link': '查看 COVID-19 最新资讯',
    'home.followUs': '关注我们探索',
    'home.tagline': '非一般的{country}旅游攻略',
    'home.categorySection.more': '更多{destination}旅游详情',
    'home.mostPopular.title': '最新热门',
  },
};

export function t(key: TranslationKey, locale: string, vars?: Record<string, string>): string {
  let value = translations[locale]?.[key] ?? translations.en[key] ?? key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      value = value.replace(`{${k}}`, v);
    }
  }
  return value;
}

export interface NavItem {
  label: string;
  href: string;
  children?: NavItem[];
}

export interface LocaleNav {
  topLevel: NavItem[];
  staticPages?: NavItem[];
}

export interface MarketNav {
  [locale: string]: LocaleNav;
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
  // ─── MALAYSIA ────────────────────────────────────────────
  my: {
    en: {
      topLevel: [
        { label: 'KL & Selangor', href: '/kuala-lumpur/' },
        { label: 'Johor', href: '/johor/' },
        { label: 'Melaka', href: '/melaka/' },
        { label: 'Kedah & Langkawi', href: '/kedah/' },
        {
          label: 'Best of Malaysia', href: '/best-of-malaysia/', children: [
            { label: 'Inspiration', href: '/inspiration/' },
          ]
        },
        {
          label: 'Get in touch', href: '/contact/', children: [
            { label: 'Partner with us', href: '/advertise/' },
            { label: 'Careers', href: '/careers/' },
            { label: 'Write for us', href: '/write-article/' },
            { label: 'About Us', href: '/about-us/' },
            { label: 'Contact Us', href: '/contact/' },
            { label: 'Terms and Conditions', href: '/terms-and-conditions/' },
            { label: 'Privacy Policy', href: '/privacy-policy/' },
          ]
        },
      ],
      staticPages: [
        { label: 'About Us', href: '/about-us/' },
        { label: 'Contact Us', href: '/contact/' },
        { label: 'Terms and Conditions', href: '/terms-and-conditions/' },
        { label: 'Privacy Policy', href: '/privacy-policy/' },
      ],
    },
    zh: {
      topLevel: [
        { label: '大马主页', href: '/zh/' },
        { label: '吉隆坡 & 雪兰莪', href: '/zh/kuala-lumpur/' },
        { label: '柔佛', href: '/zh/johor/' },
        { label: '马六甲', href: '/zh/melaka/' },
        { label: '霹雳', href: '/zh/perak/' },
        { label: '登嘉楼', href: '/zh/terengganu/' },
        { label: '生活贴士', href: '/zh/' },
        {
          label: '联络我们', href: '/zh/contact/', children: [
            { label: '关于我们', href: '/zh/about-us/' },
            { label: '刊登广告', href: '/zh/advertise/' },
            { label: '使用条款及条件', href: '/zh/terms-and-conditions/' },
          ]
        },
        { label: '隐私政策', href: '/zh/privacy-policy/' },
      ],
    },
  },

  // ─── INDONESIA ───────────────────────────────────────────
  id: {
    en: {
      topLevel: [
        {
          label: 'Bali', href: '/bali/', children: [
            { label: 'Where to stay', href: '/bali/hotels-villas-bali/' },
            { label: 'Things to do', href: '/bali/attractions-activities-bali/' },
            { label: 'Where to eat', href: '/bali/restaurants-cafes-bars-bali/' },
            { label: 'Guides and Tips', href: '/bali/travel-guide-tips-bali/' },
            { label: 'Itineraries', href: '/bali/itineraries/' },
            { label: 'Our Bali hotel reviews & experiences', href: '/bali/hotel-experience-reviews/' },
          ]
        },
        {
          label: 'Java', href: '/java/', children: [
            { label: 'Jakarta', href: '/jakarta/' },
            {
              label: 'Bandung', href: '/bandung/', children: [
                { label: 'Where to stay', href: '/bandung/hotels-villas/' },
                { label: 'Things to do', href: '/bandung/attractions-activities/' },
                { label: 'Where to eat', href: '/bandung/restaurants-cafes-bars/' },
                { label: 'Guides and Tips', href: '/bandung/travel-guide-tips/' },
              ]
            },
            { label: 'Jogja', href: '/jogja/' },
            { label: 'Malang', href: '/malang/' },
            { label: 'Semarang', href: '/semarang/' },
            { label: 'Bogor', href: '/bogor/' },
            { label: 'Banyuwangi', href: '/banyuwangi/' },
          ]
        },
        { label: 'Lombok', href: '/lombok/' },
        {
          label: 'Nusa Tenggara', href: '/nusa-tenggara/', children: [
            { label: 'Flores', href: '/flores/' },
            { label: 'Sumba', href: '/sumba/' },
          ]
        },
        { label: 'Sumatra', href: '/sumatra/' },
        { label: 'Health & Wellness', href: '/health-wellness/' },
        {
          label: 'Best of Indonesia', href: '/best-of-indonesia/', children: [
            { label: 'Our experiences/reviews', href: '/hotel-reviews-experience/' },
            { label: 'Responsible Travel', href: '/responsible-travel/' },
            { label: 'West Papua', href: '/west-papua/' },
            { label: 'Sulawesi', href: '/sulawesi/' },
            { label: 'News and Announcements', href: '/news/' },
            { label: 'Shopping guide in Indonesia', href: '/shopping/' },
          ]
        },
      ],
      staticPages: [
        { label: 'About Us', href: '/about-us/' },
        { label: 'Contact Us', href: '/contact/' },
        { label: 'Terms and Conditions', href: '/terms-and-conditions/' },
        { label: 'Privacy Policy', href: '/privacy-policy/' },
      ],
    },
    id: {
      topLevel: [
        {
          label: 'Bali', href: '/id/bali/', children: [
            { label: 'Hotel dan Villa', href: '/id/bali/hotel-villa-akomodasi/' },
            { label: 'Kegiatan Wisata', href: '/id/bali/kegiatan-wisata/' },
            { label: 'Wisata Kuliner', href: '/id/bali/wisata-kuliner/' },
            { label: 'Panduan dan Tips', href: '/id/bali/panduan-tips-liburan/' },
          ]
        },
        {
          label: 'Java', href: '/id/java/', children: [
            { label: 'Bandung', href: '/id/bandung/' },
            { label: 'Yogyakarta', href: '/id/jogja/' },
            { label: 'Malang', href: '/id/malang/' },
            { label: 'Bogor', href: '/id/bogor/' },
            { label: 'Semarang', href: '/id/semarang/' },
            { label: 'Banyuwangi', href: '/id/banyuwangi/' },
            { label: 'Sukabumi', href: '/id/sukabumi/' },
            { label: 'Purwakarta', href: '/id/purwakarta/' },
            { label: 'Kediri & Blitar', href: '/id/kediri-blitar/' },
            { label: 'Surakarta (Solo)', href: '/id/surakarta/' },
            { label: 'Cirebon', href: '/id/cirebon/' },
            { label: 'Tegal', href: '/id/tegal/' },
            { label: 'Pacitan', href: '/id/pacitan/' },
            { label: 'Purwokerto & Kebumen', href: '/id/purwokerto-kebumen/' },
          ]
        },
        { label: 'Lombok', href: '/id/lombok/' },
        { label: 'Sumatra', href: '/id/sumatra/' },
        { label: 'Sulawesi', href: '/id/sulawesi/' },
        { label: 'Kalimantan', href: '/id/kalimantan/' },
        { label: 'Pulau Sumba', href: '/id/sumba/' },
        {
          label: 'Best of Indonesia', href: '/id/best-of-indonesia/', children: [
            { label: 'Inspirasi', href: '/id/inspirasi/' },
          ]
        },
        { label: 'Cari Hotel', href: 'https://www.booking.com/?aid=1141958' },
      ],
    },
    zh: {
      topLevel: [
        { label: '印尼旅游攻略', href: '/zh/' },
        { label: '巴厘岛', href: '/zh/bali/' },
        { label: '日惹', href: '/zh/jogja/' },
        {
          label: '刊登广告', href: '/zh/advertise/', children: [
            { label: '关于我们', href: '/zh/about-us/' },
            { label: '联络我们', href: '/zh/contact/' },
          ]
        },
      ],
    },
  },

  // ─── THAILAND ────────────────────────────────────────────
  th: {
    en: {
      topLevel: [
        { label: 'COVID-19 Updates', href: '/news/covid19-updates/' },
        { label: 'Bangkok', href: '/bangkok/' },
        {
          label: 'Southern Thailand', href: '/southern-thailand/', children: [
            { label: 'Phuket', href: '/phuket/' },
            { label: 'Hat Yai', href: '/hat-yai/' },
            { label: 'Krabi', href: '/krabi/' },
            { label: 'Koh Lipe & Satun', href: '/satun/' },
            { label: 'Phang Nga and Khao Lak', href: '/phang-nga/' },
          ]
        },
        {
          label: 'Central Thailand', href: '/central-thailand/', children: [
            { label: 'Khao Yai', href: '/khao-yai/' },
            { label: 'Hua Hin', href: '/hua-hin/' },
            { label: 'Kanchanaburi', href: '/kanchanaburi/' },
            { label: 'Pattaya & Chonburi', href: '/chonburi/' },
          ]
        },
        {
          label: 'Northern Thailand', href: '/northern-thailand/', children: [
            { label: 'Chiang Mai', href: '/chiang-mai/' },
            { label: 'Chiang Rai', href: '/chiang-rai/' },
            { label: 'Phetchabun', href: '/phetchabun/' },
          ]
        },
        {
          label: 'Best of Thailand', href: '/best-of-thailand/', children: [
            { label: 'Shopping Guide in Thailand', href: '/shopping/' },
          ]
        },
      ],
      staticPages: [
        { label: 'About Us', href: '/about-us/' },
        { label: 'Contact Us', href: '/contact/' },
        { label: 'Terms and Conditions', href: '/terms-and-conditions/' },
        { label: 'Privacy Policy', href: '/privacy-policy/' },
      ],
    },
    zh: {
      topLevel: [
        { label: '曼谷', href: '/zh/bangkok/' },
        {
          label: '华欣', href: '/zh/hua-hin/', children: [
            { label: '旅行住宿', href: '/zh/hua-hin/hotels-villas-hua-hin/' },
            { label: '景点', href: '/zh/hua-hin/attractions-activities-hua-hin/' },
            { label: '美食指南', href: '/zh/hua-hin/restaurants-cafes-hua-hin/' },
            { label: '旅行指南', href: '/zh/hua-hin/travel-guide-tips-hua-hin/' },
          ]
        },
        {
          label: '考艾', href: '/zh/khao-yai/', children: [
            { label: '旅行住宿', href: '/zh/khao-yai/hotels-villas-khao-yai/' },
            { label: '景点', href: '/zh/khao-yai/attractions-activities-khao-yai/' },
            { label: '美食指南', href: '/zh/khao-yai/restaurants-cafes-khao-yai/' },
            { label: '旅行指南', href: '/zh/khao-yai/travel-guide-tips-khao-yai/' },
          ]
        },
        { label: '清迈', href: '/zh/chiang-mai/' },
        { label: '合艾', href: '/zh/hat-yai/' },
        { label: '北碧府', href: '/zh/kanchanaburi/' },
        { label: '考柯与碧差汶', href: '/zh/phetchabun/' },
        { label: '普吉岛', href: '/zh/phuket/' },
        { label: '甲米(Krabi)', href: '/zh/krabi/' },
        { label: '泰国之最', href: '/zh/best-of-thailand/' },
        {
          label: '更多资讯', href: '/zh/contact/', children: [
            { label: '关于我们', href: '/zh/about-us/' },
            { label: '合作伙伴', href: '/zh/advertise/' },
            { label: '诚邀作家加入我们', href: '/zh/write-an-article/' },
            { label: '联络我们', href: '/zh/contact/' },
          ]
        },
      ],
    },
    id: {
      topLevel: [
        { label: 'Thailand', href: '/id/' },
        { label: 'Bangkok', href: '/id/bangkok/' },
        { label: 'Hua Hin', href: '/id/hua-hin/' },
        { label: 'Kanchanaburi', href: '/id/kanchanaburi/' },
        { label: 'Khao Yai', href: '/id/khao-yai/' },
        { label: 'Tentang Kami', href: '/id/about-us/' },
      ],
    },
  },
};

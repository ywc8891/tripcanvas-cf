# Homepage Visual Match — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the ID market homepage aesthetically similar to the production WordPress site by upgrading PostCard, adding section navigation, and restructuring Bandung/Jogja/Lombok sections.

**Architecture:** Incremental upgrades to existing Astro components. New CSS is additive to `global.css`. Two new components (SectionNav, SectionPostCard), one modified (PostCard gets `"full"` variant), two homepage templates restructured.

**Tech Stack:** Astro 5, existing Bootstrap-like CSS grid, TypeScript, Payload REST API

---

### Task 1: Add CSS for new card variants and section navigation

**Files:**
- Modify: `apps/frontend/src/styles/global.css` (append at end)

- [ ] **Step 1: Append new CSS rules**

Append the following to `apps/frontend/src/styles/global.css`:

```css
/* ==================================================================
   PostCard "full" variant — image left, text right with excerpt
   ================================================================== */
.post-card-full {
  display: flex;
  gap: 1.25rem;
  margin-bottom: 1.25rem;
  align-items: flex-start;
}
.post-card-full .card-image {
  flex: 0 0 35%;
  min-width: 180px;
}
.post-card-full .card-image img {
  width: 100%;
  height: 180px;
  object-fit: cover;
  border-radius: 3px;
  display: block;
}
.post-card-full .card-content {
  flex: 1;
  min-width: 0;
}
.post-card-full .card-content .badge {
  margin-bottom: 0.35rem;
}
.post-card-full .card-content .badge a {
  display: inline-block;
  background: #ff6000;
  color: #fff;
  font-size: 0.7rem;
  font-weight: 600;
  text-transform: uppercase;
  padding: 2px 8px;
  border-radius: 2px;
  margin-right: 4px;
  margin-bottom: 4px;
}
.post-card-full .card-content .badge a:hover {
  background: #e05500;
  color: #fff;
  text-decoration: none;
}
.post-card-full .card-title {
  font-size: 1.15rem;
  font-weight: 700;
  line-height: 1.35;
  margin-bottom: 0.4rem;
}
.post-card-full .card-title a {
  color: #333;
  text-decoration: none;
}
.post-card-full .card-title a:hover {
  color: #ff6000;
}
.post-card-full .card-excerpt {
  color: #666;
  font-size: 0.875rem;
  line-height: 1.55;
  margin-bottom: 0.5rem;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.post-card-full .card-meta {
  color: #aaa;
  font-size: 0.8rem;
}
.post-card-full .card-meta a {
  color: #ff6000;
  text-decoration: none;
  margin-left: 0.5rem;
}
.post-card-full .card-meta a:hover {
  text-decoration: underline;
}

/* ==================================================================
   SectionNav — inline quick-link bar under section headings
   ================================================================== */
.sectionnav {
  margin-bottom: 1rem;
  padding-bottom: 0.75rem;
  border-bottom: 1px solid #e8e8e8;
}
.sectionnav a {
  display: inline-block;
  color: #555;
  font-size: 0.85rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  margin-right: 1.5rem;
  padding-bottom: 3px;
  border-bottom: 2px solid transparent;
  text-decoration: none;
  transition: border-color 0.15s;
}
.sectionnav a:last-child {
  margin-right: 0;
}
.sectionnav a:hover,
.sectionnav a:active {
  color: #333;
  border-bottom-color: #ff6000;
}

/* ==================================================================
   SectionPostCard — horizontal excerpt card for category sections
   ================================================================== */
.section-post-card {
  display: flex;
  gap: 1.25rem;
  padding-bottom: 1.25rem;
  margin-bottom: 1.25rem;
  border-bottom: 1px solid #eee;
  align-items: flex-start;
}
.section-post-card:last-of-type {
  border-bottom: none;
}
.section-post-card .card-image {
  flex: 0 0 180px;
}
.section-post-card .card-image img {
  width: 180px;
  height: 120px;
  object-fit: cover;
  border-radius: 3px;
  display: block;
}
.section-post-card .card-content {
  flex: 1;
  min-width: 0;
}
.section-post-card .card-tags {
  margin-bottom: 0.3rem;
}
.section-post-card .card-tags a {
  display: inline-block;
  font-size: 0.72rem;
  font-weight: 600;
  text-transform: uppercase;
  color: #ff6000;
  text-decoration: none;
  margin-right: 8px;
}
.section-post-card .card-tags a:hover {
  color: #e05500;
}
.section-post-card .card-tags span.sep {
  color: #ccc;
  margin: 0 2px;
}
.section-post-card .card-title {
  font-size: 1rem;
  font-weight: 600;
  line-height: 1.4;
  margin-bottom: 0.35rem;
}
.section-post-card .card-title a {
  color: #333;
  text-decoration: none;
}
.section-post-card .card-title a:hover {
  color: #ff6000;
}
.section-post-card .card-excerpt {
  color: #666;
  font-size: 0.85rem;
  line-height: 1.6;
  margin-bottom: 0.4rem;
}
.section-post-card .card-readmore {
  color: #ff6000;
  font-size: 0.85rem;
  font-weight: 600;
  text-decoration: none;
}
.section-post-card .card-readmore:hover {
  text-decoration: underline;
}

/* ==================================================================
   Section spacing — more breathing room
   ================================================================== */
.no-top-margin.section {
  padding-top: 1.5rem;
  padding-bottom: 1.5rem;
}
.homesection.ad-section.section {
  padding-bottom: 1rem;
}

/* ==================================================================
   Mobile: stack variants vertically
   ================================================================== */
@media (max-width: 767px) {
  .post-card-full {
    flex-direction: column;
  }
  .post-card-full .card-image {
    flex: none;
    min-width: 0;
    width: 100%;
  }
  .post-card-full .card-image img {
    height: 200px;
    width: 100%;
  }
  .section-post-card {
    flex-direction: column;
  }
  .section-post-card .card-image {
    flex: none;
    width: 100%;
  }
  .section-post-card .card-image img {
    width: 100%;
    height: 160px;
  }
  .sectionnav a {
    margin-right: 0.75rem;
    font-size: 0.78rem;
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/frontend/src/styles/global.css
git commit -m "feat: add CSS for full PostCard variant, SectionNav, and SectionPostCard"
```

---

### Task 2: Add SECTION_NAV config to i18n.ts

**Files:**
- Modify: `apps/frontend/src/lib/i18n.ts` (append before closing)

- [ ] **Step 1: Add SECTION_NAV export**

Append the following before the last line of `apps/frontend/src/lib/i18n.ts`:

```typescript
// ─── Section Navigation Data ────────────────────────────────
// Quick-link rows shown below section headings on homepage.
// Keyed by market → category slug.
export interface SectionNavItem {
  label: string;
  href: string;
}

export const SECTION_NAV: Record<string, Record<string, SectionNavItem[]>> = {
  id: {
    bali: [
      { label: 'Where to stay', href: '/bali/hotels-villas-bali/' },
      { label: 'Things to do', href: '/bali/attractions-activities-bali/' },
      { label: 'Where to eat', href: '/bali/restaurants-cafes-bars-bali/' },
      { label: 'Guides and tips', href: '/bali/travel-guide-tips-bali/' },
    ],
    bandung: [
      { label: 'Where to stay', href: '/bandung/hotels-villas/' },
      { label: 'Things to do', href: '/bandung/attractions-activities/' },
      { label: 'Where to eat', href: '/bandung/restaurants-cafes-bars/' },
      { label: 'Guides and tips', href: '/bandung/travel-guide-tips/' },
    ],
    jogja: [
      { label: 'Where to stay', href: '/jogja/' },
      { label: 'Things to do', href: '/jogja/' },
      { label: 'Where to eat', href: '/jogja/' },
      { label: 'Guides and tips', href: '/jogja/' },
    ],
    lombok: [
      { label: 'Where to stay', href: '/lombok/' },
      { label: 'Things to do', href: '/lombok/' },
    ],
  },
  // Markets that share ID content structure (fallback to id)
  my: {},
  th: {},
  en: {},
};
```

- [ ] **Step 2: Commit**

```bash
git add apps/frontend/src/lib/i18n.ts
git commit -m "feat: add SECTION_NAV config for homepage section sub-navigation"
```

---

### Task 3: Create SectionNav.astro component

**Files:**
- Create: `apps/frontend/src/components/SectionNav.astro`

- [ ] **Step 1: Create the component**

Write `apps/frontend/src/components/SectionNav.astro`:

```astro
---
import { localePath } from '../lib/locale';

interface SectionNavLink {
  label: string;
  href: string;
}

interface Props {
  links: SectionNavLink[];
  locale: string;
}

const { links, locale } = Astro.props;
if (!links || links.length === 0) return new Response(null, { status: 200 });
---

<div class="sectionnav">
  {links.map((link) => (
    <a href={localePath(link.href, locale)}>{link.label}</a>
  ))}
</div>
```

- [ ] **Step 2: Commit**

```bash
git add apps/frontend/src/components/SectionNav.astro
git commit -m "feat: add SectionNav component for homepage section quick-links"
```

---

### Task 4: Create SectionPostCard.astro component

**Files:**
- Create: `apps/frontend/src/components/SectionPostCard.astro`

- [ ] **Step 1: Create the component**

Write `apps/frontend/src/components/SectionPostCard.astro`:

```astro
---
import { localePath } from '../lib/locale';
import { firstImageUrl } from '../lib/payload';

interface Props {
  post: any;
  locale: string;
  categoryLinks?: { label: string; href: string }[];
  showExcerpt?: boolean;
}

const { post, locale, categoryLinks, showExcerpt = true } = Astro.props;
const thumb = firstImageUrl(post.content);
const displayTitle = post.title || post.slug.replace(/-/g, ' ');
const excerpt = post.excerpt || '';
const slug = post.slug;
---

<div class="section-post-card">
  {thumb && (
    <div class="card-image">
      <a href={localePath(`/blog/${slug}`, locale)}>
        <img src={thumb} alt={displayTitle} loading="lazy" />
      </a>
    </div>
  )}
  <div class="card-content">
    {categoryLinks && categoryLinks.length > 0 && (
      <div class="card-tags">
        {categoryLinks.map((cl, i) => (
          <>
            {i > 0 && <span class="sep"> | </span>}
            <a href={localePath(cl.href, locale)}>{cl.label}</a>
          </>
        ))}
      </div>
    )}
    <div class="card-title">
      <a href={localePath(`/blog/${slug}`, locale)}>{displayTitle}</a>
    </div>
    {showExcerpt && excerpt && (
      <div class="card-excerpt">{excerpt}</div>
    )}
    <a class="card-readmore" href={localePath(`/blog/${slug}`, locale)}>
      Read More &rarr;
    </a>
  </div>
</div>
```

- [ ] **Step 2: Commit**

```bash
git add apps/frontend/src/components/SectionPostCard.astro
git commit -m "feat: add SectionPostCard component with horizontal excerpt layout"
```

---

### Task 5: Update PostCard.astro with "full" variant

**Files:**
- Modify: `apps/frontend/src/components/PostCard.astro`

- [ ] **Step 1: Add variant prop and "full" variant rendering**

Replace the entire file contents of `apps/frontend/src/components/PostCard.astro` with:

```astro
---
import { getPostUrl, primaryCategory, localePath } from '../lib/locale';
import { firstImageUrl } from '../lib/payload';

interface Props {
  post: any;
  locale: string;
  catCount?: number;
  isFirst?: boolean;
  variant?: 'compact' | 'full';
}

const { post, locale, catCount = 1, isFirst = false, variant = 'compact' } = Astro.props;
const size = isFirst ? 'fullgrid' : 'halfgrid';
const imgClass = isFirst ? 'attachment-big size-big wp-post-image' : 'attachment-half size-half wp-post-image';
const thumb = firstImageUrl(post.content);
const cats = post.categories || [];
const dateAgo = (function() {
  const d = new Date(post.publishedAt || post.createdAt);
  const now = new Date();
  const years = now.getFullYear() - d.getFullYear();
  if (years >= 1) return `${years} year${years > 1 ? 's' : ''} ago`;
  const months = (now.getFullYear() - d.getFullYear()) * 12 + now.getMonth() - d.getMonth();
  if (months >= 1) return `${months} month${months > 1 ? 's' : ''} ago`;
  const days = Math.floor((now.getTime() - d.getTime()) / 86400000);
  return `${days || 1} day${days !== 1 ? 's' : ''} ago`;
})();
const displayTitle = post.title || post.slug.replace(/-/g, ' ');
const postUrl = getPostUrl(post.slug, locale, primaryCategory(post.categories));
const catId = cats[0]?.id || '';
const excerpt = post.excerpt || '';
---

{variant === 'full' ? (
  <div class="post-card-full">
    {thumb && (
      <div class="card-image">
        <a href={postUrl}>
          <img src={thumb} alt={displayTitle} loading="lazy" />
        </a>
      </div>
    )}
    <div class="card-content">
      {cats.length > 0 && (
        <div class="badge">
          {cats.slice(0, 2).map((cat: any) => (
            <a href={localePath(`/${cat.slug}`, locale)}>{cat.name || cat.slug}</a>
          ))}
        </div>
      )}
      <div class="card-title">
        <a href={postUrl}>{displayTitle}</a>
      </div>
      {excerpt && (
        <div class="card-excerpt">{excerpt}</div>
      )}
      <div class="card-meta">
        <span>{dateAgo}</span>
        <a href={postUrl}>Read More &rarr;</a>
      </div>
    </div>
  </div>
) : (
  <div class="isobrick">
    <div class={`highlight_category_${catId} has-thumbnail ${size} grid-item`}>
      <div class="isobrick-inner">
        <img src={thumb} class={imgClass} alt="" loading="lazy" style="opacity: 0.75;" />
        <span class="thumboverdate">
          <i class="fa fa-bookmark"></i>{dateAgo}
        </span>
        <div class="thumbovertext">
          <div class="badge">
            {cats.slice(0, catCount).map((cat: any) => (
              <a href={localePath(`/${cat.slug}`, locale)} class={`category-${cat.id || ''}`}>{cat.name || cat.slug}</a>
            ))}
            <div class="clear"></div>
          </div>
          <h2 class="title">
            <a href={postUrl}>{displayTitle}</a>
          </h2>
          <a class="button outline" href={postUrl}>Read More</a>
        </div>
        <a class="brick-thumb-link" href={postUrl}>{displayTitle}</a>
      </div>
    </div>
  </div>
)}
```

- [ ] **Step 2: Commit**

```bash
git add apps/frontend/src/components/PostCard.astro
git commit -m "feat: add 'full' variant to PostCard with excerpt and horizontal layout"
```

---

### Task 6: Restructure IdHomeId.astro homepage

**Files:**
- Modify: `apps/frontend/src/components/homepage/IdHomeId.astro`

- [ ] **Step 1: Rewrite the homepage template**

Replace the entire file contents of `apps/frontend/src/components/homepage/IdHomeId.astro` with:

```astro
---
import Layout from '../../layouts/Layout.astro';
import FullImageHero from '../../components/FullImageHero.astro';
import PostCard from '../../components/PostCard.astro';
import SectionNav from '../../components/SectionNav.astro';
import SectionPostCard from '../../components/SectionPostCard.astro';
import { getPosts, getPostsByCategory, firstImageUrl } from '../../lib/payload';
import { localePath, isStagingWorker } from '../../lib/locale';
import { t, SECTION_NAV } from '../../lib/i18n';

const locale = (Astro.locals as { locale?: string }).locale || 'id';
const host = (Astro.locals as { host?: string }).host || Astro.url.hostname;
const market = 'id';
const staging = isStagingWorker(host);
const MARKET_DOMAIN: Record<string, string> = { id: staging ? 'tripcanvas-id.academyt.workers.dev' : 'indonesia.tripcanvas.co' };
const meta = { name: 'TripCanvas Indonesia', tagline: 'Not Your Usual Indonesia Travel Guide', description: 'We share unique information on hotels, villas, things to do and dining places in Indonesia that you never knew existed.' };
const { docs: featured } = await getPosts(locale, 1, 8);
const { docs: indonesiaPosts } = await getPosts(locale, 2, 8);
const bestOfBali = await getPostsByCategory('bali', locale, 1, 8);
const bestOfBandung = await getPostsByCategory('bandung', locale, 1, 4);
const bestOfJogja = await getPostsByCategory('jogja', locale, 1, 4);
const bestOfLombok = await getPostsByCategory('lombok', locale, 1, 4);
const ogImage = featured[0] ? firstImageUrl(featured[0].content) : undefined;
const canonical = staging ? undefined : `https://${MARKET_DOMAIN.id}/id/`;

function sectionUrl(slug: string) { return localePath(`/${slug}`, locale); }

const secNav = SECTION_NAV[market] || {};
const baliNav = secNav.bali || [];
const bandungNav = secNav.bandung || [];
const jogjaNav = secNav.jogja || [];
const lombokNav = secNav.lombok || [];
---

<Layout title={meta.name} description={meta.description} ogImage={ogImage} canonical={canonical}>
  <!-- Hero -->
  <div class="content-section content-full section first-section no-title" style="margin-top:0;">
    <div class="col-md-12" style="padding-left:0;padding-right:0;">
      <FullImageHero market={market} locale={locale} />
    </div>
    <div class="clear"></div>
  </div>

  <!-- COVID Banner -->
  <div class="content-section content-full section not-first-section no-title" style="margin-top:0;">
    <div class="col-md-12" style="padding-left:0;padding-right:0;">
      <div class="container" style="margin-top:20px;">
        <div class="covid-inner" style="border-color:#e5e3ba;">
          <div class="covid-box" style="background:#fffccf;border:1px solid #ff6000;color:#333;padding:10px;border-radius:3px;text-align:center;">
            <a class="su-button su-button-style-default" style="color:#ff6000;font-family:Open Sans;font-size:15px;font-weight:200;" href={localePath('/news/covid19-updates/', locale)}>{t('home.covid.content', locale)} <i class="fa fa-arrow-circle-right"></i></a>
          </div>
        </div>
      </div>
    </div>
    <div class="clear"></div>
  </div>

  <!-- Featured Grid -->
  <div class="no-top-margin grid grid-full section not-first-section has-title">
    <div class="container">
      <div class="imagegrid full col-md-12">
        <div class="section-title"><p><span>{t('home.featured', locale)}<span class="vertical-div"> | </span></span>{meta.tagline}</p><h2></h2></div>
        <div class="loading"></div>
        <div class="grid-wrapper">
          <div class="homeposts grid-full">
            <div class="isotopecontainer" data-value="3">{featured.map((post, i) => <PostCard post={post} locale={locale} isFirst={i === 0} />)}</div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- Ad -->
  <div class="content-section content-full section not-first-section no-title">
    <div class="col-md-12" style="padding-left:0;padding-right:0;"><div class="ad-slot">Advertisement</div></div>
    <div class="clear"></div>
  </div>

  <!-- Best of Indonesia (full variant) -->
  <div class="no-top-margin grid grid-full section not-first-section has-title">
    <div class="container">
      <div class="imagegrid full col-md-12">
        <p class="section-title"><span>{t('home.mostPopular.title', locale)}</span></p><h2></h2>
        <div class="loading"></div>
        <div class="grid-wrapper">
          <div class="homeposts grid-full">
            {indonesiaPosts.slice(0, 8).map((post) => <PostCard post={post} locale={locale} variant="full" />)}
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- View All CTA -->
  <div class="homesection ad-section section not-first-section">
    <div class="container"><div class="col-md-12"><a href={localePath('/blog', locale)} class="home-section-cta">{t('home.viewAll', locale)}</a></div></div>
  </div>

  <!-- Newsletter -->
  <div class="content-section content-full section not-first-section no-title">
    <div class="col-md-12" style="padding-left:0;padding-right:0;">
      <div class="subscription-box">
        <div class="container">
          <h2 class="subscription-box-title">Get more Indonesia travel ideas <span>in your inbox!</span></h2>
          <p class="subscription-box-desc">Sign up for our monthly email and be inspired with Indonesia travel ideas that you'd love.</p>
          <form class="subscription-box-form" method="post" target="_blank">
            <input type="email" class="subscription-box-input" placeholder="Enter Your Email Address" required />
            <input type="submit" class="subscription-box-btn" value="Sign me up!" />
          </form>
        </div>
      </div>
    </div>
    <div class="clear"></div>
  </div>

  <!-- Ad -->
  <div class="content-section content-full section not-first-section no-title">
    <div class="col-md-12" style="padding-left:0;padding-right:0;"><div class="ad-slot ad-slot-responsive">Advertisement</div></div>
    <div class="clear"></div>
  </div>

  <!-- Best of Bali -->
  <div class="no-top-margin grid grid-full section not-first-section has-title">
    <div class="container">
      <div class="imagegrid full col-md-12">
        <p class="section-title"><span>Best of Bali</span></p><h2></h2>
        <div class="loading"></div>
        <SectionNav links={baliNav} locale={locale} />
        <div class="grid-wrapper">
          <div class="homeposts grid-full">
            <div class="isotopecontainer" data-value="3">{bestOfBali.docs.slice(0, 8).map((post, i) => <PostCard post={post} locale={locale} isFirst={i === 0} />)}</div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <div class="homesection ad-section section not-first-section">
    <div class="container"><div class="col-md-12"><a href={sectionUrl('bali')} class="home-section-cta">{t('home.categorySection.more', locale, { destination: 'Bali' })}</a></div></div>
  </div>

  <!-- Best of Bandung -->
  <div class="no-top-margin grid grid-full section not-first-section has-title">
    <div class="container">
      <div class="imagegrid full col-md-12">
        <p class="section-title"><span>Best of Bandung</span></p><h2></h2>
        <div class="loading"></div>
        <SectionNav links={bandungNav} locale={locale} />
        <div class="grid-wrapper">
          <div class="homeposts grid-full">
            {bestOfBandung.docs.map((post) => (
              <SectionPostCard
                post={post}
                locale={locale}
                categoryLinks={
                  (post.categories || []).slice(0, 2).map((c: any) => ({ label: c.name || c.slug, href: `/${c.slug}` }))
                }
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  </div>

  <div class="homesection ad-section section not-first-section">
    <div class="container"><div class="col-md-12"><a href={sectionUrl('bandung')} class="home-section-cta">{t('home.categorySection.more', locale, { destination: 'Bandung' })}</a></div></div>
  </div>

  <!-- Best of Jogja -->
  <div class="no-top-margin grid grid-full section not-first-section has-title">
    <div class="container">
      <div class="imagegrid full col-md-12">
        <p class="section-title"><span>Best of Jogja</span></p><h2></h2>
        <div class="loading"></div>
        <SectionNav links={jogjaNav} locale={locale} />
        <div class="grid-wrapper">
          <div class="homeposts grid-full">
            {bestOfJogja.docs.map((post) => (
              <SectionPostCard
                post={post}
                locale={locale}
                categoryLinks={
                  (post.categories || []).slice(0, 2).map((c: any) => ({ label: c.name || c.slug, href: `/${c.slug}` }))
                }
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  </div>

  <div class="homesection ad-section section not-first-section">
    <div class="container"><div class="col-md-12"><a href={sectionUrl('jogja')} class="home-section-cta">{t('home.categorySection.more', locale, { destination: 'Jogja' })}</a></div></div>
  </div>

  <!-- Best of Lombok -->
  <div class="no-top-margin grid grid-full section not-first-section has-title">
    <div class="container">
      <div class="imagegrid full col-md-12">
        <p class="section-title"><span>Best of Lombok</span></p><h2></h2>
        <div class="loading"></div>
        <SectionNav links={lombokNav} locale={locale} />
        <div class="grid-wrapper">
          <div class="homeposts grid-full">
            {bestOfLombok.docs.map((post) => (
              <SectionPostCard
                post={post}
                locale={locale}
                categoryLinks={
                  (post.categories || []).slice(0, 2).map((c: any) => ({ label: c.name || c.slug, href: `/${c.slug}` }))
                }
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  </div>

  <div class="homesection ad-section section not-first-section last-section">
    <div class="container"><div class="col-md-12"><a href={sectionUrl('lombok')} class="home-section-cta">{t('home.categorySection.more', locale, { destination: 'Lombok' })}</a></div></div>
  </div>
</Layout>
```

- [ ] **Step 2: Commit**

```bash
git add apps/frontend/src/components/homepage/IdHomeId.astro
git commit -m "feat: restructure ID homepage with section nav, full cards, and Bandung/Jogja/Lombok posts"
```

---

### Task 7: Update IdHomeZh.astro for ZH market homepage

**Files:**
- Modify: `apps/frontend/src/components/homepage/IdHomeZh.astro`

- [ ] **Step 1: Rewrite the ZH homepage template**

Replace the entire file contents of `apps/frontend/src/components/homepage/IdHomeZh.astro` with:

```astro
---
import Layout from '../../layouts/Layout.astro';
import FullImageHero from '../../components/FullImageHero.astro';
import PostCard from '../../components/PostCard.astro';
import SectionNav from '../../components/SectionNav.astro';
import SectionPostCard from '../../components/SectionPostCard.astro';
import { getPosts, getPostsByCategory, firstImageUrl } from '../../lib/payload';
import { localePath, isStagingWorker } from '../../lib/locale';
import { t, SECTION_NAV } from '../../lib/i18n';

const locale = 'zh';
const host = (Astro.locals as { host?: string }).host || Astro.url.hostname;
const market = 'id';
const staging = isStagingWorker(host);
const MARKET_DOMAIN: Record<string, string> = { id: staging ? 'tripcanvas-id.academyt.workers.dev' : 'indonesia.tripcanvas.co' };
const meta = { name: 'TripCanvas 印尼旅游攻略', tagline: '非一般的印尼旅游攻略', description: 'TripCanvas 印尼旅游攻略' };
const canonical = staging ? undefined : `https://${MARKET_DOMAIN.id}/zh/`;
const { docs: rawPosts } = await getPosts(locale, 1, 80, { fallbackLocale: 'none' });
const featured = rawPosts.filter((p: any) => p.title).slice(0, 8);
const bestOfBali = await getPostsByCategory('bali', locale, 1, 8);
const bestOfJogja = await getPostsByCategory('jogja', locale, 1, 4);
const ogImage = featured[0] ? firstImageUrl(featured[0].content) : undefined;

function sectionUrl(slug: string) { return localePath(`/${slug}`, locale); }

const secNav = SECTION_NAV[market] || { en: {}, id: {}, zh: {} };
const baliNav = secNav.bali || [];
const jogjaNav = secNav.jogja || [];
---

<Layout title={meta.name} description={meta.description} ogImage={ogImage} canonical={canonical}>
  <!-- Hero -->
  <div class="content-section content-full section first-section no-title" style="margin-top:0;">
    <div class="col-md-12" style="padding-left:0;padding-right:0;">
      <FullImageHero market={market} locale={locale} />
    </div>
    <div class="clear"></div>
  </div>

  <!-- Featured Grid -->
  <div class="no-top-margin grid grid-full section not-first-section has-title">
    <div class="container">
      <div class="imagegrid full col-md-12">
        <div class="section-title"><span>{t('home.featured', locale)}</span><p>{meta.tagline}</p></div>
        <div class="grid-wrapper">
          <div class="homeposts grid-full">
            <div class="isotopecontainer" data-value="3">{featured.map(post => <PostCard post={post} locale={locale} />)}</div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- Best of Bali (ZH) -->
  <div class="no-top-margin grid grid-full section not-first-section has-title">
    <div class="container">
      <div class="imagegrid full col-md-12">
        <p class="section-title"><span>巴厘岛热门</span></p>
        <div class="loading"></div>
        <SectionNav links={baliNav} locale={locale} />
        <div class="grid-wrapper">
          <div class="homeposts grid-full">
            <div class="isotopecontainer" data-value="3">{bestOfBali.docs.slice(0, 8).map(post => <PostCard post={post} locale={locale} />)}</div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <div class="homesection ad-section section not-first-section">
    <div class="container"><div class="col-md-12"><a href={sectionUrl('bali')} class="home-section-cta">{t('home.categorySection.more', locale, { destination: 'Bali' })}</a></div></div>
  </div>

  <!-- Best of Jogja (ZH) -->
  <div class="no-top-margin grid grid-full section not-first-section has-title">
    <div class="container">
      <div class="imagegrid full col-md-12">
        <p class="section-title"><span>日惹热门</span></p>
        <div class="loading"></div>
        <SectionNav links={jogjaNav} locale={locale} />
        <div class="grid-wrapper">
          <div class="homeposts grid-full">
            {bestOfJogja.docs.map((post) => (
              <SectionPostCard
                post={post}
                locale={locale}
                categoryLinks={
                  (post.categories || []).slice(0, 2).map((c: any) => ({ label: c.name || c.slug, href: `/${c.slug}` }))
                }
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  </div>

  <div class="homesection ad-section section not-first-section last-section">
    <div class="container"><div class="col-md-12"><a href={sectionUrl('jogja')} class="home-section-cta">{t('home.categorySection.more', locale, { destination: 'Jogja' })}</a></div></div>
  </div>
</Layout>
```

- [ ] **Step 2: Commit**

```bash
git add apps/frontend/src/components/homepage/IdHomeZh.astro
git commit -m "feat: update ZH homepage with SectionNav and Jogja SectionPostCards"
```

---

### Task 8: Build and deploy to verify

**Files:** No changes — verification only.

- [ ] **Step 1: Build the frontend**

```bash
cd apps/frontend && pnpm build
```

Expected: Build succeeds with no errors.

- [ ] **Step 2: Deploy to staging**

```bash
cd apps/frontend && npx wrangler deploy --config wrangler-id.jsonc
```

Expected: Deploy succeeds.

- [ ] **Step 3: Verify visually**

```bash
playwright-cli -s=verify open "https://tripcanvas-id.academyt.workers.dev/"
playwright-cli -s=verify screenshot --filename=/tmp/staging-v2.png --full-page
```

Open `/tmp/staging-v2.png` and confirm:
- Hero section renders
- Featured grid shows compact cards
- "Terpopuler" section shows full-variant cards with excerpts
- Best of Bali has SectionNav links (Where to stay | Things to do | Where to eat | Guides)
- Best of Bandung shows 4 horizontal excerpt cards with SectionNav
- Best of Jogja shows 4 horizontal excerpt cards with SectionNav
- Best of Lombok shows 4 horizontal excerpt cards with SectionNav
- Newsletter section renders
- Back-to-top link works

- [ ] **Step 4: Verify ZH locale**

```bash
playwright-cli -s=verify goto "https://tripcanvas-id.academyt.workers.dev/zh/"
playwright-cli -s=verify screenshot --filename=/tmp/staging-zh-v2.png --full-page
```

Confirm ZH homepage renders correctly with Chinese section headings and post cards.

- [ ] **Step 5: Commit any deployment config changes if needed**

No commit unless wrangler config changed.

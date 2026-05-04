# Homepage Visual Match — Design Spec

**Date**: 2026-05-04
**Goal**: Make the staging frontend (Astro, `tripcanvas-id.academyt.workers.dev`) aesthetically similar to the production WordPress site (`indonesia.tripcanvas.co`) using a lighter-weight modern approach — same content hierarchy, recognizable layout, but clean code.

---

## 1. Summary

The staging homepage currently uses compact image-only post cards in a dense grid. The production site uses more text-rich layouts: horizontal cards with excerpts for some sections, section sub-navigation links, and better visual breathing room.

**Approach**: Incremental component upgrades to existing Astro codebase. No framework changes, no CSS framework replacement. New CSS is additive to existing `global.css`.

**Scope**: ID market homepage (Bahasa Indonesia locale). ZH locale follows same pattern. MY/TH markets out of scope for this spec (can follow same pattern later).

---

## 2. Component Changes

### 2.1 PostCard.astro — Add Variant Support

Existing `PostCard` renders a compact image-overlay card. Add a `variant` prop:

| `variant` | Layout | Use case |
|-----------|--------|----------|
| `"compact"` (default) | Image background + title overlay + "Read More" button | Featured grid, Bali grid |
| `"full"` | Image left (35%), text right (65%) — shows category badges, title, excerpt, date | "Best of Indonesia" section |

**New props for `"full"` variant**:
- `showExcerpt: boolean` (default `true`) — shows post excerpt, line-clamped to 2 lines
- `showDate: boolean` (default `true`) — shows relative date

**"full" variant layout**:
```
┌──────────┐ ┌──────────────────────────────┐
│          │ │ [Category Badge]  [Badge]    │
│  Image   │ │ Title (h2, 18px, bold)       │
│ (35%)    │ │ Excerpt (14px, 2-line clamp)  │
│          │ │ 3 years ago | Read More →     │
└──────────┘ └──────────────────────────────┘
```

### 2.2 SectionNav.astro — NEW Component

Renders a row of inline quick-links below section headings:

```
[Where to stay]  [Things to do]  [Where to eat]  [Guides and tips]
```

- Props: `links: { label: string; href: string }[]`
- Each link renders as `<a class="sectionnav-link">`
- Default styling: inline, separated by visual dividers, 14px, color: #555
- On mobile: wrap to two lines

### 2.3 SectionPostCard.astro — NEW Component

Horizontal excerpt card for Bandung/Jogja/Lombok sections. Matches production layout:

```
┌──────────────┐  ┌─────────────────────────────────┐
│              │  │ [Bandung | Things to do]         │
│   Image      │  │ ### Title (h4, 16px)            │
│   (180px)    │  │ Excerpt paragraph (14px, 3-4     │
│              │  │ lines) — full paragraph visible  │
│              │  │ [Read More →]                    │
└──────────────┘  └─────────────────────────────────┘
```

- Props: `post`, `locale`, `categoryLinks?: { label: string; href: string }[]`
- Category links shown as inline tags above title
- Excerpt shown as full paragraph (not clamped tightly)
- Card has subtle bottom border separator between items

---

## 3. Homepage Sections Restructured

### Current IdHomeId.astro → New layout

| # | Section | Current | New | Post Cards |
|---|---------|---------|-----|------------|
| 1 | Hero | ✅ FullImageHero | Unchanged | — |
| 2 | COVID banner | ✅ | Unchanged | — |
| 3 | Featured ("Pilihan") | Compact grid | Same — compact grid | PostCard `variant="compact"` |
| 4 | Ad slot | ✅ | Unchanged | — |
| 5 | Best of Indonesia | "TripCanvas Indonesia" title | Rename only | PostCard `variant="full"` |
| 6 | View All CTA | ✅ "Lihat semua cerita →" | Unchanged | — |
| 7 | Newsletter | ✅ SubscriptionBox | Unchanged | — |
| 8 | Ad slot | ✅ | Unchanged | — |
| 9 | Best of Bali | Compact grid (8 posts) | Compact grid (8 posts) + SectionNav | PostCard `variant="compact"` |
| 10 | Bali CTA | ✅ "More Bali travel stories" | Unchanged | — |
| 11 | Best of Bandung | Title only, NO posts | SectionNav + SectionPostCards (4 posts) | SectionPostCard x4 |
| 12 | Bandung CTA | ✅ | Unchanged | — |
| 13 | Best of Jogja | Title only, NO posts | SectionNav + SectionPostCards (4 posts) | SectionPostCard x4 |
| 14 | Jogja CTA | ✅ | Unchanged | — |
| 15 | Best of Lombok | Title only, NO posts | SectionNav + SectionPostCards (4 posts) | SectionPostCard x4 |
| 16 | Lombok CTA | ✅ | Unchanged | — |

**Key fix**: Sections 11, 13, 15 currently show titles but NO actual posts — just "Call to Action" links. Production shows 4+ posts per section with excerpts. This spec adds the posts.

---

## 4. Data & Config

### Section Navigation Data

Added to `src/lib/i18n.ts` as `SECTION_NAV`:

```ts
export const SECTION_NAV: Record<string, Record<string, {label: string; href: string}[]>> = {
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
      { label: 'Things to do', href: '/jogja/' },
    ],
    lombok: [
      { label: 'Things to do', href: '/lombok/' },
    ],
  },
};
```

### Data Fetching

`IdHomeId.astro` already fetches `bestOfBandung`, `bestOfJogja`, `bestOfLombok` with `limit=4`. These are fetched but currently **not rendered** (only titles are shown). This spec makes them render.

---

## 5. CSS Additions (global.css)

All additions are **new rules at the end** of `global.css`. Nothing deleted or replaced — zero risk of regressions in other markets.

Key new styles (~150 lines):

```css
/* PostCard "full" variant */
.post-card-full { display: flex; gap: 1.5rem; margin-bottom: 1.5rem; }
.post-card-full .card-image { width: 35%; min-width: 200px; }
.post-card-full .card-image img { width: 100%; height: 200px; object-fit: cover; border-radius: 4px; }
.post-card-full .card-content { flex: 1; }
.post-card-full .card-title { font-size: 1.2rem; font-weight: 700; line-height: 1.4; }
.post-card-full .card-excerpt { color: #555; font-size: 0.9rem; line-clamp: 2; }
.post-card-full .card-meta { color: #888; font-size: 0.85rem; margin-top: 0.5rem; }

/* SectionNav */
.sectionnav { margin-bottom: 1.5rem; }
.sectionnav a { display: inline-block; color: #555; margin-right: 1.25rem; font-size: 0.9rem; border-bottom: 2px solid transparent; }
.sectionnav a:hover { color: #333; border-bottom-color: #ff6000; }

/* SectionPostCard */
.section-post-card { display: flex; gap: 1.25rem; padding-bottom: 1.25rem; margin-bottom: 1.25rem; border-bottom: 1px solid #eee; }
.section-post-card .card-image img { width: 180px; height: 120px; object-fit: cover; border-radius: 4px; }
.section-post-card .card-title { font-size: 1rem; font-weight: 600; margin-bottom: 0.25rem; }
.section-post-card .card-excerpt { color: #666; font-size: 0.875rem; line-height: 1.6; }
.section-post-card .card-tags { margin-bottom: 0.35rem; }

/* Section spacing */
.section-title { font-size: 1.5rem; font-weight: 700; margin-bottom: 1rem; letter-spacing: -0.01em; }
```

---

## 6. Files Changed

| File | Change |
|------|--------|
| `src/components/PostCard.astro` | Add `variant` prop + `"full"` variant render |
| `src/components/SectionNav.astro` | **New** — section sub-navigation component |
| `src/components/SectionPostCard.astro` | **New** — horizontal excerpt card for Bandung/Jogja/Lombok |
| `src/components/homepage/IdHomeId.astro` | Render posts in Bandung/Jogja/Lombok sections, add SectionNav |
| `src/components/homepage/IdHomeZh.astro` | Same updates for ZH locale |
| `src/lib/i18n.ts` | Add `SECTION_NAV` export |
| `src/styles/global.css` | Add ~150 lines of new CSS at end of file |

---

## 7. Non-Goals (Out of Scope)

- MY, TH, EN (hub) markets — only ID market homepage for this spec
- Floating social share bar (SumoMe replacement) — production uses a 3rd-party widget, not needed
- reCAPTCHA widget — production uses a 3rd-party widget, not needed
- Footer redesign — current footer is already structurally close to production
- NavBar redesign — current navbar is already structurally close to production
- Individual post pages (single post view)
- Category listing pages
- Search functionality
- Responsive breakpoints beyond basic mobile wrap (follows existing breakpoints)

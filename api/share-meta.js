// Share cards (Open Graph / X cards) for pages that have their own (C3 in wtf-handoff SMALL_FIXES_C2_C3_BRIEF.md;
// the lot card is from LOT_PAGE_BRIEF.md). Link crawlers (iMessage, WhatsApp, Facebook, Slack, X, Discord, search
// engines) don't run the app's JavaScript, so vercel.json sends THEM - and only them, by user agent - here for
// /a/<slug>/lot/<n> and /auction/<id>. This returns the site's own index.html with that page's card in its <head>;
// every other page (and any failure) keeps index.html's default card (public/og/og-default.png). People get the
// static page as before.
//
// Reads only public API answers (the same everyone gets), so the rules hold as everywhere: a draft is a 404 there
// and gets the default card - its title and photo never reach a crawler; no bidder, max or pickup street is in
// those answers to begin with.
const API = (process.env.SHARE_META_API_URL || process.env.LOT_META_API_URL || process.env.VITE_API_URL || 'https://wtf-live-backend-production.up.railway.app').replace(/\/+$/, '')

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const money = n => Number(n).toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: Number(n) % 1 ? 2 : 0 })
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// One line from free text: the first sentence, plain, at most `max` characters (cut at a word).
export function storyLine(text, max = 160) {
  const t = String(text || '').replace(/<[^>]*>/g, ' ').replace(/[*_#>`[\]]+/g, '').replace(/\s+/g, ' ').trim()
  if (!t) return ''
  const first = (t.match(/^.+?[.!?](?=\s|$)/) || [t])[0]
  if (first.length <= max) return first
  const cut = first.slice(0, max - 1)
  const sp = cut.lastIndexOf(' ')
  return (sp > 60 ? cut.slice(0, sp) : cut).replace(/[,;:\s]+$/, '') + '…'
}

// The same tags for every card. image: absolute URL of the FULL photo (never the thumbnail), or null for the
// default card; width/height only when we know them (the default card).
export function cardTags({ title, description, url, image, imageAlt, width, height, type = 'website' }) {
  return [
    `<title>${esc(title)} | What The Find</title>`,
    `<meta name="description" content="${esc(description)}" />`,
    `<link rel="canonical" href="${esc(url)}" />`,
    `<meta property="og:type" content="${esc(type)}" />`,
    `<meta property="og:site_name" content="What The Find" />`,
    `<meta property="og:title" content="${esc(title)}" />`,
    `<meta property="og:description" content="${esc(description)}" />`,
    `<meta property="og:url" content="${esc(url)}" />`,
    `<meta property="og:image" content="${esc(image)}" />`,
    width && `<meta property="og:image:width" content="${width}" />`,
    height && `<meta property="og:image:height" content="${height}" />`,
    `<meta property="og:image:alt" content="${esc(imageAlt)}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${esc(title)}" />`,
    `<meta name="twitter:description" content="${esc(description)}" />`,
    `<meta name="twitter:image" content="${esc(image)}" />`,
    `<meta name="twitter:image:alt" content="${esc(imageAlt)}" />`,
  ].filter(Boolean).join('\n    ')
}

const defaultImage = site => ({ image: `${site}/og/og-default.png`, width: 1200, height: 630, imageAlt: 'What The Find: every collection has a story.' })

export function lotCard(d, site) {
  const p = d.price
  const priceText = d.lot.status === 'sold' ? `Sold for ${money(p.current_bid)}`
    : p.current_bid != null ? `Current bid ${money(p.current_bid)} (${money(p.total_with_premium)} with ${p.premium_pct}% buyer's premium)`
    : `Opening bid ${money(p.opening_bid)}`
  return {
    title: `Lot ${d.lot.number}: ${d.lot.title}`,
    description: `${priceText}. ${d.auction.title} at What The Find.`,
    url: `${site}/a/${d.auction.slug}/lot/${d.lot.number}`,
    type: 'product',
    ...(d.lot.image_url ? { image: d.lot.image_url, imageAlt: d.lot.title } : defaultImage(site)),
  }
}

// a: the public GET /auction/:id answer; firstPhoto: the first lot's full photo when the auction has no cover.
export function auctionCard(a, firstPhoto, site) {
  const photo = a.image_url || firstPhoto
  return {
    title: a.title,
    description: storyLine(a.description) || 'An auction at What The Find. Every collection has a story.',
    url: `${site}/auction/${a.id}`,
    type: 'website',
    ...(photo ? { image: photo, imageAlt: a.title } : defaultImage(site)),
  }
}

// Replaces index.html's default card (and title/description/canonical) with this page's.
export function inject(html, tags) {
  return html
    .replace(/<title>[\s\S]*?<\/title>\s*/i, '')
    .replace(/<meta\s+(?:name|property)="(?:description|og:[^"]*|twitter:[^"]*)"[^>]*>\s*/gi, '')
    .replace(/<link\s+rel="canonical"[^>]*>\s*/gi, '')
    .replace(/<\/head>/i, `    ${tags}\n  </head>`)
}

const getJson = async path => {
  const r = await fetch(`${API}${path}`, { signal: AbortSignal.timeout(3000) })
  return r.ok ? r.json() : null
}

export default async function handler(req, res) {
  const site = `https://${req.headers['x-forwarded-host'] || req.headers.host}`
  const { kind = '', slug = '', n = '', id = '' } = req.query || {}
  let html
  try {
    html = await (await fetch(`${site}/index.html`, { signal: AbortSignal.timeout(3000) })).text()
  } catch {
    res.statusCode = 302; res.setHeader('Location', '/'); res.end(); return
  }
  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  try {
    let card = null
    if (kind === 'lot' && /^[a-z0-9-]{1,120}$/.test(slug) && /^\d{1,6}$/.test(n)) {
      const d = await getJson(`/lots/by-number/${slug}/${n}`)
      if (d) card = lotCard(d, site)
    } else if (kind === 'auction' && UUID.test(id)) {
      const a = await getJson(`/auction/${id.toLowerCase()}`)
      if (a && a.id) {
        let first = null
        if (!a.image_url) {
          const lots = await getJson(`/auction/${a.id}/items/standard-status`)
          first = (Array.isArray(lots) ? lots : []).sort((x, y) => x.position - y.position).find(l => l.image_url)?.image_url || null
        }
        card = auctionCard(a, first, site)
      }
    }
    if (card) {
      html = inject(html, cardTags(card))
      res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300')
    }
  } catch { /* the page with its default card, as a person would get it */ }
  res.end(html)
}

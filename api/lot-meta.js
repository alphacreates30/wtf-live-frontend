// Share previews for a lot's page (LOT_PAGE_BRIEF.md): link crawlers (iMessage, WhatsApp, Facebook, Slack, X,
// search engines) don't run the app's JavaScript, so vercel.json sends THEM - and only them, by user agent - here.
// This returns the site's own index.html with the lot's title, photo and current bid in its <head>. People get
// the static page as before. Reads the public GET /lots/by-number (the same answer everyone gets).
const API = (process.env.LOT_META_API_URL || process.env.VITE_API_URL || 'https://wtf-live-backend-production.up.railway.app').replace(/\/+$/, '')

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const money = n => Number(n).toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: Number(n) % 1 ? 2 : 0 })

export function metaFor(d, pageUrl) {
  const p = d.price
  const priceText = d.lot.status === 'sold' ? `Sold for ${money(p.current_bid)}`
    : p.current_bid != null ? `Current bid ${money(p.current_bid)} (${money(p.total_with_premium)} with ${p.premium_pct}% buyer's premium)`
    : `Opening bid ${money(p.opening_bid)}`
  const title = `Lot ${d.lot.number}: ${d.lot.title}`
  const desc = `${priceText}. ${d.auction.title} at What The Find.`
  const tags = [
    `<title>${esc(title)} | What The Find</title>`,
    `<meta name="description" content="${esc(desc)}" />`,
    `<link rel="canonical" href="${esc(pageUrl)}" />`,
    `<meta property="og:type" content="product" />`,
    `<meta property="og:site_name" content="What The Find" />`,
    `<meta property="og:title" content="${esc(title)}" />`,
    `<meta property="og:description" content="${esc(desc)}" />`,
    `<meta property="og:url" content="${esc(pageUrl)}" />`,
    d.lot.image_url && `<meta property="og:image" content="${esc(d.lot.image_url)}" />`,
    d.lot.image_url && `<meta property="og:image:alt" content="${esc(d.lot.title)}" />`,
    `<meta name="twitter:card" content="${d.lot.image_url ? 'summary_large_image' : 'summary'}" />`,
    `<meta name="twitter:title" content="${esc(title)}" />`,
    `<meta name="twitter:description" content="${esc(desc)}" />`,
    d.lot.image_url && `<meta name="twitter:image" content="${esc(d.lot.image_url)}" />`,
  ].filter(Boolean)
  return tags.join('\n    ')
}

export function inject(html, tags) {
  return html
    .replace(/<title>[\s\S]*?<\/title>\s*/i, '')
    .replace(/<meta name="description"[^>]*>\s*/i, '')
    .replace(/<\/head>/i, `    ${tags}\n  </head>`)
}

export default async function handler(req, res) {
  const site = `https://${req.headers['x-forwarded-host'] || req.headers.host}`
  const { slug = '', n = '' } = req.query || {}
  let html
  try {
    html = await (await fetch(`${site}/index.html`, { signal: AbortSignal.timeout(3000) })).text()
  } catch {
    res.statusCode = 302; res.setHeader('Location', '/'); res.end(); return
  }
  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  if (/^[a-z0-9-]{1,120}$/.test(slug) && /^\d{1,6}$/.test(n)) {
    try {
      const r = await fetch(`${API}/lots/by-number/${slug}/${n}`, { signal: AbortSignal.timeout(3000) })
      if (r.ok) {
        const d = await r.json()
        html = inject(html, metaFor(d, `${site}/a/${d.auction.slug}/lot/${d.lot.number}`))
        res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300')
      }
    } catch { /* the plain page, as a person would get it */ }
  }
  res.end(html)
}

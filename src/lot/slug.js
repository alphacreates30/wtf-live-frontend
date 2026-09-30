// A lot's own address: /a/<auction slug>/lot/<lot number>. The slug is the auction's title words plus the first
// 8 characters of its id; the id part is what finds the auction, so a renamed auction's old links still work.
// MUST match the backend's lot_rules.js (slugify / auctionSlug): verification/lot-page-frontend.js checks it.

export function slugify(text) {
  return String(text || '')
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    .slice(0, 60).replace(/-+$/, '')
}

export function auctionSlug(auction) {
  // Preview mode's sample auctions ("sample-horror") are their own slug.
  if (String(auction.id).startsWith('sample-')) return String(auction.id)
  const words = slugify(auction.title)
  const idPart = String(auction.id).toLowerCase().slice(0, 8)
  return words ? `${words}-${idPart}` : idPart
}

// lot: anything with auction_id, position and (for the words) the auction's title.
export function lotPath(auctionId, auctionTitle, position) {
  return `/a/${auctionSlug({ id: auctionId, title: auctionTitle })}/lot/${position + 1}`
}

// SAMPLE data for the admin-only "Preview with sample auctions" (PREVIEW_MODE_BRIEF.md). Built in the browser,
// shaped exactly like GET /home and GET /auctions, so the page renders what real auctions will produce.
// It is never sent anywhere and never stored: no API call is made with it. Every auction and lot title starts
// with "Sample:" so a screenshot can't be mistaken for a real listing. Generic items only (no brands, characters or
// artwork), and no photos: every image is the placeholder tile, labelled with the item type.

const MIN = 60e3, HOUR = 60 * MIN, DAY = 24 * HOUR
const CLOSE_HOUR = 20   // every sample auction ends at 8:00 PM local on its day

// Five open auctions ending on different days, then one upcoming. `day` = days from today to the auction's end.
const OPEN = [
  { key: 'horror', title: 'Sample: Horror collection', blurb: 'Monster figures, model kits and resin statues kept in one collector\'s basement.', label: 'Figure', day: 0,
    lots: [['Resin monster figure, 12 in', 26, 83], ['Vinyl creature figure, boxed', 19, 62], ['Glow-in-the-dark model kit, built', 0, 0], ['Werewolf bust on wooden base', 14, 47], ['Mummy statue with display case', 9, 31], ['Bat-wing diorama, hand painted', 0, 0], ['Graveyard playset, complete', 4, 18], ['Swamp creature figure, 8 in', 2, 9]] },
  { key: 'tin', title: 'Sample: Tin toys', blurb: 'A retired engineer\'s shelf of wind-up robots and tin cars, most with their boxes.', label: 'Tin toy', day: 2,
    lots: [['Wind-up tin robot, 1960s style', 12, 64], ['Friction tin race car, red', 5, 22], ['Tin spaceship with sparks', 0, 0], ['Clockwork walking bear', 7, 28], ['Tin carousel, working', 3, 15], ['Battery robot with light-up chest', 0, 0]] },
  { key: 'arcade', title: 'Sample: Arcade flyers', blurb: 'Original promotional flyers from a closed arcade, stored flat since the nineties.', label: 'Flyer', day: 4,
    lots: [['Arcade flyer, racing game, 1988', 6, 24], ['Arcade flyer, space shooter', 0, 0], ['Arcade flyer, fighting game, folded', 3, 11], ['Set of three pinball flyers', 8, 35], ['Arcade flyer, maze game', 1, 5], ['Arcade flyer, light-gun game', 0, 0], ['Operator price list, 1991', 2, 8]] },
  { key: 'cameras', title: 'Sample: Film cameras', blurb: 'Rangefinders and SLRs from a camera-shop back room, tested and described.', label: 'Camera', day: 5,
    lots: [['35mm rangefinder camera', 4, 45], ['Twin-lens reflex camera', 9, 120], ['Folding medium-format camera', 0, 0], ['35mm SLR with 50mm lens', 6, 70], ['Light meter in leather case', 1, 12], ['Flash unit with bulbs', 0, 0]] },
  { key: 'records', title: 'Sample: Vinyl records', blurb: 'A jazz and soul collection, sleeves in good order.', label: 'Record', day: 6,
    lots: [['12-inch jazz LP, first pressing', 11, 55], ['Soul 7-inch singles, lot of 10', 3, 20], ['Live album, gatefold sleeve', 0, 0], ['Big-band 10-inch record', 2, 9], ['Blues LP, sealed', 5, 38], ['Record crate, wooden', 0, 0]] },
]
const UPCOMING = { key: 'comics', title: 'Sample: Comic books', blurb: 'Bagged and boarded newsstand comics from one reader\'s long boxes.', label: 'Comic', day: 8, lots: 9 }

const iso = ms => new Date(ms).toISOString()

// 8:00 PM local on the auction's day. Day 0 is today while its first lot is still open, else tomorrow (and every
// later day moves with it), so the soonest sample auction always has lots to bid on.
function closeAt(day, nowMs) {
  const at = d => { const t = new Date(nowMs); t.setDate(t.getDate() + d); t.setHours(CLOSE_HOUR, 0, 0, 0); return t.getTime() }
  const firstOpen = at(0) - (OPEN[0].lots.length - 1) * MIN
  return at(day + (firstOpen > nowMs ? 0 : 1))
}

function auctionLots(a, nowMs) {
  // Lots close one minute apart, in lot order; the last one at 8:00 PM.
  const n = a.lots.length, last = closeAt(a.day, nowMs)
  return a.lots.map(([title, bids, price], i) => ({
    id: `sample-${a.key}-${i + 1}`, auction_id: `sample-${a.key}`, auction_title: a.title,
    position: i, title: `Sample: ${title}`, image_url: null, thumb_url: null, placeholder_label: a.label,
    current_bid: price, bid_count: bids, ends_at: iso(last - (n - 1 - i) * MIN), status: 'open',
  }))
}

const upcomingStart = nowMs => closeAt(UPCOMING.day, nowMs) - 10 * HOUR   // 10:00 AM on its day
const upcomingEnd = nowMs => closeAt(UPCOMING.day + 7, nowMs)

// GET /home, for `open` = 0, 1, 3 or 5 open auctions (plus the upcoming one).
export function sampleHome(open, nowMs = Date.now(), timezone = 'America/New_York') {
  const auctions = OPEN.slice(0, open)
  const lots = auctions.flatMap(a => auctionLots(a, nowMs))
  const byEnds = (x, y) => Date.parse(x.ends_at) - Date.parse(y.ends_at) || x.position - y.position
  const withBids = lots.filter(l => l.bid_count > 0).sort((x, y) => y.bid_count - x.bid_count || Date.parse(x.ends_at) - Date.parse(y.ends_at))
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' })
  const schedule = []
  for (const a of auctions) {
    const days = new Map()
    for (const l of lots.filter(l => l.auction_id === `sample-${a.key}`)) {
      const t = Date.parse(l.ends_at); if (t > nowMs + 7 * DAY) continue
      const d = day.format(new Date(t)), e = days.get(d)
      if (!e) days.set(d, { first: t, last: t }); else { e.first = Math.min(e.first, t); e.last = Math.max(e.last, t) }
    }
    for (const [date, e] of days) schedule.push({ date, auction_id: `sample-${a.key}`, title: a.title, first_close: iso(e.first), last_close: iso(e.last) })
  }
  schedule.sort((x, y) => Date.parse(x.first_close) - Date.parse(y.first_close))
  const all = [...auctions.map(a => `sample-${a.key}`), `sample-${UPCOMING.key}`]
  return {
    sample: true,
    server_now: iso(nowMs),
    timezone,
    open_auctions: auctions.map(a => {
      const own = lots.filter(l => l.auction_id === `sample-${a.key}`)
      return {
        id: `sample-${a.key}`, title: a.title, blurb: a.blurb, lot_count: own.length,
        starts_at: iso(nowMs - DAY), ends_at: own[own.length - 1].ends_at,
        first_lot_ends_at: own[0].ends_at, last_lot_ends_at: own[own.length - 1].ends_at,
        buyers_premium_pct: 15, images: [], placeholder_labels: [a.label, a.label, a.label],
      }
    }),
    closing_schedule: schedule,
    premium_pct: Object.fromEntries(all.map(id => [id, 15])),
    rails: {
      ending_soon: [...lots].sort(byEnds).slice(0, 12),
      most_wanted: withBids.length >= 3 ? withBids.slice(0, 12) : [],
      first_bid: lots.filter(l => l.bid_count === 0).sort(byEnds).slice(0, 12),
    },
    upcoming: [{
      id: `sample-${UPCOMING.key}`, title: UPCOMING.title, blurb: UPCOMING.blurb,
      starts_at: iso(upcomingStart(nowMs)), ends_at: iso(upcomingEnd(nowMs)),
      image_url: null, thumb_url: null, placeholder_label: UPCOMING.label,
    }],
  }
}

// GET /auctions (the auctions list), same counts.
export function sampleAuctions(open, nowMs = Date.now()) {
  return [
    ...OPEN.slice(0, open).map(a => ({
      id: `sample-${a.key}`, title: a.title, description: a.blurb, image_url: null, placeholder_label: a.label,
      category: null, status: 'live', mode: 'standard', starts_at: iso(nowMs - DAY), ends_at: iso(closeAt(a.day, nowMs)),
    })),
    { id: `sample-${UPCOMING.key}`, title: UPCOMING.title, description: UPCOMING.blurb, image_url: null, placeholder_label: UPCOMING.label,
      category: null, status: 'upcoming', mode: 'standard', starts_at: iso(upcomingStart(nowMs)), ends_at: iso(upcomingEnd(nowMs)) },
  ]
}

// The lot page for a sample lot (/a/sample-<key>/lot/<n>), shaped exactly like GET /lots/:id, /lots/:id/bids and
// /lots/:id/related. null for anything that isn't a lot of a sample open auction. The page disables bidding.
const inc = p => (p < 50 ? 1 : p < 100 ? 2 : p < 200 ? 5 : p < 500 ? 10 : p < 1000 ? 25 : 50)
const cents = n => Math.round(n * 100) / 100
export function sampleLotPage(slug, n, nowMs = Date.now()) {
  const a = OPEN.find(x => `sample-${x.key}` === slug)
  if (!a) return null
  const lots = auctionLots(a, nowMs), lot = lots[n - 1]
  if (!lot) return null
  const current = lot.bid_count > 0 ? lot.current_bid : null
  const shown = current ?? 1
  const prem = Math.round(Math.round(shown * 100) * 15 / 100)
  const first = lot.bid_count > 0 ? cents(lot.current_bid + inc(lot.current_bid)) : 1
  const nav = l => (l ? { id: l.id, number: l.position + 1, title: l.title } : null)
  // Two sample bidders taking turns, the last bid at the current price.
  const bids = Array.from({ length: lot.bid_count }, (_, i) => ({
    amount: i === lot.bid_count - 1 ? lot.current_bid : Math.max(1, Math.round((lot.current_bid * (i + 1)) / lot.bid_count)),
    at: iso(nowMs - (lot.bid_count - i) * 47 * MIN),
    bidder: (lot.bid_count - 1 - i) % 2 === 0 ? 'Bidder A' : 'Bidder B', you: false,
  })).reverse()
  return {
    sample: true,
    lot: {
      server_now: iso(nowMs),
      lot: { id: lot.id, number: n, position: n - 1, title: lot.title, placeholder_label: a.label,
        description: 'Sample description. A real lot has its catalogue entry here: what it is, its size and anything worth knowing.',
        condition: 'Sample condition: light wear, see photos', status: 'open', ends_at: lot.ends_at, image_url: null, thumb_url: null },
      auction: { id: `sample-${a.key}`, slug, title: a.title, story: a.blurb, category: null, phase: 'live',
        starts_at: iso(nowMs - DAY), ends_at: lots[lots.length - 1].ends_at, lot_count: lots.length, buyers_premium_pct: 15 },
      photos: [],
      price: { current_bid: current, opening_bid: current == null ? 1 : null, bid_count: lot.bid_count, premium_pct: 15,
        premium_amount: prem / 100, total_with_premium: (Math.round(shown * 100) + prem) / 100, next_bids: [first, cents(first + inc(first))] },
      time: { ends_at: lot.ends_at, soft_close_minutes: 2 },
      fulfilment: { pickup: { free: true, city: 'Sample City', starts_at: null, ends_at: null },
        shipping: { priced: 'after_auction', estimate: null, carrier: 'USPS', country: 'US' } },
      nav: { prev: nav(lots[n - 2]), next: nav(lots[n]) },
      contact_email: 'sample@example.invalid',
    },
    bids: { bid_count: lot.bid_count, bids },
    related: {
      server_now: iso(nowMs),
      more_from_auction: lots.filter(l => l.id !== lot.id).sort((x, y) => Date.parse(x.ends_at) - Date.parse(y.ends_at)).slice(0, 8),
      similar: [],
      premium_pct: { [`sample-${a.key}`]: 15 },
    },
  }
}

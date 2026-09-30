// SAMPLE data for the admin-only "Preview with sample auctions" (PREVIEW_MODE_BRIEF.md). Built in the browser,
// shaped exactly like GET /home and GET /auctions, so the page renders what real auctions will produce.
// It is never sent anywhere and never stored: no API call is made with it. Every auction and lot title starts
// with "Sample:" so a screenshot can't be mistaken for a real listing. Generic items only (no brands, characters or
// artwork), and no photos: every image is the placeholder tile, labelled with the item type.

const MIN = 60e3, HOUR = 60 * MIN, DAY = 24 * HOUR

// Five open auctions ending on different days, then one upcoming. `ends` = minutes to the auction's LAST lot.
const OPEN = [
  { key: 'horror', title: 'Sample: Horror collection', blurb: 'Monster figures, model kits and resin statues kept in one collector\'s basement.', label: 'Figure', ends: 5 * 60, firstIn: 40,
    lots: [['Resin monster figure, 12 in', 26, 83], ['Vinyl creature figure, boxed', 19, 62], ['Glow-in-the-dark model kit, built', 0, 0], ['Werewolf bust on wooden base', 14, 47], ['Mummy statue with display case', 9, 31], ['Bat-wing diorama, hand painted', 0, 0], ['Graveyard playset, complete', 4, 18], ['Swamp creature figure, 8 in', 2, 9]] },
  { key: 'tin', title: 'Sample: Tin toys', blurb: 'A retired engineer\'s shelf of wind-up robots and tin cars, most with their boxes.', label: 'Tin toy', ends: 2 * 24 * 60 + 90, firstIn: 2 * 24 * 60,
    lots: [['Wind-up tin robot, 1960s style', 12, 64], ['Friction tin race car, red', 5, 22], ['Tin spaceship with sparks', 0, 0], ['Clockwork walking bear', 7, 28], ['Tin carousel, working', 3, 15], ['Battery robot with light-up chest', 0, 0]] },
  { key: 'arcade', title: 'Sample: Arcade flyers', blurb: 'Original promotional flyers from a closed arcade, stored flat since the nineties.', label: 'Flyer', ends: 4 * 24 * 60 + 30, firstIn: 4 * 24 * 60 - 60,
    lots: [['Arcade flyer, racing game, 1988', 6, 24], ['Arcade flyer, space shooter', 0, 0], ['Arcade flyer, fighting game, folded', 3, 11], ['Set of three pinball flyers', 8, 35], ['Arcade flyer, maze game', 1, 5], ['Arcade flyer, light-gun game', 0, 0], ['Operator price list, 1991', 2, 8]] },
  { key: 'cameras', title: 'Sample: Film cameras', blurb: 'Rangefinders and SLRs from a camera-shop back room, tested and described.', label: 'Camera', ends: 5 * 24 * 60 + 200, firstIn: 5 * 24 * 60,
    lots: [['35mm rangefinder camera', 4, 45], ['Twin-lens reflex camera', 9, 120], ['Folding medium-format camera', 0, 0], ['35mm SLR with 50mm lens', 6, 70], ['Light meter in leather case', 1, 12], ['Flash unit with bulbs', 0, 0]] },
  { key: 'records', title: 'Sample: Vinyl records', blurb: 'A jazz and soul collection, sleeves in good order.', label: 'Record', ends: 6 * 24 * 60 + 60, firstIn: 6 * 24 * 60 - 30,
    lots: [['12-inch jazz LP, first pressing', 11, 55], ['Soul 7-inch singles, lot of 10', 3, 20], ['Live album, gatefold sleeve', 0, 0], ['Big-band 10-inch record', 2, 9], ['Blues LP, sealed', 5, 38], ['Record crate, wooden', 0, 0]] },
]
const UPCOMING = { key: 'comics', title: 'Sample: Comic books', blurb: 'Bagged and boarded newsstand comics from one reader\'s long boxes.', label: 'Comic', opensIn: 8 * DAY + 3 * HOUR, lots: 9 }

const iso = ms => new Date(ms).toISOString()

function auctionLots(a, nowMs) {
  // Lots close one after another: from firstIn to ends, evenly spaced.
  const n = a.lots.length, first = nowMs + a.firstIn * MIN, last = nowMs + a.ends * MIN
  return a.lots.map(([title, bids, price], i) => ({
    id: `sample-${a.key}-${i + 1}`, auction_id: `sample-${a.key}`, auction_title: a.title,
    position: i, title: `Sample: ${title}`, image_url: null, thumb_url: null, placeholder_label: a.label,
    current_bid: price, bid_count: bids, ends_at: iso(n > 1 ? first + ((last - first) * i) / (n - 1) : last), status: 'open',
  }))
}

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
        starts_at: iso(nowMs - DAY), ends_at: iso(nowMs + a.ends * MIN),
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
      starts_at: iso(nowMs + UPCOMING.opensIn), ends_at: iso(nowMs + UPCOMING.opensIn + 7 * DAY),
      image_url: null, thumb_url: null, placeholder_label: UPCOMING.label,
    }],
  }
}

// GET /auctions (the auctions list), same counts.
export function sampleAuctions(open, nowMs = Date.now()) {
  return [
    ...OPEN.slice(0, open).map(a => ({
      id: `sample-${a.key}`, title: a.title, description: a.blurb, image_url: null, placeholder_label: a.label,
      category: null, status: 'live', mode: 'standard', starts_at: iso(nowMs - DAY), ends_at: iso(nowMs + a.ends * MIN),
    })),
    { id: `sample-${UPCOMING.key}`, title: UPCOMING.title, description: UPCOMING.blurb, image_url: null, placeholder_label: UPCOMING.label,
      category: null, status: 'upcoming', mode: 'standard', starts_at: iso(nowMs + UPCOMING.opensIn), ends_at: iso(nowMs + UPCOMING.opensIn + 7 * DAY) },
  ]
}

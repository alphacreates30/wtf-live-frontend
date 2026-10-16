// The Services pages (wtf-handoff SERVICES_BRIEF.md, F5). Page copy: Cowork's, with Albert's answers (Oct 16).
// The FAQ answers only restate facts from that copy. No commission rates or prices on the site: terms are agreed
// one to one. `key` is what the request form sends (the backend's service_requests.service).

export const SERVICES = [
  {
    slug: 'sell',
    key: 'sell',
    title: 'Sell to us',
    nav: 'Sell to us',
    line: 'We buy outright. Get an offer within 72 hours.',
    headline: 'Get a fair offer and get paid.',
    paragraphs: [
      'Send us photos and a few details. We\'ll look them over and come back with an offer within 72 hours.',
      'If you accept, we inspect everything and pay you on the spot. Hassle-free.',
    ],
    steps: ['Send photos', 'Get an offer within 72 hours', 'We inspect and pay on the spot'],
    faq: [
      ['How quickly will I hear back?', 'We come back with an offer within 72 hours of getting your photos and details.'],
      ['Do I have to accept the offer?', 'No. The offer is yours to accept or turn down.'],
      ['When do I get paid?', 'Once you accept, we inspect everything and pay you on the spot.'],
    ],
  },
  {
    slug: 'consign',
    key: 'consign',
    title: 'Consign',
    nav: 'Consign',
    line: 'We sell it for you, in our auctions and live shows.',
    headline: 'We sell it for you, the right way.',
    paragraphs: [
      'We photograph, catalogue and sell your pieces in our timed auctions or live shows, to collectors who care.',
      'You stay the owner until it sells, and you\'re paid within 21 days of the auction closing. Terms are agreed with you one to one.',
    ],
    steps: ['Tell us what you have', 'We catalogue and sell', 'You get paid'],
    faq: [
      ['Who owns my pieces while they\'re for sale?', 'You do, until they sell.'],
      ['When do I get paid?', 'Within 21 days of the auction closing. That allows for the buyer\'s payment, shipping and the 3-day window buyers have to tell us an item isn\'t as described.'],
      ['What are the terms?', 'They\'re agreed with you one to one, before anything is listed.'],
    ],
  },
  {
    slug: 'estates',
    key: 'estates',
    title: 'Estate buyouts',
    nav: 'Estate buyouts',
    line: 'Whole estates and large collections, in South Florida.',
    headline: 'Whole estates, handled with care.',
    paragraphs: [
      'When there\'s a lot to sort through, we can buy everything at once, or sort, catalogue and sell it for you.',
      'Discreet, respectful and on your schedule. Serving South Florida.',
    ],
    steps: ['Tell us about the estate', 'We visit or review photos', 'We agree a plan'],
    faq: [
      ['Where do you work?', 'We serve South Florida.'],
      ['Do you buy everything, or sell it for us?', 'Either. We can buy everything at once, or sort, catalogue and sell it for you. We agree the plan together.'],
      ['Can you see it before we decide?', 'Yes. We can visit, or review photos first.'],
    ],
  },
  {
    slug: 'collection-auctions',
    key: 'collection_auction',
    title: 'Collection auctions',
    nav: 'Collection auctions',
    line: 'A dedicated auction or live show for your collection.',
    headline: 'Every collection has a story. Let us tell yours.',
    paragraphs: [
      'A dedicated auction or live show just for your collection: its own page, its story, professional photos and promotion to our buyers.',
      'Best for collections of 25 pieces or more.',
    ],
    steps: ['Share the story', 'We build the auction', 'Collectors bid'],
    faq: [
      ['How big does the collection need to be?', 'It works best for collections of 25 pieces or more.'],
      ['Timed auction or live show?', 'Either one, just for your collection.'],
      ['What do you do for it?', 'It gets its own page and its story, professional photos, and promotion to our buyers.'],
    ],
  },
]

export const SERVICE_BY_SLUG = Object.fromEntries(SERVICES.map(s => [s.slug, s]))

// The form's choices (the backend checks the same keys).
export const SERVICE_OPTIONS = [...SERVICES.map(s => [s.key, s.title]), ['general', 'General question']]
export const ITEM_COUNT_OPTIONS = [['1', '1'], ['2-10', '2 to 10'], ['11-25', '11 to 25'], ['26-100', '26 to 100'], ['100+', 'More than 100']]
export const STATUS_LABELS = { new: 'New', contacted: 'Contacted', offer_made: 'Offer made', closed: 'Closed' }

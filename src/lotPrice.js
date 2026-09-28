// Label for a lot's price stat. Once a lot has closed its price is no longer a
// "current" bid: a sold lot shows its hammer price, an unsold lot that had bids
// (reserve not met) its highest bid. null means there is no price to show - the
// lot closed with no bids.
export function lotPriceLabel(item) {
  if (item.status === 'sold') return 'Sold for'
  if (item.status === 'unsold') return item.bid_count > 0 ? 'Highest bid' : null
  return 'Current bid'
}

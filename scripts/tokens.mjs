// Generates src/design/tokens.css from src/design/tokens.json (the one source of
// design tokens, shared with the future app) and checks every allowed text/
// background pair against WCAG AA.
//
//   node scripts/tokens.mjs           write tokens.css (runs before every build)
//   node scripts/tokens.mjs --check   fail if tokens.css is out of date or a pair is below 4.5:1
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const jsonPath = join(root, 'src/design/tokens.json')
const cssPath = join(root, 'src/design/tokens.css')
const t = JSON.parse(readFileSync(jsonPath, 'utf8'))

// CSS custom property names: --<name> for colours, --font-<name>, --fs-<size>,
// --lh-<name>, --radius-<name>, --space-<n>, --tap / --header-h.
const lines = []
const group = (title, entries) => { lines.push(`  /* ${title} */`); for (const [k, v] of entries) lines.push(`  --${k}: ${v};`) }
group('colour', Object.entries(t.color))
group('type', [
  ...Object.entries(t.font).map(([k, v]) => [`font-${k}`, v]),
  ...Object.entries(t['font-weight']).map(([k, v]) => [`fw-${k}`, v]),
  ...Object.entries(t['font-size']).map(([k, v]) => [`fs-${k}`, v]),
  ...Object.entries(t['line-height']).map(([k, v]) => [`lh-${k}`, v]),
])
group('shape and space', [
  ...Object.entries(t.radius).map(([k, v]) => [`radius-${k}`, v]),
  ...Object.entries(t.space).map(([k, v]) => [`space-${k}`, v]),
  ['tap', t.size.tap], ['header-h', t.size.header],
])
const css = `/* GENERATED from tokens.json by scripts/tokens.mjs - do not edit by hand. */\n:root {\n${lines.join('\n')}\n}\n`

// WCAG relative luminance / contrast (solid hex colours only).
const lum = hex => {
  const c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
}
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05) }
let bad = 0
for (const [fg, bg] of t.contrast.pairs) {
  const r = ratio(t.color[fg], t.color[bg])
  if (r < 4.5) { bad++; console.error(`contrast FAIL ${fg} on ${bg}: ${r.toFixed(2)}:1`) }
  else if (process.argv.includes('--verbose')) console.log(`${(fg + ' on ' + bg).padEnd(28)} ${r.toFixed(2)}:1`)
}

if (process.argv.includes('--check')) {
  const current = existsSync(cssPath) ? readFileSync(cssPath, 'utf8').replace(/\r\n/g, '\n') : ''
  if (current !== css) { console.error('tokens.css is out of date: run npm run tokens'); process.exit(1) }
  if (bad) process.exit(1)
  console.log(`tokens.css matches tokens.json; ${t.contrast.pairs.length} colour pairs pass AA`)
} else {
  writeFileSync(cssPath, css)
  if (bad) process.exit(1)
  console.log(`wrote src/design/tokens.css (${lines.length - 3} tokens); ${t.contrast.pairs.length} colour pairs pass AA`)
}

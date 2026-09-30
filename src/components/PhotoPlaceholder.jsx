import './PhotoPlaceholder.css'

// Stands in for a photo: a soft neutral tile with a faint outline of the Glint
// and a small label ("Photo coming soon" on a real lot; the item type on a
// sample lot in preview). It fills whatever fixed-ratio box it sits in, so the
// layout is exactly what the real photo will produce. `seed` picks one of four
// neutral tones so a grid of placeholders doesn't read as one grey block.
export default function PhotoPlaceholder({ label = 'Photo coming soon', seed = '', size = 'md' }) {
  const tone = 1 + ([...String(seed)].reduce((n, c) => n + c.charCodeAt(0), 0) % 4)
  return (
    <div className={`ph ph-tone-${tone} ph-${size}`} role="img" aria-label={label}>
      <svg className="ph-mark" viewBox="0 0 100 100" aria-hidden="true" focusable="false">
        <rect x="3" y="3" width="94" height="94" rx="22" fill="none" stroke="currentColor" strokeWidth="3" />
        <ellipse cx="32.5" cy="50" rx="15" ry="20" fill="none" stroke="currentColor" strokeWidth="3" />
        <ellipse cx="67.5" cy="50" rx="15" ry="20" fill="none" stroke="currentColor" strokeWidth="3" />
        <circle cx="37" cy="44.5" r="7.5" fill="none" stroke="currentColor" strokeWidth="3" />
        <circle cx="72" cy="44.5" r="7.5" fill="none" stroke="currentColor" strokeWidth="3" />
      </svg>
      <span className="ph-label" aria-hidden="true">{label}</span>
    </div>
  )
}

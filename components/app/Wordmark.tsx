/** Original typographic mark: a small survey "point" beside the name. */
export function Wordmark({ size = 20 }: { size?: number }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontWeight: 650, fontSize: size, letterSpacing: '-0.03em', color: 'var(--label-primary)' }}>
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
        <circle cx="12" cy="12" r="9" stroke="var(--accent)" strokeWidth="1.6" />
        <circle cx="12" cy="12" r="3" fill="var(--accent)" />
        <path d="M12 1.5v4M12 18.5v4M1.5 12h4M18.5 12h4" stroke="var(--accent)" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
      Fieldpoint
    </span>
  )
}

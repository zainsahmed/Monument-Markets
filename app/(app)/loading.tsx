import { Skeleton } from '@/components/ui/states'

/** Route-level skeleton shaped like the final layout (large title, tiles, cards) — never a full-page spinner. */
export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading">
      <Skeleton w={260} h={40} style={{ marginBottom: 12 }} />
      <Skeleton w={380} h={14} style={{ marginBottom: 28 }} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(168px, 1fr))', gap: 12, marginBottom: 24 }}>{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} h={104} style={{ borderRadius: 14 }} />)}</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 420px), 1fr))', gap: 16 }}>{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} h={240} style={{ borderRadius: 14 }} />)}</div>
    </div>
  )
}

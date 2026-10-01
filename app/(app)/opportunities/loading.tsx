import { Skeleton, SkeletonRows } from '@/components/ui/states'

export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading opportunities">
      <Skeleton w={240} h={40} style={{ marginBottom: 12 }} />
      <Skeleton w={520} h={14} style={{ marginBottom: 24 }} />
      <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}><Skeleton w={300} h={32} style={{ borderRadius: 10 }} /><Skeleton w={240} h={32} style={{ borderRadius: 10 }} /></div>
      <div className="card" style={{ overflow: 'hidden' }}><SkeletonRows n={12} h={36} /></div>
    </div>
  )
}

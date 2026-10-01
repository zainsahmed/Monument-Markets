'use client'
import { DndContext, DragOverlay, KeyboardSensor, PointerSensor, TouchSensor, closestCorners, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent, type DragStartEvent } from '@dnd-kit/core'
import { Kanban as KanbanIcon } from 'lucide-react'
import Link from 'next/link'
import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { CountdownChip } from '@/components/ui/chips'
import { Sheet } from '@/components/ui/Dialog'
import { Empty } from '@/components/ui/states'
import { useToast } from '@/components/ui/Toast'
import { moveStage, restoreStage } from '@/lib/actions/opportunities'
import { PIPELINE_STAGES, type StageKey } from '@/lib/db-types'
import { fmtMoney, orUnknown } from '@/lib/format'

export interface KCard { coId: string; oppId: string; stage: StageKey; title: string; agency: string | null; deadline: string | null; value: number | null; checklist: { pass: number; fail: number; unknown: number; na: number } | null; supplier: 'Found' | 'Needed' | 'Unknown' }
type Pending = { card: KCard; to: StageKey } | null

function CardView({ c, canWrite, onMove, overlay }: { c: KCard; canWrite: boolean; onMove?: (to: StageKey) => void; overlay?: boolean }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: c.coId, disabled: !canWrite || overlay })
  return (
    <article ref={overlay ? undefined : setNodeRef} className="card" style={{ padding: 12, display: 'grid', gap: 8, touchAction: 'manipulation', opacity: isDragging && !overlay ? 0.35 : 1, transform: overlay ? 'scale(1.02)' : undefined, boxShadow: overlay ? '0 8px 32px var(--shadow), 0 1px 2px var(--shadow-soft)' : undefined, transition: 'transform var(--dur-fast) var(--ease), box-shadow var(--dur-fast) var(--ease)' }} aria-label={c.title}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
        <Link href={`/opportunities/${c.oppId}`} className="t-callout" style={{ flex: 1, color: 'var(--label-primary)', fontWeight: 500, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{c.title}</Link>
        {canWrite && <button type="button" {...attributes} {...listeners} aria-label={`Drag ${c.title}`} className="btn btn-icon btn-sm" style={{ cursor: 'grab', width: 24, height: 24, touchAction: 'none' }}>⠿</button>}
      </div>
      <div className="t-footnote" style={{ color: 'var(--label-secondary)' }}>{orUnknown(c.agency)}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}><CountdownChip deadline={c.deadline} /><span className="t-footnote num" style={{ color: 'var(--label-secondary)' }}>{c.value ? fmtMoney(c.value, { compact: true }) : 'Value unknown'}</span></div>
      <div className="t-footnote num" style={{ color: 'var(--label-secondary)' }}>{c.checklist ? `${c.checklist.pass} pass · ${c.checklist.unknown} unknown · ${c.checklist.fail} fail` : 'Checklist not started'} · Supplier {c.supplier.toLowerCase()}</div>
      {canWrite && onMove && (
        <label className="sr-only" htmlFor={`mv-${c.coId}`}>Move {c.title} to stage</label>
      )}
      {canWrite && onMove && <select id={`mv-${c.coId}`} className="select" style={{ height: 28, fontSize: 'var(--t-footnote-size)' }} value={c.stage} onChange={(e) => onMove(e.target.value as StageKey)} aria-label={`Move ${c.title} to stage`}>{PIPELINE_STAGES.map((s) => <option key={s.key} value={s.key}>Move to: {s.label}</option>)}</select>}
    </article>
  )
}

function Column({ stage, label, cards, canWrite, onMove }: { stage: StageKey; label: string; cards: KCard[]; canWrite: boolean; onMove: (c: KCard, to: StageKey) => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: stage })
  const known = cards.filter((c) => c.value).reduce((n, c) => n + (c.value as number), 0)
  const unknown = cards.filter((c) => !c.value).length
  return (
    <section ref={setNodeRef} aria-label={`${label}, ${cards.length} cards`} style={{ flex: '0 0 288px', scrollSnapAlign: 'start', display: 'flex', flexDirection: 'column', gap: 8, padding: 8, borderRadius: 'var(--radius-lg)', background: isOver ? 'color-mix(in srgb, var(--accent) 10%, var(--bg-tertiary))' : 'var(--bg-tertiary)', transition: 'background var(--dur-fast) var(--ease)', minHeight: 160 }}>
      <header style={{ padding: '4px 4px 0' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}><h2 className="t-subheadline" style={{ margin: 0, flex: 1 }}>{label}</h2><span className="num t-footnote" style={{ color: 'var(--label-secondary)' }}>{cards.length}</span></div>
        <div className="t-footnote num" style={{ color: 'var(--label-secondary)' }}>{known ? fmtMoney(known, { compact: true }) : 'Value unknown'}{known > 0 && unknown > 0 ? ` + ${unknown} unknown` : ''}</div>
      </header>
      {cards.map((c) => <CardView key={c.coId} c={c} canWrite={canWrite} onMove={(to) => onMove(c, to)} />)}
      {cards.length === 0 && <p className="t-footnote" style={{ color: 'var(--label-tertiary)', textAlign: 'center', margin: '24px 0' }}>Nothing here</p>}
    </section>
  )
}

export function Kanban({ initial, canWrite }: { initial: KCard[]; canWrite: boolean }) {
  const [cards, setCards] = useState(initial)
  const [active, setActive] = useState<KCard | null>(null)
  const [pending, setPending] = useState<Pending>(null)
  const [note, setNote] = useState('')
  const [amount, setAmount] = useState('')
  const { toast } = useToast()
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }), useSensor(KeyboardSensor))
  const byStage = useMemo(() => Object.fromEntries(PIPELINE_STAGES.map((s) => [s.key, cards.filter((c) => c.stage === s.key).sort((a, b) => (a.deadline ?? '9999').localeCompare(b.deadline ?? '9999'))])) as Record<StageKey, KCard[]>, [cards])

  const commit = async (card: KCard, to: StageKey, extra: { note?: string; awardAmount?: number } = {}) => {
    const from = card.stage
    setCards((l) => l.map((c) => (c.coId === card.coId ? { ...c, stage: to } : c)))
    const r = await moveStage({ coId: card.coId, stage: to, ...extra })
    if (!r.ok) { setCards((l) => l.map((c) => (c.coId === card.coId ? { ...c, stage: from } : c))); toast(r.error, { error: true }); return }
    toast(`Moved to ${PIPELINE_STAGES.find((s) => s.key === to)?.label}`, { undo: async () => { setCards((l) => l.map((c) => (c.coId === card.coId ? { ...c, stage: from } : c))); const u = await restoreStage({ coId: card.coId, stage: from }); if (!u.ok) { setCards((l) => l.map((c) => (c.coId === card.coId ? { ...c, stage: to } : c))); toast(u.error, { error: true }) } } })
  }
  const request = (card: KCard, to: StageKey) => {
    if (to === card.stage) return
    if (to === 'submitted' || to === 'lost_passed' || to === 'won') { setNote(''); setAmount(''); setPending({ card, to }); return }
    void commit(card, to)
  }
  const onEnd = (e: DragEndEvent) => { setActive(null); const c = cards.find((x) => x.coId === e.active.id); const to = e.over?.id as StageKey | undefined; if (c && to && PIPELINE_STAGES.some((s) => s.key === to)) request(c, to) }
  const onStart = (e: DragStartEvent) => setActive(cards.find((c) => c.coId === e.active.id) ?? null)

  if (cards.length === 0) return <Empty icon={KanbanIcon} title="Your pipeline is empty" body="Add an opportunity to the pipeline from the Opportunities list to track it from review to a bid decision." action={<Link className="btn btn-primary" href="/opportunities?tab=bid_ready">Browse bid-ready opportunities</Link>} />
  return (
    <>
      <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={onStart} onDragEnd={onEnd} onDragCancel={() => setActive(null)}>
        <div role="group" aria-label="Pipeline stages" style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 16, scrollSnapType: 'x proximity', alignItems: 'flex-start' }}>
          {PIPELINE_STAGES.map((s) => <Column key={s.key} stage={s.key} label={s.label} cards={byStage[s.key]} canWrite={canWrite} onMove={request} />)}
        </div>
        <DragOverlay>{active ? <CardView c={active} canWrite={false} overlay /> : null}</DragOverlay>
      </DndContext>
      <Sheet open={!!pending} onOpenChange={(o) => !o && setPending(null)} width={460}
        title={pending?.to === 'submitted' ? 'Confirm submission' : pending?.to === 'won' ? 'Mark as won' : 'Mark as lost / passed'}
        description={pending?.to === 'submitted' ? 'Fieldpoint never submits bids. Record that you submitted this manually.' : 'Optional — captured so you can review decisions later.'}>
        {pending && (
          <form style={{ display: 'grid', gap: 16 }} onSubmit={async (e) => { e.preventDefault(); const p = pending; setPending(null); await commit(p.card, p.to, { note: note || undefined, awardAmount: amount ? Number(amount) : undefined }) }}>
            <p className="t-callout" style={{ margin: 0 }}><strong>{pending.card.title}</strong></p>
            <div><label className="field-label" htmlFor="pn">{pending.to === 'submitted' ? `Submitted manually by you on ${new Date().toLocaleDateString()} — add a note` : 'Reason'}</label><textarea id="pn" className="textarea" rows={3} value={note} onChange={(e) => setNote(e.target.value)} autoFocus placeholder={pending.to === 'submitted' ? 'e.g. Submitted via DIBBS at 2:10 PM' : 'e.g. Price not competitive'} /></div>
            {pending.to !== 'submitted' && <div><label className="field-label" htmlFor="pa">Award amount ($, if known)</label><input id="pa" className="input num" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))} /></div>}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}><Button variant="plain" onClick={() => setPending(null)}>Cancel</Button><Button variant="primary" type="submit" disabled={pending.to === 'submitted' && !note.trim()}>{pending.to === 'submitted' ? 'Confirm I submitted this' : 'Move'}</Button></div>
          </form>
        )}
      </Sheet>
    </>
  )
}

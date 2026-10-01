'use client'
import { Bold, Italic, List, Link2, Trash2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useRef, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Empty } from '@/components/ui/states'
import { useToast } from '@/components/ui/Toast'
import { addNote, addTask, deleteNote, deleteTask, restoreNote, toggleTask } from '@/lib/actions/work'
import type { DetailData } from '@/lib/data/detail'
import { fmtDate } from '@/lib/format'
import { useCo } from './useCo'

export function NotesTab({ d, canWrite }: { d: DetailData; canWrite: boolean; userId: string }) {
  const ed = useRef<HTMLDivElement>(null)
  const [empty, setEmpty] = useState(true)
  const [title, setTitle] = useState('')
  const [due, setDue] = useState('')
  const [assignee, setAssignee] = useState('')
  const { toast } = useToast()
  const router = useRouter()
  const getCo = useCo(d)
  const cmd = (c: string, v?: string) => { ed.current?.focus(); document.execCommand(c, false, v) }

  const post = async () => {
    const body = ed.current?.innerHTML ?? ''
    const coId = await getCo(); if (!coId) return toast('Could not create a workspace for this notice', { error: true })
    const r = await addNote({ coId, body })
    if (!r.ok) return toast(r.error, { error: true })
    if (ed.current) ed.current.innerHTML = ''
    setEmpty(true); router.refresh()
  }
  const newTask = async () => {
    const coId = await getCo(); if (!coId) return
    const r = await addTask({ coId, title, dueDate: due || undefined, assigneeId: assignee || undefined })
    if (!r.ok) return toast(r.error, { error: true })
    setTitle(''); setDue(''); router.refresh()
  }
  const members = new Map(d.members.map((m) => [m.user_id, m.name]))
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 420px), 1fr))', gap: 24, alignItems: 'start' }}>
      <section aria-label="Notes" style={{ display: 'grid', gap: 12 }}>
        <h2 className="t-headline" style={{ margin: 0 }}>Notes</h2>
        {canWrite && (
          <div className="card" style={{ padding: 8 }}>
            <div role="toolbar" aria-label="Formatting" style={{ display: 'flex', gap: 2, paddingBottom: 4 }}>
              <Button variant="icon" aria-label="Bold" onMouseDown={(e) => e.preventDefault()} onClick={() => cmd('bold')}><Bold size={16} /></Button>
              <Button variant="icon" aria-label="Italic" onMouseDown={(e) => e.preventDefault()} onClick={() => cmd('italic')}><Italic size={16} /></Button>
              <Button variant="icon" aria-label="Bulleted list" onMouseDown={(e) => e.preventDefault()} onClick={() => cmd('insertUnorderedList')}><List size={16} /></Button>
              <Button variant="icon" aria-label="Link" onMouseDown={(e) => e.preventDefault()} onClick={() => { const u = prompt('Link URL (https://…)'); if (u && /^https?:\/\//.test(u)) cmd('createLink', u) }}><Link2 size={16} /></Button>
            </div>
            <div ref={ed} contentEditable role="textbox" aria-multiline="true" aria-label="New note" className="rich t-body" suppressContentEditableWarning onInput={() => setEmpty(!(ed.current?.textContent ?? '').trim())} style={{ minHeight: 88, padding: 8, borderRadius: 'var(--radius-sm)', background: 'var(--bg-tertiary)', outline: 'none' }} />
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}><Button variant="primary" disabled={empty} onClick={post}>Add note</Button></div>
          </div>
        )}
        {d.notes.length === 0 ? <Empty icon={List} title="No notes yet" body="Notes are timestamped and attributed to their author." /> : d.notes.map((n) => (
          <article key={n.id} className="card" style={{ padding: 16 }}>
            <header className="t-footnote" style={{ display: 'flex', gap: 8, color: 'var(--label-secondary)', marginBottom: 8 }}><strong style={{ color: 'var(--label-primary)' }}>{n.author ?? 'Unknown author'}</strong><time dateTime={n.created_at}>{new Date(n.created_at).toLocaleString()}</time>
              {canWrite && <button type="button" className="btn btn-icon btn-sm" style={{ marginLeft: 'auto', width: 24, height: 24 }} aria-label="Delete note" onClick={async () => { const r = await deleteNote({ id: n.id }); if (!r.ok) return toast(r.error, { error: true }); toast('Note deleted', { undo: async () => { if (d.co) await restoreNote({ coId: d.co.id, body: r.data.body }); router.refresh() } }); router.refresh() }}><Trash2 size={14} aria-hidden /></button>}</header>
            {/* body is sanitised on the server before storage */}
            <div className="rich t-body" dangerouslySetInnerHTML={{ __html: n.body }} />
          </article>
        ))}
      </section>
      <section aria-label="Tasks" style={{ display: 'grid', gap: 12 }}>
        <h2 className="t-headline" style={{ margin: 0 }}>Tasks</h2>
        {canWrite && (
          <form className="card" style={{ padding: 12, display: 'grid', gap: 8 }} onSubmit={(e) => { e.preventDefault(); void newTask() }}>
            <input className="input" aria-label="Task title" placeholder="Request quote from manufacturer…" value={title} onChange={(e) => setTitle(e.target.value)} />
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}><input className="input" type="date" aria-label="Due date" style={{ width: 160 }} value={due} onChange={(e) => setDue(e.target.value)} />
              <select className="select" aria-label="Assignee" style={{ width: 180 }} value={assignee} onChange={(e) => setAssignee(e.target.value)}><option value="">Unassigned</option>{d.members.map((m) => <option key={m.user_id} value={m.user_id}>{m.name}</option>)}</select>
              <Button variant="primary" type="submit" disabled={!title.trim()} style={{ marginLeft: 'auto' }}>Add task</Button></div>
          </form>
        )}
        {d.tasks.length === 0 ? <p className="t-callout" style={{ color: 'var(--label-secondary)', margin: 0 }}>No tasks.</p> : (
          <ul className="card" style={{ listStyle: 'none', margin: 0, padding: '0 16px' }}>
            {d.tasks.map((t) => (
              <li key={t.id} className="hairline-b" style={{ display: 'flex', gap: 12, alignItems: 'center', minHeight: 44 }}>
                <input type="checkbox" checked={t.done} disabled={!canWrite} aria-label={`Mark “${t.title}” ${t.done ? 'not done' : 'done'}`} onChange={async (e) => { await toggleTask({ id: t.id, done: e.target.checked }); router.refresh() }} />
                <span className="t-callout" style={{ flex: 1, textDecoration: t.done ? 'line-through' : undefined, color: t.done ? 'var(--label-secondary)' : undefined }}>{t.title}<br /><span className="t-footnote" style={{ color: 'var(--label-secondary)' }}>{t.due_date ? `Due ${fmtDate(t.due_date)}` : 'No due date'} · {t.assignee_id ? members.get(t.assignee_id) ?? 'Team member' : 'Unassigned'}</span></span>
                {canWrite && <button type="button" className="btn btn-icon btn-sm" aria-label="Delete task" onClick={async () => { await deleteTask({ id: t.id }); router.refresh() }}><Trash2 size={14} aria-hidden /></button>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

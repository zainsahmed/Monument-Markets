'use client'
import { Trash2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { Confirm } from '@/components/ui/Dialog'
import { useToast } from '@/components/ui/Toast'
import { deleteSupplier, restoreSupplier } from '@/lib/actions/suppliers'

export function SupplierDelete({ id, name, quoteCount }: { id: string; name: string; quoteCount: number }) {
  const router = useRouter()
  const { toast } = useToast()
  return (
    <Confirm trigger={<Button variant="destructive"><Trash2 size={14} aria-hidden />Delete</Button>} title={`Delete ${name}?`} body={quoteCount ? `This also removes its ${quoteCount} quote${quoteCount > 1 ? 's' : ''}. Undo restores the supplier but not its quotes.` : 'You can undo this right after.'}
      onConfirm={async () => { const r = await deleteSupplier({ id }); if (!r.ok) return toast(r.error, { error: true }); router.push('/suppliers'); toast('Supplier deleted', { undo: async () => { const s = r.data.snapshot as never; await restoreSupplier({ snapshot: { ...(s as object), id } }); router.refresh() } }) }} />
  )
}

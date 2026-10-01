import { handle, json } from '@/lib/api'
import { HttpError, requireApiSession } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { signedUrl } from '@/lib/opportunities/documents'

/** Returns a 5-minute signed URL after proving access through RLS (the user-scoped select must return the row). */
export async function GET(req: Request, ctx: RouteContext<'/api/documents/[docId]/url'>) {
  return handle(async () => {
    const session = await requireApiSession('viewer')
    const { docId } = await ctx.params
    const { data: doc } = await session.supabase.from('opportunity_documents').select('id, storage_path, file_name').eq('id', docId).maybeSingle()
    if (!doc?.storage_path) throw new HttpError(404, 'Document not found')
    const download = new URL(req.url).searchParams.get('download') === '1'
    return json({ url: await signedUrl(createAdminClient(), doc.storage_path, download ? doc.file_name : undefined), expiresInSeconds: 300 })
  })
}

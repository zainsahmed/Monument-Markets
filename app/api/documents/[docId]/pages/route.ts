import { handle, json } from '@/lib/api'
import { HttpError, requireApiSession } from '@/lib/auth'

/** Extracted page text for the in-app viewer's text mode and search (RLS-scoped). */
export async function GET(_req: Request, ctx: RouteContext<'/api/documents/[docId]/pages'>) {
  return handle(async () => {
    const session = await requireApiSession('viewer')
    const { docId } = await ctx.params
    const { data: doc } = await session.supabase.from('opportunity_documents').select('id, file_name, parse_status, parse_error, mime_type').eq('id', docId).maybeSingle()
    if (!doc) throw new HttpError(404, 'Document not found')
    const { data: pages } = await session.supabase.from('document_pages').select('page_number, section_heading, locator, text, page_reliable').eq('document_id', docId).order('page_number')
    return json({ doc, pages: pages ?? [] })
  })
}

import { notFound } from 'next/navigation'
import sanitizeHtml from 'sanitize-html'
import { DetailView } from '@/components/detail/DetailView'
import { requirePageSession } from '@/lib/auth'
import { loadDetail } from '@/lib/data/detail'

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: PageProps<'/opportunities/[id]'>) {
  const { id } = await params
  return { title: /^[0-9a-f-]{36}$/i.test(id) ? 'Opportunity' : 'Not found' }
}

// SAM descriptions can contain arbitrary HTML — sanitise on the server before it ever reaches the page.
const SAFE = { allowedTags: ['p', 'br', 'b', 'strong', 'i', 'em', 'u', 'ul', 'ol', 'li', 'a', 'h1', 'h2', 'h3', 'h4', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'blockquote', 'pre', 'code', 'span', 'div'], allowedAttributes: { a: ['href', 'title'] }, allowedSchemes: ['http', 'https', 'mailto'], transformTags: { a: sanitizeHtml.simpleTransform('a', { rel: 'noopener noreferrer nofollow', target: '_blank' }) } }
const plainToHtml = (t: string) => t.split(/\n{2,}/).map((p) => `<p>${p.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\n/g, '<br>')}</p>`).join('')

export default async function OpportunityPage({ params }: PageProps<'/opportunities/[id]'>) {
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound()
  const s = await requirePageSession()
  const d = await loadDetail(s, id)
  if (!d) notFound()
  const raw = d.opp.description ?? ''
  const html = raw ? sanitizeHtml(/<[a-z][\s\S]*>/i.test(raw) ? raw : plainToHtml(raw), SAFE) : ''
  return <DetailView d={d} role={s.role} descriptionHtml={html} userId={s.user.id} minMargin={d.minMargin} />
}

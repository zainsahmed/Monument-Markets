import Link from 'next/link'
import { SearchX } from 'lucide-react'
import { Empty } from '@/components/ui/states'

export default function NotFound() {
  return <Empty icon={SearchX} title="Opportunity not found" body="It may have been removed, or it isn’t visible to your company." action={<Link className="btn btn-primary" href="/opportunities?tab=all">Back to opportunities</Link>} />
}

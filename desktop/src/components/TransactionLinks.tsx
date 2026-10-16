import { ExternalLink } from 'lucide-react'
import type { TransactionLink } from '@/lib/api'
import { linkText, openLink } from '@/lib/links'

/** The links of a transaction, each opening in the system browser. */
export function TransactionLinks({ links }: { links: readonly TransactionLink[] }) {
  return (
    <ul className="flex min-w-0 flex-col gap-1">
      {links.map((link, index) => (
        <li key={index} className="min-w-0">
          <button
            type="button"
            title={link.url}
            className="inline-flex max-w-full items-center gap-1 text-left text-xs text-primary hover:underline"
            onClick={() => void openLink(link.url)}
          >
            <ExternalLink size={12} className="shrink-0" />
            <span className="truncate">{linkText(link)}</span>
          </button>
        </li>
      ))}
    </ul>
  )
}

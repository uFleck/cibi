// Links stored with a transaction: cleaning what the user typed, and opening one in the system browser.

import { isTauri } from '@tauri-apps/api/core'
import type { TransactionLink } from '@/lib/api'

/** Adds https:// when no scheme was typed. */
export function normalizeUrl(raw: string): string {
  const url = raw.trim()
  if (url === '') return ''
  return /^[a-z][a-z0-9+.-]*:/i.test(url) ? url : `https://${url}`
}

/** Drops rows with no url, and trims what is left. A blank label is no label. */
export function cleanLinks(links: readonly TransactionLink[]): TransactionLink[] {
  return links
    .map((link) => ({ url: normalizeUrl(link.url), label: link.label?.trim() ? link.label.trim() : null }))
    .filter((link) => link.url !== '')
}

/** What to show for a link: its label, else the host and path without the scheme. */
export function linkText(link: TransactionLink): string {
  if (link.label) return link.label
  return link.url.replace(/^https?:\/\//i, '').replace(/\/$/, '')
}

/** Opens in the system browser inside the app, and in a new tab in a plain browser. */
export async function openLink(url: string): Promise<void> {
  if (isTauri()) {
    const { openUrl } = await import('@tauri-apps/plugin-opener')
    await openUrl(url)
    return
  }
  window.open(url, '_blank', 'noopener,noreferrer')
}

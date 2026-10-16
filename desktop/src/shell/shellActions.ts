import { useEffect, useRef } from 'react'

export type ShellActionName = 'new-transaction' | 'focus-search' | 'focus-check'

type ShellActionHandler = () => void

const PENDING_TTL_MS = 3000

const handlers = new Map<ShellActionName, ShellActionHandler[]>()
const pending = new Map<ShellActionName, number>()

export function requestShellAction(name: ShellActionName) {
  const handler = handlers.get(name)?.at(-1)
  if (handler) handler()
  else pending.set(name, Date.now())
}

export function useShellAction(name: ShellActionName, handler: ShellActionHandler) {
  const latest = useRef(handler)
  useEffect(() => {
    latest.current = handler
  })

  useEffect(() => {
    const run = () => latest.current()
    handlers.set(name, [...(handlers.get(name) ?? []), run])
    const requestedAt = pending.get(name)
    if (requestedAt !== undefined) {
      pending.delete(name)
      if (Date.now() - requestedAt < PENDING_TTL_MS) run()
    }
    return () => {
      handlers.set(name, (handlers.get(name) ?? []).filter(item => item !== run))
    }
  }, [name])
}

export function focusWhenReady(selector: string, attempts = 20) {
  const element = document.querySelector<HTMLElement>(selector)
  if (element) {
    element.focus()
    return
  }
  if (attempts > 0) window.setTimeout(() => focusWhenReady(selector, attempts - 1), 50)
}

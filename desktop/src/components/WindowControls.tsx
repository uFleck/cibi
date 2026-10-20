import { useEffect, useState } from 'react'
import { getCurrentWindow } from '@tauri-apps/api/window'

export const inTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

const BUTTON = 'grid h-full w-[46px] cursor-default place-items-center text-muted-foreground transition-colors hover:bg-surface-3 hover:text-foreground'

export function WindowControls() {
  const [maximized, setMaximized] = useState(false)

  useEffect(() => {
    if (!inTauri) return
    const win = getCurrentWindow()
    let alive = true
    const sync = () => void win.isMaximized().then(m => alive && setMaximized(m))
    sync()
    const unlisten = win.onResized(sync)
    return () => {
      alive = false
      void unlisten.then(off => off())
    }
  }, [])

  if (!inTauri) return null
  const win = getCurrentWindow()

  return (
    <div className="pointer-events-auto fixed top-0 right-0 z-[60] flex h-[43px]">
      <button type="button" aria-label="Minimize" className={BUTTON} onClick={() => void win.minimize()}>
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1" className="pointer-events-none">
          <path d="M0 5.5h10" />
        </svg>
      </button>
      <button type="button" aria-label={maximized ? 'Restore' : 'Maximize'} className={BUTTON} onClick={() => void win.toggleMaximize()}>
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1" className="pointer-events-none">
          {maximized ? (
            <>
              <rect x="0.5" y="2.5" width="7" height="7" />
              <path d="M2.5 2.5v-2h7v7h-2" />
            </>
          ) : (
            <rect x="0.5" y="0.5" width="9" height="9" />
          )}
        </svg>
      </button>
      <button
        type="button"
        aria-label="Close"
        className={`${BUTTON} hover:bg-[#e81123] hover:text-white`}
        onClick={() => void win.close()}
      >
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1" className="pointer-events-none">
          <path d="M0.5 0.5l9 9M9.5 0.5l-9 9" />
        </svg>
      </button>
    </div>
  )
}

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { configureBoneyard } from 'boneyard-js/react'
import { TooltipProvider } from '@/components/ui/tooltip'
import './index.css'
import App from './App.tsx'
import { startDomain } from './domain'
import { startDueNotifications } from './lib/due-notifications'

const savedTheme = typeof window !== 'undefined' ? window.localStorage.getItem('cibi.theme') : null
const initialTheme = savedTheme === 'light' || savedTheme === 'dark'
  ? savedTheme
  : (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')

document.documentElement.classList.toggle('dark', initialTheme === 'dark')
document.documentElement.style.colorScheme = initialTheme

configureBoneyard({
  animate: 'shimmer',
  darkColor: '#181c2a',
  darkShimmerColor: '#232840',
})

async function bootstrap(): Promise<void> {
  const root = createRoot(document.getElementById('root')!)
  try {
    await startDomain()
  } catch (err) {
    root.render(
      <div className="p-6 text-sm">
        Could not open the database
        <pre className="mt-2 whitespace-pre-wrap">{err instanceof Error ? err.message : String(err)}</pre>
      </div>,
    )
    return
  }
  root.render(
    <StrictMode>
      <TooltipProvider>
        <App />
      </TooltipProvider>
    </StrictMode>,
  )
  startDueNotifications()
}

void bootstrap()

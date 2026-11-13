import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { TooltipProvider } from '@/components/ui/tooltip'
import './index.css'
import App from './App.tsx'
import { startDomain } from './domain'

const savedTheme = typeof window !== 'undefined' ? window.localStorage.getItem('cibi.theme.v2') : null
const initialTheme = savedTheme === 'dark' ? 'dark' : 'light'

document.documentElement.classList.toggle('dark', initialTheme === 'dark')
document.documentElement.style.colorScheme = initialTheme

async function bootstrap(): Promise<void> {
  const root = createRoot(document.getElementById('root')!)
  try {
    await startDomain()
  } catch (err) {
    root.render(
      <div className="p-6 text-sm">
        Não foi possível abrir o banco de dados
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
}

void bootstrap()

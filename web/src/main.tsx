import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { configureBoneyard } from 'boneyard-js/react'
import { TooltipProvider } from '@/components/ui/tooltip'
import './index.css'
import App from './App.tsx'

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

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <TooltipProvider>
      <App />
    </TooltipProvider>
  </StrictMode>,
)

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { configureBoneyard } from 'boneyard-js/react'
import { TooltipProvider } from '@/components/ui/tooltip'
import './index.css'
import App from './App.tsx'

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

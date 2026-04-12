import { ArrowLeft } from 'lucide-react'
import { PayScheduleForm } from '@/components/PayScheduleForm'

export function Settings() {
  return (
    <div className="min-h-dvh bg-background">
      <header className="border-b border-border/50 sticky top-0 z-10 backdrop-blur-sm bg-background/80">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-4 flex items-center gap-4">
          <a
            href="/"
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors duration-150 cursor-pointer"
            aria-label="Back to dashboard"
          >
            <ArrowLeft size={14} />
            <span>Dashboard</span>
          </a>
          <span className="text-sm font-semibold tracking-[0.18em] text-foreground">
            CIBI
          </span>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 sm:px-6 py-8 flex flex-col gap-4">
        <PayScheduleForm />
        <div className="h-8" />
      </main>
    </div>
  )
}

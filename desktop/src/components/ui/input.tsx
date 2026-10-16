import * as React from "react"

import { cn } from "@/lib/utils"

function Input({ className, type, lang, ...props }: React.ComponentProps<"input">) {
  const localeLang = (type === 'date' || type === 'datetime-local' || type === 'time') ? 'pt-BR' : lang

  return (
    <input
      type={type}
      lang={localeLang}
      data-slot="input"
      className={cn(
        "h-8 w-full min-w-0 rounded-md border border-input bg-surface px-2.5 py-1 text-sm transition-[color,border-color,box-shadow] duration-fast ease-cibi outline-none selection:bg-primary selection:text-primary-foreground file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-faint disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
        "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/25",
        "aria-invalid:border-destructive aria-invalid:ring-destructive/20",
        className
      )}
      {...props}
    />
  )
}

export { Input }

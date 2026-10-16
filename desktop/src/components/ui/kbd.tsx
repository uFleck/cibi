import * as React from "react"

import { cn } from "@/lib/utils"

function Kbd({ className, ...props }: React.ComponentProps<"kbd">) {
  return (
    <kbd
      data-slot="kbd"
      className={cn(
        "inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-md border border-line-strong border-b-2 bg-surface px-1 font-mono text-[10.5px] leading-none font-medium whitespace-nowrap text-faint",
        className
      )}
      {...props}
    />
  )
}

export { Kbd }

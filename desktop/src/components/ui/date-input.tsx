import * as React from "react"

import { Input } from "@/components/ui/input"
import { formatDateBR, parseTypedDate } from "@/lib/date-input"

type DateInputProps = Omit<React.ComponentProps<typeof Input>, "type" | "inputMode" | "value" | "onChange"> & {
  value: string
  onChange: (iso: string) => void
}

function DateInput({ value, onChange, placeholder = "DD/MM/AAAA", className, onBlur, onKeyDown, ...props }: DateInputProps) {
  const [draft, setDraft] = React.useState(() => formatDateBR(value))
  const [invalid, setInvalid] = React.useState(false)
  const [syncedValue, setSyncedValue] = React.useState(value)

  if (value !== syncedValue) {
    setSyncedValue(value)
    setDraft(formatDateBR(value))
    setInvalid(false)
  }

  const commit = () => {
    if (!draft.trim()) {
      setInvalid(false)
      onChange("")
      return
    }
    const iso = parseTypedDate(draft)
    if (!iso) {
      setInvalid(true)
      return
    }
    setInvalid(false)
    setDraft(formatDateBR(iso))
    onChange(iso)
  }

  return (
    <>
      <Input
        {...props}
        type="text"
        inputMode="numeric"
        placeholder={placeholder}
        className={className}
        aria-invalid={invalid || undefined}
        value={draft}
        onChange={e => {
          setDraft(e.target.value)
          setInvalid(false)
        }}
        onBlur={e => {
          commit()
          onBlur?.(e)
        }}
        onKeyDown={e => {
          onKeyDown?.(e)
          if (e.key === "Enter" && draft.trim() && draft !== formatDateBR(value)) {
            e.preventDefault()
            commit()
          }
        }}
      />
      {invalid && <p className="text-xs text-destructive">Data inválida</p>}
    </>
  )
}

export { DateInput }

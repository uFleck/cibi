import * as React from "react"
import { createPortal } from "react-dom"
import { CheckIcon, ChevronDownIcon } from "lucide-react"

import { cn } from "@/lib/utils"

type ItemMeta = { label: React.ReactNode; disabled: boolean }

type SelectContextValue = {
  value: string | undefined
  open: boolean
  disabled: boolean
  items: Map<string, ItemMeta>
  highlight: string | null
  listId: string
  optionId: (value: string) => string
  setOpen: (open: boolean) => void
  setHighlight: (value: string | null) => void
  select: (value: string) => void
}

const SelectContext = React.createContext<SelectContextValue | null>(null)

function useSelectContext(): SelectContextValue {
  const ctx = React.useContext(SelectContext)
  if (!ctx) throw new Error("Select parts must be rendered inside <Select>")
  return ctx
}

// Labels come from the static children tree, so the trigger can show the
// selected label while the list is closed (the items are not mounted then).
function collectItems(node: React.ReactNode, items = new Map<string, ItemMeta>()): Map<string, ItemMeta> {
  React.Children.forEach(node, (child) => {
    if (!React.isValidElement<{ value?: string; disabled?: boolean; children?: React.ReactNode }>(child)) return
    if (child.type === SelectItem) {
      const value = child.props.value ?? ""
      items.set(value, { label: child.props.children ?? value, disabled: !!child.props.disabled })
      return
    }
    collectItems(child.props.children, items)
  })
  return items
}

function initialHighlight(value: string | undefined, items: Map<string, ItemMeta>): string | null {
  if (value !== undefined && items.get(value)?.disabled === false) return value
  for (const [key, meta] of items) {
    if (!meta.disabled) return key
  }
  return null
}

type SelectProps = {
  value?: string
  defaultValue?: string
  onValueChange?: (value: string) => void
  open?: boolean
  onOpenChange?: (open: boolean) => void
  disabled?: boolean
  children?: React.ReactNode
}

function Select({
  value: valueProp,
  defaultValue,
  onValueChange,
  open: openProp,
  onOpenChange,
  disabled = false,
  children,
}: SelectProps) {
  const [uncontrolledValue, setUncontrolledValue] = React.useState(defaultValue)
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(false)
  const [highlight, setHighlight] = React.useState<string | null>(null)
  const listId = React.useId()

  const value = valueProp ?? uncontrolledValue
  const open = openProp ?? uncontrolledOpen
  const items = collectItems(children)

  function setOpen(next: boolean) {
    if (openProp === undefined) setUncontrolledOpen(next)
    if (next) setHighlight(initialHighlight(value, items))
    onOpenChange?.(next)
  }

  function select(next: string) {
    if (valueProp === undefined) setUncontrolledValue(next)
    onValueChange?.(next)
    setOpen(false)
  }

  const optionId = (v: string) => `${listId}-${[...items.keys()].indexOf(v)}`

  return (
    <SelectContext.Provider
      value={{ value, open, disabled, items, highlight, listId, optionId, setOpen, setHighlight, select }}
    >
      {children}
    </SelectContext.Provider>
  )
}

function SelectGroup({ ...props }: React.ComponentProps<"div">) {
  return <div role="group" data-slot="select-group" {...props} />
}

function SelectValue({ placeholder, className }: { placeholder?: React.ReactNode; className?: string }) {
  const { value, items } = useSelectContext()
  const item = value !== undefined ? items.get(value) : undefined

  return (
    <span
      data-slot="select-value"
      data-placeholder={item ? undefined : ""}
      className={cn("flex min-w-0 items-center gap-2 line-clamp-1 data-[placeholder]:text-faint", className)}
    >
      {item ? item.label : placeholder}
    </span>
  )
}

function SelectTrigger({
  className,
  size = "default",
  children,
  disabled,
  onClick,
  onKeyDown,
  ...props
}: React.ComponentProps<"button"> & {
  size?: "sm" | "default"
}) {
  const ctx = useSelectContext()
  const activeId = ctx.open && ctx.highlight !== null ? ctx.optionId(ctx.highlight) : undefined

  return (
    <button
      type="button"
      role="combobox"
      data-slot="select-trigger"
      data-size={size}
      data-state={ctx.open ? "open" : "closed"}
      aria-haspopup="listbox"
      aria-expanded={ctx.open}
      aria-controls={ctx.open ? ctx.listId : undefined}
      aria-activedescendant={activeId}
      disabled={ctx.disabled || disabled}
      data-select-id={ctx.listId}
      {...props}
      onClick={(e) => {
        onClick?.(e)
        if (!e.defaultPrevented) ctx.setOpen(!ctx.open)
      }}
      onKeyDown={(e) => {
        onKeyDown?.(e)
        if (!e.defaultPrevented && !ctx.open && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
          e.preventDefault()
          ctx.setOpen(true)
        }
      }}
      className={cn(
        "flex w-fit items-center justify-between gap-2 rounded-md border border-input bg-surface px-2.5 text-left text-sm whitespace-nowrap outline-none transition-[border-color,box-shadow,background-color] duration-fast ease-cibi hover:border-faint focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/25 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 data-[size=default]:h-8 data-[size=sm]:h-7 *:data-[slot=select-value]:line-clamp-1 *:data-[slot=select-value]:flex *:data-[slot=select-value]:items-center *:data-[slot=select-value]:gap-2",
        className
      )}
    >
      {children}
      <ChevronDownIcon
        aria-hidden
        className={cn(
          "size-3.5 shrink-0 text-faint transition-transform duration-fast ease-cibi",
          ctx.open && "rotate-180"
        )}
      />
    </button>
  )
}

function findTrigger(listId: string): HTMLButtonElement | null {
  return document.querySelector<HTMLButtonElement>(`[data-select-id="${listId}"]`)
}

function SelectContent({ className, children, ...props }: React.ComponentProps<"div">) {
  const { open, items, highlight, listId, optionId, setOpen, setHighlight, select } = useSelectContext()
  const listRef = React.useRef<HTMLDivElement>(null)

  React.useLayoutEffect(() => {
    const list = listRef.current
    const trigger = findTrigger(listId)
    if (!open || !list || !trigger) return

    const place = () => {
      const r = trigger.getBoundingClientRect()
      const viewportHeight = window.innerHeight
      const gap = 4
      const edge = 8
      const natural = list.scrollHeight
      const below = viewportHeight - r.bottom - edge
      const above = r.top - edge
      const flip = natural > below && above > below
      const room = (flip ? above : below) - gap

      list.style.minWidth = `${r.width}px`
      list.style.maxHeight = `${Math.max(120, Math.min(natural, room))}px`
      list.style.left = `${Math.max(edge, Math.min(r.left, window.innerWidth - r.width - edge))}px`
      list.style.top = flip ? "auto" : `${r.bottom + gap}px`
      list.style.bottom = flip ? `${viewportHeight - r.top + gap}px` : "auto"
      list.style.transformOrigin = flip ? "bottom" : "top"
    }

    // Keeps an enclosing Radix dialog from treating a click on the portaled list as outside.
    const stopPointer = (e: Event) => e.stopPropagation()

    place()
    list.querySelector<HTMLElement>("[data-highlighted]")?.scrollIntoView?.({ block: "nearest" })
    list.addEventListener("pointerdown", stopPointer)
    list.addEventListener("wheel", stopPointer)
    list.addEventListener("touchmove", stopPointer)
    window.addEventListener("resize", place)
    window.addEventListener("scroll", place, true)
    return () => {
      list.removeEventListener("pointerdown", stopPointer)
      list.removeEventListener("wheel", stopPointer)
      list.removeEventListener("touchmove", stopPointer)
      window.removeEventListener("resize", place)
      window.removeEventListener("scroll", place, true)
    }
  }, [open, listId])

  React.useEffect(() => {
    if (!open) return

    const enabled = [...items].filter(([, meta]) => !meta.disabled).map(([v]) => v)
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node
      if (listRef.current?.contains(target) || findTrigger(listId)?.contains(target)) return
      setOpen(false)
    }
    const onKeyDown = (e: KeyboardEvent) => {
      const index = highlight === null ? -1 : enabled.indexOf(highlight)
      let next: string | undefined
      switch (e.key) {
        case "ArrowDown":
          next = enabled[(index + 1) % enabled.length]
          break
        case "ArrowUp":
          next = enabled[index <= 0 ? enabled.length - 1 : index - 1]
          break
        case "Home":
          next = enabled[0]
          break
        case "End":
          next = enabled[enabled.length - 1]
          break
        case "Enter":
        case " ":
          e.preventDefault()
          e.stopPropagation()
          if (highlight !== null) select(highlight)
          return
        case "Escape":
          e.preventDefault()
          e.stopPropagation()
          setOpen(false)
          findTrigger(listId)?.focus()
          return
        case "Tab":
          setOpen(false)
          return
        default:
          return
      }
      e.preventDefault()
      e.stopPropagation()
      if (next === undefined) return
      setHighlight(next)
      document.getElementById(optionId(next))?.scrollIntoView?.({ block: "nearest" })
    }

    document.addEventListener("pointerdown", onPointerDown)
    window.addEventListener("keydown", onKeyDown, true)
    return () => {
      document.removeEventListener("pointerdown", onPointerDown)
      window.removeEventListener("keydown", onKeyDown, true)
    }
  }, [open, items, highlight, listId, optionId, select, setOpen, setHighlight])

  if (!open) return null

  return createPortal(
    <div
      ref={listRef}
      id={listId}
      role="listbox"
      data-slot="select-content"
      data-state="open"
      {...props}
      className={cn(
        "pointer-events-auto fixed z-50 overflow-x-hidden overflow-y-auto overscroll-contain rounded-over border bg-popover p-1 text-popover-foreground shadow-pop animation-duration-150 animate-in fade-in-0 zoom-in-95",
        className
      )}
    >
      {children}
    </div>,
    document.body
  )
}

function SelectLabel({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="select-label" className={cn("px-2 py-1.5 text-xs text-muted-foreground", className)} {...props} />
}

function SelectItem({
  className,
  children,
  value,
  disabled,
  ...props
}: React.ComponentProps<"div"> & {
  value: string
  disabled?: boolean
}) {
  const ctx = useSelectContext()
  const selected = ctx.value === value
  const highlighted = ctx.highlight === value

  return (
    <div
      {...props}
      role="option"
      id={ctx.optionId(value)}
      data-slot="select-item"
      data-value={value}
      data-state={selected ? "checked" : "unchecked"}
      data-highlighted={highlighted ? "" : undefined}
      data-disabled={disabled ? "" : undefined}
      aria-selected={selected}
      aria-disabled={disabled || undefined}
      onPointerMove={() => {
        if (!disabled && !highlighted) ctx.setHighlight(value)
      }}
      onClick={() => {
        if (!disabled) ctx.select(value)
      }}
      className={cn(
        "relative flex w-full cursor-default items-center gap-2 rounded-md py-1 pr-7 pl-2 text-sm select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[highlighted]:bg-accent data-[highlighted]:text-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3.5",
        selected && "font-medium text-foreground",
        className
      )}
    >
      {children}
      {selected && <CheckIcon aria-hidden className="absolute right-2 size-3.5" />}
    </div>
  )
}

function SelectSeparator({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      role="separator"
      data-slot="select-separator"
      className={cn("pointer-events-none -mx-1 my-1 h-px bg-border", className)}
      {...props}
    />
  )
}

export {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
}

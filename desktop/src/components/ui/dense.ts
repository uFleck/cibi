// Dense table classes (Ink). Rows are 29px tall; numbers use the `num` utility (mono, tabular).
// Apply to a native <table>: table / thead tr / th / tbody tr / td.

export const denseTable = 'w-full border-collapse text-[12px]'
export const denseHead = 'h-[26px] border-b border-line bg-surface-2 text-left font-mono text-[10px] font-medium tracking-[0.05em] text-faint uppercase'
export const denseRow = 'h-[29px] border-b border-line transition-colors last:border-b-0 hover:bg-surface-2'
export const denseCell = 'px-2.5 align-middle whitespace-nowrap'
export const denseNumCell = 'num px-2.5 text-right align-middle whitespace-nowrap'
export const denseActiveRow = 'bg-hl/10 shadow-[inset_2px_0_0_var(--color-hl)]'

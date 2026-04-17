import { Copy, Eye } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

export interface CompactEntityTableItem {
  id: string
  primary: string
  secondary: string
  onCopy?: () => void | Promise<void>
  onOpen?: () => void
  copyAriaLabel?: string
  openAriaLabel?: string
}

interface CompactEntityTableProps {
  entityLabel: string
  items: CompactEntityTableItem[]
  secondaryLabel?: string
  showActions?: boolean
}

export function CompactEntityTable({
  entityLabel,
  items,
  secondaryLabel = 'Overview',
  showActions = true,
}: CompactEntityTableProps) {
  return (
    <>
      <div className="sm:hidden border rounded-md overflow-hidden">
        <div className={`grid items-center gap-2 px-3 py-2 bg-muted/50 text-[11px] uppercase tracking-wide text-muted-foreground ${showActions ? 'grid-cols-[minmax(0,1fr)_auto]' : 'grid-cols-1'}`}>
          <span>{entityLabel}</span>
          {showActions && <span className="pr-1">Actions</span>}
        </div>

        <div className="divide-y">
          {items.map(item => (
            <div key={item.id} className="px-3 py-2">
              <div className={`grid items-center gap-2 ${showActions ? 'grid-cols-[minmax(0,1fr)_auto]' : 'grid-cols-1'}`}>
                <div className="min-w-0">
                  <div className="font-medium text-sm truncate">{item.primary}</div>
                  <div className="text-xs text-muted-foreground truncate">{item.secondary}</div>
                </div>

                {showActions && (
                  <div className="flex items-center gap-1">
                    {item.onCopy && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-10 w-10"
                            onClick={() => {
                              void item.onCopy?.()
                            }}
                            aria-label={item.copyAriaLabel ?? 'Copy'}
                          >
                            <Copy size={16} />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Copy URL</p>
                        </TooltipContent>
                      </Tooltip>
                    )}

                    {item.onOpen && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-10 w-10"
                            onClick={item.onOpen}
                            aria-label={item.openAriaLabel ?? 'Open'}
                          >
                            <Eye size={16} />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Access</p>
                        </TooltipContent>
                      </Tooltip>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="hidden sm:block border rounded-md overflow-hidden">
        <table className="w-full text-sm table-fixed">
          <thead className="bg-muted/50 text-muted-foreground">
            <tr>
              <th className={`text-left px-3 py-2 font-medium ${showActions ? 'w-[42%]' : 'w-[50%]'}`}>{entityLabel}</th>
              <th className={`text-left px-3 py-2 font-medium ${showActions ? 'w-[44%]' : 'w-[50%]'}`}>{secondaryLabel}</th>
              {showActions && <th className="text-right px-3 py-2 font-medium w-[14%]">Actions</th>}
            </tr>
          </thead>
          <tbody className="divide-y">
            {items.map(item => (
              <tr key={item.id} className="hover:bg-muted/30">
                <td className={`px-3 py-2 ${showActions ? 'w-[42%]' : 'w-[50%]'}`}>
                  <div className="font-medium truncate">{item.primary}</div>
                </td>
                <td className={`px-3 py-2 text-xs text-muted-foreground ${showActions ? 'w-[44%]' : 'w-[50%]'}`}>
                  <span className="truncate block">{item.secondary}</span>
                </td>
                {showActions && (
                  <td className="px-3 py-2">
                    <div className="flex gap-1 justify-end">
                      {item.onCopy && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-9 w-9"
                              onClick={() => {
                                void item.onCopy?.()
                              }}
                              aria-label={item.copyAriaLabel ?? 'Copy'}
                            >
                              <Copy size={14} />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Copy URL</p>
                          </TooltipContent>
                        </Tooltip>
                      )}

                      {item.onOpen && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-9 w-9"
                              onClick={item.onOpen}
                              aria-label={item.openAriaLabel ?? 'Open'}
                            >
                              <Eye size={14} />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Access</p>
                          </TooltipContent>
                        </Tooltip>
                      )}
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}

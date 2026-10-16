import { useQuery } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import { fetchCategories, suggestCategory } from '@/lib/api'

const SUGGEST_DELAY_MS = 400

export interface CategoryFieldProps {
  id: string
  value: string
  description: string
  onChange: (category: string) => void
}

/**
 * Free-text category, offering the known categories. While it is blank, a suggestion from the
 * description (debounced) can be accepted with a click.
 */
export function CategoryField({ id, value, description, onChange }: CategoryFieldProps) {
  const listId = `${id}-options`
  const { data: options = [] } = useQuery({ queryKey: ['categories'], queryFn: fetchCategories })

  const blank = value.trim() === ''
  const debounced = useDebouncedValue(description.trim(), SUGGEST_DELAY_MS)
  const { data: suggestion } = useQuery({
    queryKey: ['category-suggest', debounced],
    queryFn: () => suggestCategory(debounced),
    enabled: blank && debounced !== '',
  })

  return (
    <div className="flex flex-col gap-2">
      <Input
        id={id}
        list={listId}
        autoComplete="off"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder="Set from the description"
      />
      <datalist id={listId}>
        {options.map(option => (
          <option key={option.id} value={option.label} />
        ))}
      </datalist>
      {blank && suggestion && (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          Suggested
          <Button type="button" variant="ghost" size="sm" onClick={() => onChange(suggestion.category)}>
            {suggestion.category}
          </Button>
        </p>
      )}
    </div>
  )
}

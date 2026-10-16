import { useEffect, useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Pencil, Plus, RotateCcw, Save, Sparkles, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PageHeader, pageShell } from '@/components/ui/page-header'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { EditSheet } from '@/components/EditSheet'
import { DataList } from '@/components/ui/data-list'
import { ROW_KEYS } from '@/lib/row-actions'
import { DEFAULT_CATEGORIES } from '@/domain/categories'
import { MAX_DESCRIPTION_LENGTH, MAX_LABEL_LENGTH } from '@/domain/service/categories'
import {
  createCategory,
  deleteCategory,
  fetchCategoryDetails,
  suggestCategory,
  updateCategory,
  type CategoryDetails,
} from '@/lib/api'
import { activateLaya, warmLaya } from '@/lib/laya'

const DESCRIPTION_HINT =
  'Describe what belongs in this category: the kinds of places, products and payments. The Laya classifier reads this text to pick a category, so concrete examples work best.'

function defaultDescriptionOf(id: string): string | null {
  return DEFAULT_CATEGORIES.find((c) => c.id === id)?.description ?? null
}

/** The category being edited, or the blank form for a new one. */
type Editing = { kind: 'new' } | { kind: 'edit'; category: CategoryDetails }

function CategoryForm({ editing, onDone }: { editing: Editing; onDone: () => void }) {
  const queryClient = useQueryClient()
  const category = editing.kind === 'edit' ? editing.category : null
  const [label, setLabel] = useState(category?.label ?? '')
  const [description, setDescription] = useState(category?.description ?? '')
  const defaultDescription = category ? defaultDescriptionOf(category.id) : null

  const save = useMutation({
    mutationFn: () => (category ? updateCategory(category.id, { label, description }) : createCategory({ label, description })),
    onSuccess: () => {
      // A rename changes the category of transactions and budget limits too.
      void queryClient.invalidateQueries()
      toast.success(category ? 'Category saved' : 'Category added')
      onDone()
    },
    onError: (err: Error) => toast.error(err.message),
  })

  function submit(event: FormEvent) {
    event.preventDefault()
    save.mutate()
  }

  const renamed = category !== null && label.trim() !== category.label && category.usage > 0

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="category-label">Name</Label>
        <Input
          id="category-label"
          value={label}
          maxLength={MAX_LABEL_LENGTH}
          onChange={(e) => setLabel(e.target.value)}
          autoFocus
          required
        />
        {renamed && (
          <p className="text-xs text-muted-foreground">
            The {category.usage} transaction{category.usage === 1 ? '' : 's'} in this category move to the new name.
          </p>
        )}
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="category-description">Description for Laya</Label>
        <Textarea
          id="category-description"
          rows={6}
          value={description}
          maxLength={MAX_DESCRIPTION_LENGTH}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Restaurants, snack bars and food delivery apps"
        />
        <p className="text-xs text-muted-foreground">{DESCRIPTION_HINT}</p>
        {defaultDescription !== null && description !== defaultDescription && (
          <div>
            <Button type="button" variant="ghost" size="sm" onClick={() => setDescription(defaultDescription)}>
              <RotateCcw size={13} />
              Reset to default description
            </Button>
          </div>
        )}
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={save.isPending || label.trim() === ''}>
          <Save size={14} />
          {save.isPending ? 'Saving...' : 'Save'}
        </Button>
      </div>
    </form>
  )
}

/** Types a sample title and shows which category the classifier would pick for it. */
function TryIt() {
  const [title, setTitle] = useState('')
  const test = useMutation({ mutationFn: () => suggestCategory(title.trim()) })
  const { data: status } = useQuery({ queryKey: ['classifier-status'], queryFn: activateLaya, staleTime: Infinity })

  function submit(event: FormEvent) {
    event.preventDefault()
    if (title.trim() !== '') test.mutate()
  }

  return (
    <section className="rounded-md border border-line bg-surface">
      <header className="flex flex-col gap-0.5 border-b border-line px-3 py-2">
        <h2 className="flex items-center gap-2 font-mono text-[10.5px] uppercase tracking-[0.05em] text-faint">
          <Sparkles size={12} />
          Try it
        </h2>
        <p className="text-xs text-muted-foreground">
          Type a payment title to see which category the classifier picks with the descriptions below.
        </p>
      </header>
      <form onSubmit={submit} className="flex flex-col gap-2 p-3">
        <div className="flex gap-2">
          <Input
            aria-label="Sample title"
            value={title}
            onChange={(e) => {
              setTitle(e.target.value)
              test.reset()
            }}
            placeholder="Padaria do Zé"
          />
          <Button type="submit" size="sm" variant="outline" disabled={test.isPending || title.trim() === ''}>
            {test.isPending ? 'Testing...' : 'Test'}
          </Button>
        </div>
        {test.isSuccess && (
          <p role="status" className="text-xs text-muted-foreground" data-testid="try-it-result">
            {test.data
              ? `${test.data.category} (${Math.round(test.data.confidence * 100)}% confident)`
              : 'No confident match. A transaction like this stays uncategorized.'}
          </p>
        )}
        <p className="text-xs text-faint">
          {status?.state === 'active'
            ? 'Classifier: keyword rules, then the on-device Laya model.'
            : 'Classifier: keyword rules only. Laya reads these descriptions once its model is installed (see Settings).'}
        </p>
      </form>
    </section>
  )
}

export function CategoriesPage() {
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState<Editing | null>(null)
  const [deleting, setDeleting] = useState<CategoryDetails | null>(null)

  useEffect(() => {
    warmLaya()
  }, [])

  const { data: categories = [], isLoading } = useQuery({ queryKey: ['category-details'], queryFn: fetchCategoryDetails })

  const remove = useMutation({
    mutationFn: (id: string) => deleteCategory(id),
    onSuccess: () => {
      void queryClient.invalidateQueries()
      toast.success('Category deleted')
      setDeleting(null)
    },
    onError: (err: Error) => toast.error(err.message),
  })

  return (
    <div className={pageShell}>
      <PageHeader
        eyebrow="Classification"
        title="Categories"
        description="Rename categories and describe each one. The descriptions are what Laya reads to categorize a transaction."
        actions={
          <Button size="sm" onClick={() => setEditing({ kind: 'new' })}>
            <Plus size={14} />
            New category
          </Button>
        }
      />

      <TryIt />

      <DataList
        aria-label="Categories"
        rows={categories}
        rowId={(category) => category.id}
        empty={isLoading ? undefined : 'No categories yet.'}
        columns={[
          {
            id: 'name',
            header: 'Name',
            className: 'w-[24%]',
            cell: (category) => <span className="font-medium">{category.label}</span>,
          },
          {
            id: 'description',
            header: 'Description',
            title: (category) => category.description,
            cell: (category) => (
              <span className="text-muted-foreground">
                {category.description || <span className="text-faint">No description: Laya only sees the name</span>}
              </span>
            ),
          },
          { id: 'usage', header: 'Transactions', align: 'right', numeric: true, className: 'w-[14%]', cell: (category) => category.usage },
        ]}
        actions={(category) => [
          {
            id: 'edit',
            label: 'Edit',
            ariaLabel: `Edit ${category.label}`,
            icon: Pencil,
            keys: ROW_KEYS.edit,
            primary: true,
            run: () => setEditing({ kind: 'edit', category }),
          },
          {
            id: 'delete',
            label: 'Delete',
            ariaLabel: `Delete ${category.label}`,
            icon: Trash2,
            keys: ROW_KEYS.delete,
            variant: 'destructive',
            run: () => setDeleting(category),
          },
        ]}
      />

      <EditSheet
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) setEditing(null)
        }}
        title={editing?.kind === 'edit' ? `Edit ${editing.category.label}` : 'New category'}
        description="The name is what a transaction stores. The description is what Laya reads."
      >
        {editing !== null && (
          <CategoryForm
            key={editing.kind === 'edit' ? editing.category.id : 'new'}
            editing={editing}
            onDone={() => setEditing(null)}
          />
        )}
      </EditSheet>

      <ConfirmDialog
        open={deleting !== null}
        title={`Delete ${deleting?.label ?? 'category'}?`}
        description={
          deleting === null
            ? undefined
            : `${deleting.usage} transaction${deleting.usage === 1 ? '' : 's'} will become uncategorized, and its budget limit is removed.`
        }
        onCancel={() => setDeleting(null)}
        onConfirm={() => {
          if (deleting !== null) remove.mutate(deleting.id)
        }}
      />
    </div>
  )
}

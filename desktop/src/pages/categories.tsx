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
  'Descreva o que entra nesta categoria: os tipos de lugares, produtos e pagamentos. O classificador Laya lê este texto para escolher uma categoria, então exemplos concretos funcionam melhor.'

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
      toast.success(category ? 'Categoria salva' : 'Categoria adicionada')
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
        <Label htmlFor="category-label">Nome</Label>
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
            {category.usage} transaç{category.usage === 1 ? 'ão' : 'ões'} desta categoria {category.usage === 1 ? 'vai' : 'vão'} para o novo nome.
          </p>
        )}
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="category-description">Descrição para a Laya</Label>
        <Textarea
          id="category-description"
          rows={6}
          value={description}
          maxLength={MAX_DESCRIPTION_LENGTH}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Restaurantes, lanchonetes e apps de delivery"
        />
        <p className="text-xs text-muted-foreground">{DESCRIPTION_HINT}</p>
        {defaultDescription !== null && description !== defaultDescription && (
          <div>
            <Button type="button" variant="ghost" size="sm" onClick={() => setDescription(defaultDescription)}>
              <RotateCcw size={13} />
              Restaurar descrição padrão
            </Button>
          </div>
        )}
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onDone}>
          Cancelar
        </Button>
        <Button type="submit" size="sm" disabled={save.isPending || label.trim() === ''}>
          <Save size={14} />
          {save.isPending ? 'Salvando...' : 'Salvar'}
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
          Teste
        </h2>
        <p className="text-xs text-muted-foreground">
          Digite o título de um pagamento para ver qual categoria o classificador escolhe com as descrições abaixo.
        </p>
      </header>
      <form onSubmit={submit} className="flex flex-col gap-2 p-3">
        <div className="flex gap-2">
          <Input
            aria-label="Título de exemplo"
            value={title}
            onChange={(e) => {
              setTitle(e.target.value)
              test.reset()
            }}
            placeholder="Padaria do Zé"
          />
          <Button type="submit" size="sm" variant="outline" disabled={test.isPending || title.trim() === ''}>
            {test.isPending ? 'Testando...' : 'Testar'}
          </Button>
        </div>
        {test.isSuccess && (
          <p role="status" className="text-xs text-muted-foreground" data-testid="try-it-result">
            {test.data
              ? `${test.data.category} (${Math.round(test.data.confidence * 100)}% de confiança)`
              : 'Nenhuma correspondência confiável. Uma transação assim fica sem categoria.'}
          </p>
        )}
        <p className="text-xs text-faint">
          {status?.state === 'active'
            ? 'Classificador: regras de palavras-chave, depois o modelo Laya no aparelho.'
            : 'Classificador: só regras de palavras-chave. A Laya lê estas descrições quando o modelo estiver instalado (veja em Configurações).'}
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
      toast.success('Categoria excluída')
      setDeleting(null)
    },
    onError: (err: Error) => toast.error(err.message),
  })

  return (
    <div className={pageShell}>
      <PageHeader
        eyebrow="Classificação"
        title="Categorias"
        description="Renomeie as categorias e descreva cada uma. As descrições são o que a Laya lê para categorizar uma transação."
        actions={
          <Button size="sm" onClick={() => setEditing({ kind: 'new' })}>
            <Plus size={14} />
            Nova categoria
          </Button>
        }
      />

      <TryIt />

      <DataList
        aria-label="Categorias"
        rows={categories}
        rowId={(category) => category.id}
        empty={isLoading ? undefined : 'Nenhuma categoria ainda.'}
        columns={[
          {
            id: 'name',
            header: 'Nome',
            className: 'w-[24%]',
            cell: (category) => <span className="font-medium">{category.label}</span>,
          },
          {
            id: 'description',
            header: 'Descrição',
            title: (category) => category.description,
            cell: (category) => (
              <span className="text-muted-foreground">
                {category.description || <span className="text-faint">Sem descrição: a Laya só vê o nome</span>}
              </span>
            ),
          },
          { id: 'usage', header: 'Transações', align: 'right', numeric: true, className: 'w-[14%]', cell: (category) => category.usage },
        ]}
        actions={(category) => [
          {
            id: 'edit',
            label: 'Editar',
            ariaLabel: `Editar ${category.label}`,
            icon: Pencil,
            keys: ROW_KEYS.edit,
            primary: true,
            run: () => setEditing({ kind: 'edit', category }),
          },
          {
            id: 'delete',
            label: 'Excluir',
            ariaLabel: `Excluir ${category.label}`,
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
        title={editing?.kind === 'edit' ? `Editar ${editing.category.label}` : 'Nova categoria'}
        description="O nome é o que a transação guarda. A descrição é o que a Laya lê."
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
        title={`Excluir ${deleting?.label ?? 'categoria'}?`}
        description={
          deleting === null
            ? undefined
            : `${deleting.usage} transaç${deleting.usage === 1 ? 'ão ficará' : 'ões ficarão'} sem categoria, e o limite de orçamento dela será removido.`
        }
        onCancel={() => setDeleting(null)}
        onConfirm={() => {
          if (deleting !== null) remove.mutate(deleting.id)
        }}
      />
    </div>
  )
}

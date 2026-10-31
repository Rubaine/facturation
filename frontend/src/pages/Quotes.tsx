import { useQuery } from '@tanstack/react-query'
import clsx from 'clsx'
import { FileSignature, Plus, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { QuoteTable } from '../components/DocTables'
import { ButtonLink, Card, EmptyState, Input, PageHeader, Spinner } from '../components/ui'
import { get, type Quote } from '../lib/api'
import { money } from '../lib/format'

const FILTERS = [
  { key: '', label: 'Tous' },
  { key: 'draft', label: 'Brouillons' },
  { key: 'sent', label: 'Envoyés' },
  { key: 'accepted', label: 'Acceptés' },
  { key: 'invoiced', label: 'Facturés' },
  { key: 'refused', label: 'Refusés' },
]

export default function Quotes() {
  const [params, setParams] = useSearchParams()
  const filter = params.get('filtre') ?? ''
  const [search, setSearch] = useState('')
  const { data, isLoading } = useQuery({
    queryKey: ['quotes', filter],
    queryFn: () => get<Quote[]>(`/api/quotes${filter ? `?status=${filter}` : ''}`),
  })
  const filtered = useMemo(() => {
    const s = search.toLowerCase().trim()
    return (data ?? []).filter((q) => !s || [q.number ?? '', q.client_name, q.title].some((v) => v.toLowerCase().includes(s)))
  }, [data, search])

  return (
    <>
      <PageHeader
        title="Devis"
        subtitle={data ? `${filtered.length} devis · ${money(filtered.reduce((s, q) => s + Number(q.total_ttc), 0))}` : undefined}
        actions={
          <ButtonLink to="/devis/nouveau" icon={<Plus className="h-4 w-4" />}>
            Nouveau devis
          </ButtonLink>
        }
      />
      <Card>
        <div className="-m-5">
          <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 p-4">
            <div className="flex flex-wrap gap-1">
              {FILTERS.map((f) => (
                <button
                  key={f.key}
                  onClick={() => setParams(f.key ? { filtre: f.key } : {})}
                  className={clsx(
                    'rounded-full px-3 py-1 text-xs font-medium transition-colors',
                    filter === f.key ? 'bg-brand-800 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
                  )}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <div className="relative ml-auto min-w-[200px] flex-1 sm:max-w-xs">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <Input className="pl-9" placeholder="Numéro, client, objet…" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
          </div>
          {isLoading ? (
            <Spinner />
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={<FileSignature className="h-6 w-6" />}
              title="Aucun devis"
              action={!filter && !search && <ButtonLink to="/devis/nouveau">Créer un devis</ButtonLink>}
            />
          ) : (
            <QuoteTable quotes={filtered} />
          )}
        </div>
      </Card>
    </>
  )
}

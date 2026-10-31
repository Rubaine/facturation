import { useQuery } from '@tanstack/react-query'
import clsx from 'clsx'
import { FilePlus2, FileText, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { InvoiceTable } from '../components/DocTables'
import { ButtonLink, Card, EmptyState, Input, PageHeader, Spinner } from '../components/ui'
import { get, type Invoice } from '../lib/api'
import { money } from '../lib/format'

const FILTERS = [
  { key: '', label: 'Toutes' },
  { key: 'draft', label: 'Brouillons' },
  { key: 'issued', label: 'À encaisser' },
  { key: 'overdue', label: 'En retard' },
  { key: 'paid', label: 'Payées' },
  { key: 'credit_note', label: 'Avoirs' },
]

export default function Invoices() {
  const [params, setParams] = useSearchParams()
  const filter = params.get('filtre') ?? ''
  const [search, setSearch] = useState('')
  const query = filter === 'credit_note' ? '?kind=credit_note' : filter ? `?status=${filter}` : ''
  const { data, isLoading } = useQuery({ queryKey: ['invoices', filter], queryFn: () => get<Invoice[]>(`/api/invoices${query}`) })

  const filtered = useMemo(() => {
    const s = search.toLowerCase().trim()
    return (data ?? []).filter((i) => !s || [i.number ?? '', i.client_name, i.title].some((v) => v.toLowerCase().includes(s)))
  }, [data, search])
  const total = filtered.reduce((s, i) => s + (i.kind === 'credit_note' ? -1 : 1) * Number(i.total_ttc), 0)

  return (
    <>
      <PageHeader
        title="Factures"
        subtitle={data ? `${filtered.length} document(s) · ${money(total)}` : undefined}
        actions={
          <ButtonLink to="/factures/nouvelle" icon={<FilePlus2 className="h-4 w-4" />}>
            Nouvelle facture
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
              icon={<FileText className="h-6 w-6" />}
              title="Aucune facture"
              action={!filter && !search && <ButtonLink to="/factures/nouvelle">Créer une facture</ButtonLink>}
            />
          ) : (
            <InvoiceTable invoices={filtered} />
          )}
        </div>
      </Card>
    </>
  )
}

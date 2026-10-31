import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, FilePlus2, FileSignature, Repeat } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Badge, ButtonLink, Card, PageHeader, Select, Spinner, Stat } from '../components/ui'
import { get, type Dashboard as DashboardData } from '../lib/api'
import { date, money, moneyCompact, MONTHS_SHORT } from '../lib/format'

function Progress({ label, value, max }: { label: string; value: number; max: number }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0
  const color = pct >= 90 ? 'bg-red-500' : pct >= 70 ? 'bg-amber-500' : 'bg-emerald-500'
  return (
    <div>
      <div className="mb-1 flex justify-between text-xs">
        <span className="text-slate-600">{label}</span>
        <span className="font-medium text-slate-800">
          {moneyCompact(value)} / {moneyCompact(max)} ({pct.toFixed(0)} %)
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-100">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

function MonthlyChart({ data }: { data: DashboardData['monthly'] }) {
  const max = Math.max(1, ...data.map((m) => Math.max(Number(m.invoiced), Number(m.cashed))))
  return (
    <div>
      <div className="flex h-44 items-end gap-1.5 sm:gap-3">
        {data.map((m) => (
          <div key={m.month} className="group relative flex h-full flex-1 flex-col justify-end">
            <div className="flex h-full items-end justify-center gap-0.5">
              <div className="w-1/2 max-w-4 rounded-t bg-brand-200" style={{ height: `${(Math.max(0, Number(m.invoiced)) / max) * 100}%` }} />
              <div className="w-1/2 max-w-4 rounded-t bg-brand-700" style={{ height: `${(Number(m.cashed) / max) * 100}%` }} />
            </div>
            <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 whitespace-nowrap rounded-md bg-slate-900 px-2 py-1 text-xs text-white group-hover:block">
              Facturé {money(m.invoiced)}
              <br />
              Encaissé {money(m.cashed)}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex gap-1.5 sm:gap-3">
        {data.map((m) => (
          <div key={m.month} className="flex-1 text-center text-[10px] text-slate-500 sm:text-xs">
            {MONTHS_SHORT[m.month - 1]}
          </div>
        ))}
      </div>
      <div className="mt-3 flex gap-4 text-xs text-slate-600">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-brand-200" /> Facturé
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-brand-700" /> Encaissé
        </span>
      </div>
    </div>
  )
}

export default function Dashboard() {
  const [year, setYear] = useState<number | null>(null)
  const { data, isLoading } = useQuery({
    queryKey: ['dashboard', year],
    queryFn: () => get<DashboardData>(`/api/dashboard${year ? `?year=${year}` : ''}`),
  })
  if (isLoading || !data) return <Spinner />

  return (
    <>
      <PageHeader
        title="Tableau de bord"
        subtitle={`Aujourd'hui : ${date(data.today)}`}
        actions={
          <>
            <ButtonLink to="/devis/nouveau" variant="secondary" icon={<FileSignature className="h-4 w-4" />}>
              Nouveau devis
            </ButtonLink>
            <ButtonLink to="/factures/nouvelle" icon={<FilePlus2 className="h-4 w-4" />}>
              Nouvelle facture
            </ButtonLink>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Encaissé ce mois" value={money(data.cashed_month)} tone="green" />
        <Stat label={`Encaissé ${data.year}`} value={money(data.cashed_year)} hint={`Facturé : ${money(data.invoiced_year)}`} />
        <Stat label="À encaisser" value={money(data.unpaid_total)} hint={`${data.unpaid_count} facture(s) en attente`} />
        <Stat label="En retard" value={money(data.overdue_total)} tone={Number(data.overdue_total) > 0 ? 'red' : undefined} hint={`${data.overdue.length} facture(s)`} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card
          className="lg:col-span-2"
          title="Chiffre d'affaires par mois"
          actions={
            <Select className="w-auto py-1 text-xs" value={data.year} onChange={(e) => setYear(Number(e.target.value))}>
              {data.years.map((y) => (
                <option key={y}>{y}</option>
              ))}
            </Select>
          }
        >
          <MonthlyChart data={data.monthly} />
        </Card>
        <Card title={`Seuils micro-entreprise (${data.year})`}>
          <div className="space-y-4">
            <Progress label="Franchise de TVA (services)" value={Number(data.cashed_year)} max={Number(data.thresholds.vat_franchise)} />
            <Progress label="Plafond micro (services)" value={Number(data.cashed_year)} max={Number(data.thresholds.micro_ceiling)} />
            <p className="text-xs text-slate-500">
              Calculé sur le CA encaissé. Seuils modifiables dans les paramètres. Récurrent : ~{money(data.recurring_monthly_total)} HT / mois.
            </p>
          </div>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card title="Factures en retard">
          {data.overdue.length === 0 ? (
            <p className="text-sm text-slate-500">Aucune facture en retard. 🎉</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {data.overdue.map((i) => (
                <li key={i.id}>
                  <Link to={`/factures/${i.id}`} className="flex items-center justify-between gap-3 py-2.5 hover:text-brand-700">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">
                        {i.number} · {i.client_name}
                      </div>
                      <div className="text-xs text-red-600">Échue le {date(i.due_date)}</div>
                    </div>
                    <div className="text-sm font-semibold">{money(i.total_ttc)}</div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card
          title="Prochaines factures récurrentes"
          actions={
            <Link to="/recurrences" className="text-xs font-medium text-brand-700 hover:underline">
              Tout voir
            </Link>
          }
        >
          {data.upcoming_recurring.length === 0 ? (
            <p className="text-sm text-slate-500">
              Aucune récurrence active.{' '}
              <Link to="/recurrences/nouvelle" className="text-brand-700 hover:underline">
                En créer une
              </Link>
            </p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {data.upcoming_recurring.map((r) => (
                <li key={r.id}>
                  <Link to={`/recurrences/${r.id}`} className="flex items-center justify-between gap-3 py-2.5 hover:text-brand-700">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <Repeat className="h-4 w-4 shrink-0 text-slate-400" />
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium">
                          {r.name} · {r.client_name}
                        </div>
                        <div className="text-xs text-slate-500">
                          Le {date(r.next_run_date)} {r.auto_send ? '· envoi auto' : '· sans envoi'}
                        </div>
                        {r.last_error && (
                          <div className="flex items-center gap-1 text-xs text-red-600">
                            <AlertTriangle className="h-3 w-3" /> {r.last_error}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="text-sm font-semibold">{money(r.total_ht)}</div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
        {data.pending_quotes.length > 0 && (
          <Card title="Devis en attente de réponse" className="lg:col-span-2">
            <ul className="divide-y divide-slate-100">
              {data.pending_quotes.map((q) => (
                <li key={q.id}>
                  <Link to={`/devis/${q.id}`} className="flex items-center justify-between gap-3 py-2.5 hover:text-brand-700">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">
                        {q.number} · {q.client_name} {q.title && <span className="text-slate-500">— {q.title}</span>}
                      </div>
                      <div className="text-xs text-slate-500">Valable jusqu'au {date(q.valid_until)}</div>
                    </div>
                    <Badge tone="blue">{money(q.total_ttc)}</Badge>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    </>
  )
}

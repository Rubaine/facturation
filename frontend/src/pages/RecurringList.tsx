import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, Plus, Repeat } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Badge, ButtonLink, Card, EmptyState, InfoBox, PageHeader, Spinner, Table, Td, Th } from '../components/ui'
import { get, type Recurring, type SystemInfo } from '../lib/api'
import { date, frequencyLabel, money } from '../lib/format'

export default function RecurringList() {
  const { data, isLoading } = useQuery({ queryKey: ['recurring'], queryFn: () => get<Recurring[]>('/api/recurring') })
  const system = useQuery({ queryKey: ['system'], queryFn: () => get<SystemInfo>('/api/settings/system') })
  const monthly = (data ?? []).filter((r) => r.active).reduce((s, r) => s + Number(r.total_ht) / r.frequency_months, 0)

  return (
    <>
      <PageHeader
        title="Facturation récurrente"
        subtitle={data ? `${data.filter((r) => r.active).length} active(s) · ~${money(monthly)} HT / mois` : undefined}
        actions={
          <ButtonLink to="/recurrences/nouvelle" icon={<Plus className="h-4 w-4" />}>
            Nouvelle récurrence
          </ButtonLink>
        }
      />
      {system.data && (
        <div className="mb-4 space-y-2">
          <InfoBox>
            Chaque jour à <strong>{system.data.scheduler_time}</strong>, les factures arrivées à échéance sont générées, émises (numéro + Factur-X) puis
            envoyées automatiquement au client si l'envoi auto est activé.
          </InfoBox>
          {!system.data.smtp_configured && (
            <InfoBox tone="warning">L'envoi de mails n'est pas encore configuré sur le serveur (voir Paramètres) : les factures seront générées mais pas envoyées.</InfoBox>
          )}
        </div>
      )}
      <Card>
        <div className="-m-5">
          {isLoading ? (
            <Spinner />
          ) : !data?.length ? (
            <EmptyState
              icon={<Repeat className="h-6 w-6" />}
              title="Aucune facturation récurrente"
              action={<ButtonLink to="/recurrences/nouvelle">Créer une récurrence</ButtonLink>}
            >
              Idéal pour l'hébergement, la maintenance ou les abonnements : la facture part toute seule chaque mois.
            </EmptyState>
          ) : (
            <Table>
              <thead className="bg-slate-50">
                <tr>
                  <Th>Nom</Th>
                  <Th>Client</Th>
                  <Th className="hidden md:table-cell">Fréquence</Th>
                  <Th>Prochaine</Th>
                  <Th className="text-right">Montant HT</Th>
                  <Th>Statut</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50">
                    <Td>
                      <Link to={`/recurrences/${r.id}`} className="font-medium text-brand-800 hover:underline">
                        {r.name}
                      </Link>
                      {r.last_error && (
                        <div className="flex items-center gap-1 text-xs text-red-600">
                          <AlertTriangle className="h-3 w-3" /> {r.last_error}
                        </div>
                      )}
                    </Td>
                    <Td className="max-w-[180px] truncate">{r.client_name}</Td>
                    <Td className="hidden text-slate-600 md:table-cell">
                      {frequencyLabel(r.frequency_months)} · le {r.day_of_month}
                    </Td>
                    <Td className="text-slate-600">{r.active ? date(r.next_run_date) : '—'}</Td>
                    <Td className="text-right font-semibold">{money(r.total_ht)}</Td>
                    <Td>
                      {r.active ? <Badge tone="green">{r.auto_send ? 'Active · envoi auto' : 'Active'}</Badge> : <Badge>En pause</Badge>}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </div>
      </Card>
    </>
  )
}

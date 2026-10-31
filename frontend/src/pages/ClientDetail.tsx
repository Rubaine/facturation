import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Archive, ArchiveRestore, FilePlus2, FileSignature, Pencil, Trash2 } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ClientFormModal } from '../components/ClientForm'
import { InvoiceTable, QuoteTable } from '../components/DocTables'
import { Badge, Button, ButtonLink, Card, ErrorBox, PageHeader, Spinner, Stat, useToast } from '../components/ui'
import { del, get, put, type Client, type ClientStats, type Invoice, type Quote } from '../lib/api'
import { money } from '../lib/format'

export default function ClientDetail() {
  const id = Number(useParams().id)
  const nav = useNavigate()
  const qc = useQueryClient()
  const toast = useToast()
  const [editing, setEditing] = useState(false)
  const client = useQuery({ queryKey: ['client', id], queryFn: () => get<Client>(`/api/clients/${id}`) })
  const stats = useQuery({ queryKey: ['client-stats', id], queryFn: () => get<ClientStats>(`/api/clients/${id}/stats`) })
  const invoices = useQuery({ queryKey: ['invoices', { client: id }], queryFn: () => get<Invoice[]>(`/api/invoices?client_id=${id}`) })
  const quotes = useQuery({ queryKey: ['quotes', { client: id }], queryFn: () => get<Quote[]>(`/api/quotes?client_id=${id}`) })

  const archive = useMutation({
    mutationFn: (archived: boolean) => put<Client>(`/api/clients/${id}`, { ...client.data, archived }),
    onSuccess: (c) => {
      qc.invalidateQueries({ queryKey: ['clients'] })
      qc.setQueryData(['client', id], c)
      toast(c.archived ? 'Client archivé' : 'Client réactivé')
    },
  })
  const remove = useMutation({
    mutationFn: () => del(`/api/clients/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['clients'] })
      toast('Client supprimé')
      nav('/clients')
    },
    onError: (e) => toast(e.message, 'error'),
  })

  if (client.isLoading) return <Spinner />
  if (!client.data) return <ErrorBox error={client.error} />
  const c = client.data

  return (
    <>
      <PageHeader
        back={{ to: '/clients', label: 'Clients' }}
        title={
          <span className="flex items-center gap-3">
            {c.name} {c.archived && <Badge>Archivé</Badge>}
          </span>
        }
        subtitle={c.kind === 'company' ? 'Professionnel' : 'Particulier'}
        actions={
          <>
            <Button variant="secondary" icon={<Pencil className="h-4 w-4" />} onClick={() => setEditing(true)}>
              Modifier
            </Button>
            <ButtonLink to={`/devis/nouveau?client=${id}`} variant="secondary" icon={<FileSignature className="h-4 w-4" />}>
              Devis
            </ButtonLink>
            <ButtonLink to={`/factures/nouvelle?client=${id}`} icon={<FilePlus2 className="h-4 w-4" />}>
              Facture
            </ButtonLink>
          </>
        }
      />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Coordonnées" className="lg:col-span-1">
          <dl className="space-y-2.5 text-sm">
            {c.contact_name && <Info label="Contact" value={c.contact_name} />}
            <Info label="Email" value={c.email || '—'} />
            {c.cc_emails && <Info label="Copie" value={c.cc_emails} />}
            {c.phone && <Info label="Téléphone" value={c.phone} />}
            <Info
              label="Adresse"
              value={
                <>
                  {c.address_line1}
                  {c.address_line2 && <br />}
                  {c.address_line2}
                  <br />
                  {c.postal_code} {c.city} {c.country !== 'FR' && c.country}
                </>
              }
            />
            {c.siret && <Info label="SIRET" value={c.siret} />}
            {c.siren && !c.siret && <Info label="SIREN" value={c.siren} />}
            {c.vat_number && <Info label="N° TVA" value={c.vat_number} />}
            {c.notes && <Info label="Notes" value={<span className="whitespace-pre-line">{c.notes}</span>} />}
          </dl>
          <div className="mt-5 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
            <Button
              variant="secondary"
              size="sm"
              icon={c.archived ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
              onClick={() => archive.mutate(!c.archived)}
            >
              {c.archived ? 'Réactiver' : 'Archiver'}
            </Button>
            <Button
              variant="danger"
              size="sm"
              icon={<Trash2 className="h-4 w-4" />}
              onClick={() => confirm(`Supprimer définitivement ${c.name} ?`) && remove.mutate()}
            >
              Supprimer
            </Button>
          </div>
        </Card>
        <div className="space-y-6 lg:col-span-2">
          {stats.data && (
            <div className="grid grid-cols-3 gap-3">
              <Stat label="Facturé" value={money(stats.data.invoiced_total)} hint={`${stats.data.invoice_count} facture(s)`} />
              <Stat label="Payé" value={money(stats.data.paid_total)} tone="green" />
              <Stat label="En attente" value={money(stats.data.unpaid_total)} tone={Number(stats.data.unpaid_total) > 0 ? 'red' : undefined} />
            </div>
          )}
          <Card title="Factures">
            <div className="-m-5">
              {invoices.data?.length ? <InvoiceTable invoices={invoices.data} showClient={false} /> : <p className="p-5 text-sm text-slate-500">Aucune facture.</p>}
            </div>
          </Card>
          <Card title="Devis">
            <div className="-m-5">
              {quotes.data?.length ? <QuoteTable quotes={quotes.data} showClient={false} /> : <p className="p-5 text-sm text-slate-500">Aucun devis.</p>}
            </div>
          </Card>
        </div>
      </div>
      <ClientFormModal open={editing} onClose={() => setEditing(false)} client={c} />
    </>
  )
}

function Info({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium text-slate-500">{label}</dt>
      <dd className="text-slate-800">{value}</dd>
    </div>
  )
}

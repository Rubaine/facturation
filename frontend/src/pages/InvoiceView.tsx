import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { BellRing, CheckCircle2, Copy, Download, FileCode2, FileMinus2, Pencil, Send, Stamp, Trash2, Undo2 } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { PdfPreview } from '../components/PdfPreview'
import { SendDialog } from '../components/SendDialog'
import { InvoiceStatusBadge } from '../components/StatusBadge'
import { Badge, Button, Card, ErrorBox, Field, InfoBox, Input, Modal, PageHeader, Select, Spinner, useToast } from '../components/ui'
import { del, get, post, type EmailLog, type Invoice } from '../lib/api'
import { date, dateTime, money, OPERATION_LABELS, today } from '../lib/format'

export default function InvoiceView() {
  const id = Number(useParams().id)
  const nav = useNavigate()
  const qc = useQueryClient()
  const toast = useToast()
  const [sending, setSending] = useState<'send' | 'reminder' | null>(null)
  const [paying, setPaying] = useState(false)
  const [pdfVersion, setPdfVersion] = useState(0)
  const { data: inv, isLoading, error } = useQuery({ queryKey: ['invoice', id], queryFn: () => get<Invoice>(`/api/invoices/${id}`) })
  const logs = useQuery({ queryKey: ['invoice-emails', id], queryFn: () => get<EmailLog[]>(`/api/invoices/${id}/emails`) })

  const refresh = (updated?: Invoice) => {
    if (updated) qc.setQueryData(['invoice', id], updated)
    qc.invalidateQueries({ queryKey: ['invoice', id] })
    qc.invalidateQueries({ queryKey: ['invoices'] })
    qc.invalidateQueries({ queryKey: ['dashboard'] })
    qc.invalidateQueries({ queryKey: ['invoice-emails', id] })
    setPdfVersion((v) => v + 1)
  }

  const action = useMutation({
    mutationFn: async (kind: 'issue' | 'unpaid' | 'credit' | 'duplicate' | 'delete') => {
      if (kind === 'delete') return del(`/api/invoices/${id}`)
      const path = { issue: 'issue', unpaid: 'unpaid', credit: 'credit-note', duplicate: 'duplicate' }[kind]
      return post<Invoice>(`/api/invoices/${id}/${path}`)
    },
    onSuccess: (res, kind) => {
      if (kind === 'delete') {
        qc.invalidateQueries({ queryKey: ['invoices'] })
        toast('Brouillon supprimé')
        return nav('/factures')
      }
      const r = res as Invoice
      if (kind === 'credit' || kind === 'duplicate') {
        qc.invalidateQueries({ queryKey: ['invoices'] })
        toast(kind === 'credit' ? 'Avoir créé en brouillon : vérifie-le puis émets-le' : 'Copie créée en brouillon')
        return nav(`/factures/${r.id}/modifier`)
      }
      refresh(r)
      toast(kind === 'issue' ? `Facture ${r.number} émise` : 'Facture repassée en attente de paiement')
    },
    onError: (e) => toast(e.message, 'error'),
  })

  if (isLoading) return <Spinner />
  if (!inv) return <ErrorBox error={error} />

  const label = inv.kind === 'credit_note' ? 'Avoir' : 'Facture'
  const isDraft = inv.status === 'draft'
  const canRemind = inv.kind === 'invoice' && inv.status === 'issued'

  return (
    <>
      <PageHeader
        back={{ to: '/factures', label: 'Factures' }}
        title={
          <span className="flex flex-wrap items-center gap-3">
            {label} {inv.number ?? '(brouillon)'} <InvoiceStatusBadge invoice={inv} />
          </span>
        }
        subtitle={
          <>
            <Link to={`/clients/${inv.client_id}`} className="font-medium text-slate-700 hover:text-brand-700">
              {inv.client_name}
            </Link>
            {inv.title && <> · {inv.title}</>}
          </>
        }
        actions={
          isDraft ? (
            <>
              <Button variant="danger" icon={<Trash2 className="h-4 w-4" />} onClick={() => confirm('Supprimer ce brouillon ?') && action.mutate('delete')}>
                Supprimer
              </Button>
              <Button variant="secondary" icon={<Pencil className="h-4 w-4" />} onClick={() => nav(`/factures/${id}/modifier`)}>
                Modifier
              </Button>
              <Button variant="secondary" icon={<Stamp className="h-4 w-4" />} loading={action.isPending && action.variables === 'issue'} onClick={() => action.mutate('issue')}>
                Émettre
              </Button>
              <Button icon={<Send className="h-4 w-4" />} onClick={() => setSending('send')}>
                Émettre et envoyer
              </Button>
            </>
          ) : (
            <>
              <a href={`/api/invoices/${id}/pdf?download=true`} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50">
                <Download className="h-4 w-4" /> PDF
              </a>
              <Button variant="secondary" icon={<Send className="h-4 w-4" />} onClick={() => setSending('send')}>
                {inv.sent_at ? 'Renvoyer' : 'Envoyer'}
              </Button>
              {canRemind && (
                <Button variant="secondary" icon={<BellRing className="h-4 w-4" />} onClick={() => setSending('reminder')}>
                  Relancer
                </Button>
              )}
              {inv.kind === 'invoice' && inv.status === 'issued' && (
                <Button variant="success" icon={<CheckCircle2 className="h-4 w-4" />} onClick={() => setPaying(true)}>
                  Marquer payée
                </Button>
              )}
              {inv.status === 'paid' && (
                <Button variant="secondary" icon={<Undo2 className="h-4 w-4" />} onClick={() => action.mutate('unpaid')}>
                  Annuler le paiement
                </Button>
              )}
            </>
          )
        }
      />

      {isDraft && (
        <div className="mb-6">
          <InfoBox tone="warning">
            Brouillon : l'aperçu ci-dessous n'a pas encore de numéro. À l'émission, le numéro définitif est attribué et la facture électronique
            Factur-X est générée.
          </InfoBox>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <PdfPreview src={`/api/invoices/${id}/pdf`} version={pdfVersion} />
        </div>
        <div className="space-y-6">
          <Card title="Résumé">
            <dl className="space-y-2 text-sm">
              <Row label="Montant" value={<span className="text-base font-bold">{money(inv.total_ttc)}</span>} />
              <Row label="Émise le" value={date(inv.issue_date)} />
              {inv.kind === 'invoice' && <Row label="Échéance" value={<span className={inv.is_overdue ? 'font-semibold text-red-600' : ''}>{date(inv.due_date)}</span>} />}
              {inv.service_start && <Row label="Période" value={`${date(inv.service_start)} → ${date(inv.service_end)}`} />}
              <Row label="Opération" value={OPERATION_LABELS[inv.operation_category]} />
              {inv.sent_at && <Row label="Envoyée le" value={dateTime(inv.sent_at)} />}
              {inv.paid_at && <Row label="Payée le" value={`${date(inv.paid_at)} (${inv.payment_method})`} />}
              {inv.reminder_count > 0 && <Row label="Relances" value={`${inv.reminder_count} (dernière le ${dateTime(inv.last_reminder_at)})`} />}
              {inv.quote_id && (
                <Row label="Devis" value={<Link className="text-brand-700 hover:underline" to={`/devis/${inv.quote_id}`}>{inv.quote_number ?? 'voir'}</Link>} />
              )}
              {inv.recurring_id && (
                <Row label="Récurrence" value={<Link className="text-brand-700 hover:underline" to={`/recurrences/${inv.recurring_id}`}>voir le modèle</Link>} />
              )}
              {inv.credit_note_of_id && (
                <Row
                  label="Facture d'origine"
                  value={<Link className="text-brand-700 hover:underline" to={`/factures/${inv.credit_note_of_id}`}>{inv.credit_note_of_number}</Link>}
                />
              )}
              {inv.credit_note_ids.length > 0 && (
                <Row
                  label="Avoir(s)"
                  value={inv.credit_note_ids.map((cid) => (
                    <Link key={cid} className="mr-2 text-brand-700 hover:underline" to={`/factures/${cid}`}>
                      #{cid}
                    </Link>
                  ))}
                />
              )}
            </dl>
          </Card>

          {!isDraft && (
            <Card title="Autres actions">
              <div className="flex flex-col gap-2">
                <a href={`/api/invoices/${id}/xml`} className="inline-flex items-center gap-2 text-sm text-slate-700 hover:text-brand-700">
                  <FileCode2 className="h-4 w-4" /> Télécharger le XML Factur-X
                </a>
                {inv.kind === 'invoice' && (
                  <button className="inline-flex items-center gap-2 text-left text-sm text-slate-700 hover:text-brand-700" onClick={() => action.mutate('duplicate')}>
                    <Copy className="h-4 w-4" /> Dupliquer en nouvelle facture
                  </button>
                )}
                {inv.kind === 'invoice' && inv.status !== 'cancelled' && (
                  <button
                    className="inline-flex items-center gap-2 text-left text-sm text-red-600 hover:text-red-700"
                    onClick={() => confirm("Créer un avoir pour annuler (tout ou partie de) cette facture ?") && action.mutate('credit')}
                  >
                    <FileMinus2 className="h-4 w-4" /> Annuler / corriger par un avoir
                  </button>
                )}
              </div>
            </Card>
          )}

          <Card title="Historique des envois">
            {logs.data?.length ? (
              <ul className="space-y-2.5 text-sm">
                {logs.data.map((l) => (
                  <li key={l.id}>
                    <div className="flex items-center gap-2">
                      <Badge tone={l.status === 'sent' ? 'green' : l.status === 'outbox' ? 'amber' : 'red'}>
                        {l.status === 'sent' ? 'Envoyé' : l.status === 'outbox' ? 'Non envoyé (test)' : 'Échec'}
                      </Badge>
                      <span className="text-xs text-slate-500">{dateTime(l.created_at)}</span>
                      {l.purpose === 'reminder' && <Badge tone="purple">Relance</Badge>}
                    </div>
                    <div className="mt-0.5 truncate text-xs text-slate-600">→ {l.to}</div>
                    {l.error && <div className="text-xs text-red-600">{l.error}</div>}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-slate-500">Jamais envoyée par mail.</p>
            )}
          </Card>
        </div>
      </div>

      <SendDialog
        open={sending !== null}
        onClose={() => setSending(null)}
        title={sending === 'reminder' ? `Relancer ${inv.client_name}` : `Envoyer ${label.toLowerCase()} ${inv.number ?? ''}`}
        previewUrl={`/api/invoices/${id}/email?purpose=${sending ?? 'send'}`}
        sendUrl={`/api/invoices/${id}/send?purpose=${sending ?? 'send'}`}
        confirmLabel={isDraft ? 'Émettre et envoyer' : 'Envoyer'}
        warning={isDraft ? "La facture va être émise (numéro définitif) avant l'envoi." : undefined}
        onSent={() => {
          refresh()
          toast(sending === 'reminder' ? 'Relance envoyée' : 'Facture envoyée')
        }}
      />
      <PaidModal open={paying} onClose={() => setPaying(false)} invoice={inv} onDone={(r) => { refresh(r); toast('Facture marquée payée') }} />
    </>
  )
}

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-right text-slate-800">{value}</dd>
    </div>
  )
}

function PaidModal({ open, onClose, invoice, onDone }: { open: boolean; onClose: () => void; invoice: Invoice; onDone: (i: Invoice) => void }) {
  const [paidAt, setPaidAt] = useState(today())
  const [method, setMethod] = useState('virement')
  const pay = useMutation({
    mutationFn: () => post<Invoice>(`/api/invoices/${invoice.id}/paid`, { paid_at: paidAt, payment_method: method }),
    onSuccess: (r) => {
      onDone(r)
      onClose()
    },
  })
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Paiement de ${invoice.number}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Annuler
          </Button>
          <Button variant="success" loading={pay.isPending} onClick={() => pay.mutate()}>
            Confirmer ({money(invoice.total_ttc)})
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <ErrorBox error={pay.error} />
        <Field label="Date d'encaissement" hint="C'est cette date qui compte pour ton CA de micro-entrepreneur (déclaration URSSAF).">
          <Input type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} />
        </Field>
        <Field label="Moyen de paiement">
          <Select value={method} onChange={(e) => setMethod(e.target.value)}>
            <option value="virement">Virement</option>
            <option value="carte">Carte bancaire</option>
            <option value="espèces">Espèces</option>
            <option value="chèque">Chèque</option>
            <option value="prélèvement">Prélèvement</option>
            <option value="autre">Autre</option>
          </Select>
        </Field>
      </div>
    </Modal>
  )
}

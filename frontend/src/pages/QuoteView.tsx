import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, Copy, Download, ExternalLink, FileText, Pencil, Send, Stamp, Trash2, X } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { PdfPreview } from '../components/PdfPreview'
import { SendDialog } from '../components/SendDialog'
import { QuoteStatusBadge } from '../components/StatusBadge'
import { Badge, Button, Card, ErrorBox, Field, InfoBox, Input, Modal, PageHeader, Spinner, useToast } from '../components/ui'
import { del, get, post, type EmailLog, type Invoice, type Quote } from '../lib/api'
import { date, dateTime, money, OPERATION_LABELS } from '../lib/format'

export default function QuoteView() {
  const id = Number(useParams().id)
  const nav = useNavigate()
  const qc = useQueryClient()
  const toast = useToast()
  const [sending, setSending] = useState(false)
  const [accepting, setAccepting] = useState(false)
  const [acceptedBy, setAcceptedBy] = useState('')
  const [pdfVersion, setPdfVersion] = useState(0)
  const { data: q, isLoading, error } = useQuery({ queryKey: ['quote', id], queryFn: () => get<Quote>(`/api/quotes/${id}`) })
  const logs = useQuery({ queryKey: ['quote-emails', id], queryFn: () => get<EmailLog[]>(`/api/quotes/${id}/emails`) })

  const refresh = (updated?: Quote) => {
    if (updated) qc.setQueryData(['quote', id], updated)
    qc.invalidateQueries({ queryKey: ['quote', id] })
    qc.invalidateQueries({ queryKey: ['quotes'] })
    qc.invalidateQueries({ queryKey: ['quote-emails', id] })
    qc.invalidateQueries({ queryKey: ['dashboard'] })
    setPdfVersion((v) => v + 1)
  }

  const action = useMutation({
    mutationFn: async (kind: 'finalize' | 'accept' | 'refuse' | 'invoice' | 'duplicate' | 'delete') => {
      if (kind === 'delete') return del(`/api/quotes/${id}`)
      if (kind === 'accept') return post<Quote>(`/api/quotes/${id}/accept`, { accepted_by: acceptedBy })
      return post<Quote | Invoice>(`/api/quotes/${id}/${kind}`)
    },
    onSuccess: (res, kind) => {
      if (kind === 'delete') {
        qc.invalidateQueries({ queryKey: ['quotes'] })
        toast('Brouillon supprimé')
        return nav('/devis')
      }
      if (kind === 'invoice') {
        qc.invalidateQueries({ queryKey: ['quotes'] })
        qc.invalidateQueries({ queryKey: ['invoices'] })
        toast('Facture créée en brouillon à partir du devis')
        return nav(`/factures/${(res as Invoice).id}`)
      }
      if (kind === 'duplicate') {
        qc.invalidateQueries({ queryKey: ['quotes'] })
        toast('Copie créée en brouillon')
        return nav(`/devis/${(res as Quote).id}/modifier`)
      }
      refresh(res as Quote)
      setAccepting(false)
      toast({ finalize: 'Devis finalisé', accept: 'Devis marqué accepté', refuse: 'Devis marqué refusé' }[kind])
    },
    onError: (e) => toast(e.message, 'error'),
  })

  if (isLoading) return <Spinner />
  if (!q) return <ErrorBox error={error} />
  const isDraft = !q.number
  const publicUrl = q.public_token ? `${window.location.origin}/p/devis/${q.public_token}` : null

  return (
    <>
      <PageHeader
        back={{ to: '/devis', label: 'Devis' }}
        title={
          <span className="flex flex-wrap items-center gap-3">
            Devis {q.number ?? '(brouillon)'} <QuoteStatusBadge quote={q} />
          </span>
        }
        subtitle={
          <>
            <Link to={`/clients/${q.client_id}`} className="font-medium text-slate-700 hover:text-brand-700">
              {q.client_name}
            </Link>
            {q.title && <> · {q.title}</>}
          </>
        }
        actions={
          <>
            {isDraft && (
              <>
                <Button variant="danger" icon={<Trash2 className="h-4 w-4" />} onClick={() => confirm('Supprimer ce brouillon ?') && action.mutate('delete')}>
                  Supprimer
                </Button>
                <Button variant="secondary" icon={<Pencil className="h-4 w-4" />} onClick={() => nav(`/devis/${id}/modifier`)}>
                  Modifier
                </Button>
                <Button variant="secondary" icon={<Stamp className="h-4 w-4" />} onClick={() => action.mutate('finalize')}>
                  Finaliser
                </Button>
              </>
            )}
            {!isDraft && (
              <a href={`/api/quotes/${id}/pdf?download=true`} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50">
                <Download className="h-4 w-4" /> PDF
              </a>
            )}
            {['draft', 'sent', 'accepted'].includes(q.status) && (
              <Button variant={q.status === 'accepted' ? 'secondary' : 'primary'} icon={<Send className="h-4 w-4" />} onClick={() => setSending(true)}>
                {q.sent_at ? 'Renvoyer' : 'Envoyer'}
              </Button>
            )}
            {['accepted', 'sent', 'draft'].includes(q.status) && !isDraft && (
              <Button variant={q.status === 'accepted' ? 'primary' : 'secondary'} icon={<FileText className="h-4 w-4" />} onClick={() => action.mutate('invoice')}>
                Facturer
              </Button>
            )}
            {q.status === 'invoiced' && q.invoice_id && (
              <Button icon={<FileText className="h-4 w-4" />} onClick={() => nav(`/factures/${q.invoice_id}`)}>
                Voir la facture
              </Button>
            )}
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <PdfPreview src={`/api/quotes/${id}/pdf`} version={pdfVersion} />
        </div>
        <div className="space-y-6">
          <Card title="Résumé">
            <dl className="space-y-2 text-sm">
              <Row label="Montant" value={<span className="text-base font-bold">{money(q.total_ttc)}</span>} />
              <Row label="Date" value={date(q.issue_date)} />
              <Row label="Valable jusqu'au" value={<span className={q.is_expired ? 'font-semibold text-amber-600' : ''}>{date(q.valid_until)}</span>} />
              <Row label="Opération" value={OPERATION_LABELS[q.operation_category]} />
              {q.sent_at && <Row label="Envoyé le" value={dateTime(q.sent_at)} />}
              {q.accepted_at && <Row label="Accepté le" value={`${dateTime(q.accepted_at)}${q.accepted_by ? ` par ${q.accepted_by}` : ''}`} />}
              {q.refused_at && <Row label="Refusé le" value={dateTime(q.refused_at)} />}
            </dl>
          </Card>

          {['draft', 'sent'].includes(q.status) && (
            <Card title="Réponse du client">
              <p className="mb-3 text-sm text-slate-500">Le client peut accepter en ligne via le lien du mail. Tu peux aussi enregistrer sa réponse ici.</p>
              <div className="flex flex-wrap gap-2">
                <Button variant="success" size="sm" icon={<Check className="h-4 w-4" />} onClick={() => setAccepting(true)}>
                  Accepté
                </Button>
                <Button variant="danger" size="sm" icon={<X className="h-4 w-4" />} onClick={() => confirm('Marquer ce devis comme refusé ?') && action.mutate('refuse')}>
                  Refusé
                </Button>
              </div>
            </Card>
          )}

          {publicUrl && (
            <Card title="Lien client">
              <p className="mb-2 text-xs text-slate-500">Page où le client consulte et accepte le devis, sans compte.</p>
              <div className="flex gap-2">
                <Input readOnly value={publicUrl} className="text-xs" onFocus={(e) => e.target.select()} />
                <Button
                  variant="secondary"
                  size="sm"
                  icon={<Copy className="h-4 w-4" />}
                  onClick={() => navigator.clipboard.writeText(publicUrl).then(() => toast('Lien copié'))}
                  aria-label="Copier"
                />
                <a href={publicUrl} target="_blank" rel="noreferrer" className="inline-flex items-center rounded-lg border border-slate-300 px-2.5 text-slate-600 hover:bg-slate-50" aria-label="Ouvrir">
                  <ExternalLink className="h-4 w-4" />
                </a>
              </div>
            </Card>
          )}

          <Card title="Autres actions">
            <button className="inline-flex items-center gap-2 text-sm text-slate-700 hover:text-brand-700" onClick={() => action.mutate('duplicate')}>
              <Copy className="h-4 w-4" /> Dupliquer (nouvelle version)
            </button>
          </Card>

          <Card title="Historique des envois">
            {logs.data?.length ? (
              <ul className="space-y-2.5 text-sm">
                {logs.data.map((l) => (
                  <li key={l.id}>
                    <div className="flex items-center gap-2">
                      <Badge tone={l.status === 'sent' ? 'green' : l.status === 'outbox' ? 'amber' : 'red'}>
                        {l.purpose === 'notification' ? 'Notification' : l.status === 'sent' ? 'Envoyé' : l.status === 'outbox' ? 'Non envoyé (test)' : 'Échec'}
                      </Badge>
                      <span className="text-xs text-slate-500">{dateTime(l.created_at)}</span>
                    </div>
                    <div className="mt-0.5 truncate text-xs text-slate-600">→ {l.to}</div>
                    {l.error && <div className="text-xs text-red-600">{l.error}</div>}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-slate-500">Jamais envoyé par mail.</p>
            )}
          </Card>
        </div>
      </div>

      <SendDialog
        open={sending}
        onClose={() => setSending(false)}
        title={`Envoyer le devis ${q.number ?? ''}`}
        htmlPreviewUrl={`/api/quotes/${id}/email/html`}
        previewUrl={`/api/quotes/${id}/email`}
        sendUrl={`/api/quotes/${id}/send`}
        warning={isDraft ? 'Le devis va être finalisé (numéro définitif) avant l’envoi.' : undefined}
        onSent={() => {
          refresh()
          toast('Devis envoyé')
        }}
      />
      <Modal
        open={accepting}
        onClose={() => setAccepting(false)}
        title="Devis accepté"
        footer={
          <>
            <Button variant="secondary" onClick={() => setAccepting(false)}>
              Annuler
            </Button>
            <Button variant="success" loading={action.isPending} onClick={() => action.mutate('accept')}>
              Confirmer
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <InfoBox>Le PDF du devis sera mis à jour avec la mention « Accepté ».</InfoBox>
          <Field label="Accepté par (facultatif)">
            <Input value={acceptedBy} onChange={(e) => setAcceptedBy(e.target.value)} placeholder="Nom du signataire" />
          </Field>
        </div>
      </Modal>
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

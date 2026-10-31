import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ClientPicker } from '../components/ClientPicker'
import { cleanLines, emptyLine, LinesEditor } from '../components/LinesEditor'
import { Button, Card, ErrorBox, Field, InfoBox, Input, PageHeader, Select, Spinner, Textarea, useToast } from '../components/ui'
import { get, post, put, type Invoice, type InvoiceInput } from '../lib/api'
import { addDays, daysBetween, OPERATION_LABELS, today } from '../lib/format'
import { useSettings } from '../lib/hooks'

export default function InvoiceEdit() {
  const { id } = useParams()
  const [params] = useSearchParams()
  const nav = useNavigate()
  const qc = useQueryClient()
  const toast = useToast()
  const settings = useSettings()
  const existing = useQuery({ queryKey: ['invoice', Number(id)], queryFn: () => get<Invoice>(`/api/invoices/${id}`), enabled: !!id })
  const [form, setForm] = useState<InvoiceInput | null>(null)
  const [terms, setTerms] = useState(0)

  useEffect(() => {
    if (form) return
    if (id && existing.data) {
      const inv = existing.data
      setForm({
        client_id: inv.client_id,
        issue_date: inv.issue_date,
        due_date: inv.due_date,
        service_start: inv.service_start,
        service_end: inv.service_end,
        operation_category: inv.operation_category,
        title: inv.title,
        notes: inv.notes,
        lines: inv.lines.map((l) => ({ ...l, quantity: String(l.quantity), unit_price: String(l.unit_price), vat_rate: String(l.vat_rate) })),
      })
      setTerms(daysBetween(inv.issue_date, inv.due_date))
    } else if (!id && settings.data) {
      const s = settings.data.invoicing
      const d = today()
      setTerms(s.payment_terms_days)
      setForm({
        client_id: Number(params.get('client')) || 0,
        issue_date: d,
        due_date: addDays(d, s.payment_terms_days),
        service_start: null,
        service_end: null,
        operation_category: s.default_operation_category,
        title: '',
        notes: '',
        lines: [emptyLine(s.default_unit, s.vat_franchise ? '0' : String(s.default_vat_rate))],
      })
    }
  }, [id, existing.data, settings.data, form, params])

  const save = useMutation({
    mutationFn: async (issue: boolean) => {
      const payload = { ...form!, lines: cleanLines(form!.lines) }
      const inv = id ? await put<Invoice>(`/api/invoices/${id}`, payload) : await post<Invoice>('/api/invoices', payload)
      if (issue) return post<Invoice>(`/api/invoices/${inv.id}/issue`)
      return inv
    },
    onSuccess: (inv, issue) => {
      qc.invalidateQueries({ queryKey: ['invoices'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
      qc.setQueryData(['invoice', inv.id], inv)
      toast(issue ? `Facture ${inv.number} émise` : 'Brouillon enregistré')
      nav(`/factures/${inv.id}`)
    },
  })

  if (!form || !settings.data) return <Spinner />
  if (existing.data && existing.data.status !== 'draft') {
    return <ErrorBox error="Ce document est émis : il ne peut plus être modifié. Crée un avoir si besoin." />
  }
  const isCredit = existing.data?.kind === 'credit_note'
  const set = <K extends keyof InvoiceInput>(k: K, v: InvoiceInput[K]) => setForm((f) => ({ ...f!, [k]: v }))
  const valid = form.client_id > 0 && cleanLines(form.lines).length > 0
  const label = isCredit ? 'avoir' : 'facture'

  return (
    <>
      <PageHeader
        back={id ? { to: `/factures/${id}`, label: 'Retour' } : { to: '/factures', label: 'Factures' }}
        title={id ? `Modifier le brouillon d'${label}` : 'Nouvelle facture'}
        subtitle={isCredit && existing.data?.credit_note_of_number ? `Avoir sur la facture ${existing.data.credit_note_of_number}` : 'Le numéro est attribué à l’émission.'}
      />
      <div className="space-y-6">
        <ErrorBox error={save.error} />
        <Card title="Informations">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Client *">
              <ClientPicker value={form.client_id || null} onChange={(v) => set('client_id', v)} disabled={isCredit} />
            </Field>
            <Field label="Objet" hint="Apparaît sur la facture et dans l'objet du mail">
              <Input value={form.title} onChange={(e) => set('title', e.target.value)} placeholder="Ex. Hébergement Web - Novembre 2026" />
            </Field>
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Date d'émission">
              <Input
                type="date"
                value={form.issue_date}
                onChange={(e) => setForm((f) => ({ ...f!, issue_date: e.target.value, due_date: addDays(e.target.value, terms) }))}
              />
            </Field>
            {!isCredit && (
              <>
                <Field label="Délai de paiement">
                  <Select
                    value={[0, 15, 30, 45, 60].includes(terms) ? terms : -1}
                    onChange={(e) => {
                      const t = Number(e.target.value)
                      if (t < 0) return
                      setTerms(t)
                      set('due_date', addDays(form.issue_date, t))
                    }}
                  >
                    <option value={0}>À réception (comptant)</option>
                    <option value={15}>15 jours</option>
                    <option value={30}>30 jours</option>
                    <option value={45}>45 jours</option>
                    <option value={60}>60 jours</option>
                    <option value={-1}>Personnalisé</option>
                  </Select>
                </Field>
                <Field label="Échéance">
                  <Input
                    type="date"
                    value={form.due_date}
                    min={form.issue_date}
                    onChange={(e) => {
                      set('due_date', e.target.value)
                      setTerms(daysBetween(form.issue_date, e.target.value))
                    }}
                  />
                </Field>
              </>
            )}
            <Field label="Type d'opération" hint="Mention obligatoire (réforme)">
              <Select value={form.operation_category} onChange={(e) => set('operation_category', e.target.value as InvoiceInput['operation_category'])}>
                {Object.entries(OPERATION_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Période facturée - début" hint="Facultatif">
              <Input type="date" value={form.service_start ?? ''} onChange={(e) => set('service_start', e.target.value || null)} />
            </Field>
            <Field label="Période facturée - fin">
              <Input type="date" value={form.service_end ?? ''} onChange={(e) => set('service_end', e.target.value || null)} />
            </Field>
          </div>
        </Card>

        <Card title="Lignes">
          <LinesEditor
            lines={form.lines}
            onChange={(lines) => set('lines', lines)}
            vatFranchise={settings.data.invoicing.vat_franchise}
            defaultUnit={settings.data.invoicing.default_unit}
            defaultVatRate={String(settings.data.invoicing.default_vat_rate)}
          />
        </Card>

        <Card title="Notes">
          <Textarea value={form.notes} onChange={(e) => set('notes', e.target.value)} placeholder="Texte libre affiché sur le document (facultatif)" rows={3} />
        </Card>

        <InfoBox>
          <strong>Émettre</strong> attribue le numéro définitif et génère la facture électronique Factur-X. Une fois émise, une {label} ne peut
          plus être modifiée ni supprimée (il faudra faire un avoir).
        </InfoBox>
        <div className="flex flex-wrap justify-end gap-2 pb-8">
          <Button variant="secondary" onClick={() => save.mutate(false)} loading={save.isPending && save.variables === false} disabled={!valid}>
            Enregistrer le brouillon
          </Button>
          <Button onClick={() => save.mutate(true)} loading={save.isPending && save.variables === true} disabled={!valid}>
            Émettre {isCredit ? "l'avoir" : 'la facture'}
          </Button>
        </div>
      </div>
    </>
  )
}

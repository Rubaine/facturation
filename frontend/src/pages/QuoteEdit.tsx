import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ClientPicker } from '../components/ClientPicker'
import { cleanLines, emptyLine, LinesEditor } from '../components/LinesEditor'
import { Button, Card, ErrorBox, Field, Input, PageHeader, Select, Spinner, Textarea, useToast } from '../components/ui'
import { get, post, put, type Quote, type QuoteInput } from '../lib/api'
import { addDays, OPERATION_LABELS, today } from '../lib/format'
import { useSettings } from '../lib/hooks'

export default function QuoteEdit() {
  const { id } = useParams()
  const [params] = useSearchParams()
  const nav = useNavigate()
  const qc = useQueryClient()
  const toast = useToast()
  const settings = useSettings()
  const existing = useQuery({ queryKey: ['quote', Number(id)], queryFn: () => get<Quote>(`/api/quotes/${id}`), enabled: !!id })
  const [form, setForm] = useState<QuoteInput | null>(null)

  useEffect(() => {
    if (form) return
    if (id && existing.data) {
      const q = existing.data
      setForm({
        client_id: q.client_id,
        issue_date: q.issue_date,
        valid_until: q.valid_until,
        title: q.title,
        notes: q.notes,
        operation_category: q.operation_category,
        lines: q.lines.map((l) => ({ ...l, quantity: String(l.quantity), unit_price: String(l.unit_price), vat_rate: String(l.vat_rate) })),
      })
    } else if (!id && settings.data) {
      const s = settings.data.invoicing
      const d = today()
      setForm({
        client_id: Number(params.get('client')) || 0,
        issue_date: d,
        valid_until: addDays(d, s.quote_validity_days),
        title: '',
        notes: '',
        operation_category: s.default_operation_category,
        lines: [emptyLine(s.default_unit, s.vat_franchise ? '0' : String(s.default_vat_rate))],
      })
    }
  }, [id, existing.data, settings.data, form, params])

  const save = useMutation({
    mutationFn: async (finalize: boolean) => {
      const payload = { ...form!, lines: cleanLines(form!.lines) }
      const q = id ? await put<Quote>(`/api/quotes/${id}`, payload) : await post<Quote>('/api/quotes', payload)
      return finalize ? post<Quote>(`/api/quotes/${q.id}/finalize`) : q
    },
    onSuccess: (q, finalize) => {
      qc.invalidateQueries({ queryKey: ['quotes'] })
      qc.setQueryData(['quote', q.id], q)
      toast(finalize ? `Devis ${q.number} finalisé` : 'Brouillon enregistré')
      nav(`/devis/${q.id}`)
    },
  })

  if (!form || !settings.data) return <Spinner />
  if (existing.data?.number) return <ErrorBox error="Ce devis est finalisé : il ne peut plus être modifié. Duplique-le pour en faire une nouvelle version." />
  const set = <K extends keyof QuoteInput>(k: K, v: QuoteInput[K]) => setForm((f) => ({ ...f!, [k]: v }))
  const valid = form.client_id > 0 && cleanLines(form.lines).length > 0

  return (
    <>
      <PageHeader back={id ? { to: `/devis/${id}`, label: 'Retour' } : { to: '/devis', label: 'Devis' }} title={id ? 'Modifier le devis' : 'Nouveau devis'} />
      <div className="space-y-6">
        <ErrorBox error={save.error} />
        <Card title="Informations">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Client *">
              <ClientPicker value={form.client_id || null} onChange={(v) => set('client_id', v)} />
            </Field>
            <Field label="Objet">
              <Input value={form.title} onChange={(e) => set('title', e.target.value)} placeholder="Ex. Création d'un site vitrine" />
            </Field>
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <Field label="Date">
              <Input
                type="date"
                value={form.issue_date}
                onChange={(e) => setForm((f) => ({ ...f!, issue_date: e.target.value, valid_until: addDays(e.target.value, settings.data!.invoicing.quote_validity_days) }))}
              />
            </Field>
            <Field label="Valable jusqu'au">
              <Input type="date" value={form.valid_until} min={form.issue_date} onChange={(e) => set('valid_until', e.target.value)} />
            </Field>
            <Field label="Type d'opération">
              <Select value={form.operation_category} onChange={(e) => set('operation_category', e.target.value as QuoteInput['operation_category'])}>
                {Object.entries(OPERATION_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </Select>
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
          <Textarea value={form.notes} onChange={(e) => set('notes', e.target.value)} placeholder="Détails, planning, conditions particulières… (facultatif)" rows={4} />
        </Card>
        <div className="flex flex-wrap justify-end gap-2 pb-8">
          <Button variant="secondary" onClick={() => save.mutate(false)} loading={save.isPending && save.variables === false} disabled={!valid}>
            Enregistrer le brouillon
          </Button>
          <Button onClick={() => save.mutate(true)} loading={save.isPending && save.variables === true} disabled={!valid}>
            Finaliser (numéroter)
          </Button>
        </div>
      </div>
    </>
  )
}

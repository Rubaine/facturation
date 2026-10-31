import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Play, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ClientPicker } from '../components/ClientPicker'
import { InvoiceTable } from '../components/DocTables'
import { cleanLines, emptyLine, LinesEditor } from '../components/LinesEditor'
import { Button, Card, Checkbox, ErrorBox, Field, InfoBox, Input, PageHeader, Select, Spinner, Textarea, useToast } from '../components/ui'
import { del, get, post, put, type Invoice, type Recurring, type RecurringInput } from '../lib/api'
import { date, OPERATION_LABELS, today } from '../lib/format'
import { useSettings } from '../lib/hooks'

export default function RecurringEdit() {
  const { id } = useParams()
  const [params] = useSearchParams()
  const nav = useNavigate()
  const qc = useQueryClient()
  const toast = useToast()
  const settings = useSettings()
  const existing = useQuery({ queryKey: ['recurring', Number(id)], queryFn: () => get<Recurring>(`/api/recurring/${id}`), enabled: !!id })
  const preview = useQuery({
    queryKey: ['recurring-preview', Number(id)],
    queryFn: () => get<{ dates: string[]; next_title: string }>(`/api/recurring/${id}/preview`),
    enabled: !!id,
  })
  const invoices = useQuery({ queryKey: ['recurring-invoices', Number(id)], queryFn: () => get<Invoice[]>(`/api/recurring/${id}/invoices`), enabled: !!id })
  const [form, setForm] = useState<RecurringInput | null>(null)

  useEffect(() => {
    if (form) return
    if (id && existing.data) {
      const r = existing.data
      setForm({
        client_id: r.client_id,
        name: r.name,
        title_template: r.title_template,
        notes: r.notes,
        operation_category: r.operation_category,
        lines: r.lines.map((l) => ({ ...l, quantity: String(l.quantity), unit_price: String(l.unit_price), vat_rate: String(l.vat_rate) })),
        frequency_months: r.frequency_months,
        day_of_month: r.day_of_month,
        start_date: r.start_date,
        end_date: r.end_date,
        payment_terms_days: r.payment_terms_days,
        auto_send: r.auto_send,
        active: r.active,
      })
    } else if (!id && settings.data) {
      const s = settings.data.invoicing
      setForm({
        client_id: Number(params.get('client')) || 0,
        name: '',
        title_template: 'Hébergement Web - {Mois} {annee}',
        notes: '',
        operation_category: s.default_operation_category,
        lines: [{ ...emptyLine('mois', s.vat_franchise ? '0' : String(s.default_vat_rate)), description: '' }],
        frequency_months: 1,
        day_of_month: 1,
        start_date: today(),
        end_date: null,
        payment_terms_days: s.payment_terms_days,
        auto_send: true,
        active: true,
      })
    }
  }, [id, existing.data, settings.data, form, params])

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['recurring'] })
    qc.invalidateQueries({ queryKey: ['recurring-preview'] })
    qc.invalidateQueries({ queryKey: ['recurring-invoices'] })
    qc.invalidateQueries({ queryKey: ['invoices'] })
    qc.invalidateQueries({ queryKey: ['dashboard'] })
  }

  const save = useMutation({
    mutationFn: () => {
      const payload = { ...form!, lines: cleanLines(form!.lines) }
      return id ? put<Recurring>(`/api/recurring/${id}`, payload) : post<Recurring>('/api/recurring', payload)
    },
    onSuccess: (r) => {
      invalidate()
      qc.setQueryData(['recurring', r.id], r)
      toast(id ? 'Récurrence mise à jour' : `Récurrence créée : première facture le ${date(r.next_run_date)}`)
      if (!id) nav(`/recurrences/${r.id}`)
    },
  })
  const runNow = useMutation({
    mutationFn: () => post<Invoice>(`/api/recurring/${id}/run-now`),
    onSuccess: (inv) => {
      invalidate()
      toast(`Facture ${inv.number} générée${inv.sent_at ? ' et envoyée' : ''}`)
      nav(`/factures/${inv.id}`)
    },
    onError: (e) => toast(e.message, 'error'),
  })
  const remove = useMutation({
    mutationFn: () => del(`/api/recurring/${id}`),
    onSuccess: () => {
      invalidate()
      toast('Récurrence supprimée (les factures déjà émises sont conservées)')
      nav('/recurrences')
    },
  })

  if (!form || !settings.data) return <Spinner />
  const set = <K extends keyof RecurringInput>(k: K, v: RecurringInput[K]) => setForm((f) => ({ ...f!, [k]: v }))
  const valid = form.client_id > 0 && form.name.trim() && cleanLines(form.lines).length > 0
  const r = existing.data

  return (
    <>
      <PageHeader
        back={{ to: '/recurrences', label: 'Récurrences' }}
        title={id ? form.name || 'Récurrence' : 'Nouvelle facturation récurrente'}
        subtitle={r ? (r.active ? `Prochaine facture le ${date(r.next_run_date)} · ${r.generated_count} facture(s) générée(s)` : 'En pause') : undefined}
        actions={
          id && (
            <>
              <Button variant="danger" icon={<Trash2 className="h-4 w-4" />} onClick={() => confirm('Supprimer cette récurrence ? Les factures déjà émises sont conservées.') && remove.mutate()}>
                Supprimer
              </Button>
              <Button
                variant="secondary"
                icon={<Play className="h-4 w-4" />}
                loading={runNow.isPending}
                disabled={!r?.active}
                onClick={() =>
                  confirm(`Générer maintenant la facture de l'échéance du ${date(r?.next_run_date)}${r?.auto_send ? ' et l’envoyer au client' : ''} ?`) && runNow.mutate()
                }
              >
                Générer maintenant
              </Button>
            </>
          )
        }
      />
      <div className="space-y-6">
        <ErrorBox error={save.error} />
        {r?.last_error && <ErrorBox error={`Dernière erreur : ${r.last_error}`} />}
        <Card title="Modèle">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Client *">
              <ClientPicker value={form.client_id || null} onChange={(v) => set('client_id', v)} />
            </Field>
            <Field label="Nom interne *" hint="Pour t'y retrouver (ex. Hébergement GD Performance)">
              <Input value={form.name} onChange={(e) => set('name', e.target.value)} />
            </Field>
          </div>
          <Field
            className="mt-4"
            label="Objet des factures"
            hint={
              <>
                Variables : <code>{'{Mois}'}</code> (Novembre), <code>{'{mois}'}</code>, <code>{'{annee}'}</code>, <code>{'{Mois_precedent}'}</code>,{' '}
                <code>{'{periode}'}</code>.{preview.data && <> Prochaine : « {preview.data.next_title} »</>}
              </>
            }
          >
            <Input value={form.title_template} onChange={(e) => set('title_template', e.target.value)} />
          </Field>
        </Card>

        <Card title="Calendrier">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Fréquence">
              <Select value={form.frequency_months} onChange={(e) => set('frequency_months', Number(e.target.value))}>
                <option value={1}>Tous les mois</option>
                <option value={2}>Tous les 2 mois</option>
                <option value={3}>Tous les trimestres</option>
                <option value={6}>Tous les semestres</option>
                <option value={12}>Tous les ans</option>
              </Select>
            </Field>
            <Field label="Jour du mois" hint="Entre 1 et 28">
              <Input type="number" min={1} max={28} value={form.day_of_month} onChange={(e) => set('day_of_month', Math.min(28, Math.max(1, Number(e.target.value) || 1)))} />
            </Field>
            <Field label="À partir du">
              <Input type="date" value={form.start_date} onChange={(e) => set('start_date', e.target.value)} />
            </Field>
            <Field label="Jusqu'au (facultatif)">
              <Input type="date" value={form.end_date ?? ''} onChange={(e) => set('end_date', e.target.value || null)} />
            </Field>
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Délai de paiement (jours)" hint="0 = à réception">
              <Input type="number" min={0} max={120} value={form.payment_terms_days} onChange={(e) => set('payment_terms_days', Number(e.target.value) || 0)} />
            </Field>
            <Field label="Type d'opération">
              <Select value={form.operation_category} onChange={(e) => set('operation_category', e.target.value as RecurringInput['operation_category'])}>
                {Object.entries(OPERATION_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <div className="mt-5 space-y-3">
            <Checkbox
              label="Envoyer automatiquement la facture au client par mail"
              hint="Sinon, la facture est émise et tu l'envoies toi-même."
              checked={form.auto_send}
              onChange={(v) => set('auto_send', v)}
            />
            <Checkbox label="Récurrence active" hint="Décoche pour mettre en pause." checked={form.active} onChange={(v) => set('active', v)} />
          </div>
          {preview.data && preview.data.dates.length > 0 && (
            <div className="mt-4">
              <InfoBox>
                Prochaines échéances : {preview.data.dates.map(date).join(' · ')}. La période facturée correspond au mois de l'échéance.
              </InfoBox>
            </div>
          )}
        </Card>

        <Card title="Lignes facturées">
          <LinesEditor
            lines={form.lines}
            onChange={(lines) => set('lines', lines)}
            vatFranchise={settings.data.invoicing.vat_franchise}
            defaultUnit="mois"
            defaultVatRate={String(settings.data.invoicing.default_vat_rate)}
          />
        </Card>
        <Card title="Notes sur les factures">
          <Textarea value={form.notes} onChange={(e) => set('notes', e.target.value)} rows={2} placeholder="Facultatif" />
        </Card>
        <div className="flex justify-end">
          <Button onClick={() => save.mutate()} loading={save.isPending} disabled={!valid}>
            {id ? 'Enregistrer' : 'Créer la récurrence'}
          </Button>
        </div>

        {id && (
          <Card title="Factures générées">
            <div className="-m-5">
              {invoices.data?.length ? <InvoiceTable invoices={invoices.data} showClient={false} /> : <p className="p-5 text-sm text-slate-500">Aucune facture générée pour l'instant.</p>}
            </div>
          </Card>
        )}
        <div className="pb-8" />
      </div>
    </>
  )
}

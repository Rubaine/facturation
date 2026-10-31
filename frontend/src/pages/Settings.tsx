import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import clsx from 'clsx'
import { Save, Send } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { Badge, Button, Card, Checkbox, ErrorBox, Field, InfoBox, Input, PageHeader, Select, Spinner, Textarea, useToast } from '../components/ui'
import { get, post, put, type AppSettings, type CounterState, type EmailLog, type SystemInfo } from '../lib/api'
import { dateTime, OPERATION_LABELS } from '../lib/format'
import { useSettings } from '../lib/hooks'

const TABS = [
  { key: 'company', label: 'Entreprise' },
  { key: 'invoicing', label: 'Facturation' },
  { key: 'numbering', label: 'Numérotation' },
  { key: 'emails', label: 'Emails' },
] as const
type Tab = (typeof TABS)[number]['key']

export default function Settings() {
  const { data } = useSettings()
  const [tab, setTab] = useState<Tab>('company')
  const [form, setForm] = useState<AppSettings | null>(null)
  const qc = useQueryClient()
  const toast = useToast()
  useEffect(() => {
    if (data && !form) setForm(structuredClone(data))
  }, [data, form])

  const save = useMutation({
    mutationFn: () => put<AppSettings>('/api/settings', form),
    onSuccess: (s) => {
      qc.setQueryData(['settings'], s)
      qc.invalidateQueries({ queryKey: ['counters'] })
      toast('Paramètres enregistrés')
    },
  })

  if (!form) return <Spinner />
  const upd = <S extends keyof AppSettings>(section: S, patch: Partial<AppSettings[S]>) =>
    setForm((f) => ({ ...f!, [section]: { ...f![section], ...patch } }))

  return (
    <>
      <PageHeader
        title="Paramètres"
        actions={
          <Button icon={<Save className="h-4 w-4" />} loading={save.isPending} onClick={() => save.mutate()}>
            Enregistrer
          </Button>
        }
      />
      <div className="mb-5 flex gap-1 overflow-x-auto border-b border-slate-200">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={clsx(
              '-mb-px whitespace-nowrap border-b-2 px-4 py-2 text-sm font-medium',
              tab === t.key ? 'border-brand-700 text-brand-800' : 'border-transparent text-slate-500 hover:text-slate-800',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="space-y-6">
        <ErrorBox error={save.error} />
        {tab === 'company' && <CompanyTab form={form} upd={upd} />}
        {tab === 'invoicing' && <InvoicingTab form={form} upd={upd} />}
        {tab === 'numbering' && <NumberingTab form={form} upd={upd} />}
        {tab === 'emails' && <EmailsTab form={form} setForm={setForm} />}
      </div>
    </>
  )
}

type Upd = <S extends keyof AppSettings>(section: S, patch: Partial<AppSettings[S]>) => void

function Grid({ children, cols = 2 }: { children: ReactNode; cols?: 2 | 3 | 4 }) {
  return <div className={clsx('grid gap-4', cols === 2 && 'sm:grid-cols-2', cols === 3 && 'sm:grid-cols-3', cols === 4 && 'sm:grid-cols-2 lg:grid-cols-4')}>{children}</div>
}

function CompanyTab({ form, upd }: { form: AppSettings; upd: Upd }) {
  const c = form.company
  const set = (k: keyof AppSettings['company']) => (e: { target: { value: string } }) => upd('company', { [k]: e.target.value })
  return (
    <>
      <Card title="Identité">
        <div className="space-y-4">
          <Grid cols={3}>
            <Field label="Nom (tel qu'au répertoire SIRENE)">
              <Input value={c.name} onChange={set('name')} />
            </Field>
            <Field label="Forme juridique" hint="« EI » ou « Entrepreneur individuel » est obligatoire">
              <Input value={c.legal_form} onChange={set('legal_form')} />
            </Field>
            <Field label="Code APE">
              <Input value={c.ape} onChange={set('ape')} />
            </Field>
          </Grid>
          <Grid cols={3}>
            <Field label="SIRET">
              <Input value={c.siret} onChange={set('siret')} />
            </Field>
            <Field label="SIREN">
              <Input value={c.siren} onChange={set('siren')} />
            </Field>
            <Field label="N° TVA intracommunautaire" hint="Sert d'identifiant fiscal dans la facture électronique">
              <Input value={c.vat_number} onChange={set('vat_number')} />
            </Field>
          </Grid>
          <Field label="Mention d'immatriculation (facultatif)" hint="Ex. « Dispensé d'immatriculation au RCS et au RM »">
            <Input value={c.registration} onChange={set('registration')} />
          </Field>
        </div>
      </Card>
      <Card title="Coordonnées">
        <div className="space-y-4">
          <Grid>
            <Field label="Adresse">
              <Input value={c.address_line1} onChange={set('address_line1')} />
            </Field>
            <Field label="Complément">
              <Input value={c.address_line2} onChange={set('address_line2')} />
            </Field>
          </Grid>
          <Grid cols={3}>
            <Field label="Code postal">
              <Input value={c.postal_code} onChange={set('postal_code')} />
            </Field>
            <Field label="Ville">
              <Input value={c.city} onChange={set('city')} />
            </Field>
            <Field label="Pays">
              <Input value={c.country} onChange={set('country')} maxLength={2} />
            </Field>
          </Grid>
          <Grid cols={3}>
            <Field label="Email (affiché sur les documents)">
              <Input value={c.email} onChange={set('email')} />
            </Field>
            <Field label="Téléphone">
              <Input value={c.phone} onChange={set('phone')} />
            </Field>
            <Field label="Site web">
              <Input value={c.website} onChange={set('website')} />
            </Field>
          </Grid>
          <Field label="Logo (facultatif)" hint="PNG ou JPG, idéalement < 200 Ko. Affiché en haut des documents.">
            <div className="flex items-center gap-3">
              {c.logo_data_url && <img src={c.logo_data_url} alt="Logo" className="h-12 max-w-[160px] rounded border border-slate-200 object-contain p-1" />}
              <input
                type="file"
                accept="image/png,image/jpeg"
                className="text-sm"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (!file) return
                  const reader = new FileReader()
                  reader.onload = () => upd('company', { logo_data_url: String(reader.result) })
                  reader.readAsDataURL(file)
                }}
              />
              {c.logo_data_url && (
                <Button variant="ghost" size="sm" onClick={() => upd('company', { logo_data_url: '' })}>
                  Retirer
                </Button>
              )}
            </div>
          </Field>
        </div>
      </Card>
      <Card title="Coordonnées bancaires">
        <Grid cols={3}>
          <Field label="Banque">
            <Input value={form.bank.bank_name} onChange={(e) => upd('bank', { bank_name: e.target.value })} />
          </Field>
          <Field label="IBAN">
            <Input value={form.bank.iban} onChange={(e) => upd('bank', { iban: e.target.value })} />
          </Field>
          <Field label="BIC">
            <Input value={form.bank.bic} onChange={(e) => upd('bank', { bic: e.target.value })} />
          </Field>
        </Grid>
      </Card>
    </>
  )
}

function InvoicingTab({ form, upd }: { form: AppSettings; upd: Upd }) {
  const i = form.invoicing
  return (
    <>
      <Card title="TVA">
        <div className="space-y-4">
          <Checkbox
            label="Franchise en base de TVA (micro-entreprise sous les seuils)"
            hint="Aucune TVA facturée ; la mention ci-dessous est ajoutée sur chaque document."
            checked={i.vat_franchise}
            onChange={(v) => upd('invoicing', { vat_franchise: v })}
          />
          {i.vat_franchise ? (
            <Field label="Mention">
              <Input value={i.vat_franchise_mention} onChange={(e) => upd('invoicing', { vat_franchise_mention: e.target.value })} />
            </Field>
          ) : (
            <Field label="Taux de TVA par défaut (%)">
              <Input className="max-w-[120px]" value={i.default_vat_rate} onChange={(e) => upd('invoicing', { default_vat_rate: e.target.value })} />
            </Field>
          )}
        </div>
      </Card>
      <Card title="Valeurs par défaut">
        <Grid cols={4}>
          <Field label="Délai de paiement (jours)" hint="0 = comptant">
            <Input type="number" min={0} value={i.payment_terms_days} onChange={(e) => upd('invoicing', { payment_terms_days: Number(e.target.value) || 0 })} />
          </Field>
          <Field label="Validité des devis (jours)">
            <Input type="number" min={1} value={i.quote_validity_days} onChange={(e) => upd('invoicing', { quote_validity_days: Number(e.target.value) || 30 })} />
          </Field>
          <Field label="Type d'opération">
            <Select value={i.default_operation_category} onChange={(e) => upd('invoicing', { default_operation_category: e.target.value as AppSettings['invoicing']['default_operation_category'] })}>
              {Object.entries(OPERATION_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Unité par défaut">
            <Input value={i.default_unit} onChange={(e) => upd('invoicing', { default_unit: e.target.value })} />
          </Field>
        </Grid>
        <div className="mt-4">
          <Field label="Mode de paiement affiché">
            <Input value={i.payment_method_text} onChange={(e) => upd('invoicing', { payment_method_text: e.target.value })} />
          </Field>
        </div>
      </Card>
      <Card title="Mentions légales des factures">
        <div className="space-y-4">
          <Field label="Pénalités de retard (obligatoire)">
            <Textarea rows={2} value={i.late_penalty_text} onChange={(e) => upd('invoicing', { late_penalty_text: e.target.value })} />
          </Field>
          <Field label="Indemnité forfaitaire de recouvrement (obligatoire, clients pros)">
            <Textarea rows={2} value={i.recovery_fee_text} onChange={(e) => upd('invoicing', { recovery_fee_text: e.target.value })} />
          </Field>
          <Field label="Escompte (obligatoire)">
            <Input value={i.discount_text} onChange={(e) => upd('invoicing', { discount_text: e.target.value })} />
          </Field>
          <Field label="Texte libre en pied de page">
            <Textarea rows={2} value={i.footer_extra} onChange={(e) => upd('invoicing', { footer_extra: e.target.value })} />
          </Field>
          <Field label="Conditions des devis">
            <Textarea rows={2} value={i.quote_terms} onChange={(e) => upd('invoicing', { quote_terms: e.target.value })} />
          </Field>
        </div>
      </Card>
      <Card title="Seuils affichés sur le tableau de bord">
        <Grid>
          <Field label="Seuil de franchise de TVA (€)">
            <Input value={form.thresholds.vat_franchise_threshold} onChange={(e) => upd('thresholds', { vat_franchise_threshold: e.target.value })} />
          </Field>
          <Field label="Plafond de CA micro-entreprise (€)">
            <Input value={form.thresholds.micro_ceiling} onChange={(e) => upd('thresholds', { micro_ceiling: e.target.value })} />
          </Field>
        </Grid>
      </Card>
    </>
  )
}

const KIND_LABELS = { invoice: 'Factures', credit_note: 'Avoirs', quote: 'Devis' } as const

function NumberingTab({ form, upd }: { form: AppSettings; upd: Upd }) {
  const qc = useQueryClient()
  const toast = useToast()
  const counters = useQuery({ queryKey: ['counters'], queryFn: () => get<CounterState[]>('/api/settings/counters') })
  const [edits, setEdits] = useState<Record<string, string>>({})
  const setCounter = useMutation({
    mutationFn: (p: { kind: string; next_value: number }) => put<CounterState[]>('/api/settings/counters', p),
    onSuccess: (data) => {
      qc.setQueryData(['counters'], data)
      setEdits({})
      toast('Compteur mis à jour')
    },
    onError: (e) => toast(e.message, 'error'),
  })
  const n = form.numbering
  return (
    <>
      <InfoBox>
        Variables : <code>{'{AAAA}'}</code> année (2026), <code>{'{AA}'}</code> année courte (26), <code>{'{MM}'}</code> mois, <code>{'{N}'}</code> numéro
        (obligatoire). La loi impose une numérotation <strong>continue et chronologique</strong> : le numéro n'est attribué qu'à l'émission. Pense à
        enregistrer les formats avant de modifier les compteurs.
      </InfoBox>
      {(['invoice', 'credit_note', 'quote'] as const).map((kind) => {
        const counter = counters.data?.find((c) => c.kind === kind)
        return (
          <Card key={kind} title={KIND_LABELS[kind]}>
            <Grid cols={4}>
              <Field label="Format">
                <Input value={n[`${kind}_pattern`]} onChange={(e) => upd('numbering', { [`${kind}_pattern`]: e.target.value })} />
              </Field>
              <Field label="Remise à 1 du compteur">
                <Select value={n[`${kind}_reset`]} onChange={(e) => upd('numbering', { [`${kind}_reset`]: e.target.value })}>
                  <option value="never">Jamais (suite continue)</option>
                  <option value="yearly">Chaque année</option>
                  <option value="monthly">Chaque mois</option>
                </Select>
              </Field>
              <Field label="Chiffres minimum">
                <Input type="number" min={1} max={6} value={n[`${kind}_padding`]} onChange={(e) => upd('numbering', { [`${kind}_padding`]: Number(e.target.value) || 1 })} />
              </Field>
              <Field label="Prochain numéro" hint={counter ? `Aperçu : ${counter.preview}` : undefined}>
                <div className="flex gap-2">
                  <Input
                    type="number"
                    min={1}
                    value={edits[kind] ?? counter?.next_value ?? ''}
                    onChange={(e) => setEdits({ ...edits, [kind]: e.target.value })}
                  />
                  {edits[kind] !== undefined && (
                    <Button size="sm" onClick={() => setCounter.mutate({ kind, next_value: Number(edits[kind]) })} loading={setCounter.isPending}>
                      OK
                    </Button>
                  )}
                </div>
              </Field>
            </Grid>
          </Card>
        )
      })}
    </>
  )
}

const TEMPLATE_LABELS: Record<string, string> = {
  invoice: 'Envoi de facture',
  quote: 'Envoi de devis',
  credit_note: "Envoi d'avoir",
  reminder: 'Relance de facture impayée',
}

function EmailsTab({ form, setForm }: { form: AppSettings; setForm: (f: AppSettings) => void }) {
  const toast = useToast()
  const system = useQuery({ queryKey: ['system'], queryFn: () => get<SystemInfo>('/api/settings/system') })
  const logs = useQuery({ queryKey: ['email-logs'], queryFn: () => get<EmailLog[]>('/api/settings/email-logs?limit=30') })
  const [testTo, setTestTo] = useState(form.company.email)
  const test = useMutation({
    mutationFn: () => post<{ status: string }>('/api/settings/test-email', { to: testTo }),
    onSuccess: (r) => {
      logs.refetch()
      toast(r.status === 'sent' ? 'Mail de test envoyé' : 'SMTP non configuré : mail écrit dans data/outbox', r.status === 'sent' ? 'success' : 'info')
    },
    onError: (e) => toast(e.message, 'error'),
  })
  const setTpl = (key: string, patch: Partial<{ subject: string; body: string }>) =>
    setForm({ ...form, emails: { ...form.emails, [key]: { ...form.emails[key], ...patch } } })

  return (
    <>
      <Card title="Configuration d'envoi">
        {system.data && (
          <div className="space-y-3 text-sm">
            <div className="flex items-center gap-2">
              Statut SMTP :{' '}
              {system.data.smtp_configured ? <Badge tone="green">Configuré ({system.data.smtp_user})</Badge> : <Badge tone="amber">Non configuré</Badge>}
            </div>
            {!system.data.smtp_configured && (
              <InfoBox tone="warning">
                Renseigne <code>SMTP_USER</code> et <code>SMTP_PASSWORD</code> (mot de passe d'application Gmail) dans le fichier <code>.env</code> du serveur, puis
                redémarre l'application. En attendant, les mails sont enregistrés dans <code>data/outbox</code>.
              </InfoBox>
            )}
            <div className="text-slate-600">
              Factures récurrentes traitées chaque jour à <strong>{system.data.scheduler_time}</strong> · URL publique : <code>{system.data.public_url}</code>
            </div>
            <div className="flex flex-wrap items-end gap-2">
              <Field label="Envoyer un mail de test à" className="min-w-[240px] flex-1">
                <Input value={testTo} onChange={(e) => setTestTo(e.target.value)} />
              </Field>
              <Button variant="secondary" icon={<Send className="h-4 w-4" />} loading={test.isPending} onClick={() => test.mutate()}>
                Tester
              </Button>
            </div>
          </div>
        )}
      </Card>
      <InfoBox>
        Les mails partent en HTML mis en forme : ton texte est complété automatiquement par un récapitulatif (n°, montant, échéance), les
        coordonnées bancaires (factures et relances), un bouton « Consulter et accepter » (devis) et ton logo s'il est défini. Inutile donc
        d'écrire l'IBAN dans le texte. Utilise « Aperçu du mail » dans la fenêtre d'envoi pour voir le rendu.
      </InfoBox>
      <InfoBox>
        Variables disponibles : <code>{'{numero}'}</code> <code>{'{titre}'}</code> <code>{'{montant}'}</code> <code>{'{echeance}'}</code> <code>{'{validite}'}</code>{' '}
        <code>{'{date}'}</code> <code>{'{client}'}</code> <code>{'{client_contact}'}</code> <code>{'{entreprise}'}</code> <code>{'{email_entreprise}'}</code>{' '}
        <code>{'{iban}'}</code> <code>{'{bic}'}</code> <code>{'{lien}'}</code> (devis) <code>{'{facture_origine}'}</code> (avoir).
      </InfoBox>
      {Object.keys(TEMPLATE_LABELS).map((key) => (
        <Card key={key} title={TEMPLATE_LABELS[key]}>
          <div className="space-y-3">
            <Field label="Objet">
              <Input value={form.emails[key]?.subject ?? ''} onChange={(e) => setTpl(key, { subject: e.target.value })} />
            </Field>
            <Field label="Message">
              <Textarea rows={8} value={form.emails[key]?.body ?? ''} onChange={(e) => setTpl(key, { body: e.target.value })} />
            </Field>
          </div>
        </Card>
      ))}
      <Card title="Derniers mails">
        {logs.data?.length ? (
          <ul className="divide-y divide-slate-100 text-sm">
            {logs.data.map((l) => (
              <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <div className="min-w-0">
                  <div className="truncate font-medium">{l.subject}</div>
                  <div className="truncate text-xs text-slate-500">
                    → {l.to} · {dateTime(l.created_at)}
                  </div>
                  {l.error && <div className="text-xs text-red-600">{l.error}</div>}
                </div>
                <Badge tone={l.status === 'sent' ? 'green' : l.status === 'outbox' ? 'amber' : 'red'}>
                  {l.status === 'sent' ? 'Envoyé' : l.status === 'outbox' ? 'Outbox' : 'Échec'}
                </Badge>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-500">Aucun mail envoyé pour l'instant.</p>
        )}
      </Card>
    </>
  )
}

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { post, put, type Client, type ClientInput } from '../lib/api'
import { Button, ErrorBox, Field, Input, Modal, Select, Textarea, useToast } from './ui'

export const emptyClient: ClientInput = {
  kind: 'company',
  name: '',
  contact_name: '',
  email: '',
  cc_emails: '',
  phone: '',
  address_line1: '',
  address_line2: '',
  postal_code: '',
  city: '',
  country: 'FR',
  siren: '',
  siret: '',
  vat_number: '',
  notes: '',
  archived: false,
}

export function ClientFormModal({ open, onClose, client, onSaved }: { open: boolean; onClose: () => void; client?: Client | null; onSaved?: (c: Client) => void }) {
  return open ? <ClientFormInner onClose={onClose} client={client} onSaved={onSaved} /> : null
}

function ClientFormInner({ onClose, client, onSaved }: { onClose: () => void; client?: Client | null; onSaved?: (c: Client) => void }) {
  const [data, setData] = useState<ClientInput>(() => (client ? { ...emptyClient, ...client } : emptyClient))
  const qc = useQueryClient()
  const toast = useToast()
  const set = <K extends keyof ClientInput>(k: K, v: ClientInput[K]) => setData((d) => ({ ...d, [k]: v }))

  const save = useMutation({
    mutationFn: () => (client ? put<Client>(`/api/clients/${client.id}`, data) : post<Client>('/api/clients', data)),
    onSuccess: (c) => {
      qc.invalidateQueries({ queryKey: ['clients'] })
      qc.invalidateQueries({ queryKey: ['client', c.id] })
      toast(client ? 'Client mis à jour' : 'Client créé')
      onSaved?.(c)
      onClose()
    },
  })

  const isCompany = data.kind === 'company'
  return (
    <Modal
      open
      onClose={onClose}
      wide
      title={client ? `Modifier ${client.name}` : 'Nouveau client'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Annuler
          </Button>
          <Button loading={save.isPending} onClick={() => save.mutate()} disabled={!data.name.trim()}>
            Enregistrer
          </Button>
        </>
      }
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          save.mutate()
        }}
      >
        <ErrorBox error={save.error} />
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Type">
            <Select value={data.kind} onChange={(e) => set('kind', e.target.value as ClientInput['kind'])}>
              <option value="company">Professionnel (entreprise, micro…)</option>
              <option value="individual">Particulier</option>
            </Select>
          </Field>
          <Field label={isCompany ? 'Raison sociale *' : 'Nom et prénom *'} className="sm:col-span-2">
            <Input value={data.name} onChange={(e) => set('name', e.target.value)} autoFocus />
          </Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          {isCompany && (
            <Field label="Contact">
              <Input value={data.contact_name} onChange={(e) => set('contact_name', e.target.value)} placeholder="M. Dupont" />
            </Field>
          )}
          <Field label="Email (envoi des factures)">
            <Input type="email" value={data.email} onChange={(e) => set('email', e.target.value)} />
          </Field>
          <Field label="Téléphone">
            <Input value={data.phone} onChange={(e) => set('phone', e.target.value)} />
          </Field>
        </div>
        <Field label="Emails en copie" hint="Facultatif, séparés par des virgules (ex. compta@client.fr)">
          <Input value={data.cc_emails} onChange={(e) => set('cc_emails', e.target.value)} />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Adresse *">
            <Input value={data.address_line1} onChange={(e) => set('address_line1', e.target.value)} />
          </Field>
          <Field label="Complément d'adresse">
            <Input value={data.address_line2} onChange={(e) => set('address_line2', e.target.value)} />
          </Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-4">
          <Field label="Code postal *">
            <Input value={data.postal_code} onChange={(e) => set('postal_code', e.target.value)} />
          </Field>
          <Field label="Ville *" className="sm:col-span-2">
            <Input value={data.city} onChange={(e) => set('city', e.target.value)} />
          </Field>
          <Field label="Pays (code)">
            <Input value={data.country} maxLength={2} onChange={(e) => set('country', e.target.value.toUpperCase())} />
          </Field>
        </div>
        {isCompany && (
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="SIRET" hint="Le SIREN est obligatoire sur les factures B2B depuis la réforme">
              <Input value={data.siret} onChange={(e) => set('siret', e.target.value)} placeholder="14 chiffres" />
            </Field>
            <Field label="SIREN">
              <Input value={data.siren} onChange={(e) => set('siren', e.target.value)} placeholder="Déduit du SIRET si vide" />
            </Field>
            <Field label="N° TVA intracommunautaire">
              <Input value={data.vat_number} onChange={(e) => set('vat_number', e.target.value)} />
            </Field>
          </div>
        )}
        <Field label="Notes internes">
          <Textarea value={data.notes} onChange={(e) => set('notes', e.target.value)} rows={2} />
        </Field>
        <button type="submit" className="hidden" />
      </form>
    </Modal>
  )
}

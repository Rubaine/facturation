import { Plus } from 'lucide-react'
import { useState } from 'react'
import { useClients } from '../lib/hooks'
import { ClientFormModal } from './ClientForm'
import { Button, Select } from './ui'

export function ClientPicker({ value, onChange, disabled }: { value: number | null; onChange: (id: number) => void; disabled?: boolean }) {
  const { data: clients = [] } = useClients()
  const [creating, setCreating] = useState(false)
  return (
    <div className="flex gap-2">
      <Select value={value ?? ''} onChange={(e) => onChange(Number(e.target.value))} disabled={disabled}>
        <option value="" disabled>
          Choisir un client…
        </option>
        {clients.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
            {c.city ? ` (${c.city})` : ''}
          </option>
        ))}
      </Select>
      {!disabled && (
        <Button variant="secondary" icon={<Plus className="h-4 w-4" />} onClick={() => setCreating(true)} title="Nouveau client">
          <span className="hidden sm:inline">Nouveau</span>
        </Button>
      )}
      <ClientFormModal open={creating} onClose={() => setCreating(false)} onSaved={(c) => onChange(c.id)} />
    </div>
  )
}

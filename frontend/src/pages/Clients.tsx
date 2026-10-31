import { Building2, Plus, Search, User, Users } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ClientFormModal } from '../components/ClientForm'
import { Badge, Button, Card, Checkbox, EmptyState, Input, PageHeader, Spinner, Table, Td, Th } from '../components/ui'
import { useClients } from '../lib/hooks'

export default function Clients() {
  const [showArchived, setShowArchived] = useState(false)
  const { data: clients, isLoading } = useClients(showArchived)
  const [creating, setCreating] = useState(false)
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    const s = search.toLowerCase().trim()
    return (clients ?? []).filter((c) => !s || [c.name, c.contact_name, c.email, c.city, c.siret].some((v) => v.toLowerCase().includes(s)))
  }, [clients, search])

  return (
    <>
      <PageHeader
        title="Clients"
        subtitle={clients ? `${clients.length} client(s)` : undefined}
        actions={
          <Button icon={<Plus className="h-4 w-4" />} onClick={() => setCreating(true)}>
            Nouveau client
          </Button>
        }
      />
      <Card className="overflow-hidden" >
        <div className="-m-5">
          <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 p-4">
            <div className="relative min-w-[200px] flex-1">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <Input className="pl-9" placeholder="Rechercher…" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <Checkbox label="Afficher les archivés" checked={showArchived} onChange={setShowArchived} />
          </div>
          {isLoading ? (
            <Spinner />
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={<Users className="h-6 w-6" />}
              title={search ? 'Aucun résultat' : 'Aucun client pour le moment'}
              action={!search && <Button onClick={() => setCreating(true)}>Ajouter mon premier client</Button>}
            />
          ) : (
            <Table>
              <thead className="bg-slate-50">
                <tr>
                  <Th>Nom</Th>
                  <Th className="hidden md:table-cell">Email</Th>
                  <Th className="hidden sm:table-cell">Ville</Th>
                  <Th className="hidden lg:table-cell">SIRET</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50">
                    <Td>
                      <Link to={`/clients/${c.id}`} className="flex items-center gap-2.5 font-medium text-slate-900 hover:text-brand-700">
                        {c.kind === 'company' ? <Building2 className="h-4 w-4 text-slate-400" /> : <User className="h-4 w-4 text-slate-400" />}
                        <span>
                          {c.name}
                          {c.contact_name && <span className="block text-xs font-normal text-slate-500">{c.contact_name}</span>}
                        </span>
                        {c.archived && <Badge>Archivé</Badge>}
                      </Link>
                    </Td>
                    <Td className="hidden text-slate-600 md:table-cell">{c.email || '—'}</Td>
                    <Td className="hidden text-slate-600 sm:table-cell">{c.city || '—'}</Td>
                    <Td className="hidden font-mono text-xs text-slate-500 lg:table-cell">{c.siret || '—'}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </div>
      </Card>
      <ClientFormModal open={creating} onClose={() => setCreating(false)} />
    </>
  )
}

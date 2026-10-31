import { useQuery } from '@tanstack/react-query'
import { get, type AppSettings, type Client } from './api'

export function useSettings() {
  return useQuery({ queryKey: ['settings'], queryFn: () => get<AppSettings>('/api/settings'), staleTime: 60_000 })
}

export function useClients(includeArchived = false) {
  return useQuery({
    queryKey: ['clients', { includeArchived }],
    queryFn: () => get<Client[]>(`/api/clients${includeArchived ? '?include_archived=true' : ''}`),
  })
}

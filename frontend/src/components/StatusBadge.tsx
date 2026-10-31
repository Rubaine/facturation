import type { Invoice, Quote } from '../lib/api'
import { Badge } from './ui'

export function InvoiceStatusBadge({ invoice }: { invoice: Pick<Invoice, 'status' | 'is_overdue' | 'kind' | 'sent_at'> }) {
  if (invoice.status === 'draft') return <Badge tone="gray">Brouillon</Badge>
  if (invoice.kind === 'credit_note') return <Badge tone="purple">Avoir émis</Badge>
  if (invoice.status === 'paid') return <Badge tone="green">Payée</Badge>
  if (invoice.status === 'cancelled') return <Badge tone="purple">Annulée (avoir)</Badge>
  if (invoice.is_overdue) return <Badge tone="red">En retard</Badge>
  return <Badge tone="blue">{invoice.sent_at ? 'Envoyée' : 'Émise'}</Badge>
}

export function QuoteStatusBadge({ quote }: { quote: Pick<Quote, 'status' | 'is_expired' | 'number'> }) {
  if (quote.status === 'draft') return <Badge tone="gray">{quote.number ? 'Finalisé' : 'Brouillon'}</Badge>
  if (quote.status === 'sent') return quote.is_expired ? <Badge tone="amber">Expiré</Badge> : <Badge tone="blue">Envoyé</Badge>
  if (quote.status === 'accepted') return <Badge tone="green">Accepté</Badge>
  if (quote.status === 'refused') return <Badge tone="red">Refusé</Badge>
  return <Badge tone="purple">Facturé</Badge>
}

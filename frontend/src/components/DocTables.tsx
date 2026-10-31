import { Repeat } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { Invoice, Quote } from '../lib/api'
import { date, money } from '../lib/format'
import { InvoiceStatusBadge, QuoteStatusBadge } from './StatusBadge'
import { Table, Td, Th } from './ui'

export function InvoiceTable({ invoices, showClient = true }: { invoices: Invoice[]; showClient?: boolean }) {
  return (
    <Table>
      <thead className="bg-slate-50">
        <tr>
          <Th>Numéro</Th>
          {showClient && <Th>Client</Th>}
          <Th className="hidden md:table-cell">Objet</Th>
          <Th className="hidden sm:table-cell">Date</Th>
          <Th className="hidden lg:table-cell">Échéance</Th>
          <Th className="text-right">Montant</Th>
          <Th>Statut</Th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100">
        {invoices.map((i) => (
          <tr key={i.id} className="hover:bg-slate-50">
            <Td>
              <Link to={`/factures/${i.id}`} className="flex items-center gap-1.5 font-medium text-brand-800 hover:underline">
                {i.kind === 'credit_note' && <span className="text-xs text-violet-600">AVOIR</span>}
                {i.number ?? <span className="italic text-slate-500">Brouillon</span>}
                {i.recurring_id && <Repeat className="h-3.5 w-3.5 text-slate-400" aria-label="Récurrente" />}
              </Link>
            </Td>
            {showClient && <Td className="max-w-[180px] truncate">{i.client_name}</Td>}
            <Td className="hidden max-w-[240px] truncate text-slate-600 md:table-cell">{i.title || '—'}</Td>
            <Td className="hidden text-slate-600 sm:table-cell">{date(i.issue_date)}</Td>
            <Td className={`hidden lg:table-cell ${i.is_overdue ? 'font-medium text-red-600' : 'text-slate-600'}`}>
              {i.kind === 'invoice' ? date(i.due_date) : '—'}
            </Td>
            <Td className="whitespace-nowrap text-right font-semibold">{i.kind === 'credit_note' ? '−' : ''}{money(i.total_ttc)}</Td>
            <Td>
              <InvoiceStatusBadge invoice={i} />
            </Td>
          </tr>
        ))}
      </tbody>
    </Table>
  )
}

export function QuoteTable({ quotes, showClient = true }: { quotes: Quote[]; showClient?: boolean }) {
  return (
    <Table>
      <thead className="bg-slate-50">
        <tr>
          <Th>Numéro</Th>
          {showClient && <Th>Client</Th>}
          <Th className="hidden md:table-cell">Objet</Th>
          <Th className="hidden sm:table-cell">Date</Th>
          <Th className="hidden lg:table-cell">Validité</Th>
          <Th className="text-right">Montant</Th>
          <Th>Statut</Th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100">
        {quotes.map((q) => (
          <tr key={q.id} className="hover:bg-slate-50">
            <Td>
              <Link to={`/devis/${q.id}`} className="font-medium text-brand-800 hover:underline">
                {q.number ?? <span className="italic text-slate-500">Brouillon</span>}
              </Link>
            </Td>
            {showClient && <Td className="max-w-[180px] truncate">{q.client_name}</Td>}
            <Td className="hidden max-w-[240px] truncate text-slate-600 md:table-cell">{q.title || '—'}</Td>
            <Td className="hidden text-slate-600 sm:table-cell">{date(q.issue_date)}</Td>
            <Td className="hidden text-slate-600 lg:table-cell">{date(q.valid_until)}</Td>
            <Td className="whitespace-nowrap text-right font-semibold">{money(q.total_ttc)}</Td>
            <Td>
              <QuoteStatusBadge quote={q} />
            </Td>
          </tr>
        ))}
      </tbody>
    </Table>
  )
}

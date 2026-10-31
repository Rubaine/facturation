// Client HTTP et types de l'API FastAPI.

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

function extractMessage(data: unknown, fallback: string): string {
  if (data && typeof data === 'object' && 'detail' in data) {
    const detail = (data as { detail: unknown }).detail
    if (typeof detail === 'string') return detail
    if (Array.isArray(detail)) {
      return detail
        .map((d: { loc?: (string | number)[]; msg?: string }) => {
          const field = d.loc?.filter((x) => x !== 'body').join(' › ')
          return field ? `${field} : ${d.msg}` : d.msg
        })
        .join('\n')
    }
  }
  return fallback
}

export async function api<T>(path: string, options: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, headers, ...rest } = options
  const res = await fetch(path, {
    credentials: 'same-origin',
    ...rest,
    headers: {
      ...(json !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...headers,
    },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  })
  if (res.status === 401 && !path.startsWith('/api/auth/') && !path.startsWith('/api/public/')) {
    window.dispatchEvent(new Event('auth:logout'))
  }
  if (!res.ok) {
    let data: unknown = null
    try {
      data = await res.json()
    } catch {
      /* corps non JSON */
    }
    throw new ApiError(res.status, extractMessage(data, `Erreur ${res.status}`))
  }
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

export const get = <T>(path: string) => api<T>(path)
export const post = <T>(path: string, json: unknown = {}) => api<T>(path, { method: 'POST', json })
export const put = <T>(path: string, json: unknown) => api<T>(path, { method: 'PUT', json })
export const del = (path: string) => api<void>(path, { method: 'DELETE' })

// ------------------------------------------------------------------ types
export type OperationCategory = 'services' | 'goods' | 'mixed'

export interface Line {
  description: string
  details: string
  quantity: string
  unit: string
  unit_price: string
  vat_rate: string
  total_ht?: string
}

export interface Client {
  id: number
  kind: 'company' | 'individual'
  name: string
  contact_name: string
  email: string
  cc_emails: string
  phone: string
  address_line1: string
  address_line2: string
  postal_code: string
  city: string
  country: string
  siren: string
  siret: string
  vat_number: string
  notes: string
  archived: boolean
  created_at: string
}
export type ClientInput = Omit<Client, 'id' | 'created_at'>

export interface ClientStats {
  invoiced_total: string
  paid_total: string
  unpaid_total: string
  invoice_count: number
  quote_count: number
}

export type QuoteStatus = 'draft' | 'sent' | 'accepted' | 'refused' | 'invoiced'
export interface Quote {
  id: number
  number: string | null
  status: QuoteStatus
  client_id: number
  client_name: string
  issue_date: string
  valid_until: string
  title: string
  notes: string
  operation_category: OperationCategory
  lines: Line[]
  total_ht: string
  total_vat: string
  total_ttc: string
  vat_franchise: boolean
  public_token: string | null
  finalized_at: string | null
  sent_at: string | null
  accepted_at: string | null
  accepted_by: string
  refused_at: string | null
  invoice_id: number | null
  is_expired: boolean
  created_at: string
}
export interface QuoteInput {
  client_id: number
  issue_date: string
  valid_until: string
  title: string
  notes: string
  operation_category: OperationCategory
  lines: Line[]
}

export type InvoiceStatus = 'draft' | 'issued' | 'paid' | 'cancelled'
export interface Invoice {
  id: number
  number: string | null
  kind: 'invoice' | 'credit_note'
  status: InvoiceStatus
  client_id: number
  client_name: string
  issue_date: string
  due_date: string
  service_start: string | null
  service_end: string | null
  operation_category: OperationCategory
  title: string
  notes: string
  lines: Line[]
  total_ht: string
  total_vat: string
  total_ttc: string
  vat_franchise: boolean
  quote_id: number | null
  quote_number: string | null
  recurring_id: number | null
  credit_note_of_id: number | null
  credit_note_of_number: string | null
  credit_note_ids: number[]
  issued_at: string | null
  sent_at: string | null
  paid_at: string | null
  payment_method: string
  reminder_count: number
  last_reminder_at: string | null
  is_overdue: boolean
  created_at: string
}
export interface InvoiceInput {
  client_id: number
  issue_date: string
  due_date: string
  service_start: string | null
  service_end: string | null
  operation_category: OperationCategory
  title: string
  notes: string
  lines: Line[]
}

export interface Recurring {
  id: number
  client_id: number
  client_name: string
  name: string
  title_template: string
  notes: string
  operation_category: OperationCategory
  lines: Line[]
  total_ht: string
  frequency_months: number
  day_of_month: number
  start_date: string
  next_run_date: string
  end_date: string | null
  payment_terms_days: number
  auto_send: boolean
  active: boolean
  last_generated_at: string | null
  generated_count: number
  last_error: string
  created_at: string
}
export interface RecurringInput {
  client_id: number
  name: string
  title_template: string
  notes: string
  operation_category: OperationCategory
  lines: Line[]
  frequency_months: number
  day_of_month: number
  start_date: string
  end_date: string | null
  payment_terms_days: number
  auto_send: boolean
  active: boolean
}

export interface EmailPreview {
  to: string
  cc: string
  subject: string
  body: string
  smtp_configured: boolean
}

export interface EmailLog {
  id: number
  doc_type: string
  doc_id: number | null
  purpose: string
  to: string
  subject: string
  status: 'sent' | 'outbox' | 'error'
  error: string
  created_at: string
}

export interface EmailTemplate {
  subject: string
  body: string
}

export interface AppSettings {
  company: {
    name: string
    legal_form: string
    address_line1: string
    address_line2: string
    postal_code: string
    city: string
    country: string
    email: string
    phone: string
    website: string
    siren: string
    siret: string
    ape: string
    vat_number: string
    registration: string
    logo_data_url: string
  }
  bank: { bank_name: string; iban: string; bic: string }
  invoicing: {
    vat_franchise: boolean
    vat_franchise_mention: string
    default_vat_rate: string
    payment_terms_days: number
    payment_method_text: string
    late_penalty_text: string
    recovery_fee_text: string
    discount_text: string
    footer_extra: string
    quote_validity_days: number
    quote_terms: string
    default_operation_category: OperationCategory
    default_unit: string
  }
  numbering: {
    invoice_pattern: string
    invoice_reset: string
    invoice_padding: number
    credit_note_pattern: string
    credit_note_reset: string
    credit_note_padding: number
    quote_pattern: string
    quote_reset: string
    quote_padding: number
  }
  emails: Record<string, EmailTemplate>
  thresholds: { vat_franchise_threshold: string; micro_ceiling: string }
}

export interface CounterState {
  kind: 'invoice' | 'credit_note' | 'quote'
  next_value: number
  preview: string
}

export interface SystemInfo {
  smtp_configured: boolean
  smtp_user: string
  public_url: string
  scheduler_enabled: boolean
  scheduler_time: string
}

export interface Dashboard {
  year: number
  years: number[]
  invoiced_year: string
  cashed_year: string
  cashed_month: string
  unpaid_total: string
  unpaid_count: number
  overdue_total: string
  overdue: { id: number; number: string; client_name: string; total_ttc: string; due_date: string; title: string }[]
  monthly: { month: number; invoiced: string; cashed: string }[]
  recurring_monthly_total: string
  upcoming_recurring: {
    id: number
    name: string
    client_name: string
    next_run_date: string
    total_ht: string
    auto_send: boolean
    last_error: string
  }[]
  pending_quotes: { id: number; number: string; client_name: string; total_ttc: string; valid_until: string; title: string }[]
  thresholds: { vat_franchise: string; micro_ceiling: string }
  today: string
}

export interface PublicQuote {
  number: string
  title: string
  status: QuoteStatus
  issue_date: string
  valid_until: string
  is_expired: boolean
  total: string
  seller_name: string
  seller_email: string
  client_name: string
  accepted_at: string | null
  accepted_by: string
  lines: { description: string; details: string; total: string }[]
}

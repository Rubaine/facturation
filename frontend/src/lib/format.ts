const euro = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' })
const euroCompact = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })

export function money(value: string | number | null | undefined): string {
  return euro.format(Number(value ?? 0))
}

export function moneyCompact(value: string | number | null | undefined): string {
  return euroCompact.format(Number(value ?? 0))
}

export function date(value: string | null | undefined): string {
  if (!value) return '—'
  const [y, m, d] = value.slice(0, 10).split('-')
  return `${d}/${m}/${y}`
}

export function dateTime(value: string | null | undefined): string {
  if (!value) return '—'
  const dt = new Date(value.includes('T') ? value : value.replace(' ', 'T'))
  return dt.toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })
}

/** Date du jour au format AAAA-MM-JJ (fuseau local). */
export function today(): string {
  const d = new Date()
  return toIso(d)
}

export function toIso(d: Date): string {
  const tz = d.getTimezoneOffset() * 60000
  return new Date(d.getTime() - tz).toISOString().slice(0, 10)
}

export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00`)
  d.setDate(d.getDate() + days)
  return toIso(d)
}

export function daysBetween(a: string, b: string): number {
  return Math.round((new Date(`${b}T12:00:00`).getTime() - new Date(`${a}T12:00:00`).getTime()) / 86400000)
}

export const MONTHS_SHORT = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.']

export const OPERATION_LABELS: Record<string, string> = {
  services: 'Prestation de services',
  goods: 'Livraison de biens',
  mixed: 'Mixte (biens et services)',
}

export function lineTotal(quantity: string, unitPrice: string): number {
  const q = Number(String(quantity).replace(',', '.')) || 0
  const p = Number(String(unitPrice).replace(',', '.')) || 0
  return Math.round(q * p * 100) / 100
}

export function frequencyLabel(months: number): string {
  if (months === 1) return 'Mensuelle'
  if (months === 3) return 'Trimestrielle'
  if (months === 6) return 'Semestrielle'
  if (months === 12) return 'Annuelle'
  return `Tous les ${months} mois`
}

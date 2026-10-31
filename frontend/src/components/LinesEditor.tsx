import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react'
import type { Line } from '../lib/api'
import { lineTotal, money } from '../lib/format'
import { Button, Input, Textarea } from './ui'

export const UNITS = ['unité', 'forfait', 'heure', 'jour', 'mois', 'an']

export function emptyLine(unit = 'unité', vatRate = '0'): Line {
  return { description: '', details: '', quantity: '1', unit, unit_price: '', vat_rate: vatRate }
}

export function cleanLines(lines: Line[]): Line[] {
  return lines
    .filter((l) => l.description.trim())
    .map((l) => ({
      ...l,
      quantity: String(l.quantity).replace(',', '.') || '1',
      unit_price: String(l.unit_price).replace(',', '.') || '0',
      vat_rate: String(l.vat_rate).replace(',', '.') || '0',
    }))
}

interface Props {
  lines: Line[]
  onChange: (lines: Line[]) => void
  vatFranchise: boolean
  defaultUnit?: string
  defaultVatRate?: string
}

export function LinesEditor({ lines, onChange, vatFranchise, defaultUnit = 'unité', defaultVatRate = '20' }: Props) {
  const update = (i: number, patch: Partial<Line>) => onChange(lines.map((l, idx) => (idx === i ? { ...l, ...patch } : l)))
  const remove = (i: number) => onChange(lines.filter((_, idx) => idx !== i))
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir
    if (j < 0 || j >= lines.length) return
    const copy = [...lines]
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
    onChange(copy)
  }
  const totalHt = lines.reduce((s, l) => s + lineTotal(l.quantity, l.unit_price), 0)
  const totalVat = vatFranchise
    ? 0
    : lines.reduce((s, l) => s + Math.round(lineTotal(l.quantity, l.unit_price) * (Number(l.vat_rate) || 0)) / 100, 0)

  return (
    <div className="space-y-3">
      <datalist id="units">
        {UNITS.map((u) => (
          <option key={u} value={u} />
        ))}
      </datalist>
      {lines.map((line, i) => (
        <div key={i} className="rounded-lg border border-slate-200 bg-slate-50/60 p-3">
          <div className="grid grid-cols-12 gap-2">
            <div className="col-span-12 md:col-span-6">
              <Input
                placeholder="Désignation (ex. Hébergement Web)"
                value={line.description}
                onChange={(e) => update(i, { description: e.target.value })}
                aria-label="Désignation"
              />
            </div>
            <div className="col-span-4 md:col-span-1">
              <Input inputMode="decimal" placeholder="Qté" value={line.quantity} onChange={(e) => update(i, { quantity: e.target.value })} aria-label="Quantité" />
            </div>
            <div className="col-span-4 md:col-span-2">
              <Input list="units" placeholder="Unité" value={line.unit} onChange={(e) => update(i, { unit: e.target.value })} aria-label="Unité" />
            </div>
            <div className="col-span-4 md:col-span-2">
              <Input inputMode="decimal" placeholder="Prix HT" value={line.unit_price} onChange={(e) => update(i, { unit_price: e.target.value })} aria-label="Prix unitaire HT" />
            </div>
            <div className="col-span-12 flex items-center justify-end text-sm font-semibold text-slate-700 md:col-span-1">
              {money(lineTotal(line.quantity, line.unit_price))}
            </div>
            <div className="col-span-12 md:col-span-9">
              <Textarea
                className="min-h-[38px] py-1.5 text-xs"
                rows={1}
                placeholder="Détails (optionnel)"
                value={line.details}
                onChange={(e) => update(i, { details: e.target.value })}
                aria-label="Détails"
              />
            </div>
            <div className="col-span-12 flex items-center justify-end gap-1 md:col-span-3">
              {!vatFranchise && (
                <div className="mr-auto flex items-center gap-1 text-xs text-slate-500 md:mr-1">
                  TVA
                  <Input className="w-16 py-1 text-xs" value={line.vat_rate} onChange={(e) => update(i, { vat_rate: e.target.value })} aria-label="Taux de TVA" />%
                </div>
              )}
              <Button variant="ghost" size="sm" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Monter">
                <ArrowUp className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="sm" onClick={() => move(i, 1)} disabled={i === lines.length - 1} aria-label="Descendre">
                <ArrowDown className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="sm" onClick={() => remove(i)} disabled={lines.length === 1} aria-label="Supprimer la ligne">
                <Trash2 className="h-4 w-4 text-red-500" />
              </Button>
            </div>
          </div>
        </div>
      ))}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <Button variant="secondary" icon={<Plus className="h-4 w-4" />} onClick={() => onChange([...lines, emptyLine(defaultUnit, vatFranchise ? '0' : defaultVatRate)])}>
          Ajouter une ligne
        </Button>
        <div className="min-w-[220px] space-y-1 text-sm">
          <div className="flex justify-between gap-6">
            <span className="text-slate-500">Total HT</span>
            <span className="font-medium">{money(totalHt)}</span>
          </div>
          <div className="flex justify-between gap-6">
            <span className="text-slate-500">TVA</span>
            <span className="font-medium">{money(totalVat)}</span>
          </div>
          <div className="flex justify-between gap-6 border-t border-slate-200 pt-1 text-base">
            <span className="font-semibold">Total</span>
            <span className="font-bold">{money(totalHt + totalVat)}</span>
          </div>
          {vatFranchise && <div className="text-right text-xs italic text-slate-500">TVA non applicable, art. 293 B du CGI</div>}
        </div>
      </div>
    </div>
  )
}

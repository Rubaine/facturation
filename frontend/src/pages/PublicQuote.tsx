import { useMutation, useQuery } from '@tanstack/react-query'
import { CheckCircle2, Download } from 'lucide-react'
import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { Button, ErrorBox, Field, Input, Spinner } from '../components/ui'
import { get, post, type PublicQuote as PublicQuoteData } from '../lib/api'

export default function PublicQuote() {
  const { token } = useParams()
  const [name, setName] = useState('')
  const [agree, setAgree] = useState(false)
  const { data: q, isLoading, error, refetch } = useQuery({
    queryKey: ['public-quote', token],
    queryFn: () => get<PublicQuoteData>(`/api/public/quotes/${token}`),
    retry: false,
  })
  const accept = useMutation({
    mutationFn: () => post(`/api/public/quotes/${token}/accept`, { name }),
    onSuccess: () => refetch(),
  })

  if (isLoading) return <Spinner className="h-full items-center" />
  if (!q)
    return (
      <div className="mx-auto max-w-lg p-6">
        <ErrorBox error={error ?? 'Devis introuvable'} />
      </div>
    )

  const accepted = q.status === 'accepted' || q.status === 'invoiced'
  return (
    <div className="min-h-full bg-slate-100 px-4 py-10">
      <div className="mx-auto max-w-2xl space-y-5">
        <div className="text-center">
          <div className="text-sm text-slate-500">{q.seller_name}</div>
          <h1 className="mt-1 text-2xl font-bold">Devis {q.number}</h1>
          {q.title && <p className="text-slate-600">{q.title}</p>}
        </div>

        <div className="rounded-2xl bg-white p-6 shadow-sm">
          <div className="flex flex-wrap justify-between gap-2 text-sm text-slate-600">
            <span>
              Pour : <strong className="text-slate-900">{q.client_name}</strong>
            </span>
            <span>
              Émis le {q.issue_date} · valable jusqu'au {q.valid_until}
            </span>
          </div>
          <ul className="mt-5 divide-y divide-slate-100 border-y border-slate-100">
            {q.lines.map((l, i) => (
              <li key={i} className="flex justify-between gap-4 py-3 text-sm">
                <div>
                  <div className="font-medium">{l.description}</div>
                  {l.details && <div className="whitespace-pre-line text-xs text-slate-500">{l.details}</div>}
                </div>
                <div className="whitespace-nowrap font-medium">{l.total}</div>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex items-center justify-between">
            <a href={`/api/public/quotes/${token}/pdf`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-700 hover:underline">
              <Download className="h-4 w-4" /> Télécharger le PDF
            </a>
            <div className="text-right">
              <div className="text-xs text-slate-500">Total</div>
              <div className="text-2xl font-bold">{q.total}</div>
            </div>
          </div>
        </div>

        <div className="rounded-2xl bg-white p-6 shadow-sm">
          {accepted ? (
            <div className="flex items-center gap-3 text-emerald-700">
              <CheckCircle2 className="h-8 w-8" />
              <div>
                <div className="font-semibold">Devis accepté{q.accepted_at ? ` le ${q.accepted_at}` : ''}</div>
                <div className="text-sm text-slate-600">
                  {q.accepted_by ? `Par ${q.accepted_by}. ` : ''}Merci pour votre confiance ! {q.seller_name} a été prévenu.
                </div>
              </div>
            </div>
          ) : q.status === 'refused' ? (
            <p className="text-sm text-slate-600">Ce devis a été décliné. Contactez {q.seller_email || q.seller_name} pour toute question.</p>
          ) : q.is_expired ? (
            <p className="text-sm text-slate-600">Ce devis a expiré. Contactez {q.seller_email || q.seller_name} pour en obtenir un nouveau.</p>
          ) : (
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault()
                accept.mutate()
              }}
            >
              <h2 className="font-semibold">Accepter ce devis</h2>
              <ErrorBox error={accept.error} />
              <Field label="Votre nom et prénom">
                <Input value={name} onChange={(e) => setName(e.target.value)} required />
              </Field>
              <label className="flex items-start gap-2.5 text-sm text-slate-700">
                <input type="checkbox" className="mt-0.5 h-4 w-4" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
                <span>
                  Je déclare accepter ce devis d'un montant de <strong>{q.total}</strong> (« bon pour accord ») et les conditions qui y figurent.
                </span>
              </label>
              <Button type="submit" variant="success" className="w-full" loading={accept.isPending} disabled={!name.trim() || !agree}>
                Accepter le devis
              </Button>
            </form>
          )}
        </div>
        <p className="text-center text-xs text-slate-400">Une question ? {q.seller_email}</p>
      </div>
    </div>
  )
}

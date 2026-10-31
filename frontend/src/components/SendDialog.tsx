import { useMutation, useQuery } from '@tanstack/react-query'
import { Send } from 'lucide-react'
import { useEffect, useState } from 'react'
import { get, post, type EmailPreview } from '../lib/api'
import { Button, ErrorBox, Field, InfoBox, Input, Modal, Spinner, Textarea } from './ui'

interface Props {
  open: boolean
  onClose: () => void
  previewUrl: string
  sendUrl: string
  title: string
  confirmLabel?: string
  warning?: string
  onSent: () => void
}

export function SendDialog(props: Props) {
  return props.open ? <SendDialogInner {...props} /> : null
}

function SendDialogInner({ onClose, previewUrl, sendUrl, title, confirmLabel = 'Envoyer', warning, onSent }: Props) {
  const preview = useQuery({ queryKey: ['email-preview', previewUrl], queryFn: () => get<EmailPreview>(previewUrl), gcTime: 0 })
  const [mail, setMail] = useState({ to: '', cc: '', subject: '', body: '' })
  useEffect(() => {
    if (preview.data) setMail({ to: preview.data.to, cc: preview.data.cc, subject: preview.data.subject, body: preview.data.body })
  }, [preview.data])

  const send = useMutation({
    mutationFn: () => post(sendUrl, mail),
    onSuccess: () => {
      onSent()
      onClose()
    },
  })

  return (
    <Modal
      open
      onClose={onClose}
      wide
      title={title}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Annuler
          </Button>
          <Button icon={<Send className="h-4 w-4" />} loading={send.isPending} disabled={!mail.to.trim() || preview.isLoading} onClick={() => send.mutate()}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      {preview.isLoading ? (
        <Spinner />
      ) : (
        <div className="space-y-3">
          <ErrorBox error={preview.error || send.error} />
          {warning && <InfoBox tone="warning">{warning}</InfoBox>}
          {preview.data && !preview.data.smtp_configured && (
            <InfoBox tone="warning">
              L'envoi SMTP n'est pas configuré sur le serveur : le mail sera enregistré dans le dossier <code>data/outbox</code> au lieu
              d'être envoyé.
            </InfoBox>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Destinataire(s)">
              <Input value={mail.to} onChange={(e) => setMail({ ...mail, to: e.target.value })} placeholder="client@exemple.fr" />
            </Field>
            <Field label="Copie">
              <Input value={mail.cc} onChange={(e) => setMail({ ...mail, cc: e.target.value })} />
            </Field>
          </div>
          <Field label="Objet">
            <Input value={mail.subject} onChange={(e) => setMail({ ...mail, subject: e.target.value })} />
          </Field>
          <Field label="Message" hint="Le PDF est joint automatiquement.">
            <Textarea rows={11} value={mail.body} onChange={(e) => setMail({ ...mail, body: e.target.value })} />
          </Field>
        </div>
      )}
    </Modal>
  )
}

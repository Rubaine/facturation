import { ExternalLink, FileText } from 'lucide-react'
import { Card } from './ui'

/** Aperçu du PDF : intégré sur ordinateur, bouton d'ouverture sur mobile (les iframes PDF y sont mal gérées). */
export function PdfPreview({ src, version }: { src: string; version: number }) {
  return (
    <Card className="overflow-hidden">
      <div className="-m-5">
        <iframe key={version} title="Aperçu PDF" src={`${src}#view=FitH`} className="hidden h-[75vh] w-full bg-slate-100 lg:block" />
        <div className="flex flex-col items-center gap-3 p-8 text-center lg:hidden">
          <FileText className="h-10 w-10 text-brand-700" />
          <a
            href={src}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand-800 px-4 py-2 text-sm font-medium text-white hover:bg-brand-900"
          >
            <ExternalLink className="h-4 w-4" /> Ouvrir le PDF
          </a>
        </div>
      </div>
    </Card>
  )
}

import clsx from 'clsx'
import { Loader2, X } from 'lucide-react'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react'
import { Link } from 'react-router-dom'
import { twMerge } from 'tailwind-merge'

const cn = (...args: Parameters<typeof clsx>) => twMerge(clsx(...args))

// ------------------------------------------------------------------ Boutons
type Variant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'success'

const variants: Record<Variant, string> = {
  primary: 'bg-brand-800 text-white hover:bg-brand-900 shadow-sm',
  secondary: 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-50 shadow-sm',
  danger: 'bg-white text-red-600 border border-red-200 hover:bg-red-50',
  ghost: 'text-slate-600 hover:bg-slate-100',
  success: 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm',
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  loading?: boolean
  icon?: ReactNode
  size?: 'sm' | 'md'
}

export function Button({ variant = 'primary', loading, icon, size = 'md', className, children, disabled, ...rest }: ButtonProps) {
  return (
    <button
      type="button"
      className={cn(
        'inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap',
        size === 'sm' ? 'px-2.5 py-1.5 text-xs' : 'px-3.5 py-2 text-sm',
        variants[variant],
        className,
      )}
      disabled={disabled || loading}
      {...rest}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : icon}
      {children}
    </button>
  )
}

export function ButtonLink({ to, variant = 'primary', icon, children, className }: { to: string; variant?: Variant; icon?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <Link
      to={to}
      className={clsx(
        'inline-flex items-center justify-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors whitespace-nowrap',
        variants[variant],
        className,
      )}
    >
      {icon}
      {children}
    </Link>
  )
}

// ------------------------------------------------------------------ Champs
const fieldBase =
  'block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 disabled:bg-slate-100 disabled:text-slate-500'

export function Field({ label, hint, children, className }: { label?: ReactNode; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={clsx('block', className)}>
      {label && <span className="mb-1 block text-xs font-medium text-slate-600">{label}</span>}
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
    </label>
  )
}

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(fieldBase, className)} {...rest} />
}

export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(fieldBase, 'min-h-[80px]', className)} {...rest} />
}

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn(fieldBase, 'pr-8', className)} {...rest}>
      {children}
    </select>
  )
}

export function Checkbox({ label, checked, onChange, hint }: { label: ReactNode; checked: boolean; onChange: (v: boolean) => void; hint?: ReactNode }) {
  return (
    <label className="flex cursor-pointer items-start gap-2.5">
      <input
        type="checkbox"
        className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-700 focus:ring-brand-500"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>
        <span className="text-sm text-slate-800">{label}</span>
        {hint && <span className="block text-xs text-slate-500">{hint}</span>}
      </span>
    </label>
  )
}

// ------------------------------------------------------------------ Mise en page
export function Card({ children, className, title, actions }: { children: ReactNode; className?: string; title?: ReactNode; actions?: ReactNode }) {
  return (
    <section className={cn('min-w-0 rounded-xl border border-slate-200 bg-white shadow-sm', className)}>
      {(title || actions) && (
        <header className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-3.5">
          <h2 className="text-sm font-semibold text-slate-800">{title}</h2>
          {actions}
        </header>
      )}
      <div className="p-5">{children}</div>
    </section>
  )
}

export function PageHeader({ title, subtitle, actions, back }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; back?: { to: string; label: string } }) {
  return (
    <div className="mb-6">
      {back && (
        <Link to={back.to} className="mb-2 inline-block text-sm text-slate-500 hover:text-brand-700">
          ← {back.label}
        </Link>
      )}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">{title}</h1>
          {subtitle && <div className="mt-1 text-sm text-slate-500">{subtitle}</div>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  )
}

export function Spinner({ className }: { className?: string }) {
  return (
    <div className={clsx('flex justify-center py-16', className)}>
      <Loader2 className="h-6 w-6 animate-spin text-brand-700" />
    </div>
  )
}

export function EmptyState({ icon, title, children, action }: { icon?: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center">
      {icon && <div className="mb-3 rounded-full bg-brand-50 p-3 text-brand-700">{icon}</div>}
      <h3 className="font-semibold text-slate-800">{title}</h3>
      {children && <p className="mt-1 max-w-md text-sm text-slate-500">{children}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export function ErrorBox({ error }: { error: unknown }) {
  if (!error) return null
  const msg = error instanceof Error ? error.message : String(error)
  return <div className="whitespace-pre-line rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{msg}</div>
}

export function InfoBox({ children, tone = 'info' }: { children: ReactNode; tone?: 'info' | 'warning' | 'success' }) {
  const tones = {
    info: 'border-brand-200 bg-brand-50 text-brand-900',
    warning: 'border-amber-200 bg-amber-50 text-amber-900',
    success: 'border-emerald-200 bg-emerald-50 text-emerald-900',
  }
  return <div className={clsx('rounded-lg border px-4 py-3 text-sm', tones[tone])}>{children}</div>
}

// ------------------------------------------------------------------ Badges
const badgeTones = {
  gray: 'bg-slate-100 text-slate-700 ring-slate-200',
  blue: 'bg-blue-50 text-blue-700 ring-blue-200',
  green: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  red: 'bg-red-50 text-red-700 ring-red-200',
  amber: 'bg-amber-50 text-amber-800 ring-amber-200',
  purple: 'bg-violet-50 text-violet-700 ring-violet-200',
}
export type BadgeTone = keyof typeof badgeTones

export function Badge({ tone = 'gray', children }: { tone?: BadgeTone; children: ReactNode }) {
  return (
    <span className={clsx('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset whitespace-nowrap', badgeTones[tone])}>
      {children}
    </span>
  )
}

// ------------------------------------------------------------------ Modale
export function Modal({ open, onClose, title, children, footer, wide }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-0 sm:items-center sm:p-4" onMouseDown={onClose}>
      <div
        className={clsx('flex max-h-[92vh] w-full flex-col rounded-t-2xl bg-white shadow-xl sm:rounded-2xl', wide ? 'sm:max-w-3xl' : 'sm:max-w-lg')}
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
      >
        <header className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 className="font-semibold text-slate-900">{title}</h2>
          <button className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600" onClick={onClose} aria-label="Fermer">
            <X className="h-5 w-5" />
          </button>
        </header>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
        {footer && <footer className="flex flex-wrap justify-end gap-2 border-t border-slate-100 px-5 py-3">{footer}</footer>}
      </div>
    </div>
  )
}

// ------------------------------------------------------------------ Notifications
interface Toast {
  id: number
  message: string
  tone: 'success' | 'error' | 'info'
}
const ToastContext = createContext<(message: string, tone?: Toast['tone']) => void>(() => {})

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const push = useCallback((message: string, tone: Toast['tone'] = 'success') => {
    const id = Date.now() + Math.random()
    setToasts((t) => [...t, { id, message, tone }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), tone === 'error' ? 7000 : 3500)
  }, [])
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[min(92vw,380px)] flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={clsx(
              'pointer-events-auto whitespace-pre-line rounded-lg px-4 py-3 text-sm shadow-lg ring-1',
              t.tone === 'success' && 'bg-emerald-600 text-white ring-emerald-700',
              t.tone === 'error' && 'bg-red-600 text-white ring-red-700',
              t.tone === 'info' && 'bg-slate-800 text-white ring-slate-900',
            )}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  return useContext(ToastContext)
}

// ------------------------------------------------------------------ Tableaux
export function Table({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-slate-200 text-sm">{children}</table>
    </div>
  )
}

export function Th({ children, className }: { children?: ReactNode; className?: string }) {
  return <th className={clsx('px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500', className)}>{children}</th>
}

export function Td({ children, className }: { children?: ReactNode; className?: string }) {
  return <td className={clsx('px-4 py-3 align-middle', className)}>{children}</td>
}

export function Stat({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: ReactNode; tone?: 'red' | 'green' }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div className={clsx('mt-1 text-2xl font-bold tracking-tight', tone === 'red' ? 'text-red-600' : tone === 'green' ? 'text-emerald-600' : 'text-slate-900')}>{value}</div>
      {hint && <div className="mt-0.5 text-xs text-slate-500">{hint}</div>}
    </div>
  )
}

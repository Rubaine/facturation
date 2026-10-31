import clsx from 'clsx'
import { FileSignature, FileText, LayoutDashboard, LogOut, Menu, Repeat, Settings, Users, X } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../lib/auth'

const NAV = [
  { to: '/', label: 'Tableau de bord', icon: LayoutDashboard, end: true },
  { to: '/factures', label: 'Factures', icon: FileText },
  { to: '/devis', label: 'Devis', icon: FileSignature },
  { to: '/recurrences', label: 'Récurrences', icon: Repeat },
  { to: '/clients', label: 'Clients', icon: Users },
  { to: '/parametres', label: 'Paramètres', icon: Settings },
]

function NavItems({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav className="flex flex-col gap-0.5">
      {NAV.map(({ to, label, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          onClick={onNavigate}
          className={({ isActive }) =>
            clsx(
              'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
              isActive ? 'bg-white/15 text-white' : 'text-brand-100 hover:bg-white/10 hover:text-white',
            )
          }
        >
          <Icon className="h-4.5 w-4.5" />
          {label}
        </NavLink>
      ))}
    </nav>
  )
}

function Brand() {
  return (
    <div className="flex items-center gap-2.5 px-2">
      <img src="/favicon.svg" alt="" className="h-8 w-8 rounded-lg ring-1 ring-white/20" />
      <div className="leading-tight">
        <div className="text-sm font-bold text-white">Facturation</div>
        <div className="text-[11px] text-brand-200">Devis · Factures · Récurrences</div>
      </div>
    </div>
  )
}

export function Layout({ children }: { children?: ReactNode }) {
  const { logout } = useAuth()
  const [open, setOpen] = useState(false)
  return (
    <div className="min-h-full lg:flex">
      {/* Barre latérale (ordinateur) */}
      <aside className="hidden w-60 shrink-0 flex-col justify-between bg-brand-900 p-4 lg:flex lg:fixed lg:inset-y-0">
        <div className="space-y-6">
          <Brand />
          <NavItems />
        </div>
        <button onClick={logout} className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-brand-200 hover:bg-white/10 hover:text-white">
          <LogOut className="h-4.5 w-4.5" /> Déconnexion
        </button>
      </aside>

      {/* Barre du haut (mobile) */}
      <div className="sticky top-0 z-40 flex items-center justify-between bg-brand-900 px-4 py-3 lg:hidden">
        <Brand />
        <button onClick={() => setOpen(true)} className="rounded-md p-1.5 text-white hover:bg-white/10" aria-label="Menu">
          <Menu className="h-6 w-6" />
        </button>
      </div>
      {open && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 lg:hidden" onClick={() => setOpen(false)}>
          <div className="absolute inset-y-0 right-0 flex w-64 flex-col justify-between bg-brand-900 p-4" onClick={(e) => e.stopPropagation()}>
            <div className="space-y-6">
              <div className="flex justify-end">
                <button onClick={() => setOpen(false)} className="rounded-md p-1 text-white hover:bg-white/10" aria-label="Fermer">
                  <X className="h-6 w-6" />
                </button>
              </div>
              <NavItems onNavigate={() => setOpen(false)} />
            </div>
            <button onClick={logout} className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-brand-200 hover:bg-white/10">
              <LogOut className="h-4.5 w-4.5" /> Déconnexion
            </button>
          </div>
        </div>
      )}

      <main className="min-w-0 flex-1 lg:pl-60">
        <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children ?? <Outlet />}</div>
      </main>
    </div>
  )
}

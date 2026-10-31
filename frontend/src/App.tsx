import { Navigate, Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { Spinner } from './components/ui'
import { useAuth } from './lib/auth'
import ClientDetail from './pages/ClientDetail'
import Clients from './pages/Clients'
import Dashboard from './pages/Dashboard'
import InvoiceEdit from './pages/InvoiceEdit'
import InvoiceView from './pages/InvoiceView'
import Invoices from './pages/Invoices'
import Login from './pages/Login'
import PublicQuote from './pages/PublicQuote'
import QuoteEdit from './pages/QuoteEdit'
import QuoteView from './pages/QuoteView'
import Quotes from './pages/Quotes'
import RecurringEdit from './pages/RecurringEdit'
import RecurringList from './pages/RecurringList'
import Settings from './pages/Settings'

function Protected() {
  const { state } = useAuth()
  if (state === 'loading') return <Spinner className="h-full items-center" />
  if (state === 'out') return <Login />
  return <Layout />
}

export default function App() {
  return (
    <Routes>
      {/* Page publique : consultation / acceptation d'un devis par le client */}
      <Route path="/p/devis/:token" element={<PublicQuote />} />

      <Route element={<Protected />}>
        <Route index element={<Dashboard />} />
        <Route path="factures" element={<Invoices />} />
        <Route path="factures/nouvelle" element={<InvoiceEdit />} />
        <Route path="factures/:id" element={<InvoiceView />} />
        <Route path="factures/:id/modifier" element={<InvoiceEdit />} />
        <Route path="devis" element={<Quotes />} />
        <Route path="devis/nouveau" element={<QuoteEdit />} />
        <Route path="devis/:id" element={<QuoteView />} />
        <Route path="devis/:id/modifier" element={<QuoteEdit />} />
        <Route path="recurrences" element={<RecurringList />} />
        <Route path="recurrences/nouvelle" element={<RecurringEdit />} />
        <Route path="recurrences/:id" element={<RecurringEdit />} />
        <Route path="clients" element={<Clients />} />
        <Route path="clients/:id" element={<ClientDetail />} />
        <Route path="parametres" element={<Settings />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}

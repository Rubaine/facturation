import { Lock } from 'lucide-react'
import { useState } from 'react'
import { Button, ErrorBox, Input } from '../components/ui'
import { useAuth } from '../lib/auth'

export default function Login() {
  const { login } = useAuth()
  const [password, setPassword] = useState('')
  const [error, setError] = useState<unknown>(null)
  const [loading, setLoading] = useState(false)

  return (
    <div className="flex min-h-full items-center justify-center bg-gradient-to-br from-brand-900 to-brand-700 px-4">
      <form
        className="w-full max-w-sm space-y-5 rounded-2xl bg-white p-8 shadow-2xl"
        onSubmit={async (e) => {
          e.preventDefault()
          setLoading(true)
          setError(null)
          try {
            await login(password)
          } catch (err) {
            setError(err)
          } finally {
            setLoading(false)
          }
        }}
      >
        <div className="flex flex-col items-center gap-3 text-center">
          <img src="/favicon.svg" alt="" className="h-12 w-12 rounded-xl" />
          <div>
            <h1 className="text-xl font-bold">Facturation</h1>
            <p className="text-sm text-slate-500">Connecte-toi pour accéder à tes documents</p>
          </div>
        </div>
        <ErrorBox error={error} />
        <div className="relative">
          <Lock className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <Input type="password" placeholder="Mot de passe" className="pl-9" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus />
        </div>
        <Button type="submit" className="w-full" loading={loading} disabled={!password}>
          Se connecter
        </Button>
      </form>
    </div>
  )
}

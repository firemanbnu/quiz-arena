'use client'
import { useState } from 'react'
import { KeyRound } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAdmin } from '@/lib/useAdmin'

/** Mostra o login do administrador; quando autenticado, renderiza o conteúdo. */
export default function AdminGate({ children }: { children: React.ReactNode }) {
  const { ready, isAdmin } = useAdmin()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  if (!ready) return <p className="muted p-8 text-center">Carregando…</p>
  if (isAdmin) return <>{children}</>

  async function signIn(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    if (error) {
      setError(
        /invalid login/i.test(error.message)
          ? 'E-mail ou senha incorretos.'
          : /not confirmed/i.test(error.message)
            ? 'E-mail ainda não confirmado. Confirme o usuário no painel do Supabase.'
            : error.message
      )
    }
    setBusy(false)
  }

  return (
    <main className="mx-auto max-w-sm px-4 py-12">
      <form onSubmit={signIn} className="card space-y-4">
        <span className="grid h-12 w-12 place-items-center rounded-2xl bg-brand/20 text-brand">
          <KeyRound className="h-6 w-6" aria-hidden />
        </span>
        <div>
          <h1 className="text-2xl font-bold">Acesso do host</h1>
          <p className="muted mt-1 text-sm">Entre para criar competições e gerenciar o banco de questões.</p>
        </div>
        <label className="block text-sm">
          E-mail
          <input className="field mt-1" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label className="block text-sm">
          Senha
          <input className="field mt-1" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </label>
        {error && <p role="alert" className="text-sm text-rose-400">{error}</p>}
        <button className="btn btn-primary w-full" disabled={busy}>
          {busy ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
    </main>
  )
}

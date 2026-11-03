'use client'
import { useEffect, useState } from 'react'
import { Clock, KeyRound, LogOut, ShieldAlert } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { AccessProvider, useAccess } from '@/lib/access'

/** Envolve o site inteiro: só mostra o conteúdo para quem foi liberado pelo administrador geral. */
export default function AccessGate({ children }: { children: React.ReactNode }) {
  return (
    <AccessProvider>
      <Gate>{children}</Gate>
    </AccessProvider>
  )
}

function Gate({ children }: { children: React.ReactNode }) {
  const { ready, status } = useAccess()
  if (!ready) return <p className="muted p-8 text-center">Carregando…</p>
  if (status === 'signed_out') return <AuthForm />
  if (status === 'approved') return <>{children}</>
  return <WaitingScreen />
}

function authMessage(msg: string) {
  if (/invalid login/i.test(msg)) return 'E-mail ou senha incorretos.'
  if (/not confirmed/i.test(msg)) return 'E-mail ainda não confirmado. Abra o e-mail de confirmação que enviamos.'
  if (/already registered|already been registered/i.test(msg)) return 'Este e-mail já tem conta. Use "Entrar".'
  if (/password/i.test(msg) && /(6|short|weak)/i.test(msg)) return 'A senha precisa ter pelo menos 6 caracteres.'
  if (/rate limit/i.test(msg)) return 'Muitas tentativas em pouco tempo. Aguarde alguns minutos.'
  return msg
}

// o botão do Google só aparece depois de ativar o provedor no Supabase e definir NEXT_PUBLIC_GOOGLE_LOGIN=1 na Vercel
const GOOGLE = process.env.NEXT_PUBLIC_GOOGLE_LOGIN === '1'

function AuthForm() {
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [busy, setBusy] = useState(false)

  async function google() {
    setError('')
    const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin } })
    if (error) setError(error.message)
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    setInfo('')
    if (mode === 'login') {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
      if (error) setError(authMessage(error.message))
    } else {
      const { data, error } = await supabase.auth.signUp({ email: email.trim(), password })
      if (error) setError(authMessage(error.message))
      else if (!data.session) setInfo('Conta criada. Confirme o e-mail que enviamos e depois entre. Em seguida, o administrador precisa liberar seu acesso.')
    }
    setBusy(false)
  }

  return (
    <main className="mx-auto max-w-sm px-4 py-12">
      <form onSubmit={submit} className="card space-y-4">
        <span className="grid h-12 w-12 place-items-center rounded-2xl bg-brand/20 text-brand">
          <KeyRound className="h-6 w-6" aria-hidden />
        </span>
        <div>
          <h1 className="text-2xl font-bold">{mode === 'login' ? 'Entrar no Quiz Arena' : 'Criar conta'}</h1>
          <p className="muted mt-1 text-sm">
            {mode === 'login'
              ? 'Todos precisam ter cadastro. Quem ainda não tem, toque em “Ainda não tenho conta”.'
              : 'Crie sua conta aqui mesmo. Depois, o administrador precisa liberar o seu acesso.'}
          </p>
        </div>
        {GOOGLE && (
          <>
            <button type="button" onClick={google} className="btn btn-secondary w-full">
              Continuar com o Google
            </button>
            <p className="muted text-center text-xs">ou {mode === 'login' ? 'entre' : 'crie a conta'} com e-mail e senha</p>
          </>
        )}
        <label className="block text-sm">
          E-mail
          <input className="field mt-1" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label className="block text-sm">
          Senha
          <input
            className="field mt-1"
            type="password"
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>
        {error && <p role="alert" className="text-sm text-rose-400">{error}</p>}
        {info && <p role="status" className="text-sm text-emerald-300">{info}</p>}
        <button className="btn btn-primary w-full" disabled={busy}>
          {busy ? 'Aguarde…' : mode === 'login' ? 'Entrar' : 'Criar conta'}
        </button>
        <button
          type="button"
          onClick={() => {
            setMode(mode === 'login' ? 'signup' : 'login')
            setError('')
            setInfo('')
          }}
          className="w-full text-center text-sm font-semibold text-brand"
        >
          {mode === 'login' ? 'Ainda não tenho conta' : 'Já tenho conta'}
        </button>
      </form>
    </main>
  )
}

function WaitingScreen() {
  const { user, status, refresh } = useAccess()
  const blocked = status === 'blocked'
  const [checking, setChecking] = useState(false)

  // enquanto espera, confere a liberação sozinho a cada 10 segundos
  useEffect(() => {
    if (blocked) return
    const t = setInterval(refresh, 10000)
    return () => clearInterval(t)
  }, [blocked, refresh])

  async function check() {
    setChecking(true)
    await refresh()
    setChecking(false)
  }

  return (
    <main className="mx-auto max-w-sm px-4 py-12">
      <div className="card space-y-4 text-center">
        <span className={`mx-auto grid h-14 w-14 place-items-center rounded-2xl ${blocked ? 'bg-rose-500/20 text-rose-300' : 'bg-brand/20 text-brand'}`}>
          {blocked ? <ShieldAlert className="h-7 w-7" aria-hidden /> : <Clock className="h-7 w-7" aria-hidden />}
        </span>
        <h1 className="text-2xl font-bold">{blocked ? 'Acesso bloqueado' : 'Aguardando autorização'}</h1>
        <p className="muted text-sm leading-relaxed">
          {blocked
            ? 'O administrador não liberou este acesso. Fale com ele se achar que é um engano.'
            : 'Sua conta foi criada. Assim que o administrador liberar, você entra automaticamente.'}
        </p>
        <p className="rounded-xl bg-ink-900 px-3 py-2 text-sm">{user?.email}</p>
        {!blocked && (
          <button onClick={check} disabled={checking} className="btn btn-primary w-full">
            {checking ? 'Verificando…' : 'Verificar agora'}
          </button>
        )}
        <button onClick={() => supabase.auth.signOut()} className="btn btn-ghost w-full">
          <LogOut className="h-4 w-4" aria-hidden /> Sair
        </button>
      </div>
    </main>
  )
}

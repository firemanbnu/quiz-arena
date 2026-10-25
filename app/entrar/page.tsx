'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { KeyRound } from 'lucide-react'
import { ensureAnonymousUser, supabase } from '@/lib/supabase'

export default function EntrarPage() {
  const router = useRouter()
  const [code, setCode] = useState('')
  const [nickname, setNickname] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function join(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await ensureAnonymousUser()
      const { data, error } = await supabase.rpc('join_session', { p_code: code, p_nickname: nickname })
      if (error) throw error
      router.push(`/play/${data.session_id}`)
    } catch (e: any) {
      const msg: string = e?.message ?? ''
      setError(
        /rate limit/i.test(msg)
          ? 'Muitas entradas pela mesma rede em pouco tempo. Aguarde alguns minutos e tente de novo.'
          : msg || 'Não foi possível entrar.'
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="mx-auto max-w-sm px-4 py-12">
      <form onSubmit={join} className="card space-y-4">
        <span className="grid h-12 w-12 place-items-center rounded-2xl bg-brand/20 text-brand">
          <KeyRound className="h-6 w-6" aria-hidden />
        </span>
        <h1 className="text-3xl font-extrabold">Entrar na partida</h1>
        <label className="block text-sm">
          Código da sala
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            maxLength={6}
            inputMode="text"
            autoCapitalize="characters"
            autoComplete="off"
            className="field mt-1 text-center font-display text-3xl font-extrabold tracking-[0.3em]"
            placeholder="ABC123"
          />
        </label>
        <label className="block text-sm">
          Seu apelido
          <input value={nickname} onChange={(e) => setNickname(e.target.value)} maxLength={24} className="field mt-1 text-lg" placeholder="Como quer aparecer no ranking" />
        </label>
        {error && <p role="alert" className="text-sm text-rose-400">{error}</p>}
        <button className="btn btn-primary w-full py-4 text-lg" disabled={busy || code.length < 6 || !nickname.trim()}>
          {busy ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
    </main>
  )
}

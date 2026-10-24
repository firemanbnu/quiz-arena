'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ensureAnonymousUser, supabase } from '@/lib/supabase'

export default function JoinPage() {
  const router = useRouter()
  const [code, setCode] = useState('')
  const [nickname, setNickname] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function join() {
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
    <main className="mx-auto grid min-h-screen max-w-sm place-items-center p-6">
      <div className="w-full space-y-3">
        <h1 className="text-4xl font-black">Entrar na partida</h1>
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="Código da sala"
          maxLength={6}
          className="w-full rounded-xl bg-slate-800 px-4 py-4 text-center text-3xl font-black tracking-widest"
        />
        <input
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          placeholder="Seu apelido"
          maxLength={24}
          className="w-full rounded-xl bg-slate-800 px-4 py-3 text-lg"
        />
        {error && <p className="text-rose-400">{error}</p>}
        <button
          onClick={join}
          disabled={busy || code.length < 6 || !nickname.trim()}
          className="w-full rounded-xl bg-emerald-500 py-4 text-xl font-bold text-slate-950 disabled:opacity-40"
        >
          Entrar
        </button>
        <div className="flex justify-between pt-4 text-sm text-slate-400">
          <a href="/ranking" className="underline">Ranking permanente</a>
          <a href="/admin" className="underline">Sou administrador</a>
        </div>
      </div>
    </main>
  )
}

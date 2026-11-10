'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { KeyRound } from 'lucide-react'
import { supabase } from '@/lib/supabase'

export default function EntrarPage() {
  const router = useRouter()
  const [code, setCode] = useState('')
  const [nickname, setNickname] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [teams, setTeams] = useState<{ id: string; name: string; members: number }[]>([])
  const [team, setTeam] = useState('')

  // sala por equipes: mostra as equipes para o jogador escolher a dele
  useEffect(() => {
    setTeams([])
    setTeam('')
    if (code.length < 6) return
    let alive = true
    supabase.rpc('session_teams_by_code', { p_code: code }).then(({ data }) => alive && setTeams((data ?? []) as any))
    return () => {
      alive = false
    }
  }, [code])

  async function join(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const { data, error } = await supabase.rpc('join_session', { p_code: code, p_nickname: nickname, p_team: team || null })
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
        {teams.length > 0 && (
          <fieldset className="space-y-2">
            <legend className="mb-1 text-sm">Sua equipe</legend>
            {teams.map((t) => (
              <label key={t.id} className={`flex cursor-pointer items-center gap-3 rounded-2xl border p-3 ${team === t.id ? 'border-brand bg-brand/15' : 'border-line bg-ink-900'}`}>
                <input type="radio" name="team" className="h-5 w-5 accent-brand" checked={team === t.id} onChange={() => setTeam(t.id)} />
                <span className="flex-1 font-semibold">{t.name}</span>
                <span className="muted text-xs">{t.members} na equipe</span>
              </label>
            ))}
          </fieldset>
        )}
        {error && <p role="alert" className="text-sm text-rose-400">{error}</p>}
        <button className="btn btn-primary w-full py-4 text-lg" disabled={busy || code.length < 6 || !nickname.trim() || (teams.length > 0 && !team)}>
          {busy ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
    </main>
  )
}

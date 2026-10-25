'use client'
import { useCallback, useEffect, useState } from 'react'
import { RotateCcw, Trash2, Trophy } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAdmin } from '@/lib/useAdmin'

type Row = {
  user_id: string
  nickname: string
  total_score: number
  games_played: number
  wins: number
  correct_total: number
  answered_total: number
}

const MEDAL = ['bg-yellow-400 text-ink-900', 'bg-slate-300 text-ink-900', 'bg-amber-600 text-white']

export default function RankingPage() {
  const { isAdmin } = useAdmin()
  const [rows, setRows] = useState<Row[] | null>(null)
  const [confirmReset, setConfirmReset] = useState(false)
  const [clearHistory, setClearHistory] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('global_ranking')
      .select('*')
      .order('total_score', { ascending: false })
      .limit(100)
    setRows((data ?? []) as Row[])
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function removeRow(r: Row) {
    if (!window.confirm(`Tirar “${r.nickname}” do ranking permanente? Os pontos acumulados dele serão apagados.`)) return
    const { error } = await supabase.rpc('admin_remove_from_ranking', { p_user: r.user_id })
    setMsg(error ? error.message : `“${r.nickname}” saiu do ranking.`)
    load()
  }

  async function resetAll() {
    setBusy(true)
    const { error } = await supabase.rpc('admin_reset_ranking', { p_clear_history: clearHistory })
    setBusy(false)
    setConfirmReset(false)
    setClearHistory(false)
    setMsg(error ? error.message : clearHistory ? 'Ranking zerado e histórico apagado.' : 'Ranking zerado.')
    load()
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="flex items-center gap-3 text-4xl font-extrabold">
        <Trophy className="h-9 w-9 text-brand" aria-hidden /> Ranking permanente
      </h1>
      <p className="muted mt-2">Pontos e desempenho acumulados nas competições. O treino individual não conta aqui.</p>

      {isAdmin && (
        <div className="mt-6">
          {!confirmReset ? (
            <button onClick={() => setConfirmReset(true)} disabled={!rows || rows.length === 0} className="btn btn-ghost !py-2.5 text-rose-300">
              <RotateCcw className="h-4 w-4" aria-hidden /> Zerar ranking
            </button>
          ) : (
            <div role="alertdialog" aria-labelledby="zerar-titulo" className="card space-y-4 border-rose-500/50">
              <p id="zerar-titulo" className="font-semibold">
                Zerar o ranking permanente de todos os participantes? Isso não pode ser desfeito.
              </p>
              <label className="flex items-center gap-3 text-sm">
                <input type="checkbox" className="h-5 w-5 accent-rose-500" checked={clearHistory} onChange={(e) => setClearHistory(e.target.checked)} />
                Apagar também o histórico de partidas
              </label>
              <div className="flex gap-3">
                <button onClick={resetAll} disabled={busy} className="btn btn-danger">
                  {busy ? 'Zerando…' : 'Zerar agora'}
                </button>
                <button onClick={() => setConfirmReset(false)} disabled={busy} className="btn btn-ghost">
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </div>
      )}
      {msg && (
        <p role="status" className="muted mt-4 text-sm">
          {msg}
        </p>
      )}

      {rows === null ? (
        <p className="muted mt-8">Carregando…</p>
      ) : rows.length === 0 ? (
        <div className="card mt-8 text-center">
          <p className="muted">Ainda não há partidas concluídas. Termine uma competição para aparecer aqui.</p>
        </div>
      ) : (
        <ol className="mt-8 space-y-2">
          {rows.map((r, i) => (
            <li key={r.user_id} className="card flex items-center gap-4 !rounded-2xl !p-4">
              <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-full font-bold ${MEDAL[i] ?? 'bg-ink-700'}`}>{i + 1}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-lg font-semibold">{r.nickname}</p>
                <p className="muted text-sm">
                  {r.games_played} {r.games_played === 1 ? 'partida' : 'partidas'} · {r.wins} {r.wins === 1 ? 'vitória' : 'vitórias'} ·{' '}
                  {r.answered_total ? Math.round((r.correct_total / r.answered_total) * 100) : 0}% de acertos
                </p>
              </div>
              <p className="font-display text-2xl font-extrabold">{r.total_score}</p>
              {isAdmin && (
                <button
                  onClick={() => removeRow(r)}
                  aria-label={`Tirar ${r.nickname} do ranking`}
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-rose-300 hover:bg-ink-700"
                >
                  <Trash2 className="h-4 w-4" aria-hidden />
                </button>
              )}
            </li>
          ))}
        </ol>
      )}
    </main>
  )
}

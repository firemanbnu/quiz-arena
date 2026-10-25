'use client'
import { useEffect, useState } from 'react'
import { Trophy } from 'lucide-react'
import { supabase } from '@/lib/supabase'

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
  const [rows, setRows] = useState<Row[] | null>(null)

  useEffect(() => {
    supabase
      .from('global_ranking')
      .select('*')
      .order('total_score', { ascending: false })
      .limit(100)
      .then(({ data }) => setRows((data ?? []) as Row[]))
  }, [])

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="flex items-center gap-3 text-4xl font-extrabold">
        <Trophy className="h-9 w-9 text-brand" aria-hidden /> Ranking permanente
      </h1>
      <p className="muted mt-2">Pontos e desempenho acumulados nas competições. O treino individual não conta aqui.</p>

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
            </li>
          ))}
        </ol>
      )}
    </main>
  )
}

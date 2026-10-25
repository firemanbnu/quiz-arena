'use client'
import { useEffect, useMemo, useState } from 'react'
import { History } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { formatDateTime } from '@/lib/format'

type Row = {
  session_id: string
  nickname: string
  topic_name: string | null
  final_rank: number
  score: number
  correct_count: number
  total_questions: number
  played_at: string
}

type Match = { id: string; topic: string; playedAt: string; total: number; players: Row[] }

const MEDAL = ['bg-yellow-400 text-ink-900', 'bg-slate-300 text-ink-900', 'bg-amber-600 text-white']

export default function HistoricoPage() {
  const [rows, setRows] = useState<Row[] | null>(null)

  useEffect(() => {
    supabase
      .from('match_history')
      .select('session_id,nickname,topic_name,final_rank,score,correct_count,total_questions,played_at')
      .order('played_at', { ascending: false })
      .limit(500)
      .then(({ data }) => setRows((data ?? []) as Row[]))
  }, [])

  const matches = useMemo<Match[]>(() => {
    const map = new Map<string, Match>()
    for (const r of rows ?? []) {
      const m = map.get(r.session_id) ?? {
        id: r.session_id,
        topic: r.topic_name ?? 'Sem assunto',
        playedAt: r.played_at,
        total: r.total_questions,
        players: [],
      }
      m.players.push(r)
      map.set(r.session_id, m)
    }
    const list = [...map.values()]
    list.forEach((m) => m.players.sort((a, b) => a.final_rank - b.final_rank || b.score - a.score))
    return list
  }, [rows])

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="flex items-center gap-3 text-4xl font-extrabold">
        <History className="h-9 w-9 text-brand" aria-hidden /> Histórico de partidas
      </h1>
      <p className="muted mt-2">Competições já finalizadas, com o pódio de cada uma. O treino individual não aparece aqui.</p>

      {rows === null ? (
        <p className="muted mt-8">Carregando…</p>
      ) : matches.length === 0 ? (
        <div className="card mt-8 text-center">
          <p className="muted">Nenhuma competição finalizada ainda.</p>
        </div>
      ) : (
        <div className="mt-8 space-y-4">
          {matches.map((m) => (
            <details key={m.id} className="card group !p-0">
              <summary className="flex cursor-pointer list-none items-center gap-4 p-5">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-display text-xl font-bold">{m.topic}</p>
                  <p className="muted text-sm">
                    {formatDateTime(m.playedAt)} · {m.total} perguntas · {m.players.length}{' '}
                    {m.players.length === 1 ? 'participante' : 'participantes'}
                  </p>
                </div>
                <div className="text-right">
                  <p className="muted text-xs">Vencedor</p>
                  <p className="font-semibold">{m.players[0]?.nickname}</p>
                </div>
              </summary>
              <ol className="space-y-2 border-t border-line p-5">
                {m.players.map((p, i) => (
                  <li key={p.nickname + i} className="flex items-center gap-3">
                    <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-sm font-bold ${MEDAL[p.final_rank - 1] ?? 'bg-ink-700'}`}>
                      {p.final_rank}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{p.nickname}</span>
                    <span className="muted text-sm">
                      {p.correct_count}/{p.total_questions}
                    </span>
                    <span className="w-16 text-right font-bold">{p.score}</span>
                  </li>
                ))}
              </ol>
            </details>
          ))}
        </div>
      )}
    </main>
  )
}

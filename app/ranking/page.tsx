'use client'
import { useEffect, useState } from 'react'
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
    <main className="mx-auto max-w-3xl p-6">
      <h1 className="mb-6 text-4xl font-black">Ranking permanente</h1>
      {rows === null ? (
        <p className="text-slate-400">Carregando…</p>
      ) : rows.length === 0 ? (
        <p className="text-slate-400">Ainda não há partidas concluídas. Termine uma partida para aparecer aqui.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="text-sm text-slate-400">
              <tr>
                <th className="py-2">#</th>
                <th>Jogador</th>
                <th className="text-right">Pontos</th>
                <th className="text-right">Partidas</th>
                <th className="text-right">Vitórias</th>
                <th className="text-right">Acertos</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.user_id} className="border-t border-slate-800">
                  <td className="py-2">{i + 1}</td>
                  <td>{r.nickname}</td>
                  <td className="text-right font-bold">{r.total_score}</td>
                  <td className="text-right">{r.games_played}</td>
                  <td className="text-right">{r.wins}</td>
                  <td className="text-right">
                    {r.answered_total ? Math.round((r.correct_total / r.answered_total) * 100) : 0}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <a href="/" className="mt-6 inline-block underline">Voltar</a>
    </main>
  )
}

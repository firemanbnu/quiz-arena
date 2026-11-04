'use client'
import { useEffect, useMemo, useState } from 'react'
import { Lightbulb, Target } from 'lucide-react'
import { LevelChip, PctBar, Stat, TopicList, fmtPct, toTopic, type TopicRow } from '@/components/PerfBits'
import { supabase } from '@/lib/supabase'
import { formatDateTime } from '@/lib/format'

type Wrong = {
  session_id: string
  played_at: string
  pos: number
  topic_name: string
  question_id: string
  question_text: string
  chosen_text: string | null
  correct_text: string | null
  explanation: string | null
  status: 'wrong' | 'unanswered'
}
type Summary = { games: number; asked: number; correct: number; wrong: number; unanswered: number; pct: number }

/** Meu desempenho: cada pessoa vê somente os próprios dados (o servidor só entrega as respostas do próprio usuário). */
export default function MeuDesempenhoPage() {
  const [sum, setSum] = useState<Summary | null>(null)
  const [topics, setTopics] = useState<TopicRow[] | null>(null)
  const [wrong, setWrong] = useState<Wrong[]>([])
  const [topicFilter, setTopicFilter] = useState<string | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let alive = true
    Promise.all([supabase.rpc('my_perf_summary'), supabase.rpc('my_perf_by_topic'), supabase.rpc('my_perf_wrong')]).then(([s, t, w]) => {
      if (!alive) return
      if (s.error || t.error || w.error) {
        setError('Não foi possível carregar o seu desempenho.')
        setTopics([])
        return
      }
      const row = (Array.isArray(s.data) ? s.data[0] : s.data) as any
      setSum(row ? { games: Number(row.games), asked: Number(row.asked), correct: Number(row.correct), wrong: Number(row.wrong), unanswered: Number(row.unanswered), pct: Number(row.pct) } : null)
      setTopics(((t.data ?? []) as any[]).map(toTopic))
      setWrong((w.data ?? []) as Wrong[])
    })
    return () => {
      alive = false
    }
  }, [])

  const shown = useMemo(() => wrong.filter((w) => !topicFilter || w.topic_name === topicFilter), [wrong, topicFilter])

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="flex items-center gap-3 text-4xl font-extrabold">
          <Target className="h-9 w-9 text-brand" aria-hidden /> Meu desempenho
        </h1>
        {sum && sum.asked > 0 && <LevelChip pct={sum.pct} />}
      </div>
      <p className="muted mt-2">Só você vê estes dados. Contam as partidas já encerradas.</p>

      {error && <p role="alert" className="mt-6 text-rose-400">{error}</p>}
      {topics === null ? (
        <p className="muted mt-8">Carregando…</p>
      ) : !sum || sum.asked === 0 ? (
        <div className="card mt-8 text-center">
          <p className="muted">Você ainda não tem partidas encerradas. Depois da sua primeira competição, seu desempenho aparece aqui.</p>
        </div>
      ) : (
        <>
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Aproveitamento" value={fmtPct(sum.pct)} hint={`${sum.correct} de ${sum.asked}`} />
            <Stat label="Erros" value={String(sum.wrong)} />
            <Stat label="Sem resposta" value={String(sum.unanswered)} />
            <Stat label="Partidas" value={String(sum.games)} />
          </div>
          <div className="mt-3">
            <PctBar pct={sum.pct} label="Meu aproveitamento" />
          </div>

          <section className="mt-8" aria-label="Assuntos">
            <TopicList rows={topics} onPick={setTopicFilter} active={topicFilter} />
            <p className="muted mt-2 text-xs">Toque em um assunto para ver só as questões que você errou nele.</p>
          </section>

          <section className="mt-10" aria-label="Questões erradas">
            <div className="mb-3 flex flex-wrap items-center gap-3">
              <h2 className="font-display text-xl font-bold">
                Questões que errei ({shown.length}
                {topicFilter ? ` em ${topicFilter}` : ''})
              </h2>
              {topicFilter && (
                <button onClick={() => setTopicFilter(null)} className="btn btn-ghost !px-3 !py-1.5 text-sm">
                  Ver todas
                </button>
              )}
            </div>
            {shown.length === 0 ? (
              <p className="muted text-sm">Nenhuma questão errada nesta seleção.</p>
            ) : (
              <ul className="space-y-3">
                {shown.map((w) => (
                  <li key={`${w.session_id}-${w.pos}`} className="card !rounded-2xl !p-4">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="rounded-full bg-ink-700 px-2.5 py-0.5 font-semibold">{w.topic_name}</span>
                      <span className={`rounded-full px-2.5 py-0.5 font-bold ${w.status === 'wrong' ? 'bg-rose-500/20 text-rose-200' : 'bg-slate-500/25 text-slate-200'}`}>
                        {w.status === 'wrong' ? 'Errei' : 'Sem resposta'}
                      </span>
                      <span className="muted">{formatDateTime(w.played_at)}</span>
                    </div>
                    <p className="mt-2 font-semibold leading-snug">{w.question_text}</p>
                    {w.status === 'wrong' && (
                      <p className="mt-2 text-sm">
                        <span className="muted">Marquei: </span>
                        {w.chosen_text ?? '—'}
                      </p>
                    )}
                    <p className="mt-1 text-sm">
                      <span className="muted">Resposta certa: </span>
                      <strong>{w.correct_text ?? '—'}</strong>
                    </p>
                    {w.explanation && (
                      <div className="mt-3 flex gap-3 rounded-xl bg-black/25 p-3 text-sm">
                        <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" aria-hidden />
                        <p className="leading-relaxed">{w.explanation}</p>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </main>
  )
}

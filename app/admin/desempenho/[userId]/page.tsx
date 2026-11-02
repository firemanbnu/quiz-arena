'use client'
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { ArrowLeft, Lightbulb } from 'lucide-react'
import AdminGate from '@/components/AdminGate'
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
type Person = { nickname: string; email: string | null; games: number; asked: number; correct: number; wrong: number; unanswered: number; pct: number }

export default function ParticipantePage() {
  return (
    <AdminGate>
      <Detalhe />
    </AdminGate>
  )
}

function Detalhe() {
  const { userId } = useParams<{ userId: string }>()
  const [session, setSession] = useState<string | null | undefined>(undefined) // undefined = ainda lendo a URL
  const [person, setPerson] = useState<Person | null>(null)
  const [topics, setTopics] = useState<TopicRow[] | null>(null)
  const [wrong, setWrong] = useState<Wrong[]>([])
  const [topicFilter, setTopicFilter] = useState<string | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    setSession(new URLSearchParams(window.location.search).get('partida'))
  }, [])

  useEffect(() => {
    if (session === undefined) return
    let alive = true
    Promise.all([
      supabase.rpc('perf_participants', { p_session: session }),
      supabase.rpc('perf_by_topic', { p_user: userId, p_session: session }),
      supabase.rpc('perf_wrong_answers', { p_user: userId, p_session: session }),
    ]).then(([p, t, w]) => {
      if (!alive) return
      if (p.error || t.error || w.error) {
        setError('Não foi possível carregar este participante.')
        setTopics([])
        return
      }
      const me = ((p.data ?? []) as any[]).find((r) => r.user_id === userId)
      setPerson(me ? { ...me, games: Number(me.games), asked: Number(me.asked), correct: Number(me.correct), wrong: Number(me.wrong), unanswered: Number(me.unanswered), pct: Number(me.pct) } : null)
      setTopics(((t.data ?? []) as any[]).map(toTopic))
      setWrong((w.data ?? []) as Wrong[])
    })
    return () => {
      alive = false
    }
  }, [userId, session])

  const shown = useMemo(() => wrong.filter((w) => !topicFilter || w.topic_name === topicFilter), [wrong, topicFilter])
  const back = `/admin/desempenho`

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <Link href={back} className="muted inline-flex items-center gap-2 text-sm hover:text-white">
        <ArrowLeft className="h-4 w-4" aria-hidden /> Desempenho
      </Link>

      {error && <p role="alert" className="mt-6 text-rose-400">{error}</p>}
      {topics === null ? (
        <p className="muted mt-8">Carregando…</p>
      ) : !person ? (
        <div className="card mt-8 text-center">
          <p className="muted">Sem dados deste participante nas partidas finalizadas.</p>
        </div>
      ) : (
        <>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <h1 className="text-4xl font-extrabold">{person.nickname}</h1>
            <LevelChip pct={person.pct} />
          </div>
          {person.email && <p className="muted mt-1 text-sm">{person.email}</p>}
          {session && <p className="muted mt-1 text-sm">Somente a partida selecionada.</p>}

          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Aproveitamento" value={fmtPct(person.pct)} hint={`${person.correct} de ${person.asked}`} />
            <Stat label="Erros" value={String(person.wrong)} />
            <Stat label="Sem resposta" value={String(person.unanswered)} />
            <Stat label="Partidas" value={String(person.games)} />
          </div>
          <div className="mt-3">
            <PctBar pct={person.pct} label={person.nickname} />
          </div>

          <section className="mt-8" aria-label="Assuntos">
            <TopicList rows={topics} onPick={setTopicFilter} active={topicFilter} />
            <p className="muted mt-2 text-xs">Toque em um assunto para ver só as questões erradas dele.</p>
          </section>

          <section className="mt-10" aria-label="Questões erradas">
            <div className="mb-3 flex flex-wrap items-center gap-3">
              <h2 className="font-display text-xl font-bold">
                Questões erradas ({shown.length}
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
                        {w.status === 'wrong' ? 'Errou' : 'Sem resposta'}
                      </span>
                      <span className="muted">{formatDateTime(w.played_at)}</span>
                    </div>
                    <p className="mt-2 font-semibold leading-snug">{w.question_text}</p>
                    {w.status === 'wrong' && (
                      <p className="mt-2 text-sm">
                        <span className="muted">Marcou: </span>
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

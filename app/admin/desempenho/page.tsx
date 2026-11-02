'use client'
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { BarChart3, ChevronRight, Search } from 'lucide-react'
import AdminGate from '@/components/AdminGate'
import { LevelChip, PctBar, Stat, TopicList, fmtPct, toTopic, type TopicRow } from '@/components/PerfBits'
import { supabase } from '@/lib/supabase'
import { formatDateTime } from '@/lib/format'

type Sess = { id: string; topic_label: string | null; finished_at: string; players: number }
type Person = {
  user_id: string
  nickname: string
  email: string | null
  games: number
  asked: number
  correct: number
  wrong: number
  unanswered: number
  pct: number
  weak_topics: string[]
}
type Hard = { question_id: string; question_text: string; topic_name: string; asked: number; missed: number; pct_missed: number }

export default function DesempenhoPage() {
  return (
    <AdminGate>
      <Desempenho />
    </AdminGate>
  )
}

function Desempenho() {
  const [tab, setTab] = useState<'geral' | 'participantes'>('geral')
  const [sessions, setSessions] = useState<Sess[]>([])
  const [session, setSession] = useState('') // '' = todas as partidas
  const [topics, setTopics] = useState<TopicRow[] | null>(null)
  const [people, setPeople] = useState<Person[] | null>(null)
  const [hard, setHard] = useState<Hard[]>([])
  const [error, setError] = useState('')
  const [q, setQ] = useState('')

  useEffect(() => {
    supabase.rpc('perf_sessions').then(({ data }) => setSessions((data ?? []) as Sess[]))
  }, [])

  useEffect(() => {
    let alive = true
    setTopics(null)
    setPeople(null)
    setError('')
    const p_session = session || null
    Promise.all([
      supabase.rpc('perf_by_topic', { p_user: null, p_session }),
      supabase.rpc('perf_participants', { p_session }),
      supabase.rpc('perf_hard_questions', { p_session }),
    ]).then(([t, p, h]) => {
      if (!alive) return
      if (t.error || p.error || h.error) {
        setError('Não foi possível carregar o desempenho.')
        setTopics([])
        setPeople([])
        return
      }
      setTopics(((t.data ?? []) as any[]).map(toTopic))
      setPeople(((p.data ?? []) as any[]).map((r) => ({ ...r, games: Number(r.games), asked: Number(r.asked), correct: Number(r.correct), wrong: Number(r.wrong), unanswered: Number(r.unanswered), pct: Number(r.pct) })))
      setHard(((h.data ?? []) as any[]).map((r) => ({ ...r, asked: Number(r.asked), missed: Number(r.missed), pct_missed: Number(r.pct_missed) })))
    })
    return () => {
      alive = false
    }
  }, [session])

  const totals = useMemo(() => {
    const t = topics ?? []
    const asked = t.reduce((s, r) => s + r.asked, 0)
    const correct = t.reduce((s, r) => s + r.correct, 0)
    return { asked, correct, pct: asked ? Math.round((correct / asked) * 1000) / 10 : 0, weak: t.filter((r) => r.pct < 70).length }
  }, [topics])

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    return (people ?? []).filter((p) => !s || p.nickname.toLowerCase().includes(s) || (p.email ?? '').toLowerCase().includes(s))
  }, [people, q])

  const loading = topics === null || people === null
  const empty = !loading && totals.asked === 0

  return (
    <main className="mx-auto max-w-4xl px-4 py-10">
      <h1 className="flex items-center gap-3 text-4xl font-extrabold">
        <BarChart3 className="h-9 w-9 text-brand" aria-hidden /> Desempenho
      </h1>
      <p className="muted mt-2">
        O que cada participante errou e quais assuntos precisam de reforço. Considera só partidas finalizadas; quem não respondeu a tempo conta como não acertou.
      </p>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <div role="tablist" aria-label="Visão" className="flex rounded-full bg-ink-800 p-1">
          {(['geral', 'participantes'] as const).map((t) => (
            <button
              key={t}
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={`rounded-full px-5 py-2 text-sm font-semibold ${tab === t ? 'bg-brand text-white' : 'text-slate-300 hover:text-white'}`}
            >
              {t === 'geral' ? 'Geral' : 'Por participante'}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-sm">
          <span className="muted">Partida</span>
          <select className="field !w-auto !py-2" value={session} onChange={(e) => setSession(e.target.value)}>
            <option value="">Todas ({sessions.length})</option>
            {sessions.map((s) => (
              <option key={s.id} value={s.id}>
                {formatDateTime(s.finished_at)} · {s.topic_label ?? 'Sem assunto'} · {s.players} jogadores
              </option>
            ))}
          </select>
        </label>
      </div>

      {error && <p role="alert" className="mt-6 text-rose-400">{error}</p>}
      {loading ? (
        <p className="muted mt-8">Carregando…</p>
      ) : empty ? (
        <div className="card mt-8 text-center">
          <p className="muted">Ainda não há partidas finalizadas para analisar.</p>
        </div>
      ) : tab === 'geral' ? (
        <div className="mt-8 space-y-8">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Aproveitamento" value={fmtPct(totals.pct)} hint={`${totals.correct} de ${totals.asked} respostas`} />
            <Stat label="Participantes" value={String(people!.length)} />
            <Stat label="Assuntos" value={String(topics!.length)} />
            <Stat label="A melhorar" value={String(totals.weak)} hint="assuntos abaixo de 70%" />
          </div>

          <TopicList rows={topics!} />

          <section aria-label="Questões mais erradas">
            <h2 className="mb-2 font-display text-xl font-bold">Questões mais erradas</h2>
            {hard.length === 0 ? (
              <p className="muted text-sm">Ninguém errou nada nesta seleção.</p>
            ) : (
              <ol className="space-y-2">
                {hard.map((h, i) => (
                  <li key={h.question_id ?? i} className="card !rounded-2xl !p-4">
                    <div className="flex items-start gap-3">
                      <p className="min-w-0 flex-1 font-semibold leading-snug">{h.question_text}</p>
                      <span className="shrink-0 font-display text-lg font-extrabold">{fmtPct(h.pct_missed)}</span>
                    </div>
                    <p className="muted mt-1 text-xs">
                      {h.topic_name} · errada ou sem resposta por {h.missed} de {h.asked} participantes
                    </p>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
      ) : (
        <div className="mt-8">
          <label className="relative block">
            <span className="sr-only">Buscar participante</span>
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
            <input className="field !pl-11" placeholder="Buscar participante" value={q} onChange={(e) => setQ(e.target.value)} />
          </label>
          <p className="muted mt-3 text-sm">Do menor para o maior aproveitamento. Toque em um participante para ver as questões que errou.</p>
          <ul className="mt-4 space-y-2">
            {filtered.map((p) => (
              <li key={p.user_id}>
                <Link
                  href={`/admin/desempenho/${p.user_id}${session ? `?partida=${session}` : ''}`}
                  className="card flex items-center gap-4 !rounded-2xl !p-4 transition-colors hover:border-brand/60"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="min-w-0 truncate text-lg font-semibold">{p.nickname}</span>
                      <LevelChip pct={p.pct} />
                    </div>
                    {p.email && <p className="muted truncate text-xs">{p.email}</p>}
                    <div className="mt-2">
                      <PctBar pct={p.pct} label={p.nickname} />
                    </div>
                    <p className="muted mt-1.5 text-xs">
                      {p.wrong} erros · {p.unanswered} sem resposta · {p.games} {p.games === 1 ? 'partida' : 'partidas'}
                    </p>
                    {p.weak_topics.length > 0 && (
                      <p className="mt-1.5 text-xs">
                        <span className="muted">Melhorar: </span>
                        {p.weak_topics.join(' · ')}
                      </p>
                    )}
                  </div>
                  <span className="font-display text-2xl font-extrabold">{fmtPct(p.pct)}</span>
                  <ChevronRight className="h-5 w-5 shrink-0 text-slate-400" aria-hidden />
                </Link>
              </li>
            ))}
            {filtered.length === 0 && <p className="muted text-sm">Nenhum participante encontrado.</p>}
          </ul>
        </div>
      )}
    </main>
  )
}

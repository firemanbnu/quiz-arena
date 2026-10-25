'use client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { ArrowLeft, CheckCircle2, Clock, Lightbulb, Pencil, Users } from 'lucide-react'
import { useGameRoom } from '@/hooks/useGameRoom'
import { supabase } from '@/lib/supabase'
import { cleanOptionTexts } from '@/lib/options'
import MountainRace from '@/components/MountainRace'
import QuestionEditor from '@/components/QuestionEditor'

const GRACE_MS = 2500 // folga após o tempo da pergunta (latência dos jogadores)
const REVEAL_MS = 2000 // tempo mostrando o resultado antes da próxima pergunta
const SHAPES = ['▲', '◆', '●', '■']
const COLORS = ['bg-rose-600', 'bg-sky-600', 'bg-amber-500', 'bg-emerald-600']

export default function HostSessionPage() {
  const { id } = useParams<{ id: string }>()
  const { session, participants, answers, question } = useGameRoom(id, { isHost: true })
  const [correctId, setCorrectId] = useState<string | null>(null)
  const [explanation, setExplanation] = useState<string | null>(null)
  const [secondsLeft, setSecondsLeft] = useState(0)
  const [editing, setEditing] = useState(false)
  const [questionId, setQuestionId] = useState<string | null>(null)

  const idx = session?.current_index ?? -1
  const status = session?.status
  const version = session?.edit_version ?? 0 // muda quando uma pergunta é corrigida

  // pergunta (do banco) que está em jogo, para o botão "Editar pergunta"
  useEffect(() => {
    if (idx < 0) {
      setQuestionId(null)
      return
    }
    let alive = true
    supabase
      .from('session_questions')
      .select('question_id')
      .eq('session_id', id)
      .eq('position', idx)
      .maybeSingle()
      .then(({ data }) => alive && setQuestionId((data?.question_id as string | null) ?? null))
    return () => {
      alive = false
    }
  }, [id, idx])

  // ---- avanço da máquina de estados (idempotente no servidor) ----
  const advance = useCallback(async () => {
    if (!session) return
    await supabase.rpc('host_advance', {
      p_session: session.id,
      p_from_status: session.status,
      p_from_index: session.current_index,
    })
  }, [session])

  const advanceRef = useRef(advance)
  advanceRef.current = advance

  const answeredIds = useMemo(
    () => new Set(answers.filter((a) => a.position === idx).map((a) => a.participant_id)),
    [answers, idx]
  )
  const everyoneAnswered = participants.length > 0 && answeredIds.size >= participants.length

  // 1) fecha a pergunta quando todos respondem
  useEffect(() => {
    if (status === 'question' && everyoneAnswered) advanceRef.current()
  }, [status, everyoneAnswered])

  // 2) ...ou quando o tempo acaba (rede de segurança)
  useEffect(() => {
    if (status !== 'question' || !session) return
    const t = setTimeout(() => advanceRef.current(), session.time_limit_s * 1000 + GRACE_MS)
    return () => clearTimeout(t)
  }, [status, idx, session?.time_limit_s]) // eslint-disable-line react-hooks/exhaustive-deps

  // 3) na revelação, aguarda e passa para a próxima pergunta (ou encerra)
  useEffect(() => {
    if (status !== 'reveal') return
    const t = setTimeout(() => advanceRef.current(), REVEAL_MS)
    return () => clearTimeout(t)
  }, [status, idx])

  // contagem visual (informativa)
  useEffect(() => {
    if (status !== 'question' || !session) return
    const end = Date.now() + session.time_limit_s * 1000
    setSecondsLeft(session.time_limit_s)
    const t = setInterval(() => setSecondsLeft(Math.max(0, Math.ceil((end - Date.now()) / 1000))), 250)
    return () => clearInterval(t)
  }, [status, idx, session?.time_limit_s]) // eslint-disable-line react-hooks/exhaustive-deps

  // gabarito e explicação na revelação
  useEffect(() => {
    if (status !== 'reveal' || idx < 0) {
      setCorrectId(null)
      setExplanation(null)
      return
    }
    supabase.rpc('get_correct_option', { p_session: id, p_pos: idx }).then(({ data }) => setCorrectId(data))
    supabase.rpc('get_question_explanation', { p_session: id, p_pos: idx }).then(({ data }) => setExplanation(data))
  }, [status, idx, id, version])

  // placar ao vivo: placar do banco (relido a cada fase) + pontos da pergunta em andamento
  const ranking = useMemo(() => {
    const live = new Map<string, number>()
    if (status === 'question') {
      answers
        .filter((a) => a.position === idx)
        .forEach((a) => live.set(a.participant_id, (live.get(a.participant_id) ?? 0) + a.points))
    }
    return participants
      .map((p) => ({ ...p, score: Math.max(0, p.score + (live.get(p.id) ?? 0)) }))
      .sort((a, b) => b.score - a.score || a.nickname.localeCompare(b.nickname))
  }, [participants, answers, status, idx])

  const texts = useMemo(() => cleanOptionTexts(question?.options.map((o) => o.text) ?? []), [question])

  if (!session) return <p className="muted p-8 text-center">Carregando…</p>

  const maxScore = session.question_count * 900

  // ---------------- Lobby ----------------
  if (status === 'lobby') {
    return (
      <main className="mx-auto max-w-3xl px-4 py-10 text-center">
        <Link href="/admin" className="muted inline-flex items-center gap-2 text-sm hover:text-white">
          <ArrowLeft className="h-4 w-4" aria-hidden /> Voltar
        </Link>
        <p className="muted mt-6">
          Entre em <strong className="text-white">{typeof window !== 'undefined' ? window.location.host : ''}</strong> e use o código
        </p>
        <h1 className="grad-text my-3 font-display text-8xl font-extrabold tracking-[0.15em]">{session.code}</h1>
        <p className="muted">
          {session.topic_label ? `${session.topic_label} · ` : ''}
          {session.question_count} perguntas · {session.time_limit_s}s por pergunta
        </p>

        <button disabled={participants.length === 0} onClick={advance} className="btn btn-primary mt-8 px-10 py-4 text-xl">
          Iniciar partida
        </button>

        <h2 className="mb-3 mt-10 flex items-center justify-center gap-2 text-lg font-semibold">
          <Users className="h-5 w-5" aria-hidden /> Na sala ({participants.length})
        </h2>
        <ul className="flex flex-wrap justify-center gap-2">
          {participants.map((p) => (
            <li key={p.id} className="rounded-full border border-line bg-ink-800 px-4 py-1.5">{p.nickname}</li>
          ))}
        </ul>
      </main>
    )
  }

  // ---------------- Final ----------------
  if (status === 'finished') {
    return (
      <main className="mx-auto max-w-3xl px-4 py-10">
        <h1 className="mb-6 text-4xl font-extrabold">Resultado final</h1>
        <MountainRace players={ranking} maxScore={maxScore} />
        <ol className="mt-6 space-y-2">
          {ranking.map((p, i) => (
            <li key={p.id} className="card flex items-center justify-between !rounded-2xl !p-4 text-lg">
              <span><span className="muted mr-3">{i + 1}º</span>{p.nickname}</span>
              <span className="font-display text-xl font-bold">{p.score}</span>
            </li>
          ))}
        </ol>
        <div className="mt-6 flex gap-3">
          <Link href="/admin" className="btn btn-primary">Nova competição</Link>
          <Link href="/historico" className="btn btn-secondary">Ver histórico</Link>
        </div>
      </main>
    )
  }

  // ---------------- Pergunta / Revelação ----------------
  return (
    <main className="grid min-h-screen gap-6 p-4 lg:grid-cols-[1fr_340px] lg:p-6">
      <section>
        <div className="mb-4 flex items-center justify-between">
          <span className="muted">
            Pergunta {idx + 1} de {session.question_count}
          </span>
          <span className="flex items-center gap-2 font-display text-4xl font-extrabold" aria-live="off">
            <Clock className="h-6 w-6 text-brand" aria-hidden /> {status === 'question' ? secondsLeft : '—'}
          </span>
        </div>

        <h1 className="mb-8 text-3xl font-bold leading-tight sm:text-4xl">{question?.text ?? '…'}</h1>

        <div className="grid gap-4 sm:grid-cols-2">
          {question?.options.map((o, i) => {
            const dim = status === 'reveal' && correctId && o.id !== correctId
            const count = answers.filter((a) => a.position === idx && a.option_id === o.id).length
            return (
              <div key={o.id} className={`${COLORS[i % 4]} flex items-center gap-4 rounded-2xl p-5 text-xl font-semibold ${dim ? 'opacity-30' : ''}`}>
                <span className="text-2xl" aria-hidden>{SHAPES[i % 4]}</span>
                <span className="flex-1">{texts[i] ?? o.text}</span>
                {status === 'reveal' && correctId === o.id && <CheckCircle2 className="h-6 w-6" aria-label="Resposta certa" />}
                {status === 'reveal' && <span className="rounded-full bg-black/25 px-2.5 py-0.5 text-sm">{count}</span>}
              </div>
            )
          })}
        </div>

        {status === 'reveal' && explanation && (
          <div className="card mt-6 flex gap-3" role="status">
            <Lightbulb className="mt-1 h-5 w-5 shrink-0 text-amber-300" aria-hidden />
            <p className="leading-relaxed">{explanation}</p>
          </div>
        )}

        <div className="mt-6 flex flex-wrap items-center gap-4">
          <span className="muted">{answeredIds.size}/{participants.length} responderam</span>
          <button onClick={advance} className="btn btn-secondary !py-2.5">
            {status === 'question' ? 'Encerrar pergunta' : 'Próxima'}
          </button>
          <button onClick={() => setEditing(true)} disabled={!questionId} className="btn btn-ghost !py-2.5">
            <Pencil className="h-4 w-4" aria-hidden /> Editar pergunta
          </button>
        </div>

        <div className="mt-6">
          <MountainRace players={ranking} maxScore={maxScore} />
        </div>
      </section>

      <aside className="space-y-6">
        <div className="card !p-4">
          <h2 className="mb-3 font-semibold">Ranking</h2>
          <ol className="space-y-1.5">
            {ranking.slice(0, 10).map((p, i) => (
              <li key={p.id} className="flex justify-between rounded-xl bg-ink-700 px-3 py-2">
                <span className="truncate">{i + 1}. {p.nickname}</span>
                <span className="font-bold">{p.score}</span>
              </li>
            ))}
          </ol>
        </div>
        <div className="card !p-4">
          <h2 className="mb-3 font-semibold">Participantes</h2>
          <ul className="space-y-1.5 text-sm">
            {participants.map((p) => (
              <li key={p.id} className="flex justify-between gap-2">
                <span className="truncate">{p.nickname}</span>
                <span className={answeredIds.has(p.id) ? 'text-emerald-400' : 'text-amber-400'}>
                  {status === 'question' ? (answeredIds.has(p.id) ? 'já respondeu' : 'respondendo…') : ''}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </aside>
      {editing && questionId && <QuestionEditor questionId={questionId} onClose={() => setEditing(false)} />}
    </main>
  )
}

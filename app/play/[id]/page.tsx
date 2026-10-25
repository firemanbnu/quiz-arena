'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { Lightbulb } from 'lucide-react'
import { useGameRoom } from '@/hooks/useGameRoom'
import { supabase, type Answer } from '@/lib/supabase'
import { cleanOptionTexts } from '@/lib/options'

const SHAPES = ['▲', '◆', '●', '■']
const COLORS = ['bg-rose-600', 'bg-sky-600', 'bg-amber-500', 'bg-emerald-600']

export default function PlayPage() {
  const { id } = useParams<{ id: string }>()
  const { session, participants, question, questionPos } = useGameRoom(id, { isHost: false })
  const [meId, setMeId] = useState<string | null>(null)
  const [chosen, setChosen] = useState<string | null>(null)
  const [msLeft, setMsLeft] = useState(0)
  const [correctId, setCorrectId] = useState<string | null>(null)
  const [explanation, setExplanation] = useState<string | null>(null)
  const [myAnswer, setMyAnswer] = useState<Answer | null>(null)

  // Cronômetro LOCAL: começa quando a pergunta chega neste dispositivo (performance.now é monotônico)
  const startedAt = useRef(0)
  const sent = useRef(false)

  const idx = session?.current_index ?? -1
  const status = session?.status
  const limitMs = (session?.time_limit_s ?? 0) * 1000
  const version = session?.edit_version ?? 0 // muda quando o admin corrige uma pergunta
  // a pergunta carregada é a da posição atual (evita mostrar a anterior e permite o cronômetro
  // começar só quando a pergunta chega); correções durante a pergunta NÃO reiniciam o cronômetro
  const ready = !!question && questionPos === idx

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setMeId(data.user?.id ?? null))
  }, [])

  // nova pergunta disponível → zera estado e inicia o relógio local
  useEffect(() => {
    if (status !== 'question' || !ready) return
    startedAt.current = performance.now()
    sent.current = false
    setChosen(null)
    setCorrectId(null)
    setExplanation(null)
    setMyAnswer(null)
    setMsLeft(limitMs)
    const t = setInterval(() => {
      const left = Math.max(0, limitMs - (performance.now() - startedAt.current))
      setMsLeft(left)
      if (left === 0) clearInterval(t)
    }, 100)
    return () => clearInterval(t)
  }, [status, idx, ready, limitMs])

  async function answer(optionId: string) {
    if (sent.current || msLeft <= 0 || status !== 'question' || !ready) return
    sent.current = true
    const elapsed = Math.round(performance.now() - startedAt.current) // medido no dispositivo
    setChosen(optionId)
    await supabase.rpc('submit_answer', { p_session: id, p_option: optionId, p_elapsed_ms: elapsed })
  }

  // revelação: gabarito, explicação e minha resposta (liberados pelo RLS só após o fechamento)
  useEffect(() => {
    if (status !== 'reveal') return
    supabase.rpc('get_correct_option', { p_session: id, p_pos: idx }).then(({ data }) => setCorrectId(data))
    supabase.rpc('get_question_explanation', { p_session: id, p_pos: idx }).then(({ data }) => setExplanation(data))
    supabase
      .from('answers')
      .select('*')
      .eq('session_id', id)
      .eq('position', idx)
      .maybeSingle()
      .then(({ data }) => setMyAnswer(data as Answer | null))
  }, [status, idx, id, version])

  const ranking = useMemo(() => [...participants].sort((a, b) => b.score - a.score), [participants])
  const texts = useMemo(() => cleanOptionTexts(question?.options.map((o) => o.text) ?? []), [question])
  const me = ranking.find((p) => p.user_id === meId)
  const myRank = me ? ranking.indexOf(me) + 1 : null

  if (!session) return <p className="muted p-8 text-center">Entrando na sala…</p>

  if (status === 'lobby') {
    return (
      <main className="grid min-h-screen place-items-center p-6 text-center">
        <div>
          <p className="muted">Sala {session.code}</p>
          <h1 className="mt-2 text-3xl font-extrabold">
            Você está dentro{me ? <>, <span className="grad-text">{me.nickname}</span></> : ''}!
          </h1>
          <p className="muted mt-3">Aguardando o host iniciar…</p>
        </div>
      </main>
    )
  }

  if (status === 'finished') {
    return (
      <main className="mx-auto max-w-md p-6 text-center">
        <h1 className="text-3xl font-extrabold">Fim da partida</h1>
        <p className="grad-text mt-4 font-display text-8xl font-extrabold">{myRank}º</p>
        <p className="muted">{me?.score ?? 0} pontos</p>
        <ol className="mt-6 space-y-1.5 text-left">
          {ranking.slice(0, 5).map((p, i) => (
            <li key={p.id} className={`flex justify-between rounded-xl px-3 py-2 ${p.id === me?.id ? 'bg-brand/25' : 'bg-ink-700'}`}>
              <span>{i + 1}. {p.nickname}</span>
              <span className="font-bold">{p.score}</span>
            </li>
          ))}
        </ol>
        <div className="mt-6 flex justify-center gap-3">
          <Link href="/ranking" className="btn btn-secondary">Ranking permanente</Link>
          <Link href="/" className="btn btn-ghost">Início</Link>
        </div>
      </main>
    )
  }

  if (status === 'reveal') {
    const ok = myAnswer?.is_correct
    return (
      <main className={`grid min-h-screen place-items-center p-6 text-center ${myAnswer ? (ok ? 'bg-emerald-800' : 'bg-rose-800') : 'bg-ink-800'}`}>
        <div className="max-w-md">
          <p className="font-display text-5xl font-extrabold">{myAnswer ? (ok ? 'Acertou!' : 'Errou') : 'Sem resposta'}</p>
          <p className="mt-2 text-2xl">{myAnswer ? `${myAnswer.points > 0 ? '+' : ''}${myAnswer.points} pontos` : '0 pontos'}</p>
          <p className="mt-6 text-lg">Você está em {myRank}º · {me?.score ?? 0} pts</p>
          {explanation && (
            <div className="mt-6 flex gap-3 rounded-2xl bg-black/25 p-4 text-left" role="status">
              <Lightbulb className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" aria-hidden />
              <p className="leading-relaxed">{explanation}</p>
            </div>
          )}
          {correctId && question && !ok && (
            <p className="mt-4 text-sm">
              Resposta certa: <strong>{texts[question.options.findIndex((o) => o.id === correctId)]}</strong>
            </p>
          )}
        </div>
      </main>
    )
  }

  // status === 'question'
  const answered = chosen !== null
  return (
    <main className="flex min-h-screen flex-col p-4">
      <div className="mb-3 h-2 overflow-hidden rounded-full bg-ink-700" aria-hidden>
        <div className="h-full bg-gradient-to-r from-brand to-aqua" style={{ width: `${limitMs ? (msLeft / limitMs) * 100 : 0}%` }} />
      </div>
      <p className="muted mb-4 text-center">{Math.ceil(msLeft / 1000)}s</p>
      <h1 className="mb-4 text-center text-2xl font-bold">{ready ? question?.text : ''}</h1>
      {!ready ? (
        <div className="grid flex-1 place-items-center text-center">
          <p className="muted text-xl">Carregando pergunta…</p>
        </div>
      ) : answered ? (
        <div className="grid flex-1 place-items-center text-center">
          <p className="text-2xl font-bold">Resposta enviada. Aguardando os outros…</p>
        </div>
      ) : msLeft <= 0 ? (
        <div className="grid flex-1 place-items-center text-center">
          <p className="text-2xl font-bold">Tempo esgotado</p>
        </div>
      ) : (
        <div className="grid flex-1 grid-cols-1 gap-3 sm:grid-cols-2">
          {question?.options.map((o, i) => (
            <button
              key={o.id}
              onClick={() => answer(o.id)}
              className={`${COLORS[i % 4]} flex items-center gap-3 rounded-2xl p-5 text-left text-xl font-semibold active:scale-95`}
            >
              <span className="text-2xl" aria-hidden>{SHAPES[i % 4]}</span>
              {texts[i] ?? o.text}
            </button>
          ))}
        </div>
      )}
    </main>
  )
}

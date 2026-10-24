'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import { useGameRoom } from '@/hooks/useGameRoom'
import { supabase, type Answer } from '@/lib/supabase'
import { cleanOptionTexts } from '@/lib/options'

const SHAPES = ['▲', '◆', '●', '■']
const COLORS = ['bg-rose-600', 'bg-sky-600', 'bg-amber-500', 'bg-emerald-600']

export default function PlayPage() {
  const { id } = useParams<{ id: string }>()
  const { session, participants, question } = useGameRoom(id, { isHost: false })
  const [meId, setMeId] = useState<string | null>(null)
  const [chosen, setChosen] = useState<string | null>(null)
  const [msLeft, setMsLeft] = useState(0)
  const [correctId, setCorrectId] = useState<string | null>(null)
  const [myAnswer, setMyAnswer] = useState<Answer | null>(null)

  // Cronômetro LOCAL: começa quando a pergunta chega neste dispositivo (performance.now é monotônico)
  const startedAt = useRef(0)
  const sent = useRef(false)

  const idx = session?.current_index ?? -1
  const status = session?.status
  const limitMs = (session?.time_limit_s ?? 0) * 1000

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setMeId(data.user?.id ?? null))
  }, [])

  // nova pergunta disponível → zera estado e inicia o relógio local
  useEffect(() => {
    if (status !== 'question' || !question) return
    startedAt.current = performance.now()
    sent.current = false
    setChosen(null)
    setCorrectId(null)
    setMyAnswer(null)
    setMsLeft(limitMs)
    const t = setInterval(() => {
      const left = Math.max(0, limitMs - (performance.now() - startedAt.current))
      setMsLeft(left)
      if (left === 0) clearInterval(t)
    }, 100)
    return () => clearInterval(t)
  }, [status, idx, question, limitMs])

  async function answer(optionId: string) {
    if (sent.current || msLeft <= 0 || status !== 'question') return
    sent.current = true
    const elapsed = Math.round(performance.now() - startedAt.current) // medido no dispositivo
    setChosen(optionId)
    await supabase.rpc('submit_answer', {
      p_session: id,
      p_option: optionId,
      p_elapsed_ms: elapsed,
    })
  }

  // revelação: gabarito + minha resposta (liberados pelo RLS só após o fechamento)
  useEffect(() => {
    if (status !== 'reveal') return
    supabase.rpc('get_correct_option', { p_session: id, p_pos: idx }).then(({ data }) => setCorrectId(data))
    supabase
      .from('answers')
      .select('*')
      .eq('session_id', id)
      .eq('position', idx)
      .maybeSingle()
      .then(({ data }) => setMyAnswer(data as Answer | null))
  }, [status, idx, id])

  const ranking = useMemo(() => [...participants].sort((a, b) => b.score - a.score), [participants])
  const texts = useMemo(() => cleanOptionTexts(question?.options.map((o) => o.text) ?? []), [question])
  const me = ranking.find((p) => p.user_id === meId)
  const myRank = me ? ranking.indexOf(me) + 1 : null

  if (!session) return <p className="p-8">Entrando na sala…</p>

  if (status === 'lobby') {
    return (
      <main className="grid min-h-screen place-items-center p-6 text-center">
        <div>
          <h1 className="text-3xl font-black">Você está dentro{me ? `, ${me.nickname}` : ''}!</h1>
          <p className="mt-2 text-slate-400">Aguardando o host iniciar…</p>
        </div>
      </main>
    )
  }

  if (status === 'finished') {
    return (
      <main className="mx-auto max-w-md p-6 text-center">
        <h1 className="text-3xl font-black">Fim da partida</h1>
        <p className="mt-4 text-6xl font-black">{myRank}º</p>
        <p className="text-slate-400">{me?.score ?? 0} pontos</p>
        <ol className="mt-6 space-y-1 text-left">
          {ranking.slice(0, 5).map((p, i) => (
            <li key={p.id} className="flex justify-between rounded-lg bg-slate-800 px-3 py-2">
              <span>{i + 1}. {p.nickname}</span><span>{p.score}</span>
            </li>
          ))}
        </ol>
        <a href="/ranking" className="mt-6 inline-block underline">Ranking permanente</a>
      </main>
    )
  }

  if (status === 'reveal') {
    const ok = myAnswer?.is_correct
    return (
      <main className={`grid min-h-screen place-items-center p-6 text-center ${myAnswer ? (ok ? 'bg-emerald-700' : 'bg-rose-700') : 'bg-slate-800'}`}>
        <div>
          <p className="text-5xl font-black">{myAnswer ? (ok ? 'Acertou!' : 'Errou') : 'Sem resposta'}</p>
          <p className="mt-2 text-2xl">{myAnswer ? `${myAnswer.points > 0 ? '+' : ''}${myAnswer.points} pontos` : '0 pontos'}</p>
          <p className="mt-6 text-lg">Você está em {myRank}º · {me?.score ?? 0} pts</p>
        </div>
      </main>
    )
  }

  // status === 'question'
  const answered = chosen !== null
  return (
    <main className="flex min-h-screen flex-col p-4">
      <div className="mb-3 h-2 overflow-hidden rounded bg-slate-800">
        <div className="h-full bg-white" style={{ width: `${limitMs ? (msLeft / limitMs) * 100 : 0}%` }} />
      </div>
      <p className="mb-4 text-center text-slate-400">{Math.ceil(msLeft / 1000)}s</p>
      <h1 className="mb-4 text-center text-2xl font-bold">{question?.text}</h1>
      {answered ? (
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
              className={`${COLORS[i % 4]} flex items-center gap-3 rounded-xl p-5 text-left text-xl font-semibold active:scale-95`}
            >
              <span className="text-2xl">{SHAPES[i % 4]}</span>
              {texts[i] ?? o.text}
            </button>
          ))}
        </div>
      )}
    </main>
  )
}

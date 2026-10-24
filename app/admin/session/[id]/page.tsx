'use client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import { useGameRoom } from '@/hooks/useGameRoom'
import { supabase } from '@/lib/supabase'
import { cleanOptionTexts } from '@/lib/options'
import MountainRace from '@/components/MountainRace'

const GRACE_MS = 2500 // folga após o tempo da pergunta (latência dos jogadores)
const REVEAL_MS = 5000 // tempo mostrando o resultado antes da próxima pergunta
const SHAPES = ['▲', '◆', '●', '■']
const COLORS = ['bg-rose-600', 'bg-sky-600', 'bg-amber-500', 'bg-emerald-600']

export default function HostSessionPage() {
  const { id } = useParams<{ id: string }>()
  const { session, participants, answers, question } = useGameRoom(id, { isHost: true })
  const [correctId, setCorrectId] = useState<string | null>(null)
  const [secondsLeft, setSecondsLeft] = useState(0)

  const idx = session?.current_index ?? -1
  const status = session?.status

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

  // respostas da pergunta atual
  const answeredIds = useMemo(
    () => new Set(answers.filter((a) => a.position === idx).map((a) => a.participant_id)),
    [answers, idx]
  )
  const everyoneAnswered = participants.length > 0 && answeredIds.size >= participants.length

  // 1) fecha a pergunta quando todos respondem
  useEffect(() => {
    if (status === 'question' && everyoneAnswered) advanceRef.current()
  }, [status, everyoneAnswered])

  // 2) ...ou quando o tempo acaba (timer local do host só como rede de segurança)
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

  // contagem visual para o host (apenas informativa)
  useEffect(() => {
    if (status !== 'question' || !session) return
    const end = Date.now() + session.time_limit_s * 1000
    setSecondsLeft(session.time_limit_s)
    const t = setInterval(() => setSecondsLeft(Math.max(0, Math.ceil((end - Date.now()) / 1000))), 250)
    return () => clearInterval(t)
  }, [status, idx, session?.time_limit_s]) // eslint-disable-line react-hooks/exhaustive-deps

  // opção correta na revelação
  useEffect(() => {
    if (status !== 'reveal' || idx < 0) {
      setCorrectId(null)
      return
    }
    supabase.rpc('get_correct_option', { p_session: id, p_pos: idx }).then(({ data }) => setCorrectId(data))
  }, [status, idx, id])

  // placar ao vivo: placar do banco (relido a cada fase) + pontos das respostas da pergunta em andamento
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

  if (!session) return <p className="p-8">Carregando…</p>

  // ---------------- Lobby ----------------
  if (status === 'lobby') {
    return (
      <main className="mx-auto max-w-3xl p-6">
        <p className="text-slate-400">Entre em {typeof window !== 'undefined' && window.location.origin} com o código</p>
        <h1 className="my-2 text-7xl font-black tracking-widest">{session.code}</h1>
        <p className="mb-6 text-slate-400">
          {session.question_count} perguntas · {session.time_limit_s}s por pergunta
        </p>
        <button
          disabled={participants.length === 0}
          onClick={advance}
          className="rounded-xl bg-emerald-500 px-8 py-4 text-xl font-bold text-slate-950 disabled:opacity-40"
        >
          Iniciar partida
        </button>
        <h2 className="mb-2 mt-8 text-lg font-semibold">Na sala ({participants.length})</h2>
        <ul className="flex flex-wrap gap-2">
          {participants.map((p) => (
            <li key={p.id} className="rounded-full bg-slate-800 px-4 py-1">{p.nickname}</li>
          ))}
        </ul>
      </main>
    )
  }

  // ---------------- Final ----------------
  if (status === 'finished') {
    return (
      <main className="mx-auto max-w-2xl p-6">
        <h1 className="mb-6 text-4xl font-black">Resultado final</h1>
        <div className="mb-6">
          <MountainRace players={ranking} maxScore={session.question_count * 900} />
        </div>
        <ol className="space-y-2">
          {ranking.map((p, i) => (
            <li key={p.id} className="flex items-center justify-between rounded-xl bg-slate-800 px-5 py-3 text-xl">
              <span>{i + 1}º {p.nickname}</span>
              <span className="font-bold">{p.score}</span>
            </li>
          ))}
        </ol>
        <a href="/ranking" className="mt-6 inline-block underline">Ver ranking permanente</a>
      </main>
    )
  }

  // ---------------- Pergunta / Revelação ----------------
  return (
    <main className="grid min-h-screen gap-6 p-6 lg:grid-cols-[1fr_320px]">
      <section>
        <div className="mb-4 flex items-center justify-between text-slate-400">
          <span>Pergunta {idx + 1} de {session.question_count}</span>
          <span className="text-3xl font-black text-white">{status === 'question' ? secondsLeft : '—'}</span>
        </div>
        <h1 className="mb-8 text-3xl font-bold leading-tight">{question?.text ?? '…'}</h1>
        <div className="grid gap-4 sm:grid-cols-2">
          {question?.options.map((o, i) => {
            const dim = status === 'reveal' && correctId && o.id !== correctId
            const count = answers.filter((a) => a.position === idx && a.option_id === o.id).length
            return (
              <div key={o.id} className={`${COLORS[i % 4]} flex items-center gap-4 rounded-xl p-5 text-xl font-semibold ${dim ? 'opacity-30' : ''}`}>
                <span className="text-2xl">{SHAPES[i % 4]}</span>
                <span className="flex-1">{texts[i] ?? o.text}</span>
                {status === 'reveal' && <span className="text-sm">{count}</span>}
              </div>
            )
          })}
        </div>
        <div className="mt-6 flex items-center gap-4 text-slate-400">
          <span>{answeredIds.size}/{participants.length} responderam</span>
          <button onClick={advance} className="rounded-lg border border-slate-600 px-4 py-2 text-white">
            {status === 'question' ? 'Encerrar pergunta' : 'Próxima'}
          </button>
        </div>
        <div className="mt-6">
          <MountainRace players={ranking} maxScore={session.question_count * 900} />
        </div>
      </section>

      <aside className="space-y-6">
        <div>
          <h2 className="mb-2 font-semibold">Ranking</h2>
          <ol className="space-y-1">
            {ranking.slice(0, 10).map((p, i) => (
              <li key={p.id} className="flex justify-between rounded-lg bg-slate-800 px-3 py-2">
                <span>{i + 1}. {p.nickname}</span>
                <span className="font-bold">{p.score}</span>
              </li>
            ))}
          </ol>
        </div>
        <div>
          <h2 className="mb-2 font-semibold">Participantes</h2>
          <ul className="space-y-1 text-sm">
            {participants.map((p) => (
              <li key={p.id} className="flex justify-between">
                <span>{p.nickname}</span>
                <span className={answeredIds.has(p.id) ? 'text-emerald-400' : 'text-amber-400'}>
                  {status === 'question' ? (answeredIds.has(p.id) ? 'já respondeu' : 'respondendo…') : ''}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </aside>
    </main>
  )
}

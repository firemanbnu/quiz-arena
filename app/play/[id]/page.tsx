'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { Lightbulb } from 'lucide-react'
import { useGameRoom } from '@/hooks/useGameRoom'
import { supabase, type Answer } from '@/lib/supabase'
import { QuestionReviewCard, loadReview, type ReviewA, type ReviewQ } from '@/components/ReviewBits'
import { cleanOptionTexts } from '@/lib/options'
import TeamBoard from '@/components/TeamBoard'
import { useTeamScores } from '@/hooks/useTeamScores'

const SHAPES = ['▲', '◆', '●', '■']
const COLORS = ['bg-rose-600', 'bg-sky-600', 'bg-amber-500', 'bg-emerald-600']

export default function PlayPage() {
  const { id } = useParams<{ id: string }>()
  const { session, participants, question, questionPos } = useGameRoom(id, { isHost: false })
  const [meId, setMeId] = useState<string | null>(null)
  const isTeam = session?.mode === 'team'
  const { teams } = useTeamScores(id, isTeam, [session?.status, session?.current_index, session?.edit_version])
  const [chosen, setChosen] = useState<string | null>(null)
  const [msLeft, setMsLeft] = useState(0)
  const [correctId, setCorrectId] = useState<string | null>(null)
  const [explanation, setExplanation] = useState<string | null>(null)
  const [myAnswer, setMyAnswer] = useState<Answer | null>(null)
  const [result, setResult] = useState<{ idx: number; correct?: boolean; points?: number; late?: boolean } | null>(null)
  const [review, setReview] = useState<{ qs: ReviewQ[]; as: ReviewA[] } | null>(null)

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
    // avisa o servidor que a pergunta apareceu NESTE aparelho: o tempo de resposta conta a partir daqui,
    // então conexão lenta não tira pontos (uma nova tentativa se a primeira falhar)
    ;(async () => {
      for (let i = 0; i < 2; i++) {
        const { error } = await supabase.rpc('ack_question', { p_session: id, p_pos: idx })
        if (!error) break
      }
    })()
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
  }, [status, idx, ready, limitMs, id])

  async function answer(optionId: string) {
    if (sent.current || msLeft <= 0 || status !== 'question' || !ready) return
    sent.current = true
    const elapsed = Math.round(performance.now() - startedAt.current) // medido no dispositivo
    setChosen(optionId)
    const { data } = await supabase.rpc('submit_answer', { p_session: id, p_option: optionId, p_elapsed_ms: elapsed })
    const r = (data ?? {}) as { correct?: boolean; points?: number; late?: boolean }
    setResult({ idx, ...r })
  }

  // fim da partida: todas as perguntas com a resposta certa e o meu resultado em cada uma
  useEffect(() => {
    if (status !== 'finished') return
    let alive = true
    loadReview(id)
      .then((d) => alive && setReview(d))
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [status, id])

  // revelação: gabarito, explicação e minha resposta (liberados pelo RLS só após o fechamento).
  // Tudo é carregado junto e a tela de resultado só aparece com os dados completos da pergunta
  // atual (`revealFor === idx`), para nunca piscar um resultado vazio ou o da pergunta anterior.
  const [revealFor, setRevealFor] = useState<number | null>(null)
  useEffect(() => {
    if (status !== 'reveal') return
    let alive = true
    Promise.all([
      supabase.rpc('get_correct_option', { p_session: id, p_pos: idx }),
      supabase.rpc('get_question_explanation', { p_session: id, p_pos: idx }),
      supabase.from('answers').select('*').eq('session_id', id).eq('position', idx).maybeSingle(),
    ]).then(([c, e, a]) => {
      if (!alive) return
      setCorrectId((c.data as string | null) ?? null)
      setExplanation((e.data as string | null) ?? null)
      setMyAnswer((a.data as Answer | null) ?? null)
      setRevealFor(idx)
    })
    return () => {
      alive = false
    }
  }, [status, idx, id, version])

  // empate de pontos: quem acertou mais perguntas fica na frente
  const ranking = useMemo(() => [...participants].sort((a, b) => b.score - a.score || b.correct_count - a.correct_count), [participants])
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
          {isTeam && me && <p className="mt-2 text-lg">Equipe: <strong>{teams.find((t) => t.team_id === me.team_id)?.name ?? '—'}</strong></p>}
          <p className="muted mt-3">Aguardando o host iniciar…</p>
        </div>
      </main>
    )
  }

  if (status === 'finished') {
    return (
      <main className="mx-auto max-w-md p-6 text-center">
        <h1 className="text-3xl font-extrabold">Fim da partida</h1>
        {isTeam ? (
          <div className="mt-4 text-left">
            <TeamBoard teams={teams} final myTeamId={me?.team_id} />
            {me && <p className="muted mt-3 text-center text-sm">Você fez {me.score} pontos para a sua equipe.</p>}
          </div>
        ) : (
          <>
            {me ? (
              <>
                <p className="grad-text mt-4 font-display text-8xl font-extrabold">{myRank}º</p>
                <p className="muted">{me.score} pontos</p>
              </>
            ) : (
              <p className="muted mt-4">Você não está no ranking desta partida.</p>
            )}
            <ol className="mt-6 space-y-1.5 text-left">
              {ranking.slice(0, 5).map((p, i) => (
                <li key={p.id} className={`flex justify-between rounded-xl px-3 py-2 ${p.id === me?.id ? 'bg-brand/25' : 'bg-ink-700'}`}>
                  <span>{i + 1}. {p.nickname}</span>
                  <span className="font-bold">{p.score}</span>
                </li>
              ))}
            </ol>
          </>
        )}
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link href={`/historico/${id}`} className="btn btn-primary">Revisar perguntas</Link>
          {!isTeam && <Link href="/ranking" className="btn btn-secondary">Ranking permanente</Link>}
          <Link href="/" className="btn btn-ghost">Início</Link>
        </div>
        {review && review.qs.length > 0 && (
          <section className="mt-8 text-left" aria-label="Perguntas e respostas corretas">
            <h2 className="text-xl font-bold">Perguntas e respostas certas</h2>
            <ol className="mt-3 space-y-3">
              {review.qs.map((q) => (
                <QuestionReviewCard key={q.pos} q={q} who={review.as.filter((a) => a.pos === q.pos)} full={false} meId={meId} />
              ))}
            </ol>
          </section>
        )}
      </main>
    )
  }

  if (status === 'reveal' && revealFor === idx) {
    const ok = myAnswer?.is_correct
    return (
      <main className={`grid min-h-screen place-items-center p-6 text-center ${myAnswer ? (ok ? 'bg-emerald-800' : 'bg-rose-800') : 'bg-ink-800'}`}>
        <div className="max-w-md">
          <p className="font-display text-5xl font-extrabold">{myAnswer ? (ok ? 'Acertou!' : 'Errou') : 'Sem resposta'}</p>
          <p className="mt-2 text-2xl">{myAnswer ? `${myAnswer.points > 0 ? '+' : ''}${myAnswer.points} pontos` : '0 pontos'}</p>
          {explanation && (
            <div className="mt-6 flex gap-3 rounded-2xl bg-black/25 p-4 text-left" role="status">
              <Lightbulb className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" aria-hidden />
              <p className="leading-relaxed">{explanation}</p>
            </div>
          )}
          {isTeam && teams.length > 0 && (
            <div className="mt-6 text-left">
              <TeamBoard teams={teams} myTeamId={me?.team_id} />
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
          {result && result.idx === idx && result.late ? (
            <div>
              <p className="text-3xl font-extrabold text-rose-300">Tempo esgotado</p>
              <p className="muted mt-2">Sua resposta chegou depois do limite. Aguardando os outros…</p>
            </div>
          ) : result && result.idx === idx && result.correct != null ? (
            <div>
              <p className={`text-4xl font-extrabold ${result.correct ? 'text-emerald-300' : 'text-rose-300'}`}>{result.correct ? 'Acertou!' : 'Errou'}</p>
              <p className="mt-2 text-2xl">{(result.points ?? 0) > 0 ? '+' : ''}{result.points ?? 0} pontos</p>
              <p className="muted mt-3">Aguardando os outros…</p>
            </div>
          ) : (
            <p className="text-2xl font-bold">Resposta enviada. Aguardando o resultado…</p>
          )}
        </div>
      ) : msLeft <= 0 || status === 'reveal' ? (
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

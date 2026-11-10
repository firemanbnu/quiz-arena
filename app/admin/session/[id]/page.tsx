'use client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { ArrowLeft, CheckCircle2, Clock, History, Lightbulb, Pause, Pencil, Play, ShieldCheck, Trash2, Users } from 'lucide-react'
import { useGameRoom } from '@/hooks/useGameRoom'
import { supabase } from '@/lib/supabase'
import { cleanOptionTexts } from '@/lib/options'
import TeamBoard from '@/components/TeamBoard'
import { useTeamScores } from '@/hooks/useTeamScores'
import QuestionEditor from '@/components/QuestionEditor'
import ReviewPanel from '@/components/ReviewPanel'

const HARD_MS = 8000 // limite máximo após o tempo da pergunta, caso a consulta de janelas falhe
const REVEAL_MS = 2000 // tempo mostrando o resultado antes da próxima pergunta
const SHAPES = ['▲', '◆', '●', '■']
const COLORS = ['bg-rose-600', 'bg-sky-600', 'bg-amber-500', 'bg-emerald-600']

export default function HostSessionPage() {
  const { id } = useParams<{ id: string }>()
  const { session, participants, answers, question, reloadParticipants } = useGameRoom(id, { isHost: true })
  const [correctId, setCorrectId] = useState<string | null>(null)
  const [explanation, setExplanation] = useState<string | null>(null)
  const [secondsLeft, setSecondsLeft] = useState(0)
  const [editing, setEditing] = useState(false)
  const [questionId, setQuestionId] = useState<string | null>(null)
  const [reviewing, setReviewing] = useState(false)
  // pausa: a sala fica parada na revelação até o host clicar em Continuar (só no aparelho do host)
  const [paused, setPaused] = useState(false)
  const [notice, setNotice] = useState('')

  const idx = session?.current_index ?? -1
  const status = session?.status
  const version = session?.edit_version ?? 0 // muda quando uma pergunta é corrigida
  const isTeam = session?.mode === 'team'
  const { teams, reloadTeams } = useTeamScores(id, isTeam, [status, idx, version], status === 'lobby')

  // lobby por equipes: relê quem entrou/trocou de equipe
  useEffect(() => {
    if (!isTeam || status !== 'lobby') return
    const t = setInterval(reloadParticipants, 3000)
    return () => clearInterval(t)
  }, [isTeam, status, reloadParticipants])

  async function moveTo(participantId: string, teamId: string) {
    const { error } = await supabase.rpc('set_participant_team', { p_participant: participantId, p_team: teamId })
    if (error) setNotice(error.message)
    await Promise.all([reloadParticipants(), reloadTeams()])
  }

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

  // 2) ...ou quando o tempo de TODOS acabou. Cada jogador tem o tempo contado a partir do momento em que a
  // pergunta apareceu no aparelho dele; por isso o servidor diz quanto falta para a última janela terminar
  // (no máximo 5 s além do tempo). Se a consulta falhar, usa o tempo fixo com folga.
  useEffect(() => {
    if (status !== 'question' || !session) return
    let alive = true
    let timer: ReturnType<typeof setTimeout>
    const check = async () => {
      const { data, error } = await supabase.rpc('host_question_wait_ms', { p_session: session.id })
      if (!alive) return
      const wait = !error && typeof data === 'number' ? data : 0
      if (wait <= 0) advanceRef.current()
      else timer = setTimeout(check, Math.min(wait + 150, 2000))
    }
    timer = setTimeout(check, session.time_limit_s * 1000 + 300)
    const hard = setTimeout(() => advanceRef.current(), session.time_limit_s * 1000 + HARD_MS)
    return () => {
      alive = false
      clearTimeout(timer)
      clearTimeout(hard)
    }
  }, [status, idx, session?.time_limit_s]) // eslint-disable-line react-hooks/exhaustive-deps

  // 3) na revelação, aguarda e passa para a próxima pergunta (ou encerra)
  useEffect(() => {
    if (status !== 'reveal' || paused) return
    const t = setTimeout(() => advanceRef.current(), REVEAL_MS)
    return () => clearTimeout(t)
  }, [status, idx, paused])

  function resume() {
    setPaused(false)
    if (status === 'reveal') advanceRef.current() // continua de onde parou: vai para a próxima pergunta
  }

  function openReview() {
    setPaused(true)
    setReviewing(true)
  }

  async function removeParticipant(userId: string, nickname: string) {
    const msg =
      status === 'finished'
        ? `Remover “${nickname}” desta partida? ${isTeam ? 'Os pontos dele saem do total da equipe.' : 'Os pontos dele saem do histórico e do ranking permanente.'}`
        : `Remover “${nickname}” da partida? As respostas dele serão apagadas.`
    if (!window.confirm(msg)) return
    const { error } = await supabase.rpc('remove_from_match', { p_session: id, p_user: userId })
    setNotice(error ? error.message : `“${nickname}” foi removido.`)
  }

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

  // Placar validado: só muda DEPOIS que o último jogador terminou a pergunta (na revelação). Durante a pergunta
  // continua o placar da rodada anterior, porque cada jogador tem o tempo medido no próprio aparelho e as
  // respostas chegam em momentos diferentes. O banco é relido a cada mudança de fase.
  const ranking = useMemo(
    () =>
      participants
        .map((p) => ({ ...p, correct: p.correct_count }))
        .sort((a, b) => b.score - a.score || b.correct - a.correct || a.nickname.localeCompare(b.nickname)),
    [participants]
  )

  const texts = useMemo(() => cleanOptionTexts(question?.options.map((o) => o.text) ?? []), [question])

  if (!session) return <p className="muted p-8 text-center">Carregando…</p>

  const unassigned = participants.filter((p) => !p.team_id)
  const canStart = participants.length > 0 && (!isTeam || (unassigned.length === 0 && teams.length === 2 && teams.every((t) => t.members > 0)))

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

        <button disabled={!canStart} onClick={advance} className="btn btn-primary mt-8 px-10 py-4 text-xl">
          Iniciar partida
        </button>

        {isTeam && !canStart && participants.length > 0 && (
          <p role="status" className="muted mt-3 text-sm">
            {unassigned.length > 0 ? 'Distribua todos os jogadores nas equipes para iniciar.' : 'Cada equipe precisa ter ao menos um jogador.'}
          </p>
        )}

        <h2 className="mb-3 mt-10 flex items-center justify-center gap-2 text-lg font-semibold">
          <Users className="h-5 w-5" aria-hidden /> Na sala ({participants.length})
        </h2>
        {isTeam ? (
          <div className="space-y-4 text-left">
            <div className="grid gap-3 sm:grid-cols-2">
              {teams.map((t, i) => (
                <div key={t.team_id} className={`rounded-2xl border p-4 ${i === 0 ? 'border-sky-500/60 bg-sky-500/10' : 'border-rose-500/60 bg-rose-500/10'}`}>
                  <p className="font-bold">{t.name} <span className="muted text-sm font-normal">({participants.filter((p) => p.team_id === t.team_id).length})</span></p>
                  <ul className="mt-2 space-y-1.5">
                    {participants.filter((p) => p.team_id === t.team_id).map((p) => {
                      const other = teams.find((x) => x.team_id !== t.team_id)
                      return (
                        <li key={p.id} className="flex items-center justify-between gap-2 rounded-xl bg-ink-800 px-3 py-1.5 text-sm">
                          <span className="truncate">{p.nickname}</span>
                          {other && (
                            <button onClick={() => moveTo(p.id, other.team_id)} className="muted shrink-0 text-xs underline hover:text-white" aria-label={`Mover ${p.nickname} para ${other.name}`}>
                              mover para {other.name}
                            </button>
                          )}
                        </li>
                      )
                    })}
                  </ul>
                </div>
              ))}
            </div>
            {unassigned.length > 0 && (
              <div className="rounded-2xl border border-amber-500/50 bg-amber-500/10 p-4">
                <p className="font-bold">Sem equipe ({unassigned.length})</p>
                <ul className="mt-2 space-y-1.5">
                  {unassigned.map((p) => (
                    <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-ink-800 px-3 py-1.5 text-sm">
                      <span className="truncate">{p.nickname}</span>
                      <span className="flex gap-2">
                        {teams.map((t) => (
                          <button key={t.team_id} onClick={() => moveTo(p.id, t.team_id)} className="btn btn-ghost !px-3 !py-1 text-xs">
                            {t.name}
                          </button>
                        ))}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {notice && <p role="alert" className="text-sm text-rose-400">{notice}</p>}
          </div>
        ) : (
          <ul className="flex flex-wrap justify-center gap-2">
            {participants.map((p) => (
              <li key={p.id} className="rounded-full border border-line bg-ink-800 px-4 py-1.5">{p.nickname}</li>
            ))}
          </ul>
        )}
      </main>
    )
  }

  // ---------------- Final ----------------
  if (status === 'finished') {
    return (
      <main className="mx-auto max-w-3xl px-4 py-10">
        <h1 className="mb-6 text-4xl font-extrabold">Resultado final</h1>
        {isTeam && <TeamBoard teams={teams} final />}
        <ol className="mt-6 space-y-2">
          {(isTeam ? [...participants].sort((a, b) => a.nickname.localeCompare(b.nickname)) : ranking).map((p, i) => (
            <li key={p.id} className="card flex items-center gap-3 !rounded-2xl !p-4 text-lg">
              <span className="min-w-0 flex-1 truncate">
                {isTeam ? <span className="muted mr-3 text-sm">{teams.find((t) => t.team_id === p.team_id)?.name ?? '—'}</span> : <span className="muted mr-3">{i + 1}º</span>}
                {p.nickname}
              </span>
              <span className="font-display text-xl font-bold">{p.score}</span>
              <button
                onClick={() => removeParticipant(p.user_id, p.nickname)}
                aria-label={`Remover ${p.nickname} da partida`}
                className="grid h-9 w-9 place-items-center rounded-xl text-rose-300 hover:bg-ink-700"
              >
                <Trash2 className="h-4 w-4" aria-hidden />
              </button>
            </li>
          ))}
        </ol>
        {notice && <p role="status" className="muted mt-3 text-sm">{notice}</p>}
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/admin" className="btn btn-primary">Nova competição</Link>
          <Link href="/historico" className="btn btn-secondary">Ver histórico</Link>
          <button onClick={() => setReviewing(true)} className="btn btn-ghost">
            <History className="h-4 w-4" aria-hidden /> Revisar perguntas
          </button>
          <Link href={`/historico/${id}`} className="btn btn-ghost">
            Revisão com quem acertou
          </Link>
          <Link href={`/admin/auditoria/${id}`} className="btn btn-ghost">
            <ShieldCheck className="h-4 w-4" aria-hidden /> Auditar pontuação
          </Link>
        </div>
        {reviewing && (
          <ReviewPanel sessionId={id} maxPos={session.question_count - 1} version={version} finished onClose={() => setReviewing(false)} />
        )}
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
          <button onClick={openReview} className="btn btn-ghost !py-2.5">
            <History className="h-4 w-4" aria-hidden /> Revisar anteriores
          </button>
          <button onClick={paused ? resume : () => setPaused(true)} className="btn btn-ghost !py-2.5" aria-pressed={paused}>
            {paused ? <Play className="h-4 w-4" aria-hidden /> : <Pause className="h-4 w-4" aria-hidden />}
            {paused ? 'Continuar' : 'Pausar'}
          </button>
        </div>
        {paused && (
          <p role="status" className="mt-3 rounded-2xl border border-amber-500/50 bg-amber-500/10 p-3 text-sm text-amber-200">
            {status === 'reveal'
              ? 'Sala pausada. Os jogadores aguardam. Clique em Continuar para seguir para a próxima pergunta.'
              : 'A sala vai parar na revelação desta pergunta. Clique em Continuar quando quiser seguir.'}
          </p>
        )}

      </section>

      <aside className="space-y-6">
        {isTeam ? (
          <div className="card !p-4">
            <h2 className="mb-3 font-semibold">Placar das equipes</h2>
            <TeamBoard teams={teams} />
          </div>
        ) : (
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
        )}
      </aside>
      {editing && questionId && <QuestionEditor questionId={questionId} onClose={() => setEditing(false)} />}
      {reviewing && <ReviewPanel sessionId={id} maxPos={idx} version={version} onClose={() => setReviewing(false)} />}
    </main>
  )
}

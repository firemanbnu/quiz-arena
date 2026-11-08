'use client'
import { CheckCircle2, Clock, Lightbulb, XCircle } from 'lucide-react'
import { supabase } from '@/lib/supabase'

export type ReviewQ = {
  pos: number
  question_id: string
  question_text: string
  topic_name: string
  explanation: string | null
  options: { id: string; text: string; correct: boolean }[] | null
  correct_option_id: string | null
  my_option_id: string | null
  my_status: 'correct' | 'wrong' | 'unanswered' | null
  my_points: number | null
  my_elapsed_ms: number | null
  answered: number
  hits: number
  total: number
}

export type ReviewA = {
  pos: number
  user_id: string
  nickname: string
  status: 'correct' | 'wrong' | 'unanswered'
  option_text: string | null
  points: number | null
  elapsed_ms: number | null
}

/** Carrega a revisão (perguntas + respostas visíveis para quem está logado). Lança erro com a mensagem do servidor. */
export async function loadReview(sessionId: string): Promise<{ qs: ReviewQ[]; as: ReviewA[] }> {
  const [q, a] = await Promise.all([
    supabase.rpc('review_session', { p_session: sessionId }),
    supabase.rpc('review_answers', { p_session: sessionId }),
  ])
  if (q.error) throw new Error(q.error.message)
  if (a.error) throw new Error(a.error.message)
  return { qs: (q.data ?? []) as ReviewQ[], as: (a.data ?? []) as ReviewA[] }
}

const fmtSec = (ms: number | null) => (ms == null ? '' : `${(ms / 1000).toFixed(1).replace('.', ',')} s`)

/** Quem acertou (para todos) e, para host/administrador, quem errou e quem não respondeu. */
export function WhoAnswered({ rows, full, meId }: { rows: ReviewA[]; full: boolean; meId?: string | null }) {
  const hit = rows.filter((r) => r.status === 'correct')
  const wrong = rows.filter((r) => r.status === 'wrong')
  const none = rows.filter((r) => r.status === 'unanswered')
  const name = (r: ReviewA) => (
    <span key={r.user_id} className={`inline-block rounded-full px-2.5 py-0.5 text-xs ${r.user_id === meId ? 'bg-brand/30 font-bold' : 'bg-ink-700'}`}>
      {r.nickname}
      {full && r.elapsed_ms != null ? <span className="muted"> · {fmtSec(r.elapsed_ms)}</span> : null}
    </span>
  )
  return (
    <div className="mt-3 space-y-2 text-sm">
      <div>
        <p className="mb-1 flex items-center gap-1.5 font-semibold text-emerald-300">
          <CheckCircle2 className="h-4 w-4" aria-hidden /> Acertaram ({hit.length})
        </p>
        {hit.length === 0 ? <p className="muted text-xs">Ninguém acertou.</p> : <div className="flex flex-wrap gap-1.5">{hit.map(name)}</div>}
      </div>
      {full && (
        <>
          <div>
            <p className="mb-1 flex items-center gap-1.5 font-semibold text-rose-300">
              <XCircle className="h-4 w-4" aria-hidden /> Erraram ({wrong.length})
            </p>
            {wrong.length === 0 ? (
              <p className="muted text-xs">Ninguém.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {wrong.map((r) => (
                  <span key={r.user_id} className="inline-block rounded-full bg-ink-700 px-2.5 py-0.5 text-xs">
                    {r.nickname}
                    {r.option_text ? <span className="muted"> · marcou “{r.option_text}”</span> : null}
                  </span>
                ))}
              </div>
            )}
          </div>
          <div>
            <p className="mb-1 flex items-center gap-1.5 font-semibold text-slate-300">
              <Clock className="h-4 w-4" aria-hidden /> Sem resposta ({none.length})
            </p>
            {none.length === 0 ? <p className="muted text-xs">Ninguém.</p> : <div className="flex flex-wrap gap-1.5">{none.map(name)}</div>}
          </div>
        </>
      )}
    </div>
  )
}

/** Cartão de uma pergunta na revisão: opções com a certa marcada, a escolha da pessoa, explicação e quem acertou. */
export function QuestionReviewCard({ q, who, full, meId }: { q: ReviewQ; who: ReviewA[]; full: boolean; meId?: string | null }) {
  const status = q.my_status
  return (
    <li className="card !rounded-2xl !p-4">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="rounded-full bg-ink-700 px-2.5 py-0.5 font-semibold">{q.pos + 1}</span>
        <span className="rounded-full bg-ink-700 px-2.5 py-0.5 font-semibold">{q.topic_name}</span>
        {status && (
          <span
            className={`rounded-full px-2.5 py-0.5 font-bold ${
              status === 'correct' ? 'bg-emerald-500/20 text-emerald-200' : status === 'wrong' ? 'bg-rose-500/20 text-rose-200' : 'bg-slate-500/25 text-slate-200'
            }`}
          >
            {status === 'correct' ? 'Acertei' : status === 'wrong' ? 'Errei' : 'Sem resposta'}
            {q.my_points != null ? ` · ${q.my_points > 0 ? '+' : ''}${q.my_points} pts` : ''}
            {q.my_elapsed_ms != null ? ` · ${fmtSec(q.my_elapsed_ms)}` : ''}
          </span>
        )}
        <span className="muted">
          {q.hits} de {q.total} acertaram
        </span>
      </div>
      <p className="mt-2 font-semibold leading-snug">{q.question_text}</p>
      <ul className="mt-3 space-y-1.5">
        {(q.options ?? []).map((o) => {
          const mine = o.id === q.my_option_id
          return (
            <li
              key={o.id}
              className={`flex items-start gap-2 rounded-xl border px-3 py-2 text-sm ${
                o.correct ? 'border-emerald-500/60 bg-emerald-500/10' : mine ? 'border-rose-500/60 bg-rose-500/10' : 'border-line'
              }`}
            >
              {o.correct ? (
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" aria-hidden />
              ) : mine ? (
                <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-300" aria-hidden />
              ) : (
                <span className="w-4 shrink-0" />
              )}
              <span className="min-w-0 flex-1">{o.text}</span>
              {o.correct && <span className="shrink-0 text-xs font-bold text-emerald-300">Resposta certa</span>}
              {mine && <span className="shrink-0 text-xs font-bold">{o.correct ? 'Sua resposta' : 'Sua resposta (errada)'}</span>}
            </li>
          )
        })}
      </ul>
      {q.explanation && (
        <div className="mt-3 flex gap-3 rounded-xl bg-black/25 p-3 text-sm">
          <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" aria-hidden />
          <p className="leading-relaxed">{q.explanation}</p>
        </div>
      )}
      <WhoAnswered rows={who} full={full} meId={meId} />
    </li>
  )
}

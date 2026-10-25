'use client'
import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, CheckCircle2, Dumbbell, RotateCcw, XCircle } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { cleanOptionTexts } from '@/lib/options'

type TopicRow = { id: string; name: string; question_count: number }
type Q = { id: string; text: string; options: { id: string; text: string }[] }
type Check = { correct_option: string; is_correct: boolean; explanation: string | null }
type Answered = { q: Q; chosen: string | null; check: Check }

const SHAPES = ['▲', '◆', '●', '■']
const COLORS = ['bg-rose-600', 'bg-sky-600', 'bg-amber-500', 'bg-emerald-600']

/**
 * Treino individual: sem login, sem pontos, sem ranking e sem histórico.
 * Nada é gravado no banco; as funções training_* só leem.
 */
export default function TreinoPage() {
  const [topics, setTopics] = useState<TopicRow[] | null>(null)
  const [selected, setSelected] = useState<string[]>([])
  const [count, setCount] = useState(10)
  const [balanced, setBalanced] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const [questions, setQuestions] = useState<Q[] | null>(null)
  const [index, setIndex] = useState(0)
  const [chosen, setChosen] = useState<string | null>(null)
  const [check, setCheck] = useState<Check | null>(null)
  const [answered, setAnswered] = useState<Answered[]>([])
  const [finished, setFinished] = useState(false)

  useEffect(() => {
    supabase.rpc('training_topics').then(({ data, error }) => {
      if (error) setError('Não foi possível carregar os assuntos.')
      setTopics(((data ?? []) as any[]).map((t) => ({ ...t, question_count: Number(t.question_count) })))
    })
  }, [])

  const available = useMemo(
    () => (topics ?? []).filter((t) => selected.includes(t.id)).reduce((s, t) => s + t.question_count, 0),
    [topics, selected]
  )
  const toggle = (id: string) => setSelected((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]))

  async function start() {
    setBusy(true)
    setError('')
    const { data, error } = await supabase.rpc('training_questions', {
      p_topics: selected,
      p_count: Math.min(count, available || count),
      p_balanced: balanced,
    })
    setBusy(false)
    if (error || !data || (data as Q[]).length === 0) return setError('Não foi possível montar o treino.')
    setQuestions(data as Q[])
    setIndex(0)
    setChosen(null)
    setCheck(null)
    setAnswered([])
    setFinished(false)
  }

  const q = questions?.[index]
  const texts = useMemo(() => cleanOptionTexts(q?.options.map((o) => o.text) ?? []), [q])

  async function answer(optionId: string) {
    if (!q || chosen) return
    setChosen(optionId)
    const { data, error } = await supabase.rpc('training_check', { p_question: q.id, p_option: optionId })
    if (error || !data) {
      setChosen(null)
      return setError('Falha ao conferir a resposta. Tente de novo.')
    }
    setCheck(data as Check)
    setAnswered((a) => [...a, { q, chosen: optionId, check: data as Check }])
  }

  function next() {
    if (!questions) return
    if (index + 1 >= questions.length) return setFinished(true)
    setIndex(index + 1)
    setChosen(null)
    setCheck(null)
  }

  function reset() {
    setQuestions(null)
    setFinished(false)
    setError('')
  }

  // ---------------- Configuração ----------------
  if (!questions) {
    return (
      <main className="mx-auto max-w-xl px-4 py-10">
        <h1 className="flex items-center gap-3 text-4xl font-extrabold">
          <Dumbbell className="h-9 w-9 text-brand" aria-hidden /> Treino individual
        </h1>
        <p className="muted mt-2">
          Responda no seu ritmo e veja a correção na hora. Nada é gravado no ranking nem no histórico.
        </p>

        <div className="card mt-8 space-y-5">
          {topics === null ? (
            <p className="muted">Carregando assuntos…</p>
          ) : topics.length === 0 ? (
            <p className="muted">Nenhum assunto liberado para treino ainda.</p>
          ) : (
            <>
              <fieldset className="space-y-2">
                <legend className="mb-2 font-semibold">Escolha um ou mais assuntos</legend>
                {topics.map((t) => (
                  <label key={t.id} className="flex cursor-pointer items-center gap-3 rounded-2xl border border-line bg-ink-900 p-3">
                    <input type="checkbox" className="h-5 w-5 accent-brand" checked={selected.includes(t.id)} onChange={() => toggle(t.id)} />
                    <span className="flex-1">{t.name}</span>
                    <span className="muted text-sm">{t.question_count} perguntas</span>
                  </label>
                ))}
              </fieldset>

              {selected.length > 1 && (
                <label className="flex items-center gap-3 text-sm">
                  <input type="checkbox" className="h-5 w-5 accent-brand" checked={balanced} onChange={(e) => setBalanced(e.target.checked)} />
                  Equilibrar entre os assuntos
                </label>
              )}

              <label className="block">
                Quantidade de perguntas{' '}
                {selected.length > 0 && <span className="muted text-sm">(máx. {Math.min(available, 50)})</span>}
                <input
                  type="number"
                  min={1}
                  max={Math.min(available || 50, 50)}
                  value={count}
                  onChange={(e) => setCount(Math.max(1, +e.target.value || 1))}
                  className="field mt-1"
                />
              </label>
            </>
          )}
          {error && <p role="alert" className="text-sm text-rose-400">{error}</p>}
          <button onClick={start} disabled={busy || selected.length === 0} className="btn btn-primary w-full py-4 text-lg">
            {busy ? 'Montando…' : 'Começar treino'}
          </button>
        </div>
      </main>
    )
  }

  // ---------------- Resultado e revisão ----------------
  if (finished) {
    const hits = answered.filter((a) => a.check.is_correct).length
    const pct = Math.round((hits / answered.length) * 100)
    return (
      <main className="mx-auto max-w-2xl px-4 py-10">
        <div className="card text-center">
          <p className="muted">Treino concluído</p>
          <p className="grad-text mt-2 font-display text-7xl font-extrabold">{pct}%</p>
          <p className="mt-2 text-lg">
            {hits} de {answered.length} {answered.length === 1 ? 'acerto' : 'acertos'}
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <button onClick={start} className="btn btn-primary">
              <RotateCcw className="h-4 w-4" aria-hidden /> Treinar de novo
            </button>
            <button onClick={reset} className="btn btn-secondary">Mudar assuntos</button>
          </div>
        </div>

        <h2 className="mb-3 mt-10 text-2xl font-bold">Revisão</h2>
        <ol className="space-y-3">
          {answered.map(({ q, chosen, check }, i) => {
            const cleaned = cleanOptionTexts(q.options.map((o) => o.text))
            const text = (id: string | null) => {
              const k = q.options.findIndex((o) => o.id === id)
              return k < 0 ? '—' : cleaned[k]
            }
            return (
              <li key={q.id} className="card !rounded-2xl !p-5">
                <p className="flex items-start gap-2 font-semibold">
                  {check.is_correct ? (
                    <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-400" aria-label="Acertou" />
                  ) : (
                    <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-rose-400" aria-label="Errou" />
                  )}
                  <span>{i + 1}. {q.text}</span>
                </p>
                {!check.is_correct && <p className="mt-2 text-sm text-rose-300">Sua resposta: {text(chosen)}</p>}
                <p className="mt-1 text-sm text-emerald-300">Resposta certa: {text(check.correct_option)}</p>
                {check.explanation && <p className="muted mt-2 text-sm">{check.explanation}</p>}
              </li>
            )
          })}
        </ol>
      </main>
    )
  }

  // ---------------- Pergunta ----------------
  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <div className="mb-4 flex items-center justify-between text-sm">
        <span className="muted">Pergunta {index + 1} de {questions.length}</span>
        <button onClick={reset} className="muted underline">Encerrar treino</button>
      </div>
      <div className="mb-6 h-2 overflow-hidden rounded-full bg-ink-700" aria-hidden>
        <div className="h-full bg-gradient-to-r from-brand to-aqua transition-all" style={{ width: `${((index + (check ? 1 : 0)) / questions.length) * 100}%` }} />
      </div>

      <h1 className="text-2xl font-bold leading-snug sm:text-3xl">{q?.text}</h1>

      <div className="mt-6 grid gap-3">
        {q?.options.map((o, i) => {
          const isRight = check && o.id === check.correct_option
          const isWrongPick = check && o.id === chosen && !check.is_correct
          return (
            <button
              key={o.id}
              onClick={() => answer(o.id)}
              disabled={!!chosen}
              className={`${COLORS[i % 4]} flex items-center gap-4 rounded-2xl p-4 text-left text-lg font-semibold transition-opacity ${
                check && !isRight && !isWrongPick ? 'opacity-30' : ''
              } ${isRight ? 'ring-4 ring-white' : ''} ${isWrongPick ? 'ring-4 ring-rose-300 line-through decoration-2' : ''}`}
            >
              <span className="text-2xl" aria-hidden>{SHAPES[i % 4]}</span>
              <span className="flex-1">{texts[i] ?? o.text}</span>
              {isRight && <CheckCircle2 className="h-6 w-6" aria-label="Resposta certa" />}
              {isWrongPick && <XCircle className="h-6 w-6" aria-label="Sua resposta errada" />}
            </button>
          )
        })}
      </div>

      {check && (
        <div className={`card mt-6 ${check.is_correct ? '!border-emerald-500/50' : '!border-rose-500/50'}`} role="status">
          <p className="font-display text-2xl font-bold">{check.is_correct ? 'Acertou!' : 'Não foi dessa vez'}</p>
          {check.explanation ? (
            <p className="muted mt-2 leading-relaxed">{check.explanation}</p>
          ) : (
            <p className="muted mt-2">Esta pergunta não tem explicação cadastrada.</p>
          )}
          <button onClick={next} className="btn btn-primary mt-4">
            {index + 1 >= questions.length ? 'Ver resultado' : 'Próxima'} <ArrowRight className="h-4 w-4" aria-hidden />
          </button>
        </div>
      )}
      {error && <p role="alert" className="mt-4 text-sm text-rose-400">{error}</p>}
    </main>
  )
}

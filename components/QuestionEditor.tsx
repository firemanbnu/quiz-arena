'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, Plus, Trash2, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { cleanOptionTexts } from '@/lib/options'

type Opt = { key: number; id?: string; text: string; correct: boolean }
type Usage = { sessions: number; finished: number; answers: number }
type OptRow = { id: string; text: string; position: number; option_keys: { is_correct: boolean } | { is_correct: boolean }[] | null }

const keyOf = (o: OptRow) => (Array.isArray(o.option_keys) ? o.option_keys[0] : o.option_keys)

/**
 * Editor de pergunta (texto, explicação, opções e resposta correta).
 * Funciona no Banco e durante uma competição. Ao mudar a resposta correta, o servidor recalcula
 * pontos das partidas que usaram a pergunta, o histórico e o ranking permanente.
 */
export default function QuestionEditor({
  questionId,
  onClose,
  onSaved,
}: {
  questionId: string
  onClose: () => void
  onSaved?: () => void
}) {
  const [loading, setLoading] = useState(true)
  const [text, setText] = useState('')
  const [explanation, setExplanation] = useState('')
  const [opts, setOpts] = useState<Opt[]>([])
  const [originalCorrect, setOriginalCorrect] = useState<string | null>(null)
  const [usage, setUsage] = useState<Usage | null>(null)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const nextKey = useRef(1)
  const firstField = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    let alive = true
    ;(async () => {
      const [q, u] = await Promise.all([
        supabase
          .from('questions')
          .select('id,text,explanation,options(id,text,position,option_keys(is_correct))')
          .eq('id', questionId)
          .single(),
        supabase.rpc('question_usage', { p_question: questionId }),
      ])
      if (!alive) return
      if (q.error || !q.data) {
        setError('Não foi possível carregar a pergunta.')
        setLoading(false)
        return
      }
      const rows = [...(q.data.options as unknown as OptRow[])].sort((a, b) => a.position - b.position)
      const clean = cleanOptionTexts(rows.map((o) => o.text))
      const list: Opt[] = rows.map((o, i) => ({
        key: nextKey.current++,
        id: o.id,
        text: clean[i] ?? o.text,
        correct: !!keyOf(o)?.is_correct,
      }))
      setText(q.data.text as string)
      setExplanation((q.data.explanation as string | null) ?? '')
      setOpts(list)
      setOriginalCorrect(list.find((o) => o.correct)?.id ?? null)
      const row = Array.isArray(u.data) ? u.data[0] : u.data
      if (row) setUsage(row as Usage)
      setLoading(false)
      setTimeout(() => firstField.current?.focus(), 0)
    })()
    return () => {
      alive = false
    }
  }, [questionId])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !saving && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, saving])

  const correctNow = opts.find((o) => o.correct)
  const changedCorrect = !loading && (correctNow?.id ?? 'nova') !== originalCorrect
  const willRecalculate = changedCorrect && !!usage && usage.sessions > 0

  const problem = useMemo(() => {
    if (!text.trim()) return 'Escreva o texto da pergunta.'
    if (opts.length < 2) return 'A pergunta precisa de pelo menos 2 opções.'
    if (opts.some((o) => !o.text.trim())) return 'Há uma opção sem texto.'
    if (opts.filter((o) => o.correct).length !== 1) return 'Marque exatamente 1 opção como correta.'
    return ''
  }, [text, opts])

  const setOptText = (key: number, value: string) =>
    setOpts((p) => p.map((o) => (o.key === key ? { ...o, text: value } : o)))
  const setCorrect = (key: number) => setOpts((p) => p.map((o) => ({ ...o, correct: o.key === key })))
  // se remover a correta, o botão Salvar fica bloqueado até marcar outra
  const removeOpt = (key: number) => setOpts((p) => p.filter((o) => o.key !== key))
  const addOpt = () => setOpts((p) => [...p, { key: nextKey.current++, text: '', correct: false }])

  async function save() {
    if (problem) return setError(problem)
    setSaving(true)
    setError('')
    const { error: err } = await supabase.rpc('edit_question', {
      p_question: questionId,
      p_text: text,
      p_explanation: explanation,
      p_options: opts.map((o) => ({ id: o.id ?? null, text: o.text, correct: o.correct })),
    })
    setSaving(false)
    if (err) return setError(err.message)
    onSaved?.()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/70 p-4" role="presentation">
      <div role="dialog" aria-modal="true" aria-labelledby="editar-titulo" className="card my-8 w-full max-w-2xl space-y-5">
        <div className="flex items-start justify-between gap-4">
          <h2 id="editar-titulo" className="font-display text-2xl font-extrabold">
            Editar pergunta
          </h2>
          <button onClick={onClose} disabled={saving} aria-label="Fechar" className="grid h-10 w-10 place-items-center rounded-xl hover:bg-ink-700">
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>

        {loading ? (
          <p className="muted">Carregando…</p>
        ) : (
          <>
            {usage && usage.sessions > 0 && (
              <p className="muted text-sm">
                Usada em {usage.sessions} partida{usage.sessions > 1 ? 's' : ''} ({usage.finished} encerrada
                {usage.finished === 1 ? '' : 's'}), com {usage.answers} resposta{usage.answers === 1 ? '' : 's'}. Correções de texto
                aparecem na hora nas salas em andamento.
              </p>
            )}

            <label className="block text-sm">
              Pergunta
              <textarea ref={firstField} value={text} onChange={(e) => setText(e.target.value)} rows={3} className="field mt-1" />
            </label>

            <fieldset className="space-y-2">
              <legend className="mb-1 text-sm">Opções (marque a correta)</legend>
              {opts.map((o, i) => (
                <div key={o.key} className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="correta"
                    checked={o.correct}
                    onChange={() => setCorrect(o.key)}
                    aria-label={`Opção ${i + 1} é a correta`}
                    className="h-5 w-5 shrink-0 accent-emerald-500"
                  />
                  <input
                    value={o.text}
                    onChange={(e) => setOptText(o.key, e.target.value)}
                    aria-label={`Texto da opção ${i + 1}`}
                    className={`field !py-2 ${o.correct ? 'border-emerald-500/70' : ''}`}
                  />
                  <button
                    onClick={() => removeOpt(o.key)}
                    disabled={opts.length <= 2}
                    aria-label={`Remover opção ${i + 1}`}
                    className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-rose-300 hover:bg-ink-700 disabled:opacity-30"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden />
                  </button>
                </div>
              ))}
              <button onClick={addOpt} className="btn btn-ghost !px-3 !py-2 text-sm">
                <Plus className="h-4 w-4" aria-hidden /> Adicionar opção
              </button>
            </fieldset>

            <label className="block text-sm">
              Explicação (aparece no Treino e depois da pergunta)
              <textarea value={explanation} onChange={(e) => setExplanation(e.target.value)} rows={2} className="field mt-1" />
            </label>

            {willRecalculate && (
              <p role="status" className="flex gap-3 rounded-2xl border border-amber-500/50 bg-amber-500/10 p-3 text-sm text-amber-200">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
                <span>
                  Você mudou a resposta correta. Ao salvar, os pontos das {usage!.sessions} partida{usage!.sessions > 1 ? 's' : ''} que usaram
                  esta pergunta, o histórico e o ranking permanente serão recalculados.
                </span>
              </p>
            )}

            {error && (
              <p role="alert" className="text-sm text-rose-400">
                {error}
              </p>
            )}

            <div className="flex justify-end gap-3">
              <button onClick={onClose} disabled={saving} className="btn btn-ghost">
                Cancelar
              </button>
              <button onClick={save} disabled={saving || !!problem} className="btn btn-primary">
                {saving ? 'Salvando…' : willRecalculate ? 'Salvar e recalcular' : 'Salvar'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

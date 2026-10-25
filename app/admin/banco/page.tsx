'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, ChevronDown, Dumbbell, Trash2 } from 'lucide-react'
import AdminGate from '@/components/AdminGate'
import { supabase } from '@/lib/supabase'
import { parseQuestions } from '@/lib/parser'
import { cleanOptionTexts } from '@/lib/options'

type OptRow = { id: string; text: string; position: number; option_keys: { is_correct: boolean } | { is_correct: boolean }[] | null }
type QRow = { id: string; text: string; explanation: string | null; options: OptRow[] }
type TopicRow = { id: string; name: string; training_enabled: boolean; questions: QRow[] }

const isCorrect = (o: OptRow) => {
  const k = Array.isArray(o.option_keys) ? o.option_keys[0] : o.option_keys
  return !!k?.is_correct
}

export default function BancoPage() {
  return (
    <AdminGate>
      <Banco />
    </AdminGate>
  )
}

function Banco() {
  const [topics, setTopics] = useState<TopicRow[]>([])
  const [raw, setRaw] = useState('')
  const [topicName, setTopicName] = useState('')
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [saving, setSaving] = useState(false)
  const [open, setOpen] = useState<string | null>(null)

  const parsed = useMemo(() => parseQuestions(raw), [raw])

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('topics')
      .select('id,name,training_enabled,questions(id,text,explanation,options(id,text,position,option_keys(is_correct)))')
      .order('name')
    setTopics((data ?? []) as unknown as TopicRow[])
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function save() {
    setSaving(true)
    setMsg(null)
    const { data, error } = await supabase.rpc('import_questions', { p_topic_name: topicName, p_items: parsed.questions })
    setSaving(false)
    if (error) return setMsg({ ok: false, text: error.message })
    setMsg({ ok: true, text: `${data} perguntas salvas em “${topicName.trim()}”.` })
    setRaw('')
    load()
  }

  async function toggleTraining(t: TopicRow) {
    await supabase.from('topics').update({ training_enabled: !t.training_enabled }).eq('id', t.id)
    load()
  }

  async function removeTopic(t: TopicRow) {
    if (!window.confirm(`Excluir o assunto “${t.name}” e suas ${t.questions.length} perguntas? Isso não pode ser desfeito.`)) return
    await supabase.from('topics').delete().eq('id', t.id)
    load()
  }

  async function removeQuestion(id: string) {
    if (!window.confirm('Excluir esta pergunta?')) return
    await supabase.from('questions').delete().eq('id', id)
    load()
  }

  return (
    <main className="mx-auto grid max-w-6xl gap-8 px-4 py-10 lg:grid-cols-2">
      {/* ---------- Importar ---------- */}
      <section className="space-y-4">
        <h1 className="text-3xl font-extrabold">Importar perguntas</h1>
        <p className="muted text-sm">
          Cole o texto com as perguntas. Marque a correta com <code>*</code> ao final da alternativa ou use uma linha{' '}
          <code>Resposta: b</code>. Para o Treino, adicione <code>Explicação: …</code> depois de cada pergunta.
        </p>

        <label className="block text-sm">
          Assunto (existente ou novo)
          <input list="topics" value={topicName} onChange={(e) => setTopicName(e.target.value)} className="field mt-1" placeholder="Ex.: Segurança do Trabalho" />
        </label>
        <datalist id="topics">{topics.map((t) => <option key={t.id} value={t.name} />)}</datalist>

        <textarea
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          rows={14}
          aria-label="Texto com as perguntas"
          placeholder={'1. Qual a capital da França?\na) Londres\nb) Paris *\nc) Roma\nExplicação: Paris é a capital desde ...'}
          className="field font-mono text-sm"
        />

        {raw.trim() && (
          <div className="card !rounded-2xl !p-4 text-sm">
            <p className="flex items-center gap-2 font-semibold">
              <CheckCircle2 className="h-4 w-4 text-emerald-400" aria-hidden /> {parsed.questions.length} perguntas válidas
              {parsed.errors.length > 0 && (
                <>
                  <AlertTriangle className="ml-3 h-4 w-4 text-amber-400" aria-hidden /> {parsed.errors.length} com problema
                </>
              )}
            </p>
            {parsed.errors.map((e) => (
              <p key={e.index} className="mt-1 text-amber-300">
                #{e.index + 1} “{e.question.slice(0, 50)}”: {e.message}
              </p>
            ))}
            <ol className="mt-3 max-h-72 space-y-3 overflow-y-auto pr-1">
              {parsed.questions.map((q, i) => (
                <li key={i}>
                  <p className="font-semibold">{i + 1}. {q.text}</p>
                  <ul className="ml-4 list-disc">
                    {q.options.map((o, k) => (
                      <li key={k} className={o.correct ? 'font-semibold text-emerald-300' : 'muted'}>
                        {o.text} {o.correct && '✓'}
                      </li>
                    ))}
                  </ul>
                  {q.explanation && <p className="muted ml-4 mt-1 italic">{q.explanation}</p>}
                </li>
              ))}
            </ol>
          </div>
        )}

        <button onClick={save} disabled={saving || !topicName.trim() || parsed.questions.length === 0} className="btn btn-primary w-full">
          {saving ? 'Salvando…' : `Salvar ${parsed.questions.length} perguntas`}
        </button>
        {msg && (
          <p role="status" className={msg.ok ? 'text-emerald-300' : 'text-rose-400'}>
            {msg.text}
          </p>
        )}
      </section>

      {/* ---------- Assuntos ---------- */}
      <section className="space-y-4">
        <h2 className="text-3xl font-extrabold">Assuntos</h2>
        {topics.length === 0 && <p className="muted">Nenhum assunto ainda. Importe perguntas ao lado.</p>}

        {topics.map((t) => {
          const expanded = open === t.id
          return (
            <div key={t.id} className="card !p-0">
              <div className="flex items-center gap-3 p-4">
                <button
                  onClick={() => setOpen(expanded ? null : t.id)}
                  aria-expanded={expanded}
                  className="flex min-w-0 flex-1 items-center gap-3 text-left"
                >
                  <ChevronDown className={`h-5 w-5 shrink-0 transition-transform ${expanded ? 'rotate-180' : ''}`} aria-hidden />
                  <span className="min-w-0">
                    <span className="block truncate font-display text-lg font-bold">{t.name}</span>
                    <span className="muted text-sm">{t.questions.length} perguntas</span>
                  </span>
                </button>
                <button
                  onClick={() => toggleTraining(t)}
                  aria-pressed={t.training_enabled}
                  title="Liberar este assunto no Treino individual"
                  className={`btn !px-3 !py-2 text-sm ${t.training_enabled ? 'btn-primary' : 'btn-ghost'}`}
                >
                  <Dumbbell className="h-4 w-4" aria-hidden /> {t.training_enabled ? 'No treino' : 'Fora do treino'}
                </button>
                <button onClick={() => removeTopic(t)} aria-label={`Excluir assunto ${t.name}`} className="grid h-10 w-10 place-items-center rounded-xl text-rose-300 hover:bg-ink-700">
                  <Trash2 className="h-5 w-5" aria-hidden />
                </button>
              </div>

              {expanded && (
                <ol className="space-y-4 border-t border-line p-4">
                  {t.questions.map((q, i) => {
                    const opts = [...q.options].sort((a, b) => a.position - b.position)
                    const clean = cleanOptionTexts(opts.map((o) => o.text))
                    return (
                      <li key={q.id} className="text-sm">
                        <div className="flex items-start gap-2">
                          <p className="flex-1 font-semibold">{i + 1}. {q.text}</p>
                          <button onClick={() => removeQuestion(q.id)} aria-label="Excluir pergunta" className="text-rose-300 hover:text-rose-200">
                            <Trash2 className="h-4 w-4" aria-hidden />
                          </button>
                        </div>
                        <ul className="ml-4 mt-1 list-disc">
                          {opts.map((o, k) => (
                            <li key={o.id} className={isCorrect(o) ? 'font-semibold text-emerald-300' : 'muted'}>
                              {clean[k]} {isCorrect(o) && '✓'}
                            </li>
                          ))}
                        </ul>
                        {q.explanation && <p className="muted ml-4 mt-1 italic">{q.explanation}</p>}
                      </li>
                    )
                  })}
                </ol>
              )}
            </div>
          )
        })}
      </section>
    </main>
  )
}

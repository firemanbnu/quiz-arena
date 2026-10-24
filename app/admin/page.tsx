'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { parseQuestions } from '@/lib/parser'

type Topic = { id: string; name: string; questions: { count: number }[] }

export default function AdminPage() {
  const router = useRouter()
  const [ready, setReady] = useState(false)
  const [signedIn, setSignedIn] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [authError, setAuthError] = useState('')

  const [topics, setTopics] = useState<Topic[]>([])
  const [raw, setRaw] = useState('')
  const [topicName, setTopicName] = useState('')
  const [importMsg, setImportMsg] = useState('')

  const [topicIds, setTopicIds] = useState<string[]>([])
  const [balanced, setBalanced] = useState(false)
  const [count, setCount] = useState(10)
  const [timeLimit, setTimeLimit] = useState(20)
  const [penalty, setPenalty] = useState(0)
  const [createError, setCreateError] = useState('')

  const parsed = useMemo(() => parseQuestions(raw), [raw])

  const loadTopics = useCallback(async () => {
    const { data } = await supabase.from('topics').select('id,name,questions(count)').order('name')
    setTopics((data ?? []) as Topic[])
  }, [])

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const u = data.user
      const ok = !!u && !u.is_anonymous
      setSignedIn(ok)
      setReady(true)
      if (ok) loadTopics()
    })
  }, [loadTopics])

  async function signIn() {
    setAuthError('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) return setAuthError(error.message)
    setSignedIn(true)
    loadTopics()
  }

  async function importQuestions() {
    setImportMsg('')
    const { data, error } = await supabase.rpc('import_questions', {
      p_topic_name: topicName,
      p_items: parsed.questions,
    })
    if (error) return setImportMsg(error.message)
    setImportMsg(`${data} perguntas importadas.`)
    setRaw('')
    loadTopics()
  }

  async function createSession() {
    setCreateError('')
    const { data, error } = await supabase.rpc('create_session', {
      p_topics: topicIds,
      p_balanced: balanced,
      p_count: count,
      p_time: timeLimit,
      p_penalty: penalty,
    })
    if (error) return setCreateError(error.message)
    router.push(`/admin/session/${data.id}`)
  }

  const available = topics
    .filter((t) => topicIds.includes(t.id))
    .reduce((sum, t) => sum + (t.questions?.[0]?.count ?? 0), 0)
  const toggleTopic = (id: string) =>
    setTopicIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))

  if (!ready) return null

  if (!signedIn) {
    return (
      <main className="mx-auto max-w-sm space-y-3 p-6">
        <h1 className="text-3xl font-black">Acesso do administrador</h1>
        <input className="w-full rounded-lg bg-slate-800 p-3" placeholder="E-mail" value={email} onChange={(e) => setEmail(e.target.value)} />
        <input className="w-full rounded-lg bg-slate-800 p-3" type="password" placeholder="Senha" value={password} onChange={(e) => setPassword(e.target.value)} />
        {authError && <p className="text-rose-400">{authError}</p>}
        <button onClick={signIn} className="w-full rounded-lg bg-emerald-500 py-3 font-bold text-slate-950">Entrar</button>
      </main>
    )
  }

  return (
    <main className="mx-auto grid max-w-6xl gap-8 p-6 lg:grid-cols-2">
      {/* ---------- Importação ---------- */}
      <section className="space-y-3">
        <h2 className="text-2xl font-bold">Importar perguntas</h2>
        <input
          list="topics"
          value={topicName}
          onChange={(e) => setTopicName(e.target.value)}
          placeholder="Assunto (existente ou novo)"
          className="w-full rounded-lg bg-slate-800 p-3"
        />
        <datalist id="topics">{topics.map((t) => <option key={t.id} value={t.name} />)}</datalist>
        <textarea
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          rows={16}
          placeholder={'1. Qual a capital da França?\na) Londres\nb) Paris *\nc) Roma\nResposta: b'}
          className="w-full rounded-lg bg-slate-800 p-3 font-mono text-sm"
        />
        <p className="text-sm text-slate-400">
          {parsed.questions.length} válidas · {parsed.errors.length} com problema
        </p>
        {parsed.errors.map((e) => (
          <p key={e.index} className="text-sm text-amber-400">#{e.index + 1} “{e.question.slice(0, 50)}”: {e.message}</p>
        ))}
        <button
          onClick={importQuestions}
          disabled={!topicName.trim() || parsed.questions.length === 0}
          className="rounded-lg bg-sky-500 px-5 py-3 font-bold text-slate-950 disabled:opacity-40"
        >
          Salvar {parsed.questions.length} perguntas
        </button>
        {importMsg && <p>{importMsg}</p>}
      </section>

      {/* ---------- Nova partida ---------- */}
      <section className="space-y-3">
        <h2 className="text-2xl font-bold">Nova partida</h2>
        <fieldset className="space-y-2 rounded-lg bg-slate-800 p-3">
          <legend className="px-1 text-sm text-slate-400">Assuntos (marque um ou vários para mesclar)</legend>
          {topics.length === 0 && <p className="text-sm text-slate-400">Importe perguntas para criar assuntos.</p>}
          {topics.map((t) => (
            <label key={t.id} className="flex items-center gap-3">
              <input type="checkbox" checked={topicIds.includes(t.id)} onChange={() => toggleTopic(t.id)} className="h-5 w-5" />
              <span className="flex-1">{t.name}</span>
              <span className="text-sm text-slate-400">{t.questions?.[0]?.count ?? 0} perguntas</span>
            </label>
          ))}
        </fieldset>
        {topicIds.length > 1 && (
          <label className="flex items-center gap-3">
            <input type="checkbox" checked={balanced} onChange={(e) => setBalanced(e.target.checked)} className="h-5 w-5" />
            <span>Equilibrar entre os assuntos (mesma quantidade de cada um, quando possível)</span>
          </label>
        )}
        <label className="block">Quantidade de perguntas {topicIds.length > 0 && <span className="text-slate-400">(máx. {available})</span>}
          <input type="number" min={1} max={available || undefined} value={count} onChange={(e) => setCount(+e.target.value)} className="mt-1 w-full rounded-lg bg-slate-800 p-3" />
        </label>
        <label className="block">Tempo por pergunta (segundos)
          <input type="number" min={5} max={300} value={timeLimit} onChange={(e) => setTimeLimit(+e.target.value)} className="mt-1 w-full rounded-lg bg-slate-800 p-3" />
        </label>
        <label className="block">Penalidade por erro (pontos)
          <input type="number" min={0} value={penalty} onChange={(e) => setPenalty(+e.target.value)} className="mt-1 w-full rounded-lg bg-slate-800 p-3" />
        </label>
        {createError && <p className="text-rose-400">{createError}</p>}
        <button onClick={createSession} disabled={topicIds.length === 0} className="rounded-lg bg-emerald-500 px-5 py-3 font-bold text-slate-950 disabled:opacity-40">
          Criar sala
        </button>
        <a href="/ranking" className="block pt-4 text-sm text-slate-400 underline">Ranking permanente</a>
      </section>
    </main>
  )
}

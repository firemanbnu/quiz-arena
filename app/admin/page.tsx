'use client'
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { LibraryBig, Radio } from 'lucide-react'
import AdminGate from '@/components/AdminGate'
import { supabase } from '@/lib/supabase'

type Topic = { id: string; name: string; questions: { count: number }[] }

export default function AdminPage() {
  return (
    <AdminGate>
      <CriarCompeticao />
    </AdminGate>
  )
}

function CriarCompeticao() {
  const router = useRouter()
  const [topics, setTopics] = useState<Topic[] | null>(null)
  const [topicIds, setTopicIds] = useState<string[]>([])
  const [balanced, setBalanced] = useState(false)
  const [count, setCount] = useState(10)
  const [timeLimit, setTimeLimit] = useState(20)
  const [penalty, setPenalty] = useState(0)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const { data } = await supabase.from('topics').select('id,name,questions(count)').order('name')
    setTopics((data ?? []) as Topic[])
  }, [])
  useEffect(() => {
    load()
  }, [load])

  const available = (topics ?? [])
    .filter((t) => topicIds.includes(t.id))
    .reduce((sum, t) => sum + (t.questions?.[0]?.count ?? 0), 0)
  const toggle = (id: string) => setTopicIds((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]))

  async function create() {
    setBusy(true)
    setError('')
    const { data, error } = await supabase.rpc('create_session', {
      p_topics: topicIds,
      p_count: Math.min(count, available),
      p_time: timeLimit,
      p_penalty: penalty,
      p_balanced: balanced,
    })
    setBusy(false)
    if (error) return setError(error.message)
    router.push(`/admin/session/${data.id}`)
  }

  return (
    <main className="mx-auto max-w-xl px-4 py-10">
      <h1 className="flex items-center gap-3 text-4xl font-extrabold">
        <Radio className="h-9 w-9 text-brand" aria-hidden /> Criar competição
      </h1>
      <p className="muted mt-2">Escolha os assuntos, a quantidade de perguntas e o tempo. Você pode mudar tudo antes de abrir a sala.</p>

      <div className="card mt-8 space-y-5">
        {topics === null ? (
          <p className="muted">Carregando assuntos…</p>
        ) : topics.length === 0 ? (
          <div className="text-center">
            <p className="muted">Você ainda não tem perguntas.</p>
            <Link href="/admin/banco" className="btn btn-primary mt-4">
              <LibraryBig className="h-4 w-4" aria-hidden /> Importar perguntas
            </Link>
          </div>
        ) : (
          <>
            <fieldset className="space-y-2">
              <legend className="mb-2 font-semibold">Assuntos (marque um ou vários para mesclar)</legend>
              {topics.map((t) => (
                <label key={t.id} className="flex cursor-pointer items-center gap-3 rounded-2xl border border-line bg-ink-900 p-3">
                  <input type="checkbox" className="h-5 w-5 accent-brand" checked={topicIds.includes(t.id)} onChange={() => toggle(t.id)} />
                  <span className="flex-1">{t.name}</span>
                  <span className="muted text-sm">{t.questions?.[0]?.count ?? 0} perguntas</span>
                </label>
              ))}
            </fieldset>

            {topicIds.length > 1 && (
              <label className="flex items-center gap-3 text-sm">
                <input type="checkbox" className="h-5 w-5 accent-brand" checked={balanced} onChange={(e) => setBalanced(e.target.checked)} />
                Equilibrar entre os assuntos (mesma quantidade de cada um, quando possível)
              </label>
            )}

            <label className="block">
              Quantidade de perguntas {topicIds.length > 0 && <span className="muted text-sm">(máx. {available})</span>}
              <input type="number" min={1} max={available || undefined} value={count} onChange={(e) => setCount(Math.max(1, +e.target.value || 1))} className="field mt-1" />
            </label>
            <label className="block">
              Tempo por pergunta (segundos)
              <input type="number" min={5} max={300} value={timeLimit} onChange={(e) => setTimeLimit(+e.target.value || 20)} className="field mt-1" />
            </label>
            <label className="block">
              Penalidade por erro (pontos)
              <input type="number" min={0} value={penalty} onChange={(e) => setPenalty(Math.max(0, +e.target.value || 0))} className="field mt-1" />
            </label>

            {error && <p role="alert" className="text-sm text-rose-400">{error}</p>}
            <button onClick={create} disabled={busy || topicIds.length === 0} className="btn btn-primary w-full py-4 text-lg">
              {busy ? 'Criando…' : 'Criar sala'}
            </button>
          </>
        )}
      </div>
    </main>
  )
}

'use client'
import { Fragment, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { AlertTriangle, ArrowLeft, CheckCircle2, ChevronDown, ShieldCheck } from 'lucide-react'
import AdminGate from '@/components/AdminGate'
import { supabase } from '@/lib/supabase'

type P = {
  user_id: string; nickname: string; stored_score: number; recomputed_score: number
  stored_correct: number; recomputed_correct: number; history_score: number | null
  history_rank: number | null; recomputed_rank: number | null; ok: boolean; note: string | null
}
type A = {
  pos: number; user_id: string; nickname: string; status: string; elapsed_ms: number | null
  points: number | null; expected_points: number | null; device_notice: boolean; issue: string | null
}

const sec = (ms: number | null) => (ms == null ? '—' : `${(ms / 1000).toFixed(1).replace('.', ',')} s`)

function Audit() {
  const { id } = useParams<{ id: string }>()
  const [ps, setPs] = useState<P[] | null>(null)
  const [as, setAs] = useState<A[]>([])
  const [error, setError] = useState('')
  const [onlyBad, setOnlyBad] = useState(false)
  const [open, setOpen] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    Promise.all([supabase.rpc('audit_participants', { p_session: id }), supabase.rpc('audit_answers', { p_session: id })]).then(([p, a]) => {
      if (!alive) return
      if (p.error || a.error) return setError((p.error || a.error)!.message)
      setPs((p.data ?? []) as P[])
      setAs((a.data ?? []) as A[])
    })
    return () => {
      alive = false
    }
  }, [id])

  const bad = useMemo(() => (ps ?? []).filter((p) => !p.ok), [ps])
  const issues = as.filter((a) => a.issue && a.issue !== 'sem confirmação do aparelho')
  const shown = (ps ?? []).filter((p) => !onlyBad || !p.ok || as.some((a) => a.user_id === p.user_id && a.issue && a.issue !== 'sem confirmação do aparelho'))

  return (
    <main className="mx-auto max-w-4xl px-4 py-10">
      <Link href={`/historico/${id}`} className="muted inline-flex items-center gap-2 text-sm hover:text-white">
        <ArrowLeft className="h-4 w-4" aria-hidden /> Revisão da competição
      </Link>
      <h1 className="mt-4 flex items-center gap-3 text-4xl font-extrabold">
        <ShieldCheck className="h-8 w-8 text-brand" aria-hidden /> Auditoria da pontuação
      </h1>
      <p className="muted mt-2 text-sm leading-relaxed">
        Cada resposta é recalculada com a regra oficial: acerto = 1000 × (1 − 0,5 × tempo ÷ limite); erro = penalidade da competição; o placar nunca fica abaixo de zero.
        O tempo é o medido no aparelho de cada participante.
      </p>

      {error ? (
        <p role="alert" className="mt-6 text-rose-400">{error}</p>
      ) : !ps ? (
        <p className="muted mt-6">Carregando…</p>
      ) : (
        <>
          <div className={`card mt-6 flex items-center gap-3 ${bad.length || issues.length ? '!border-amber-500/60' : '!border-emerald-500/60'}`}>
            {bad.length || issues.length ? <AlertTriangle className="h-6 w-6 text-amber-300" aria-hidden /> : <CheckCircle2 className="h-6 w-6 text-emerald-300" aria-hidden />}
            <p>
              {bad.length === 0 && issues.length === 0
                ? `Tudo confere: ${ps.length} participante(s), pontuação igual ao recálculo.`
                : `${bad.length} participante(s) com placar divergente e ${issues.length} resposta(s) com alerta.`}
            </p>
          </div>
          <button onClick={() => setOnlyBad((v) => !v)} aria-pressed={onlyBad} className="btn btn-ghost mt-4 !px-4 !py-2 text-sm">
            {onlyBad ? 'Mostrar todos' : 'Só divergências'}
          </button>

          <div className="mt-4 overflow-x-auto rounded-2xl border border-line">
            <table className="w-full text-left text-sm">
              <thead className="bg-ink-800 text-xs uppercase muted">
                <tr>
                  <th className="p-3">Participante</th><th className="p-3">Placar salvo</th><th className="p-3">Recalculado</th>
                  <th className="p-3">Acertos</th><th className="p-3">Posição</th><th className="p-3">Situação</th><th className="p-3" />
                </tr>
              </thead>
              <tbody>
                {shown.map((p) => {
                  const mine = as.filter((a) => a.user_id === p.user_id)
                  const isOpen = open === p.user_id
                  return (
                    <Fragment key={p.user_id}>
                      <tr className="border-t border-line">
                        <td className="p-3 font-semibold">{p.nickname}</td>
                        <td className="p-3">{p.stored_score}</td>
                        <td className="p-3">{p.recomputed_score}</td>
                        <td className="p-3">{p.stored_correct}/{p.recomputed_correct}</td>
                        <td className="p-3">{p.history_rank ?? '—'} / {p.recomputed_rank ?? '—'}</td>
                        <td className={`p-3 font-semibold ${p.ok ? 'text-emerald-300' : 'text-amber-300'}`}>{p.ok ? 'Confere' : p.note || 'Divergente'}</td>
                        <td className="p-3">
                          <button onClick={() => setOpen(isOpen ? null : p.user_id)} aria-expanded={isOpen} aria-label={`Respostas de ${p.nickname}`} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-ink-700">
                            <ChevronDown className={`h-4 w-4 transition ${isOpen ? 'rotate-180' : ''}`} aria-hidden />
                          </button>
                        </td>
                      </tr>
                      {isOpen && (
                        <tr className="bg-ink-900">
                          <td colSpan={7} className="p-3">
                            <table className="w-full text-xs">
                              <thead className="muted"><tr><th className="p-1.5 text-left">Pergunta</th><th className="p-1.5 text-left">Resultado</th><th className="p-1.5 text-left">Tempo</th><th className="p-1.5 text-left">Pontos</th><th className="p-1.5 text-left">Esperado</th><th className="p-1.5 text-left">Alerta</th></tr></thead>
                              <tbody>
                                {mine.map((a) => (
                                  <tr key={a.pos} className="border-t border-line/60">
                                    <td className="p-1.5">{a.pos + 1}</td>
                                    <td className="p-1.5">{a.status === 'correct' ? 'Acertou' : a.status === 'wrong' ? 'Errou' : 'Sem resposta'}</td>
                                    <td className="p-1.5">{sec(a.elapsed_ms)}</td>
                                    <td className="p-1.5">{a.points ?? '—'}</td>
                                    <td className="p-1.5">{a.expected_points ?? '—'}</td>
                                    <td className={`p-1.5 ${a.issue && a.issue !== 'sem confirmação do aparelho' ? 'text-amber-300' : 'muted'}`}>{a.issue ?? ''}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
          <p className="muted mt-3 text-xs">“Sem confirmação do aparelho” é apenas informativo: aparece em competições antigas, anteriores ao tempo medido no aparelho.</p>
        </>
      )}
    </main>
  )
}

export default function AuditoriaPage() {
  return (
    <AdminGate>
      <Audit />
    </AdminGate>
  )
}

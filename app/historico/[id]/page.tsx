'use client'
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { ArrowLeft, ShieldCheck } from 'lucide-react'
import { QuestionReviewCard, loadReview, type ReviewA, type ReviewQ } from '@/components/ReviewBits'
import { useAdmin } from '@/lib/useAdmin'

/** Revisão de uma competição encerrada: perguntas, respostas certas, a sua resposta e quem acertou. */
export default function RevisaoPage() {
  const { id } = useParams<{ id: string }>()
  const { user, isAdmin } = useAdmin()
  const [data, setData] = useState<{ qs: ReviewQ[]; as: ReviewA[] } | null>(null)
  const [error, setError] = useState('')
  const [onlyMissed, setOnlyMissed] = useState(false)

  useEffect(() => {
    let alive = true
    loadReview(id)
      .then((d) => alive && setData(d))
      .catch((e) => alive && setError(e.message || 'Não foi possível carregar a revisão.'))
    return () => {
      alive = false
    }
  }, [id])

  const played = !!data?.qs.some((q) => q.my_status)
  const stats = useMemo(() => {
    const qs = data?.qs ?? []
    return {
      hit: qs.filter((q) => q.my_status === 'correct').length,
      wrong: qs.filter((q) => q.my_status === 'wrong').length,
      none: qs.filter((q) => q.my_status === 'unanswered').length,
      points: qs.reduce((n, q) => n + (q.my_points ?? 0), 0),
    }
  }, [data])
  const shown = (data?.qs ?? []).filter((q) => !onlyMissed || (q.my_status && q.my_status !== 'correct'))

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <Link href="/historico" className="muted inline-flex items-center gap-2 text-sm hover:text-white">
        <ArrowLeft className="h-4 w-4" aria-hidden /> Histórico
      </Link>
      <h1 className="mt-4 text-4xl font-extrabold">Revisão da competição</h1>

      {error ? (
        <p role="alert" className="mt-6 text-rose-400">{error}</p>
      ) : !data ? (
        <p className="muted mt-6">Carregando…</p>
      ) : (
        <>
          {played && (
            <p className="mt-2 text-lg">
              Você acertou <strong>{stats.hit}</strong> de {data.qs.length}
              {stats.wrong > 0 ? `, errou ${stats.wrong}` : ''}
              {stats.none > 0 ? ` e deixou ${stats.none} sem resposta` : ''}.
            </p>
          )}
          <p className="muted mt-1 text-sm">Cada pergunta mostra a resposta certa, a explicação e quem acertou.</p>
          <div className="mt-4 flex flex-wrap gap-3">
            {played && (
              <button onClick={() => setOnlyMissed((v) => !v)} aria-pressed={onlyMissed} className="btn btn-ghost !px-4 !py-2 text-sm">
                {onlyMissed ? 'Mostrar todas' : 'Só as que errei'}
              </button>
            )}
            {isAdmin && (
              <Link href={`/admin/auditoria/${id}`} className="btn btn-ghost !px-4 !py-2 text-sm">
                <ShieldCheck className="h-4 w-4" aria-hidden /> Auditar pontuação
              </Link>
            )}
          </div>
          <ol className="mt-6 space-y-4">
            {shown.map((q) => (
              <QuestionReviewCard key={q.pos} q={q} who={data.as.filter((a) => a.pos === q.pos)} full={isAdminHost(data, user?.id, isAdmin)} meId={user?.id} />
            ))}
          </ol>
          {shown.length === 0 && <p className="muted mt-6">Nenhuma pergunta nesta seleção.</p>}
        </>
      )}
    </main>
  )
}

// Host/administrador recebem do servidor as respostas de todos (inclusive quem errou); jogadores só recebem quem acertou
// e a própria. Se vieram respostas erradas de outras pessoas, a lista completa pode ser mostrada.
function isAdminHost(d: { as: ReviewA[] }, me: string | undefined, isAdmin: boolean) {
  return isAdmin && d.as.some((a) => a.user_id !== me && a.status !== 'correct')
}

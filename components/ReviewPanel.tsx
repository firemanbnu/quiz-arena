'use client'
import { useEffect, useState } from 'react'
import { Pencil, X } from 'lucide-react'
import { supabase, type QuestionPayload } from '@/lib/supabase'
import QuestionEditor from '@/components/QuestionEditor'

type Row = { position: number; question_id: string | null; payload: QuestionPayload }

/**
 * Lista as perguntas da partida (até a posição `maxPos`) para o host corrigir qualquer uma delas,
 * inclusive as já passadas. A correção recalcula pontos, histórico e ranking (ver edit_question).
 */
export default function ReviewPanel({
  sessionId,
  maxPos,
  version,
  onClose,
}: {
  sessionId: string
  maxPos: number
  version: number
  onClose: () => void
}) {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)

  // `version` muda a cada correção salva: a lista é relida com os textos novos
  useEffect(() => {
    let alive = true
    supabase
      .from('session_questions')
      .select('position,question_id,payload')
      .eq('session_id', sessionId)
      .lte('position', maxPos)
      .order('position')
      .then(({ data }) => alive && setRows((data ?? []) as Row[]))
    return () => {
      alive = false
    }
  }, [sessionId, maxPos, version])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !editingId && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, editingId])

  return (
    <div className="fixed inset-0 z-40 grid place-items-center overflow-y-auto bg-black/70 p-4" role="presentation">
      <div role="dialog" aria-modal="true" aria-labelledby="revisar-titulo" className="card my-8 w-full max-w-2xl space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="revisar-titulo" className="font-display text-2xl font-extrabold">
              Revisar perguntas
            </h2>
            <p className="muted mt-1 text-sm">Escolha uma pergunta para corrigir. Os pontos e os rankings são recalculados ao salvar.</p>
          </div>
          <button onClick={onClose} aria-label="Fechar" className="grid h-10 w-10 shrink-0 place-items-center rounded-xl hover:bg-ink-700">
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>

        {rows === null ? (
          <p className="muted">Carregando…</p>
        ) : rows.length === 0 ? (
          <p className="muted">Nenhuma pergunta foi exibida ainda.</p>
        ) : (
          <ol className="space-y-2">
            {rows.map((r) => (
              <li key={r.position} className="flex items-start gap-3 rounded-2xl border border-line bg-ink-900 p-3">
                <span className="muted w-6 shrink-0 text-right font-semibold">{r.position + 1}</span>
                <p className="min-w-0 flex-1">{r.payload.text}</p>
                <button
                  onClick={() => setEditingId(r.question_id)}
                  disabled={!r.question_id}
                  aria-label={`Editar a pergunta ${r.position + 1}`}
                  className="btn btn-ghost !px-3 !py-2 text-sm"
                >
                  <Pencil className="h-4 w-4" aria-hidden /> Editar
                </button>
              </li>
            ))}
          </ol>
        )}

        <div className="flex justify-end">
          <button onClick={onClose} className="btn btn-secondary">
            Fechar
          </button>
        </div>
      </div>
      {editingId && <QuestionEditor questionId={editingId} onClose={() => setEditingId(null)} />}
    </div>
  )
}

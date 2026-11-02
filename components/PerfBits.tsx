'use client'

/** Limite abaixo do qual o assunto "precisa melhorar". */
export const GOOD_PCT = 70
export const WARN_PCT = 50

export type Level = { label: string; bar: string; chip: string }

/** A cor nunca é o único sinal: todo nível também tem rótulo escrito. */
export function levelOf(pct: number): Level {
  if (pct < WARN_PCT) return { label: 'Melhorar', bar: 'bg-rose-500', chip: 'bg-rose-500/20 text-rose-200' }
  if (pct < GOOD_PCT) return { label: 'Atenção', bar: 'bg-amber-500', chip: 'bg-amber-500/20 text-amber-200' }
  return { label: 'Bom', bar: 'bg-emerald-500', chip: 'bg-emerald-500/20 text-emerald-200' }
}

export const fmtPct = (n: number) => `${Number.isInteger(n) ? n : n.toFixed(1).replace('.', ',')}%`

export function PctBar({ pct, label }: { pct: number; label: string }) {
  const lv = levelOf(pct)
  return (
    <div
      role="img"
      aria-label={`${label}: ${fmtPct(pct)} de aproveitamento, nível ${lv.label}`}
      className="h-2.5 w-full overflow-hidden rounded-full bg-ink-700"
    >
      <div className={`h-full rounded-full ${lv.bar}`} style={{ width: `${Math.max(2, Math.min(100, pct))}%` }} />
    </div>
  )
}

export function LevelChip({ pct }: { pct: number }) {
  const lv = levelOf(pct)
  return <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold ${lv.chip}`}>{lv.label}</span>
}

export function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="card !rounded-2xl !p-4">
      <p className="muted text-sm">{label}</p>
      <p className="mt-1 font-display text-3xl font-extrabold">{value}</p>
      {hint && <p className="muted mt-1 text-xs">{hint}</p>}
    </div>
  )
}

export type TopicRow = {
  topic_id: string | null
  topic_name: string
  asked: number
  correct: number
  wrong: number
  unanswered: number
  pct: number
}

export const toTopic = (r: any): TopicRow => ({
  ...r,
  asked: Number(r.asked),
  correct: Number(r.correct),
  wrong: Number(r.wrong),
  unanswered: Number(r.unanswered),
  pct: Number(r.pct),
})

/** Lista de assuntos do pior para o melhor, separada entre "a melhorar" e "em bom nível". */
export function TopicList({
  rows,
  onPick,
  active,
}: {
  rows: TopicRow[]
  onPick?: (name: string | null) => void
  active?: string | null
}) {
  const weak = rows.filter((r) => r.pct < GOOD_PCT)
  const good = rows.filter((r) => r.pct >= GOOD_PCT)
  const block = (title: string, list: TopicRow[], empty: string) => (
    <div>
      <h3 className="mb-2 font-display text-lg font-bold">{title}</h3>
      {list.length === 0 ? (
        <p className="muted text-sm">{empty}</p>
      ) : (
        <ul className="space-y-2">
          {list.map((r) => {
            const body = (
              <>
                <div className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate font-semibold">{r.topic_name}</span>
                  <LevelChip pct={r.pct} />
                  <span className="w-14 text-right font-display text-lg font-extrabold">{fmtPct(r.pct)}</span>
                </div>
                <div className="mt-2">
                  <PctBar pct={r.pct} label={r.topic_name} />
                </div>
                <p className="muted mt-1.5 text-xs">
                  {r.correct} acertos · {r.wrong} erros · {r.unanswered} sem resposta · {r.asked} perguntas
                </p>
              </>
            )
            return (
              <li key={r.topic_name}>
                {onPick ? (
                  <button
                    onClick={() => onPick(active === r.topic_name ? null : r.topic_name)}
                    aria-pressed={active === r.topic_name}
                    className={`card block w-full !rounded-2xl !p-4 text-left transition-colors hover:border-brand/60 ${active === r.topic_name ? '!border-brand' : ''}`}
                  >
                    {body}
                  </button>
                ) : (
                  <div className="card !rounded-2xl !p-4">{body}</div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
  return (
    <div className="space-y-6">
      {block(`Assuntos a melhorar (abaixo de ${GOOD_PCT}%)`, weak, 'Nenhum assunto abaixo do nível esperado.')}
      {good.length > 0 && block('Assuntos em bom nível', good, '')}
    </div>
  )
}

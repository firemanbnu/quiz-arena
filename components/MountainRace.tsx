'use client'
import { useMemo } from 'react'

type Player = { id: string; nickname: string; score: number }

const W = 800
const H = 320

// Rota de subida: é também a encosta esquerda da montanha (o último ponto é o cume)
const ROUTE: [number, number][] = [
  [20, 300], [110, 262], [190, 222], [260, 176], [330, 130], [380, 92], [420, 56],
]
const SEG = ROUTE.slice(1).map(([x, y], i) => {
  const [px, py] = ROUTE[i]
  const len = Math.hypot(x - px, y - py)
  return { px, py, dx: (x - px) / len, dy: (y - py) / len, len }
})
const TOTAL = SEG.reduce((s, g) => s + g.len, 0)

/** Ponto na rota para t em [0,1], com o vetor normal à encosta. */
function pointAt(t: number) {
  let d = Math.min(Math.max(t, 0), 1) * TOTAL
  for (const g of SEG) {
    if (d <= g.len) return { x: g.px + g.dx * d, y: g.py + g.dy * d, nx: -g.dy, ny: g.dx }
    d -= g.len
  }
  const g = SEG[SEG.length - 1]
  return { x: g.px + g.dx * g.len, y: g.py + g.dy * g.len, nx: -g.dy, ny: g.dx }
}

const MEDAL = ['#facc15', '#cbd5e1', '#d97706'] // ouro, prata, bronze
const LABELED = 8 // quantos nomes aparecem escritos; os demais ficam como pontos (com tooltip)

/**
 * Montanha da partida: cada participante sobe conforme a pontuação.
 * `maxScore` é a pontuação que leva ao topo (ex.: perguntas × 900).
 */
export default function MountainRace({ players, maxScore }: { players: Player[]; maxScore: number }) {
  const items = useMemo(() => {
    const sorted = [...players].sort((a, b) => b.score - a.score || a.nickname.localeCompare(b.nickname))
    const placed: { x: number; y: number }[] = []
    let camp = 0

    return sorted.map((p, rank) => {
      const t = maxScore > 0 ? Math.min(1, p.score / maxScore) : 0
      let x: number
      let y: number

      if (t < 0.03) {
        // acampamento base: quem ainda não pontuou fica em grade, sem sobrepor
        const col = camp % 8
        const row = Math.floor(camp / 8)
        x = 40 + col * 17
        y = 306 - row * 15
        camp++
      } else {
        const b = pointAt(t)
        x = b.x
        y = b.y
        for (const k of [0, 1, -1, 2, -2, 3, -3, 4, -4, 5, -5, 6, -6]) {
          const cx = b.x + b.nx * 20 * k
          const cy = b.y + b.ny * 20 * k
          if (placed.every((q) => Math.hypot(q.x - cx, q.y - cy) >= 19)) {
            x = cx
            y = cy
            break
          }
        }
      }
      placed.push({ x, y })
      return { ...p, rank, x, y }
    })
  }, [players, maxScore])

  const leader = items[0]
  const ariaLabel = leader
    ? `Montanha da partida. Na frente: ${leader.nickname}, com ${leader.score} pontos.`
    : 'Montanha da partida. Aguardando participantes.'

  return (
    <div className="rounded-xl bg-slate-900 p-3">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={ariaLabel} className="h-auto w-full">
        <defs>
          <linearGradient id="mr-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#0f172a" />
            <stop offset="1" stopColor="#1e3a5f" />
          </linearGradient>
          <linearGradient id="mr-rock" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#64748b" />
            <stop offset="1" stopColor="#1e293b" />
          </linearGradient>
        </defs>

        <rect width={W} height={H} rx="12" fill="url(#mr-sky)" />

        {/* montanhas ao fundo */}
        <polygon points="430,320 540,170 610,215 700,120 800,230 800,320" fill="#1e293b" opacity="0.8" />

        {/* montanha principal: encosta esquerda = rota */}
        <polygon
          points={`0,320 ${ROUTE.map(([x, y]) => `${x},${y}`).join(' ')} 520,150 580,118 690,215 800,320`}
          fill="url(#mr-rock)"
        />
        {/* lado sombreado */}
        <polygon points="420,56 520,150 580,118 690,215 800,320 470,320 450,200" fill="#0f172a" opacity="0.35" />
        {/* neve no cume */}
        <polygon points="420,56 397,84 411,77 420,90 431,78 446,86" fill="#f8fafc" />

        {/* trilha */}
        <polyline
          points={ROUTE.map(([x, y]) => `${x},${y}`).join(' ')}
          fill="none"
          stroke="#94a3b8"
          strokeWidth="2"
          strokeDasharray="4 6"
          opacity="0.6"
        />

        {/* bandeira no topo */}
        <line x1="420" y1="56" x2="420" y2="26" stroke="#e2e8f0" strokeWidth="2" />
        <polygon points="420,26 446,34 420,42" fill="#ef4444" />
        <text x="456" y="38" fill="#e2e8f0" fontSize="12" fontWeight="700">Topo</text>

        {/* acampamento */}
        <text x="22" y="22" fill="#94a3b8" fontSize="11">Subindo a montanha · ranking ao vivo</text>

        {/* participantes */}
        {items.map((p) => {
          const top3 = p.rank < 3
          const labeled = p.rank < LABELED
          const left = p.rank % 2 === 0
          const name = p.nickname.length > 14 ? p.nickname.slice(0, 13) + '…' : p.nickname
          return (
            <g
              key={p.id}
              style={{ transform: `translate(${p.x}px, ${p.y}px)`, transition: 'transform 900ms ease-out' }}
            >
              <title>{`${p.rank + 1}º ${p.nickname} — ${p.score} pts`}</title>
              <circle
                r={labeled ? 8 : 5.5}
                fill={top3 ? MEDAL[p.rank] : '#38bdf8'}
                stroke="#0f172a"
                strokeWidth="2"
              />
              {labeled && (
                <text
                  x={left ? -14 : 14}
                  y={4}
                  textAnchor={left ? 'end' : 'start'}
                  fontSize="12"
                  fontWeight="700"
                  fill="#f8fafc"
                  stroke="#0f172a"
                  strokeWidth="3"
                  paintOrder="stroke"
                >
                  {`${p.rank + 1}º ${name}`}
                </text>
              )}
            </g>
          )
        })}
      </svg>
      {items.length > LABELED && (
        <p className="mt-1 text-xs text-slate-400">
          Mostrando os nomes dos {LABELED} primeiros; passe o mouse nos pontos para ver os demais.
        </p>
      )}
    </div>
  )
}

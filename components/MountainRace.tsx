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

/** Borda direita da montanha na altura y (para a linha de 2º e 3º lugar). */
function edgeX(y: number) {
  if (y <= 150) return 420 + ((y - 56) * 100) / 94 - 4
  if (y <= 215) return 580 + ((y - 118) * 110) / 97 - 4
  return 690 + ((y - 215) * 110) / 105 - 4
}

const MEDAL = ['#facc15', '#cbd5e1', '#d97706'] // ouro, prata, bronze
const LABELED = 8 // quantos nomes aparecem escritos; os demais ficam como pontos (com tooltip)

const shortName = (n: string, max: number) => (n.length > max ? n.slice(0, max - 1) + '…' : n)

/** Bombeiro de capacete vermelho, hasteando a bandeira. Pés em (0,0). */
function Firefighter() {
  return (
    <g>
      {/* pernas e botas */}
      <rect x="-6" y="-11" width="5" height="9" fill="#1e293b" />
      <rect x="1" y="-11" width="5" height="9" fill="#1e293b" />
      <rect x="-7" y="-3" width="7" height="3" rx="1" fill="#0f172a" />
      <rect x="0" y="-3" width="7" height="3" rx="1" fill="#0f172a" />
      {/* braço de baixo */}
      <line x1="-7" y1="-22" x2="-11" y2="-14" stroke="#f59e0b" strokeWidth="4" strokeLinecap="round" />
      {/* casaco com faixas refletivas */}
      <rect x="-8" y="-25" width="16" height="15" rx="3" fill="#f59e0b" />
      <rect x="-8" y="-19" width="16" height="2" fill="#f1f5f9" />
      <rect x="-8" y="-15" width="16" height="2" fill="#f1f5f9" />
      {/* braço erguido segurando a corda da bandeira */}
      <line x1="7" y1="-22" x2="15" y2="-30" stroke="#f59e0b" strokeWidth="4" strokeLinecap="round" />
      <circle cx="15.5" cy="-30.5" r="2.2" fill="#fcd9b6" />
      {/* cabeça e capacete */}
      <circle cx="0" cy="-31" r="5" fill="#fcd9b6" />
      <path d="M-7,-32 a7,7 0 0 1 14,0 z" fill="#dc2626" />
      <rect x="-9" y="-32" width="18" height="2.5" rx="1.2" fill="#b91c1c" />
      <circle cx="0" cy="-35.5" r="1.6" fill="#facc15" />
    </g>
  )
}

/**
 * Montanha da partida: cada participante sobe conforme a pontuação.
 * `maxScore` é a pontuação que leva ao topo (ex.: perguntas × 900).
 * Quando o 1º colocado chega à bandeira (ou a partida termina, com `finished`), um bombeiro
 * iça a bandeira com o nome do vencedor; o 2º e o 3º ficam marcados por uma linha na montanha.
 */
export default function MountainRace({
  players,
  maxScore,
  finished = false,
}: {
  players: Player[]
  maxScore: number
  finished?: boolean
}) {
  const { items, arrived } = useMemo(() => {
    const sorted = [...players].sort((a, b) => b.score - a.score || a.nickname.localeCompare(b.nickname))
    const leaderT = sorted.length && maxScore > 0 ? Math.min(1, sorted[0].score / maxScore) : 0
    const arrived = sorted.length > 0 && sorted[0].score > 0 && (finished || leaderT >= 1)
    const placed: { x: number; y: number }[] = []
    let camp = 0

    const list = sorted.map((p, rank) => {
      let t = maxScore > 0 ? Math.min(1, p.score / maxScore) : 0
      // na chegada, o líder está na bandeira e os demais ficam abaixo dela
      if (arrived) t = rank === 0 ? 1 : Math.min(t, 0.93)
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
        if (!(arrived && rank === 0)) {
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
      }
      placed.push({ x, y })
      return { ...p, rank, x, y, camp: t < 0.03 }
    })
    return { items: list, arrived }
  }, [players, maxScore, finished])

  const leader = items[0]
  const ariaLabel = !leader
    ? 'Montanha da partida. Aguardando participantes.'
    : arrived
      ? `Montanha da partida. ${leader.nickname} chegou ao topo e içou a bandeira, com ${leader.score} pontos.`
      : `Montanha da partida. Na frente: ${leader.nickname}, com ${leader.score} pontos.`

  const podiumLines = items.filter((p) => (p.rank === 1 || p.rank === 2) && !p.camp && p.score > 0)

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

        {/* linhas do 2º e 3º colocados, na altura de cada um */}
        {podiumLines.map((p) => (
          <g key={`linha-${p.id}`}>
            <line
              x1={p.x}
              y1={p.y}
              x2={edgeX(p.y)}
              y2={p.y}
              stroke={MEDAL[p.rank]}
              strokeWidth="2"
              strokeDasharray="7 5"
              opacity="0.85"
            />
            <text
              x={edgeX(p.y) - 6}
              y={p.y - 5}
              textAnchor="end"
              fontSize="11"
              fontWeight="700"
              fill={MEDAL[p.rank]}
              stroke="#0f172a"
              strokeWidth="3"
              paintOrder="stroke"
            >
              {`${p.rank + 1}º lugar`}
            </text>
          </g>
        ))}

        {/* mastro e bandeira: a bandeira sobe quando o 1º chega */}
        <line x1="420" y1="56" x2="420" y2="26" stroke="#e2e8f0" strokeWidth="2" />
        <g style={{ transform: `translateY(${arrived ? 0 : 22}px)`, transition: 'transform 1600ms ease-out 400ms' }}>
          <polygon points="420,26 446,34 420,42" fill="#ef4444" />
        </g>

        {arrived && leader ? (
          <g>
            <text x="456" y="26" fill="#94a3b8" fontSize="10" fontWeight="700" letterSpacing="1.5">
              VENCEDOR
            </text>
            <text
              x="456"
              y="44"
              fill="#facc15"
              fontSize="16"
              fontWeight="800"
              stroke="#0f172a"
              strokeWidth="3"
              paintOrder="stroke"
            >
              {shortName(leader.nickname, 18)}
            </text>
            <text x="456" y="58" fill="#e2e8f0" fontSize="11">{`${leader.score} pontos`}</text>
          </g>
        ) : (
          <text x="456" y="38" fill="#e2e8f0" fontSize="12" fontWeight="700">Topo</text>
        )}

        {/* bombeiro ao lado do mastro */}
        {arrived && (
          <g transform="translate(402 73) scale(1.2)">
            <g style={{ animation: 'mr-appear 700ms ease-out both' }}>
              <Firefighter />
            </g>
          </g>
        )}

        {/* acampamento */}
        <text x="22" y="22" fill="#94a3b8" fontSize="11">Subindo a montanha · ranking ao vivo</text>

        {/* participantes */}
        {items.map((p) => {
          if (arrived && p.rank === 0) return null // o líder é o bombeiro no topo
          const top3 = p.rank < 3
          const labeled = p.rank < LABELED
          const left = p.rank % 2 === 0 && p.x > 110 // perto da borda esquerda o nome vai para a direita
          const name = shortName(p.nickname, 14)
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
        <style>{`@keyframes mr-appear { from { opacity: 0; transform: translateY(-8px) } to { opacity: 1; transform: none } } @media (prefers-reduced-motion: reduce) { svg g { animation: none !important } }`}</style>
      </svg>
      {items.length > LABELED && (
        <p className="mt-1 text-xs text-slate-400">
          Mostrando os nomes dos {LABELED} primeiros; passe o mouse nos pontos para ver os demais.
        </p>
      )}
    </div>
  )
}

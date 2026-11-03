'use client'
import { useEffect, useMemo, useState } from 'react'

type Player = { id: string; nickname: string; score: number; correct?: number }

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

// os 5 primeiros ficam em destaque: ouro, prata, bronze, violeta e verde-água
const MEDAL = ['#facc15', '#cbd5e1', '#d97706', '#a78bfa', '#2dd4bf']
const TOP = 5
const LABELED = 8 // quantos nomes aparecem escritos; os demais ficam como pontos (com tooltip)

const shortName = (n: string, max: number) => (n.length > max ? n.slice(0, max - 1) + '…' : n)

/**
 * Montanha da partida: cada participante sobe conforme a pontuação.
 * `maxScore` é a pontuação que leva ao topo (ex.: perguntas × 900).
 * Quando o 1º colocado chega ao topo (ou a partida termina, com `finished`), o vídeo do bombeiro com a
 * bandeira (public/vencedor.mp4) toca ao lado do cume, com o nome do vencedor; o 2º e o 3º ficam
 * marcados por uma linha na montanha.
 */
export default function MountainRace({
  players,
  maxScore,
  steps,
  finished = false,
}: {
  players: Player[]
  maxScore: number
  /** total de perguntas: cada acerto sobe 1/steps da montanha (a pontuação só desempata) */
  steps?: number
  finished?: boolean
}) {
  // quem prefere menos movimento vê só o quadro parado do vídeo
  const [reduceMotion, setReduceMotion] = useState(false)
  useEffect(() => {
    const m = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReduceMotion(m.matches)
  }, [])

  const { items, arrived } = useMemo(() => {
    const sorted = [...players].sort((a, b) => b.score - a.score || a.nickname.localeCompare(b.nickname))
    // progresso: cada acerto = um degrau (1/steps); a pontuação (velocidade) soma até 0,4 degrau
    const progress = (p: Player) => {
      if (steps && steps > 0 && p.correct !== undefined) {
        const bonus = Math.min(1, Math.max(0, p.score / (steps * 1000)))
        return Math.min(1, (p.correct + 0.4 * bonus) / steps)
      }
      return maxScore > 0 ? Math.min(1, p.score / maxScore) : 0
    }
    const leaderT = sorted.length ? progress(sorted[0]) : 0
    const arrived = sorted.length > 0 && sorted[0].score > 0 && (finished || leaderT >= 1)
    const placed: { x: number; y: number }[] = []
    let camp = 0

    const list = sorted.map((p, rank) => {
      let t = progress(p)
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
      return { ...p, rank, x, y, t, camp: t < 0.03 }
    })
    return { items: list, arrived }
  }, [players, maxScore, steps, finished])

  const leader = items[0]
  const ariaLabel = !leader
    ? 'Montanha da partida. Aguardando participantes.'
    : arrived
      ? `Montanha da partida. ${leader.nickname} chegou ao topo e içou a bandeira, com ${leader.score} pontos.`
      : `Montanha da partida. Na frente: ${leader.nickname}, com ${leader.score} pontos.`

  // linhas de 2º a 5º lugar; o texto é omitido quando ficaria colado no de outra linha
  const podiumLines = items
    .filter((p) => p.rank >= 1 && p.rank < TOP && !p.camp && p.score > 0)
    .map((p, i, arr) => ({
      ...p,
      showLabel: arr.slice(0, i).every((q) => Math.abs(q.y - p.y) >= 14),
    }))
  // trilha percorrida pelos 5 primeiros (do acampamento até onde cada um chegou)
  const trails = items.filter((p) => p.rank < TOP && !p.camp && !(arrived && p.rank === 0))

  return (
    <div className="rounded-xl bg-slate-900 p-3">
      <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={ariaLabel} className="block h-auto w-full">
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

        {/* trilha de cada um dos 5 primeiros: cresce (com animação) conforme o participante sobe */}
        {trails.map((p) => (
          <polyline
            key={`trilha-${p.id}`}
            points={ROUTE.map(([x, y]) => `${x},${y}`).join(' ')}
            pathLength={1}
            fill="none"
            stroke={MEDAL[p.rank]}
            strokeWidth="4"
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity="0.55"
            style={{ strokeDasharray: '1 1', strokeDashoffset: 1 - p.t, transition: 'stroke-dashoffset 1400ms ease-in-out' }}
          />
        ))}

        {/* linhas do 2º ao 5º colocado, na altura de cada um */}
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
            {p.showLabel && (
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
            )}
          </g>
        ))}

        {/* mastro e bandeira (baixa até alguém chegar); ao chegar entra o vídeo do vencedor */}
        {!arrived && (
          <>
            <line x1="420" y1="56" x2="420" y2="26" stroke="#e2e8f0" strokeWidth="2" />
            <g style={{ transform: 'translateY(22px)' }}>
              <polygon points="420,26 446,34 420,42" fill="#ef4444" />
            </g>
            <text x="456" y="38" fill="#e2e8f0" fontSize="12" fontWeight="700">Topo</text>
          </>
        )}

        {arrived && leader && (
          <g textAnchor="end">
            <text x="408" y="26" fill="#94a3b8" fontSize="10" fontWeight="700" letterSpacing="1.5">
              VENCEDOR
            </text>
            <text
              x="408"
              y="45"
              fill="#facc15"
              fontSize="17"
              fontWeight="800"
              stroke="#0f172a"
              strokeWidth="3"
              paintOrder="stroke"
            >
              {shortName(leader.nickname, 18)}
            </text>
            <text x="408" y="60" fill="#e2e8f0" fontSize="11">{`${leader.score} pontos`}</text>
          </g>
        )}

        {/* acampamento */}
        <text x="22" y="22" fill="#94a3b8" fontSize="11">Subindo a montanha · ranking ao vivo</text>

        {/* participantes */}
        {items.map((p) => {
          if (arrived && p.rank === 0) return null // o líder é o bombeiro no topo
          const top = p.rank < TOP // os 5 primeiros em destaque
          const labeled = p.rank < LABELED
          const left = p.rank % 2 === 0 && p.x > 110 // perto da borda esquerda o nome vai para a direita
          const name = shortName(p.nickname, top ? 16 : 12)
          return (
            <g
              key={p.id}
              style={{ transform: `translate(${p.x}px, ${p.y}px)`, transition: 'transform 1400ms ease-in-out' }}
            >
              <title>{`${p.rank + 1}º ${p.nickname} — ${p.score} pts`}</title>
              {top && !p.camp && <circle r="14" fill={MEDAL[p.rank]} opacity="0.28" />}
              <circle
                r={top ? 9 : labeled ? 6.5 : 5}
                fill={top ? MEDAL[p.rank] : '#38bdf8'}
                stroke={top ? '#f8fafc' : '#0f172a'}
                strokeWidth={top ? 2.5 : 2}
              />
              {top && (
                <text y="3.6" textAnchor="middle" fontSize="10" fontWeight="800" fill="#0f172a">
                  {p.rank + 1}
                </text>
              )}
              {labeled && (
                <text
                  x={left ? -16 : 16}
                  y={4}
                  textAnchor={left ? 'end' : 'start'}
                  fontSize={top ? 13 : 10.5}
                  fontWeight={top ? 800 : 600}
                  fill={top ? '#f8fafc' : '#cbd5e1'}
                  stroke="#0f172a"
                  strokeWidth="3"
                  paintOrder="stroke"
                >
                  {name}
                </text>
              )}
            </g>
          )
        })}
      </svg>
      {arrived && leader && (
        // janela do vídeo ao lado do cume (posição em % do desenho 800×320)
        <div
          className="absolute overflow-hidden rounded-lg border-2 border-yellow-400 bg-slate-950 shadow-lg shadow-black/50"
          style={{ left: '57.5%', top: '1.25%', width: '14.5%', height: '29.5%' }}
        >
          {reduceMotion ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src="/vencedor-poster.jpg" alt={`${leader.nickname} comemorando a vitória com a bandeira`} className="h-full w-full object-cover" />
          ) : (
            <video
              src="/vencedor.mp4"
              poster="/vencedor-poster.jpg"
              autoPlay
              muted
              playsInline
              preload="auto"
              aria-label={`${leader.nickname} comemorando a vitória com a bandeira`}
              className="h-full w-full object-cover"
            />
          )}
        </div>
      )}
      </div>
      {items.length > LABELED && (
        <p className="mt-1 text-xs text-slate-400">
          Mostrando os nomes dos {LABELED} primeiros; passe o mouse nos pontos para ver os demais.
        </p>
      )}
    </div>
  )
}

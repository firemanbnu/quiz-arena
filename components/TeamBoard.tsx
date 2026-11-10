'use client'
import { Trophy } from 'lucide-react'
import type { TeamScore } from '@/lib/supabase'

const TONES = [
  { box: 'border-sky-500/60 bg-sky-500/10', bar: 'bg-sky-500' },
  { box: 'border-rose-500/60 bg-rose-500/10', bar: 'bg-rose-500' },
]

/** Resultado entre duas equipes: id da vencedora, ou 'draw' em caso de empate. */
export function teamWinner(teams: TeamScore[]): string | 'draw' | null {
  if (teams.length < 2) return null
  const [a, b] = teams
  if (a.score === b.score) return 'draw'
  return a.score > b.score ? a.team_id : b.team_id
}

/** Placar das equipes: sem ranking individual. Com `final`, mostra vencedora e perdedora. */
export default function TeamBoard({ teams, final = false, myTeamId }: { teams: TeamScore[]; final?: boolean; myTeamId?: string | null }) {
  const winner = teamWinner(teams)
  const max = Math.max(1, ...teams.map((t) => t.score))
  return (
    <div className="space-y-3" aria-label="Placar das equipes">
      {final && (
        <p className="text-center font-display text-3xl font-extrabold" role="status">
          {winner === 'draw' ? 'Empate!' : winner ? `${teams.find((t) => t.team_id === winner)?.name} venceu!` : ''}
        </p>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        {teams.map((t, i) => {
          const won = final && winner === t.team_id
          const lost = final && winner !== 'draw' && winner !== t.team_id
          return (
            <div key={t.team_id} className={`rounded-2xl border p-4 ${TONES[i % 2].box} ${lost ? 'opacity-70' : ''} ${t.team_id === myTeamId ? 'ring-2 ring-white/70' : ''}`}>
              <div className="flex items-center justify-between gap-2">
                <p className="truncate text-lg font-bold">
                  {t.name}
                  {t.team_id === myTeamId && <span className="muted ml-2 text-xs font-normal">sua equipe</span>}
                </p>
                {final && winner !== 'draw' && (
                  <span className={`flex shrink-0 items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold ${won ? 'bg-yellow-400 text-ink-900' : 'bg-ink-700'}`}>
                    {won && <Trophy className="h-3.5 w-3.5" aria-hidden />} {won ? 'Vencedora' : 'Perdedora'}
                  </span>
                )}
              </div>
              <p className="mt-1 font-display text-5xl font-extrabold">{t.score}</p>
              <p className="muted text-xs">
                {t.members} {t.members === 1 ? 'jogador' : 'jogadores'} · {t.correct} acertos no total
              </p>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-ink-700" aria-hidden>
                <div className={`h-full ${TONES[i % 2].bar} transition-all duration-700`} style={{ width: `${(t.score / max) * 100}%` }} />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

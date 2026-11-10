'use client'
import { useCallback, useEffect, useState } from 'react'
import { supabase, type TeamScore } from '@/lib/supabase'

/** Totais das equipes (soma dos pontos dos integrantes). Relido a cada mudança de fase; `poll` atualiza no lobby. */
export function useTeamScores(sessionId: string, enabled: boolean, deps: unknown[], poll = false) {
  const [teams, setTeams] = useState<TeamScore[]>([])
  const load = useCallback(async () => {
    const { data } = await supabase.rpc('team_scores', { p_session: sessionId })
    if (data) setTeams(data as TeamScore[])
  }, [sessionId])

  useEffect(() => {
    if (enabled) load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, load, ...deps])

  useEffect(() => {
    if (!enabled || !poll) return
    const t = setInterval(load, 3000)
    return () => clearInterval(t)
  }, [enabled, poll, load])

  return { teams, reloadTeams: load }
}

'use client'
import { useCallback, useEffect, useState } from 'react'
import {
  supabase,
  type Answer,
  type GameSession,
  type Participant,
  type QuestionPayload,
} from '@/lib/supabase'

/**
 * Otimizado para o plano gratuito do Supabase Realtime (200 conexões, 100 msgs/s, 2M msgs/mês):
 *  - TODOS escutam só `game_sessions` (1 mudança por fase da partida).
 *  - Só o HOST escuta `answers` (INSERT) e `participants` (INSERT, entradas na sala).
 *  - Placar NÃO é transmitido a cada resposta (evitaria N×N mensagens): é relido
 *    do banco a cada mudança de fase (pergunta → revelação → próxima).
 */
export function useGameRoom(sessionId: string, opts: { isHost: boolean }) {
  const [session, setSession] = useState<GameSession | null>(null)
  const [participants, setParticipants] = useState<Participant[]>([])
  const [answers, setAnswers] = useState<Answer[]>([])
  const [question, setQuestion] = useState<QuestionPayload | null>(null)

  const loadParticipants = useCallback(async () => {
    const { data } = await supabase.from('participants').select('*').eq('session_id', sessionId)
    if (data) setParticipants(data as Participant[])
  }, [sessionId])

  useEffect(() => {
    let alive = true

    const loadAll = async () => {
      const [s, a] = await Promise.all([
        supabase.from('game_sessions').select('*').eq('id', sessionId).single(),
        opts.isHost
          ? supabase.from('answers').select('*').eq('session_id', sessionId)
          : Promise.resolve({ data: [] as Answer[] }),
      ])
      if (!alive) return
      if (s.data) setSession(s.data as GameSession)
      setAnswers((a.data ?? []) as Answer[])
      await loadParticipants()
    }
    loadAll()

    const channel = supabase
      .channel(`room:${sessionId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'game_sessions', filter: `id=eq.${sessionId}` },
        (payload) => setSession(payload.new as GameSession)
      )

    if (opts.isHost) {
      channel
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'participants', filter: `session_id=eq.${sessionId}` },
          (payload) =>
            setParticipants((prev) =>
              prev.some((p) => p.id === (payload.new as Participant).id) ? prev : [...prev, payload.new as Participant]
            )
        )
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'answers', filter: `session_id=eq.${sessionId}` },
          (payload) => setAnswers((prev) => [...prev, payload.new as Answer])
        )
    }

    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') loadAll() // garante consistência após (re)conexão
    })

    return () => {
      alive = false
      supabase.removeChannel(channel)
    }
  }, [sessionId, opts.isHost, loadParticipants])

  const index = session?.current_index ?? -1
  const status = session?.status

  // placar autoritativo: relido a cada mudança de fase
  useEffect(() => {
    if (status) loadParticipants()
  }, [status, index, loadParticipants])

  // pergunta atual (RLS só entrega ao jogador a pergunta em andamento)
  useEffect(() => {
    if (index < 0 || status === 'lobby' || status === 'finished') {
      setQuestion(null)
      return
    }
    let alive = true
    supabase
      .from('session_questions')
      .select('payload')
      .eq('session_id', sessionId)
      .eq('position', index)
      .maybeSingle()
      .then(({ data }) => {
        if (alive) setQuestion((data?.payload as QuestionPayload) ?? null)
      })
    return () => {
      alive = false
    }
  }, [sessionId, index, status])

  return { session, participants, answers, question }
}

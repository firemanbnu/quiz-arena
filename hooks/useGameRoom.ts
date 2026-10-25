'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
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
  const [questionPos, setQuestionPos] = useState(-1) // posição a que `question` pertence

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
  const version = session?.edit_version ?? 0 // muda quando o admin corrige uma pergunta

  // placar autoritativo: relido a cada mudança de fase e a cada correção (que pode recalcular pontos)
  useEffect(() => {
    if (status) loadParticipants()
  }, [status, index, version, loadParticipants])

  // após uma correção, o host relê as respostas (acerto/pontos podem ter mudado)
  const seenVersion = useRef<number | null>(null)
  const hasSession = session !== null
  useEffect(() => {
    if (!hasSession) return
    if (seenVersion.current === null) {
      seenVersion.current = version
      return
    }
    if (seenVersion.current === version) return
    seenVersion.current = version
    if (opts.isHost) {
      supabase
        .from('answers')
        .select('*')
        .eq('session_id', sessionId)
        .then(({ data }) => data && setAnswers(data as Answer[]))
    }
  }, [hasSession, version, opts.isHost, sessionId])

  // pergunta atual (RLS só entrega ao jogador a pergunta em andamento); relida após correções
  useEffect(() => {
    if (index < 0 || status === 'lobby' || status === 'finished') {
      setQuestion(null)
      setQuestionPos(-1)
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
        if (!alive) return
        setQuestion((data?.payload as QuestionPayload) ?? null)
        setQuestionPos(data ? index : -1)
      })
    return () => {
      alive = false
    }
  }, [sessionId, index, status, version])

  return { session, participants, answers, question, questionPos }
}

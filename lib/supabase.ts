import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export type SessionStatus = 'lobby' | 'question' | 'reveal' | 'finished'

export type GameSession = {
  id: string
  code: string
  host_id: string
  topic_id: string | null
  topic_ids: string[]
  topic_label: string | null
  status: SessionStatus
  time_limit_s: number
  question_count: number
  wrong_penalty: number
  current_index: number
  question_started_at: string | null
  /** aumenta a cada correção de pergunta: faz host e jogadores relerem pergunta, gabarito e placar */
  edit_version: number
  /** 'team' = competição por equipes (soma dos pontos, sem ranking individual) */
  mode: 'individual' | 'team'
}

export type Participant = {
  id: string
  session_id: string
  user_id: string
  nickname: string
  score: number
  correct_count: number
  team_id: string | null
}

export type TeamScore = {
  team_id: string
  name: string
  position: number
  members: number
  score: number
  correct: number
}

export type Answer = {
  id: string
  session_id: string
  position: number
  participant_id: string
  option_id: string
  is_correct: boolean
  elapsed_ms: number
  points: number
}

export type QuestionPayload = {
  text: string
  options: { id: string; text: string }[]
}

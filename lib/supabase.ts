import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

/** Participantes entram como usuários anônimos (sessão persiste no navegador). */
export async function ensureAnonymousUser() {
  const { data } = await supabase.auth.getSession()
  if (!data.session) {
    const { error } = await supabase.auth.signInAnonymously()
    if (error) throw error
  }
}

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
}

export type Participant = {
  id: string
  session_id: string
  user_id: string
  nickname: string
  score: number
  correct_count: number
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

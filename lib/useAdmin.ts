'use client'
import { useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

type State = { ready: boolean; user: User | null; isAdmin: boolean }

/** Administrador = usuário com e-mail/senha (não anônimo). */
export function useAdmin(): State {
  const [state, setState] = useState<State>({ ready: false, user: null, isAdmin: false })

  useEffect(() => {
    let alive = true
    const apply = (u: User | null) =>
      alive && setState({ ready: true, user: u, isAdmin: !!u && !u.is_anonymous })

    supabase.auth.getSession().then(({ data }) => apply(data.session?.user ?? null))
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => apply(session?.user ?? null))
    return () => {
      alive = false
      sub.subscription.unsubscribe()
    }
  }, [])

  return state
}

'use client'
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

export type AccessStatus = 'loading' | 'signed_out' | 'pending' | 'approved' | 'blocked'
export type AccessRole = 'player' | 'organizer' | 'admin' | null

type Access = {
  /** false enquanto a sessão e a autorização ainda estão sendo verificadas */
  ready: boolean
  user: User | null
  status: AccessStatus
  role: AccessRole
  /** organizador aprovado ou administrador geral: pode criar competições e mexer no banco */
  isAdmin: boolean
  /** administrador geral: libera e bloqueia pessoas */
  isSuper: boolean
  refresh: () => Promise<void>
}

const Ctx = createContext<Access | null>(null)

/**
 * Autorização: só entra quem tem conta (e-mail/senha) liberada pelo administrador geral.
 * A decisão vem do banco (função request_access); as regras valem também no servidor (RLS e RPCs).
 */
export function AccessProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<{ user: User | null; status: AccessStatus; role: AccessRole }>({
    user: null,
    status: 'loading',
    role: null,
  })

  const load = useCallback(async (user: User | null) => {
    if (!user || user.is_anonymous) {
      setState({ user: null, status: 'signed_out', role: null })
      return
    }
    const { data, error } = await supabase.rpc('request_access')
    if (error || !data) {
      // sem resposta do servidor: não libera nada
      setState({ user, status: 'pending', role: null })
      return
    }
    const r = data as { status: string; role?: AccessRole }
    const status: AccessStatus = r.status === 'approved' ? 'approved' : r.status === 'blocked' ? 'blocked' : 'pending'
    setState({ user, status, role: status === 'approved' ? (r.role ?? 'player') : null })
  }, [])

  const refresh = useCallback(async () => {
    const { data } = await supabase.auth.getSession()
    await load(data.session?.user ?? null)
  }, [load])

  useEffect(() => {
    let alive = true
    supabase.auth.getSession().then(({ data }) => alive && load(data.session?.user ?? null))
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      // adia a chamada: não se faz consulta dentro do callback de autenticação
      setTimeout(() => alive && load(session?.user ?? null), 0)
    })
    return () => {
      alive = false
      sub.subscription.unsubscribe()
    }
  }, [load])

  const value = useMemo<Access>(
    () => ({
      ready: state.status !== 'loading',
      user: state.user,
      status: state.status,
      role: state.role,
      isAdmin: state.status === 'approved' && (state.role === 'organizer' || state.role === 'admin'),
      isSuper: state.status === 'approved' && state.role === 'admin',
      refresh,
    }),
    [state, refresh]
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useAccess(): Access {
  const v = useContext(Ctx)
  if (!v) throw new Error('useAccess precisa estar dentro de <AccessProvider>')
  return v
}

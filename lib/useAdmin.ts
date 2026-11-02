'use client'
import { useAccess } from '@/lib/access'

/**
 * Compatível com o uso anterior: `isAdmin` agora significa "organizador aprovado pelo administrador geral".
 * `isSuper` = administrador geral.
 */
export function useAdmin() {
  const { ready, user, isAdmin, isSuper } = useAccess()
  return { ready, user, isAdmin, isSuper }
}

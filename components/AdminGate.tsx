'use client'
import Link from 'next/link'
import { ShieldAlert } from 'lucide-react'
import { useAdmin } from '@/lib/useAdmin'

/** Só organizadores liberados pelo administrador geral veem o conteúdo. */
export default function AdminGate({ children }: { children: React.ReactNode }) {
  const { ready, isAdmin } = useAdmin()

  if (!ready) return <p className="muted p-8 text-center">Carregando…</p>
  if (isAdmin) return <>{children}</>

  return (
    <main className="mx-auto max-w-sm px-4 py-12">
      <div className="card space-y-4 text-center">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-amber-500/20 text-amber-300">
          <ShieldAlert className="h-7 w-7" aria-hidden />
        </span>
        <h1 className="text-2xl font-bold">Só para organizadores</h1>
        <p className="muted text-sm leading-relaxed">
          Seu acesso é de jogador. Para criar competições e gerenciar o banco de questões, peça ao administrador para liberar o perfil de organizador.
        </p>
        <Link href="/" className="btn btn-secondary w-full">Voltar ao início</Link>
      </div>
    </main>
  )
}

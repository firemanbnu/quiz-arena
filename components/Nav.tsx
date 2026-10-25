'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { Dumbbell, History, Home, LibraryBig, LogOut, Radio, Sparkles, Trophy } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAdmin } from '@/lib/useAdmin'

const PUBLIC_LINKS = [
  { href: '/', label: 'Início', icon: Home },
  { href: '/treino', label: 'Treino', icon: Dumbbell },
  { href: '/ranking', label: 'Ranking', icon: Trophy },
  { href: '/historico', label: 'Histórico', icon: History },
]
const ADMIN_LINKS = [
  { href: '/admin', label: 'Competição', icon: Radio },
  { href: '/admin/banco', label: 'Banco', icon: LibraryBig },
]

export default function Nav() {
  const pathname = usePathname()
  const router = useRouter()
  const { user, isAdmin } = useAdmin()

  // telas de partida ocupam a tela inteira
  if (pathname.startsWith('/play') || pathname.startsWith('/admin/session')) return null

  const links = isAdmin ? [...PUBLIC_LINKS, ...ADMIN_LINKS] : PUBLIC_LINKS
  const isActive = (href: string) => (href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(href + '/'))
  const initials = (user?.email ?? '?').slice(0, 2).toUpperCase()

  async function signOut() {
    await supabase.auth.signOut()
    router.push('/')
  }

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-ink-900/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
        <Link href="/" className="flex shrink-0 items-center gap-2.5" aria-label="Quiz Arena, página inicial">
          <span className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-brand to-aqua">
            <Sparkles className="h-6 w-6 text-ink-900" aria-hidden />
          </span>
          <span className="hidden font-display text-lg font-bold leading-tight sm:block">
            Quiz
            <br />
            Arena
          </span>
        </Link>

        <nav aria-label="Principal" className="-mx-1 flex flex-1 items-center gap-1 overflow-x-auto px-1">
          {links.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              aria-current={isActive(href) ? 'page' : undefined}
              className={`flex shrink-0 items-center gap-2 rounded-full px-4 py-2.5 text-sm font-medium transition-colors ${
                isActive(href) ? 'bg-ink-700 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Icon className="h-4 w-4" aria-hidden />
              <span className={isActive(href) ? '' : 'hidden md:inline'}>{label}</span>
            </Link>
          ))}
        </nav>

        {isAdmin ? (
          <div className="flex shrink-0 items-center gap-2">
            <span
              title={user?.email ?? ''}
              className="grid h-11 w-11 place-items-center rounded-full bg-ink-700 text-sm font-bold"
            >
              {initials}
            </span>
            <button onClick={signOut} aria-label="Sair" className="grid h-11 w-11 place-items-center rounded-full text-slate-300 hover:bg-ink-700">
              <LogOut className="h-5 w-5" aria-hidden />
            </button>
          </div>
        ) : (
          <Link href="/admin" className="btn btn-secondary shrink-0 !px-4 !py-2.5 text-sm">
            Sou host
          </Link>
        )}
      </div>
    </header>
  )
}

'use client'
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { ShieldAlert, ShieldCheck } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAdmin } from '@/lib/useAdmin'
import { formatDateTime } from '@/lib/format'

type Row = {
  user_id: string
  email: string | null
  role: 'player' | 'organizer' | 'admin'
  status: 'pending' | 'approved' | 'blocked'
  requested_at: string
  decided_at: string | null
  last_sign_in_at: string | null
}

const ROLE_LABEL = { player: 'Jogador', organizer: 'Organizador', admin: 'Administrador geral' } as const

export default function AcessosPage() {
  const { ready, isSuper } = useAdmin()
  if (!ready) return <p className="muted p-8 text-center">Carregando…</p>
  if (!isSuper) {
    return (
      <main className="mx-auto max-w-sm px-4 py-12">
        <div className="card space-y-4 text-center">
          <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-amber-500/20 text-amber-300">
            <ShieldAlert className="h-7 w-7" aria-hidden />
          </span>
          <h1 className="text-2xl font-bold">Só para o administrador geral</h1>
          <Link href="/" className="btn btn-secondary w-full">Voltar ao início</Link>
        </div>
      </main>
    )
  }
  return <Painel />
}

function Painel() {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [msg, setMsg] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('admin_list_access')
    if (error) setMsg(error.message)
    else setRows((data ?? []) as Row[])
  }, [])

  useEffect(() => {
    load()
    const t = setInterval(load, 15000) // novos pedidos aparecem sozinhos
    return () => clearInterval(t)
  }, [load])

  async function set(r: Row, role: 'player' | 'organizer', status: 'approved' | 'blocked', text: string) {
    setBusyId(r.user_id)
    const { error } = await supabase.rpc('admin_set_access', { p_user: r.user_id, p_role: role, p_status: status })
    setBusyId(null)
    setMsg(error ? error.message : `${r.email ?? 'Usuário'}: ${text}.`)
    load()
  }

  const [filter, setFilter] = useState<'all' | 'pending' | 'approved' | 'blocked'>('all')
  const pending = (rows ?? []).filter((r) => r.status === 'pending')
  const approved = (rows ?? []).filter((r) => r.status === 'approved')
  const blocked = (rows ?? []).filter((r) => r.status === 'blocked')

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="flex items-center gap-3 text-4xl font-extrabold">
        <ShieldCheck className="h-9 w-9 text-brand" aria-hidden /> Acessos
      </h1>
      <p className="muted mt-2">
        Só entra no Quiz Arena quem você libera aqui. Todos que criaram conta aparecem aqui. Quem ainda não foi liberado fica em “Aguardando” até você escolher: jogador (joga, treina e vê o
        ranking) ou organizador (também cria competições e edita o banco de questões).
      </p>

      {msg && (
        <p role="status" className="muted mt-4 text-sm">
          {msg}
        </p>
      )}

      <div role="tablist" aria-label="Filtro" className="mt-6 flex flex-wrap gap-2">
        {([
          ['all', `Todos (${(rows ?? []).length})`],
          ['pending', `Aguardando (${pending.length})`],
          ['approved', `Liberados (${approved.length})`],
          ['blocked', `Bloqueados (${blocked.length})`],
        ] as const).map(([k, label]) => (
          <button
            key={k}
            role="tab"
            aria-selected={filter === k}
            onClick={() => setFilter(k)}
            className={`rounded-full px-4 py-2 text-sm font-medium ${filter === k ? 'bg-ink-700 text-white' : 'text-slate-400 hover:text-white'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {rows === null ? (
        <p className="muted mt-8">Carregando…</p>
      ) : (
        <div className="mt-8 space-y-8">
          {(filter === 'all' || filter === 'pending') && (
          <Section title={`Aguardando autorização (${pending.length})`} empty="Nenhum pedido no momento.">
            {pending.map((r) => (
              <Item key={r.user_id} r={r}>
                <button disabled={busyId === r.user_id} onClick={() => set(r, 'player', 'approved', 'liberado como jogador')} className="btn btn-primary !px-4 !py-2 text-sm">
                  Jogador
                </button>
                <button disabled={busyId === r.user_id} onClick={() => set(r, 'organizer', 'approved', 'liberado como organizador')} className="btn btn-secondary !px-4 !py-2 text-sm">
                  Organizador
                </button>
                <button disabled={busyId === r.user_id} onClick={() => set(r, 'player', 'blocked', 'bloqueado')} className="btn btn-ghost !px-4 !py-2 text-sm text-rose-300">
                  Bloquear
                </button>
              </Item>
            ))}
          </Section>
          )}

          {(filter === 'all' || filter === 'approved') && (
          <Section title={`Liberados (${approved.length})`} empty="Ninguém liberado ainda.">
            {approved.map((r) => (
              <Item key={r.user_id} r={r}>
                {r.role === 'admin' ? (
                  <span className="muted text-sm">Não pode ser alterado</span>
                ) : (
                  <>
                    {r.role === 'player' ? (
                      <button disabled={busyId === r.user_id} onClick={() => set(r, 'organizer', 'approved', 'agora é organizador')} className="btn btn-secondary !px-4 !py-2 text-sm">
                        Tornar organizador
                      </button>
                    ) : (
                      <button disabled={busyId === r.user_id} onClick={() => set(r, 'player', 'approved', 'agora é jogador')} className="btn btn-secondary !px-4 !py-2 text-sm">
                        Tornar jogador
                      </button>
                    )}
                    <button disabled={busyId === r.user_id} onClick={() => set(r, 'player', 'blocked', 'bloqueado')} className="btn btn-ghost !px-4 !py-2 text-sm text-rose-300">
                      Bloquear
                    </button>
                  </>
                )}
              </Item>
            ))}
          </Section>
          )}

          {(filter === 'all' || filter === 'blocked') && (
          <Section title={`Bloqueados (${blocked.length})`} empty="Ninguém bloqueado.">
            {blocked.map((r) => (
              <Item key={r.user_id} r={r}>
                <button disabled={busyId === r.user_id} onClick={() => set(r, 'player', 'approved', 'liberado como jogador')} className="btn btn-secondary !px-4 !py-2 text-sm">
                  Liberar como jogador
                </button>
                <button disabled={busyId === r.user_id} onClick={() => set(r, 'organizer', 'approved', 'liberado como organizador')} className="btn btn-ghost !px-4 !py-2 text-sm">
                  Organizador
                </button>
              </Item>
            ))}
          </Section>
          )}
        </div>
      )}
    </main>
  )
}

function Section({ title, empty, children }: { title: string; empty: string; children: React.ReactNode[] }) {
  return (
    <section aria-label={title}>
      <h2 className="mb-3 font-display text-xl font-bold">{title}</h2>
      {children.length === 0 ? <p className="muted text-sm">{empty}</p> : <ul className="space-y-2">{children}</ul>}
    </section>
  )
}

function Item({ r, children }: { r: Row; children: React.ReactNode }) {
  return (
    <li className="card flex flex-wrap items-center gap-3 !rounded-2xl !p-4">
      <div className="min-w-0 flex-1">
        <p className="truncate text-lg font-semibold">{r.email ?? '(sem e-mail)'}</p>
        <p className="muted text-sm">
          {r.status === 'approved' ? ROLE_LABEL[r.role] : r.status === 'blocked' ? 'Bloqueado' : 'Pediu acesso'} · cadastro {formatDateTime(r.requested_at)}
          {r.last_sign_in_at ? ` · último acesso ${formatDateTime(r.last_sign_in_at)}` : ''}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </li>
  )
}

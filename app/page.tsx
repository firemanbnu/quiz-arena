import Link from 'next/link'
import { ArrowRight, Dumbbell, History, KeyRound, Play, Trophy, Zap } from 'lucide-react'

const CARDS = [
  {
    href: '/admin',
    icon: Play,
    title: 'Painel do host',
    text: 'Escolha o assunto, defina quantas perguntas e o tempo de cada uma. A sala mostra o ranking lateral, quem já respondeu e avança sozinha quando todos enviam.',
    cta: 'Abrir sala',
  },
  {
    href: '/treino',
    icon: Dumbbell,
    title: 'Treino individual',
    text: 'Pratique sozinho com correção imediata, resposta certa e explicação. Nada é gravado no ranking nem no histórico.',
    cta: 'Começar treino',
  },
  {
    href: '/ranking',
    icon: Trophy,
    title: 'Ranking permanente',
    text: 'Pontos, vitórias e aproveitamento acumulados em todas as competições.',
    cta: 'Ver ranking',
  },
  {
    href: '/historico',
    icon: History,
    title: 'Histórico de partidas',
    text: 'Veja as competições anteriores, o assunto de cada uma e quem ficou no pódio.',
    cta: 'Ver histórico',
  },
]

export default function Home() {
  return (
    <main className="mx-auto max-w-3xl px-4 pb-16 pt-12 text-center sm:pt-20">
      <span className="pill">
        <Zap className="h-4 w-4 text-brand" aria-hidden />
        Competições ao vivo
      </span>

      <h1 className="mt-8 text-5xl font-extrabold leading-[1.05] sm:text-7xl">
        Transforme conhecimento em <span className="grad-text">disputa</span>
      </h1>
      <p className="muted mx-auto mt-6 max-w-xl text-lg leading-relaxed sm:text-xl">
        Importe suas perguntas, escolha o assunto e abra uma sala. Cada participante responde no próprio dispositivo, com
        cronômetro justo, ranking em tempo real e histórico permanente.
      </p>

      <div className="mx-auto mt-10 grid max-w-md gap-3">
        <Link href="/admin" className="btn btn-primary py-4 text-lg">
          <Play className="h-5 w-5" aria-hidden /> Criar competição
        </Link>
        <Link href="/entrar" className="btn btn-secondary py-4 text-lg">
          <KeyRound className="h-5 w-5" aria-hidden /> Entrar com código
        </Link>
      </div>

      <div className="mt-16 grid gap-4 text-left sm:grid-cols-2">
        {CARDS.map(({ href, icon: Icon, title, text, cta }) => (
          <Link key={href} href={href} className="card group flex flex-col transition-colors hover:border-brand/60">
            <span className="grid h-14 w-14 place-items-center rounded-2xl bg-brand/15 text-brand">
              <Icon className="h-6 w-6" aria-hidden />
            </span>
            <h2 className="mt-5 text-2xl font-bold">{title}</h2>
            <p className="muted mt-2 flex-1 leading-relaxed">{text}</p>
            <span className="mt-5 inline-flex items-center gap-2 font-semibold text-brand">
              {cta} <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" aria-hidden />
            </span>
          </Link>
        ))}
      </div>
    </main>
  )
}

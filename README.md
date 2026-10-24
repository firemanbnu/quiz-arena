# Quiz Arena

Competições de conhecimento em tempo real (estilo Kahoot) com Next.js + Supabase.

## Estrutura

```
quiz-arena/
├─ supabase/schema.sql          # tabelas, RLS, RPCs e Realtime
├─ lib/
│  ├─ supabase.ts               # cliente + tipos
│  └─ parser.ts                 # texto longo → perguntas
├─ hooks/useGameRoom.ts         # sessão/participantes/respostas em tempo real
└─ app/
   ├─ page.tsx                  # entrada do participante (código + apelido)
   ├─ play/[id]/page.tsx        # tela do participante (timer client-side)
   ├─ admin/page.tsx            # login, importação, assuntos, criar partida
   ├─ admin/session/[id]/page.tsx  # tela do host (ranking, status, auto-avanço)
   └─ ranking/page.tsx          # ranking permanente
```

## Como rodar

1. Crie um projeto no Supabase e rode `supabase/schema.sql` no SQL Editor.
2. Em Authentication > Providers, habilite **Anonymous sign-ins** (participantes) e **Email** (admin).
3. Crie o usuário administrador em Authentication > Users (e-mail + senha).
4. Copie `.env.example` para `.env.local` e preencha a URL e a chave anon.
5. `npm install && npm run dev`.

## Deploy

1. `git init && git add . && git commit -m "init"`, crie o repositório no GitHub e faça push.
2. Na Vercel: **Add New Project** → importe o repositório → defina as duas variáveis `NEXT_PUBLIC_SUPABASE_*` → Deploy.
3. A cada push na `main`, a Vercel publica automaticamente.

## Formato de importação

```
1. Qual a capital da França?
a) Londres
b) Paris *
c) Roma
Resposta: b
```
A correta pode ser marcada com `*`, `(correta)`, `[x]`, `✓`, ou por uma linha `Resposta: b` / `Gabarito: b`.

## Rodando nos planos gratuitos

**Supabase Free**
- 200 conexões Realtime simultâneas no projeto, 100 mensagens/s e 2 milhões de mensagens/mês. Cada celular usa 1 conexão; a sala aceita até 150 jogadores (teto no `join_session`).
- O app foi desenhado para gastar pouco: todos escutam só a mudança de fase (`game_sessions`); somente o host escuta respostas e entradas; o placar é relido a cada fase em vez de transmitido a cada resposta. Uma partida de 50 jogadores e 10 perguntas gasta em torno de 2 mil mensagens (estimativa), ou seja, centenas de partidas por mês.
- O projeto é pausado após 7 dias sem atividade. O workflow `.github/workflows/keepalive.yml` faz uma consulta leve a cada 3 dias (crie os secrets `SUPABASE_URL` e `SUPABASE_ANON_KEY` no GitHub). Se pausar mesmo assim, restaure pelo painel.
- Login anônimo é limitado por IP (padrão: 30 por hora). Em sala de aula, onde todos saem pelo mesmo Wi-Fi, aumente em Authentication > Rate Limits antes do evento. Quem já entrou reaproveita a sessão e não consome o limite de novo.

**Vercel Hobby**
- Os termos restringem o plano Hobby a uso pessoal e não comercial. Se o app for usado em treinamento da empresa, confirme com a Vercel; caso conte como comercial, precisa do plano Pro ou de outra hospedagem.

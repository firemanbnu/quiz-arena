# Quiz Arena

Competições de conhecimento ao vivo (estilo Kahoot), Treino individual e ranking permanente.
Next.js 14 (App Router) + Tailwind + Supabase (Postgres, Auth, Realtime). Deploy na Vercel.

## Telas

| Rota | Quem usa | O que faz |
|---|---|---|
| `/` | todos | Página inicial |
| `/entrar` | participante | Código da sala + apelido |
| `/play/[id]` | participante | Pergunta, cronômetro local, resultado e explicação |
| `/treino` | todos, sem login | Treino individual: correção na hora, explicação e revisão. **Não grava nada** |
| `/ranking` | todos | Ranking permanente |
| `/historico` | todos | Partidas finalizadas e pódio de cada uma |
| `/admin` | host | Criar sala (um ou vários assuntos, quantidade, tempo, penalidade) |
| `/admin/banco` | host | Importar perguntas por texto, conferir antes de salvar, listar, excluir, liberar assunto no Treino |
| `/admin/session/[id]` | host | Sala ao vivo: pergunta, ranking, status de cada participante, montanha |

## Banco de dados (Supabase)

Rode no SQL Editor, nesta ordem:

1. `supabase/schema.sql`
2. `supabase/002_treino_explicacao.sql` (explicação por pergunta, Treino, assuntos liberados para treino)
3. `supabase/003_editar_perguntas.sql` (editar perguntas, inclusive durante a competição, com recálculo de pontos, histórico e ranking)
4. `supabase/004_rankings_admin.sql` (remover participante de partida/ranking e zerar o ranking permanente)
5. `supabase/005_acesso_autorizado.sql` (acesso só para pessoas liberadas pelo administrador geral; troque o e-mail dele no final do arquivo)

Depois, no painel: Authentication > Sign In / Providers:

- **Email**: habilitado. Recomendado desligar **Confirm email** (o plano gratuito envia poucos e-mails por hora; a liberação é feita pelo administrador de qualquer forma).
- **Anonymous sign-ins**: pode desligar. O site não usa mais login anônimo.

## Quem pode entrar

Só entra quem tem conta (e-mail e senha) **liberada pelo administrador geral**:

1. A pessoa cria a conta na tela inicial e fica em "Aguardando autorização".
2. O administrador geral abre **Acessos** no menu e escolhe: **Jogador** (joga, treina, vê ranking e histórico) ou **Organizador** (também cria competições e edita o banco de questões), ou **Bloquear**.
3. A tela da pessoa libera sozinha em até 10 segundos.

O administrador geral é definido no final de `005_acesso_autorizado.sql` (hoje `firemanbnu@gmail.com`) e não pode ser alterado pela tela. As regras valem no servidor (RLS e funções), não só na interface. Contas de outros sistemas que usam o mesmo projeto Supabase não têm acesso até serem liberadas.

## Formato de importação

```
1. Qual a capital da França?
a) Londres
b) Paris *
c) Roma
Resposta: b
Explicação: Paris é a capital desde ...
```

A correta pode ser marcada com `*`, `(correta)`, `[x]`, `✓`, ou por uma linha `Resposta: b` / `Gabarito: b`.
A explicação é opcional (`Explicação:`, `Comentário:` ou `Justificativa:`) e aparece no Treino e ao fim de cada pergunta na competição.
As letras das alternativas não aparecem para os jogadores, e a ordem é embaralhada a cada partida.

## Como rodar

1. `cp .env.example .env.local` e preencha a URL e a chave anon do Supabase.
2. `npm install && npm run dev`.

## Deploy

1. Suba o código no GitHub (branch `main`).
2. Na Vercel, importe o repositório e cadastre `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
3. Cada push na `main` publica automaticamente.

## Planos gratuitos

**Supabase Free:** 200 conexões Realtime simultâneas e 2 milhões de mensagens por mês. A sala aceita até 150 jogadores. Todos escutam só a mudança de fase; só o host escuta respostas; o placar é relido a cada fase. O projeto pausa após 7 dias sem uso: o workflow `.github/workflows/keepalive.yml` faz uma consulta a cada 3 dias (crie os secrets `SUPABASE_URL` e `SUPABASE_ANON_KEY` no GitHub). Os participantes entram com conta própria, então o limite de login anônimo por IP não se aplica mais.

**Vercel Hobby:** uso pessoal e não comercial. Treinamento da empresa pode contar como comercial; confirme com a Vercel.

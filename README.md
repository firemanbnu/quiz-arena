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
6. `supabase/006_desempenho.sql` (erros por participante e assuntos a melhorar)
7. `supabase/007_mudar_assunto.sql` (mudar o assunto de uma pergunta)

Depois, no painel: Authentication > Sign In / Providers:

- **Email**: habilitado. Recomendado desligar **Confirm email** (o plano gratuito envia poucos e-mails por hora; a liberação é feita pelo administrador de qualquer forma).
- **Anonymous sign-ins**: pode desligar. O site não usa mais login anônimo.

## Quem pode entrar

Só entra quem tem conta (e-mail e senha) **liberada pelo administrador geral**:

1. A pessoa cria a conta na tela inicial e fica em "Aguardando autorização".
2. O administrador geral abre **Acessos** no menu e escolhe: **Jogador** (joga, treina, vê ranking e histórico) ou **Organizador** (também cria competições e edita o banco de questões), ou **Bloquear**.
3. A tela da pessoa libera sozinha em até 10 segundos.

O administrador geral é definido no final de `005_acesso_autorizado.sql` (hoje `firemanbnu@gmail.com`) e não pode ser alterado pela tela. As regras valem no servidor (RLS e funções), não só na interface. Contas de outros sistemas que usam o mesmo projeto Supabase não têm acesso até serem liberadas.

## Desempenho

Menu **Desempenho** (organizadores e administrador geral), com dados das partidas finalizadas:

- **Geral**: aproveitamento por assunto do pior para o melhor, separando "a melhorar" (abaixo de 70%) de "em bom nível", e as questões mais erradas pelo grupo.
- **Por participante**: lista do menor para o maior aproveitamento, com os assuntos mais fracos de cada um. Ao abrir um participante: assuntos a melhorar, erros e sem resposta, e cada questão errada com o que ele marcou, a resposta certa e a explicação.
- Dá para filtrar por uma partida específica. Quem não respondeu a tempo conta como não acertou.
- O administrador geral vê todas as partidas; um organizador vê só as que ele criou.

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


### Entrar com a conta do Google (opcional)
O cadastro com e-mail e senha já funciona. Para mostrar também o botão "Continuar com o Google":
1. Supabase → Authentication → Providers → Google: ative e cole o Client ID e o Client Secret (criados no Google Cloud → Credenciais → ID do cliente OAuth; a "URI de redirecionamento" é a que o Supabase mostra nessa tela).
2. Supabase → Authentication → URL Configuration: coloque o endereço do site em Site URL e em Redirect URLs.
3. Vercel → Settings → Environment Variables: `NEXT_PUBLIC_GOOGLE_LOGIN` = `1` e faça um novo deploy.
Quem entra pelo Google também cai em "Aguardando" até você liberar em Acessos.

## Pontuação e tempo justos
- Pontos por acerto: 1000 × (1 − 0,5 × tempo gasto ÷ tempo da pergunta), ou seja, de 1000 (imediato) a 500 (no limite). Erro vale −penalidade (configurável) e a pontuação nunca fica abaixo de 0. Empate: quem acertou mais perguntas fica na frente.
- O tempo de cada jogador é medido **no aparelho dele**, a partir do momento em que a pergunta apareceu nele (o aparelho avisa o servidor). Conexão lenta não tira pontos nem tempo; o servidor só rejeita valores impossíveis (menores que o intervalo que ele mesmo observou, com 2 s de tolerância).
- O host só encerra a pergunta quando todos responderam ou a janela pessoal de cada um terminou (no máximo 5 s além do tempo).
- Execute `supabase/010_tempo_justo_e_meu_desempenho.sql` (também cria "Meu desempenho").

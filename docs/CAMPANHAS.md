# Contas e campanhas

Cada pessoa pode ter uma conta, guardar fichas na nuvem e jogar em campanhas. Sem conta, e sem servidor configurado, o app funciona exatamente como antes: tudo fica no aparelho.

## Como funciona na mesa

- **Conta**: e-mail e senha, pela barra lateral (ou **Ferramentas → Entrar** no celular). Depois de entrar, a janela da conta oferece **Enviar para minha conta** para as fichas que só existem no aparelho.
- **Campanha**: quem cria é o mestre. Em **Participantes** ficam o código e o link de convite; quem entra participa como jogador. O mestre pode promover outro participante a mestre, remover participantes e gerar um novo código.
- **Jogador**: em **Grupo**, escolhe o personagem que leva para a campanha e vê as fichas dos outros, só para leitura.
- **Mestre**: não precisa de ficha. A **Mesa** mostra PV, PM, Defesa, condições e iniciativa de todos, e permite aplicar dano, cura, PM e condições. A ficha aberta pelo mestre mostra o diário recente. Escolhas do personagem (edição, evolução, ataques, testes) continuam com o jogador.
- Efeitos aplicados pelo mestre entram no histórico do jogador com o autor ("por Mestre…") e podem ser desfeitos pelo jogador.
- **Notas**: o diário da campanha é visível para o grupo; as notas do mestre, só para mestres.
- **Mapas da campanha**: o mestre leva um dos seus mapas para a campanha (aba **Mapas**). Aethelgard, que acompanha o app, não precisa de envio; imagens próprias vão para o Storage do Supabase, em blocos, e cada participante as baixa uma vez para uso offline. Os locais já marcados podem ir junto, inclusive como secretos.
- **Locais**: qualquer participante marca, edita, move e exclui locais visíveis, e o nome de quem marcou aparece nos detalhes. Só mestres criam locais **secretos**, que os jogadores não recebem; **Revelar ao grupo** os torna visíveis a todos. Uma edição feita sobre uma versão antiga é recusada, para não sobrescrever a mudança de outra pessoa. Marcar locais exige conexão.
- **Experiência**: a ficha mostra o XP e o progresso até o próximo nível, com **Registrar XP** (valores negativos corrigem). Na Mesa, **Conceder XP** dá a mesma quantidade a vários personagens de uma vez; o histórico de cada jogador registra o motivo e o mestre como autor.

## Sincronização

O IndexedDB continua sendo a fonte da interface. `src/sync/sync-engine.ts` troca dados com o servidor em segundo plano:

- Alterações de fichas vinculadas a uma conta entram na tabela `outbox` na mesma transação de `dispatch`, `undo` e `archive`.
- O envio usa revisão otimista (`save_character`). Se o servidor tiver uma versão mais nova (o mestre aplicou dano enquanto o jogador estava offline), os comandos pendentes são **reaplicados** sobre ela com os mesmos dados rolados. Edições de ficha inteira (`edit`, `level`) reaplicam só os campos alterados.
- Um comando já gravado no servidor, cuja resposta se perdeu, não é aplicado duas vezes: o ID do evento identifica a operação.
- O que não pode ser reaplicado (um **Desfazer** sobre uma ficha que mudou, ou um comando que ficou inválido) é descartado, com uma cópia da versão local em **Backups → Recuperação local** e um aviso na conta.
- A sincronização roda ao entrar, ao voltar a conexão, ao voltar ao app, a cada minuto, após alterações locais e quando o servidor avisa em tempo real.
- As fichas de outros membros ficam em cache (`party`) para as vistas de grupo e mestre; efeitos do mestre exigem conexão.
- Ao sair da conta, as fichas dela deixam de aparecer no aparelho até a pessoa entrar de novo.

## Servidor

`src/sync/types.ts` define o contrato. Há três implementações:

| Implementação | Uso |
|---|---|
| `SupabaseBackend` | Produção, com `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`. O cliente é carregado sob demanda. |
| `MemoryBackend` (demo) | `npm run dev:demo`: servidor simulado no `localStorage` do navegador, para experimentar sem Supabase. Não use para dados reais. |
| `MemoryBackend` | Testes. Espelha as regras do SQL. |

`supabase/migrations/20260930000000_campaigns.sql` cria perfis, campanhas, participantes, fichas, eventos e notas, com RLS em todas as tabelas. Escritas em fichas, participação e convites passam por funções RPC `security definer`, que validam dono, mestre e revisão.

## Supabase

Projeto `pxpdekjgebueudoqgtvy` (Supabase Cloud), separado do Supabase da VPS, que guarda dados reais de outro projeto.

- As migrações `20260930000000_campaigns.sql` e `20260930010000_campaign_maps.sql` (mapas, locais, segredos e o bucket privado `campaign-maps`) estão aplicadas e registrada em `supabase_migrations.schema_migrations`, então `supabase db push` reconhece o estado.
- `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` (chave publicável) estão na Vercel em produção, preview e desenvolvimento. `vercel env pull .env.local` as traz para o `npm run dev`.
- **Confirmação de e-mail**: em Authentication → Sign In / Providers → Email, deixe **Confirm email** desligado, ou configure um SMTP próprio. O SMTP padrão do Supabase só entrega para membros da equipe do projeto. Se a confirmação ficar ligada, ajuste o Site URL para o endereço do app.
- **Pausa do plano gratuito**: o projeto pausa após 7 dias sem uso. Configure um keep-alive.

Verificações contra o banco real (a senha do banco fica em Project Settings → Database e é lida só do ambiente):

```bash
export SUPABASE_DB_HOST=db.pxpdekjgebueudoqgtvy.supabase.co SUPABASE_DB_PASSWORD=...
node scripts/supabase-check-rls.mjs        # 48 verificações de RLS, RPCs e Storage, com rollback no fim

export TEST_USER_PASSWORD=...              # qualquer senha temporária
node scripts/supabase-test-users.mjs create
SB_URL=https://pxpdekjgebueudoqgtvy.supabase.co SB_KEY=<chave publicável> npx vitest run tests/supabase-live.test.ts
node scripts/supabase-test-users.mjs remove
```

O teste real usa dois aparelhos simulados e cobre campanha, convite, efeito do mestre em tempo real, conflito offline, segundo aparelho, notas, mapa com imagem enviada, local secreto revelado e XP. Sem `SB_URL`, ele é ignorado em `npm test`.

## Verificar

```powershell
npm.cmd test                 # inclui tests/sync.test.ts (dispositivos e campanhas simulados)
npm.cmd run test:campaigns   # fluxo completo no navegador, com o servidor de demonstração
```

Substituir a imagem de um mapa já compartilhado não é possível: remova-o da campanha e adicione de novo.

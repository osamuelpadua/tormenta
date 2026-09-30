# Contas e campanhas

Cada pessoa pode ter uma conta, guardar fichas na nuvem e jogar em campanhas. Sem conta, e sem servidor configurado, o app funciona exatamente como antes: tudo fica no aparelho.

## Como funciona na mesa

- **Conta**: e-mail e senha, pela barra lateral (ou **Ferramentas → Entrar** no celular). Depois de entrar, a janela da conta oferece **Enviar para minha conta** para as fichas que só existem no aparelho.
- **Campanha**: quem cria é o mestre. Em **Participantes** ficam o código e o link de convite; quem entra participa como jogador. O mestre pode promover outro participante a mestre, remover participantes e gerar um novo código.
- **Jogador**: em **Grupo**, escolhe o personagem que leva para a campanha e vê as fichas dos outros, só para leitura.
- **Mestre**: não precisa de ficha. A **Mesa** mostra PV, PM, Defesa, condições e iniciativa de todos, e permite aplicar dano, cura, PM e condições. A ficha aberta pelo mestre mostra o diário recente. Escolhas do personagem (edição, evolução, ataques, testes) continuam com o jogador.
- Efeitos aplicados pelo mestre entram no histórico do jogador com o autor ("por Mestre…") e podem ser desfeitos pelo jogador.
- **Notas**: o diário da campanha é visível para o grupo; as notas do mestre, só para mestres.

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

## Ativar o Supabase (pendente)

1. Criar um projeto **separado** no Supabase Cloud. Não use o Supabase da VPS: ele guarda dados reais de outro projeto.
2. Aplicar `supabase/migrations/20260930000000_campaigns.sql` (SQL Editor ou `supabase db push`).
3. Em Authentication → Providers → Email, desativar **Confirm email** para o cadastro mais simples, ou configurar SMTP próprio. O app também trata a confirmação por e-mail.
4. Na Vercel, definir `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` (chave pública) e publicar de novo.
5. Configurar o keep-alive, porque o plano gratuito pausa após 7 dias sem uso.
6. Verificar as regras com três usuários reais (mestre, jogador A e jogador B): B não altera a ficha de A, quem não participa não vê nada, as notas secretas não aparecem para jogadores, e o efeito do mestre chega ao jogador com autor.

## Verificar

```powershell
npm.cmd test                 # inclui tests/sync.test.ts (dispositivos e campanhas simulados)
npm.cmd run test:campaigns   # fluxo completo no navegador, com o servidor de demonstração
```

Mapas da campanha (envio para o Storage e locais visíveis só para o mestre) ainda não fazem parte desta versão.

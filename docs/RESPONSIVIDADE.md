# Revisão de responsividade e uso no celular

A interface usa a identidade de fantasia medieval em carvão, ferro, vinho e dourado, com hierarquia, espaçamento e controles adaptados ao toque. As telas compartilham os mesmos componentes e dados da versão desktop. A direção visual está em [Identidade visual](IDENTIDADE_VISUAL.md).

## Navegação e leitura

- Até 900 px, as cinco áreas ficam na navegação inferior. A área atual recebe fundo e indicação acessível; mudar de área retorna ao início do conteúdo.
- O cabeçalho permite trocar ou criar personagens e abrir o rolador. O menu Ferramentas reúne livro original, histórico com desfazer, backups, criação e ajuda.
- A ficha tem atalhos para perícias, ataques, características e anotações. No telefone, os ataques aparecem antes da lista longa de perícias. O atalho também move o foco para a seção.
- PV e PM têm valores destacados e botões com rótulos: Dano, Curar, Gastar e Recuperar. Os controles principais têm pelo menos 44 × 44 px; os campos de formulário usam texto de 16 px e altura mínima de 46 px.
- O inventário apresenta cartões com quantidade, situação e edição. No tablet, os cartões e as bibliotecas aproveitam duas colunas.

## Janelas e formulários

As janelas usam a altura disponível, com cabeçalho e ações separados do conteúdo rolável. A altura acompanha `visualViewport` quando disponível; margens reservam as áreas seguras do dispositivo. O menu Ferramentas abre na parte inferior.

Em telas estreitas, os formulários usam uma coluna. A criação mantém a etapa atual visível na faixa horizontal e retorna ao topo ao avançar. Abas, tabelas do texto organizado e PDF ampliado têm rolagem própria quando necessária. A página principal não precisa de rolagem lateral.

O PDF original preserva o tamanho do leitor durante a renderização e reserva espaço para a barra de rolagem, evitando o ciclo de redimensionamentos que causava piscadas. O leitor continua com página impressa, busca e zoom.

## Verificação

`e2e/mobile.spec.ts` cobre as cinco áreas em 320, 390, 600, 768, 900, 1024 e 1440 px. Os fluxos com toque verificam dano, desfazer, inventário, reabertura, edição, evolução, condições, catálogos, magia, as 11 etapas da criação e acesso ao livro e backups. Há verificações de largura, alvos de toque, posição das ações, foco e altura reduzida de 500 px.

Os testes existentes cobrem o ciclo de personagem, importação de Budrik, retorno offline e estabilidade do PDF com barras de rolagem visíveis. Execute o build antes de `npm.cmd run test:e2e`.

As capturas para inspeção visual ficam em `.cache/screenshots/mobile-review`. A validação automatizada usa Chromium com tamanhos de tela e toque emulados. Teclados reais do iOS/Android, áreas seguras físicas e leitores de tela ainda precisam de conferência nesses dispositivos; reduzir a viewport não reproduz integralmente o teclado de um aparelho.

As regras e limitações funcionais permanecem documentadas em [LIMITACOES.md](LIMITACOES.md). Esta revisão não altera o esquema dos personagens nem exige migração dos backups.

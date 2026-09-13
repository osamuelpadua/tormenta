# Biblioteca e consulta integrada

## Auditoria da implementação anterior

Poderes e Magias usavam `characterEntries` e mostravam apenas benefícios automáticos e aquisições da ficha selecionada. A biblioteca de inclusão era um seletor dentro de um diálogo: permitia registrar uma aquisição, mas não oferecia exploração geral contextual. O filtro era único, a busca tinha cobertura limitada e o estado ficava no componente. Detalhes e livro substituíam um ao outro no estado do diálogo. A navegação escrevia a aba no hash, mas não restaurava a tela pelo histórico do navegador.

O catálogo contém 198 magias e 673 poderes, habilidades, escolhas de classe e parceiros. São os mesmos registros usados pela criação, evolução e motor. A revisão não cria cópias de entidades nem altera cálculos, regras, migrações ou fichas existentes.

## Exploração e dados

`src/ui/library.tsx` oferece **Meus Poderes / Biblioteca de Poderes** e **Minhas Magias / Biblioteca de Magias**. O acervo completo não é restringido pelos requisitos do personagem. A busca normaliza acentos, combina palavras e inclui nome, descrição, requisitos e relações conhecidas. Resultados têm ordenação e paginação em lotes de 24; `useDeferredValue` mantém a digitação responsiva.

`library-data.ts` constrói o índice sobre as entidades canônicas:

| Critério                           | Fonte e limites                                                                                                                                             |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tipo e categoria                   | `kind` e `group` do catálogo                                                                                                                                |
| Classe de poder/habilidade         | Grupo da classe, sem atribuir uma classe fictícia a poderes gerais                                                                                          |
| Raça                               | Lista de habilidades de `RACES`, incluindo a escolha registrada de Suraggel                                                                                 |
| Origem                             | Benefícios identificados pela rotinas existentes `originBenefits` e `powerOptions`                                                                          |
| Nível indicado                     | Pré-requisito explícito ou primeiro nível da habilidade na progressão da classe                                                                             |
| Tipo, escola, círculo, custo base  | Campos estruturados das magias                                                                                                                              |
| Lista básica de classe para magias | `spellOptions` aplicado ao limite da progressão de cada classe, com escolas abertas; não representa acesso atual nem exceções concedidas por outros poderes |
| Requisitos                         | Texto existente, sem interpretar ausência como permissão                                                                                                    |

Filtros são cumulativos por interseção. Algumas combinações não possuem resultados porque os dados não registram aquele vínculo. Custo variável de poderes não foi transformado em um custo base fictício.

O contexto usa `characterEntries`, `validatePrerequisites`, `powerOptions`, `spellOptions` e atributos calculados. **Já possui** inclui habilidades automáticas. **Requisitos pendentes** mostra as condições que a validação existente consegue verificar. **Opção de aprendizagem** significa que existe uma opção nas regras implementadas; a interface lembra que progressão, escolhas e requisitos não automatizados ainda precisam ser conferidos. Não se promete elegibilidade integral com um simples resultado vazio de validação.

`EntryReadout` reúne metadados, texto original, requisitos e aprimoramentos. `EntryDetails` preserva os comandos existentes de memorização, reparo e remoção. **Preparar aquisição** abre o fluxo existente com o registro selecionado; a origem, escolhas específicas e motivo continuam explícitos antes de salvar. Escolhas de classe especiais são consultáveis, mas não ganham um atalho de aquisição que ignore seu fluxo próprio.

Os seletores de criação e evolução reutilizam o índice de pesquisa, os detalhes e os links de referência. Seus conjuntos de escolhas válidas permanecem controlados pelas regras existentes.

## Estado e navegação

`reference-navigation.ts` representa aba, entidade, página e termo de foco no hash e usa `pushState`/`popstate`. IDs são resolvidos no catálogo; páginas inválidas e IDs desconhecidos são descartados. Exemplos: `#powers?entry=classPower-barbaro-frenesi` e `#inventory?book=149&focus=Marreta`.

O histórico permite Biblioteca → Detalhes → Livro → Detalhes → Biblioteca, com voltar/avançar do navegador e ações de retorno do aplicativo. Uma referência aberta diretamente também tem um retorno interno. O livro é o mesmo `BookModal`, sobreposto ao detalhe ou formulário original, preservando a edição em andamento. Em recarregamentos de uma rota com detalhes e livro, ambos esperam o contexto do personagem antes de abrir na ordem correta.

`library-state.ts` mantém pesquisa, filtros, ordenação, página de resultados, favoritos, painel de filtros, item selecionado e rolagem em `sessionStorage`, por personagem e por módulo. A consulta sobrevive à troca de abas e a recarregamentos naquela sessão. O contexto do item também fica na rota. Se o navegador bloquear o armazenamento, o componente ainda conserva seu estado durante a consulta, mas a recuperação após recarregar não é garantida.

## Referências ao PDF

`scripts/build-book-references.mjs` valida o SHA-256 do PDF contra `docs/sources.json`, confere a correspondência entre página impressa e página física e verifica o título no texto da página. Produz `src/data/book-references.json` e `docs/book-reference-audit.json`. Há 1.435 referências de catálogo verificadas; um registro de extração sem nome suficiente fica sem link. Isso verifica a localização, não substitui a revisão semântica das regras extraídas.

As 60 referências adicionais de raças, classes e perícias ficam em `reference-subjects.json`: raças/classes usam os dados existentes de `rules.ts`/`class-source.json`, e perícias usam os cabeçalhos encontrados nas páginas 115–123. O gerador reconfere os títulos antes de publicar esses links. A versão da fonte e as páginas são dados estruturados reutilizáveis.

Inventário e edição de item consultam a entidade identificada por `entryId`, pelo modelo de equipamento ou pelo nome do item base. Exemplo: **Marreta certeira** consulta a descrição de **Marreta**, na página 149, e não a tabela de preços. Itens desconhecidos não recebem links inventados. Referências também estão disponíveis em condições, uso de poderes/magias, perícias, detalhes da ficha, criação e evolução.

## Leitor e desempenho

Uma consulta envia página e título ao leitor. O título é destacado; ocorrências em cabeçalhos maiores têm prioridade sobre menções incidentais. A abertura usa 115% no desktop e 200% em telas estreitas para facilitar a leitura da coluna. O usuário pode ajustar o zoom e navegar normalmente; a busca geral permanece independente.

O leitor reutiliza o documento PDF já aberto ao alternar entre referências. O worker e o documento são liberados após 90 segundos sem uso. Erros de carregamento descartam o cache para permitir nova tentativa. Alterações rápidas de zoom têm prévia visual imediata sobre o raster anterior e consolidam a renderização após 160 ms. A página permanece visível enquanto a versão nítida é preparada; tarefas substituídas são canceladas. Permanecem o limite de oito milhões de pixels, a seleção de texto, os gestos e o funcionamento offline.

## Verificação e limites

Testes cobrem filtros combinados, catálogo completo, contexto do personagem, fontes desconhecidas, rotas, retorno por histórico, recarregamento, paginação, aquisição, edição de inventário e zoom sem ocultar a página. A suíte existente verifica criação, evolução, combate, backups, toque, estabilidade com barras de rolagem e PDF offline. A revisão visual usa larguras de 320 a 1440 px. Gestos são emulados em Chromium; não houve validação em dispositivos iOS físicos.

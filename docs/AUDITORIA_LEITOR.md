# Livro de referência e ícones

## Diagnóstico e mudanças

A implementação anterior mantinha título, busca, seletor de visualização, zoom e paginação em faixas permanentes. Em 320 × 844 px, a área do leitor ficava em aproximadamente 514 px de altura. O campo de página navegava a cada dígito, a busca limitava os resultados a 30 páginas e apagava o termo ao selecionar um resultado. Os dados das duas apresentações textuais eram carregados mesmo para consultar o PDF.

O leitor usa exclusivamente o PDF original, com texto selecionável, imagens e tabelas intactos. Em 320 × 844 px, sua área ocupa a altura inteira da tela; no desktop de 1440 × 1000 px, ocupa 1414 × 974 px. A página ajustada à largura conserva sua proporção original; o zoom permite ler as colunas. O conteúdo não recebe filtros nem texturas.

- Busca por botão ou Ctrl/Cmd+F, painel sobreposto, termo preservado, acentos opcionais, reconhecimento de palavras hifenizadas na extração, trechos e destaques sobre o texto original. Resultados em lotes de 24, sem corte das páginas restantes.
- Paginação compacta, limites validados e confirmação por Enter ou saída do campo. PgUp/PgDn navegam; +/− ampliam ou reduzem. A numeração impressa e a correspondência do PDF permanecem disponíveis.
- Controles recolhíveis, alvos principais de 44 px e fechamento independente da busca. Escape recolhe os painéis antes de fechar o livro.
- Zoom de 50% a 400%, pinça com prévia visual, manutenção do ponto de leitura e arraste nativo. Na largura padrão, gesto horizontal curto troca a página; ampliado, o mesmo movimento desloca o conteúdo.
- Índice de pesquisa carregado sob demanda; apresentação textual antiga removida do fluxo e do bundle. Os arquivos de extração permanecem como fontes de auditoria.

`book.tsx` coordena os controles e a pesquisa; `book-search.ts` conserva os offsets dos trechos encontrados; `book-pdf.tsx` mantém PDF.js, canvas exclusivo por renderização, cancelamento, camada de texto e limite de oito milhões de pixels. O contêiner interno mede a largura útil descontando a barra de rolagem, evitando a regressão da piscada no Windows. PDF, fontes, decodificadores e índice continuam disponíveis offline após o cache completo.

## Identidade dos elementos

Os ícones usam desenhos da coleção [Game-icons.net](https://game-icons.net/), recoloridos com os tokens da interface. Há correspondência para o catálogo e os equipamentos, aplicada de forma consistente em listas, seletores e detalhes. Nomes personalizados de equipamentos conservam a identidade da arma ou objeto base. Nomes desconhecidos recebem um monograma. Desenhos relacionados podem compartilhar a mesma silhueta; os controles de navegação continuam com símbolos funcionais.

O MCP Magnific não estava disponível nesta sessão. Foram usados vetores locais da coleção, sem dependência de serviço externo durante o uso. A geometria original foi preservada; máscaras removem o fundo e permitem herdar a cor do contexto.

O sprite, os créditos de cada desenho, os autores e a revisão da fonte estão em `public/art/entity-icons*`; a página `/art/credits.html` está vinculada na Ajuda. Licença CC BY 3.0. Para regenerar, obtenha o repositório indicado no manifesto, faça checkout da revisão registrada e execute `node scripts/build-entity-icons.mjs caminho/do/checkout`. O mapa editorial está em `scripts/entity-icon-map.txt`. O build normal utiliza os arquivos já gerados.

Os selects recebem uma seta única com recuo de 13 px e reserva de 40 px para o texto. Teclado e seleção permanecem nativos; o modo de cores forçadas mantém o indicador do navegador.

## Verificação

Testes de busca, offsets, limites de página e identidade de equipamentos; testes de navegador para PDF offline, busca offline, destaques, paginação, controles recolhíveis, pinça, arraste e estabilidade com barra de rolagem. Revisão visual das cinco áreas em 320, 390, 768 e 1440 px, além dos fluxos existentes de criação, combate, evolução e backups.

Os gestos foram verificados por eventos de toque do Chromium emulado. Safari/iOS e dispositivos físicos ainda exigem validação própria. Nenhuma regra, ficha ou migração de armazenamento foi alterada nesta revisão.

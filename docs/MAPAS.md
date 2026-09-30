# Mapas

O atlas é independente dos personagens. Abra **Mapas** na lateral do desktop ou em **Ferramentas → Mapas** no celular, inclusive sem uma ficha cadastrada.

## Usar na mesa

- Abra Aethelgard ou use **Novo mapa** para importar uma imagem JPEG, PNG ou WebP. Dê um nome e, opcionalmente, registre anotações gerais.
- Arraste para explorar. Use a roda do mouse ou dois dedos para ampliar. Os controles também oferecem zoom e **Ajustar mapa à tela**.
- Escolha **Adicionar local**, depois toque/clique no mapa. **Usar centro** permite posicionar pelo teclado ou sem apontar um ponto preciso. Escolha categoria, ícone, nome e anotações, e salve.
- Clique/toque em um símbolo para consultar o local. **Locais** também oferece uma lista acessível. No desktop os detalhes aparecem ao lado do mapa; no celular, em uma janela adaptada.
- **Mover** habilita arraste do marcador ou escolha de outro ponto. **Confirmar posição** grava; **Cancelar** preserva a posição anterior. Arrastar normalmente o mapa nunca move locais.
- **Editar mapa** permite renomear, editar anotações e substituir a imagem. Ao substituir, as marcações mantêm suas posições relativas; uma mudança no território pode exigir reposicionamento.
- Excluir um mapa remove seus locais e imagens exclusivas. Aethelgard também pode ser excluído e não reaparece automaticamente.

## Imagens e funcionamento offline

O arquivo com upscale fornecido pelo usuário, originalmente `aethelgard-hd.jpeg`, tem 6144 × 4096 pixels. Ele foi incorporado como `assets/maps/aethelgard.jpeg` antes da integração. A inspeção comparou composição e rótulos com a imagem original; o upscale fornecido apresenta alguns detalhes redesenhados e foi utilizado conforme autorização do usuário.

`npm.cmd run maps:prepare` gera o manifesto, a miniatura e 129 tiles WebP em cinco níveis, com blocos de até 512 × 512 pixels e qualidade 95. O diretório em `public/maps` inclui um identificador derivado do conteúdo. Os artefatos gerados são versionados; builds normais não dependem de Downloads nem de processamento externo.

O mapa padrão e os ícones são incluídos no cache da PWA. Aguarde **Aplicativo pronto para uso offline** para disponibilidade de todos os níveis sem conexão. Imagens personalizadas ficam no IndexedDB, junto aos dados. Não há upload, conta ou sincronização em nuvem.

Importações aceitam até 50 MB, 64 megapixels e 16.384 pixels por lado. As dimensões são verificadas antes da decodificação. Um worker prepara os tiles com uma única imagem decodificada e pequenos canvases; há cancelamento, progresso e uma alternativa para navegadores sem OffscreenCanvas. A gravação só publica o mapa após completar a preparação. Erros de espaço não substituem dados anteriores.

## Persistência e manutenção

O banco `tormenta-personagens` passa da versão 3 para 4 por uma migração aditiva. `atlasMaps`, `mapLocations`, `mapAssets` e `mapTiles` separam metadados, locais e recursos binários. As tabelas anteriores não são alteradas.

A inicialização usa `builtin-aethelgard`, a identidade `builtin:aethelgard` e a configuração `map-aethelgard-initialized` dentro da mesma transação. Instalações com dados existentes também recebem o mapa. A inicialização não substitui edições nem recria mapas excluídos; abas concorrentes não produzem duplicatas.

Coordenadas X/Y variam de 0 a 1, com origem no canto superior esquerdo. O domínio converte para `CRS.Simple` do Leaflet somente na camada visual. Revisões impedem gravações concorrentes silenciosas. Exclusões removem recursos exclusivos em uma única transação; erros abortam a operação completa.

O visualizador é carregado sob demanda e mantém sua instância durante alterações de locais. Tiles usam a área visível mais uma margem; os objetos de marcadores são reaproveitados e os que ficam fora da área ampliada são removidos. Pan e zoom não persistem coordenadas nem provocam atualização React a cada movimento. Object URLs, observadores, eventos e bitmaps são liberados ao terminar seu uso.

As categorias estão em `src/data/map-categories.json`. Categoria e ícone têm identidades independentes, com fallback visual para referências desconhecidas. Os 33 tipos iniciais usam o sprite e os créditos de Game-icons.net existentes. `node scripts/build-entity-icons.mjs` regenera o sprite a partir do checkout indicado pelo script; usuários e builds recebem o resultado pronto.

## Backups

**Backups e importação** oferece uma seção própria para mapas. É possível exportar todos ou apenas um mapa. O ZIP contém manifesto `tormenta-mapas`, versão 1, mapas, locais, miniaturas, imagens originais importadas e todos os tiles necessários. Aethelgard inclui sua imagem em tiles, portanto a restauração não depende da versão embarcada em outro dispositivo.

A importação verifica versão, referências, identificadores, dimensões e arquivos antes de publicar os dados. Há prévia; mapas são importados como cópias com IDs remapeados e imagens independentes. O limite é 256 MB de conteúdo por backup. Para atlas maiores, exporte mapas individualmente. Backups JSON de personagens permanecem compatíveis e separados.

## Verificar

```powershell
npm.cmd test
npm.cmd run build
npx.cmd playwright test
```

Os testes cobrem migração, inicialização idempotente, exclusão do padrão, transações, coordenadas, importação/exportação, gestos, uso sem personagens, disponibilidade offline e mil marcações. As capturas de revisão ficam em `.cache/screenshots/maps`. A emulação Chromium não substitui uma conferência em aparelhos iOS/Android reais, especialmente com teclado virtual e pouca memória disponível.

Camadas, filtros, busca de locais, rotas, regiões, submapas, Fog of War e permissões não fazem parte desta versão.

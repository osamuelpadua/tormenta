# Arquitetura

Aplicação React/TypeScript, Vite, IndexedDB/Dexie, PWA. Nenhuma conta ou serviço remoto é necessário para jogar. O conteúdo é extraído dos PDFs locais e distribuído junto com o aplicativo.

## Contratos

- `Character`: identidade e escolhas canônicas, aquisições ordenadas por nível, inventário, recursos atuais, efeitos e estado da cena. Valores derivados são calculados.
- `CatalogEntry`: conteúdo de referência, tipo, página, versão da fonte, estado de revisão, metadados e aprimoramentos. ID estável por categoria e nome; homônimos recebem sufixo para evitar colisões. A extração não implica revisão semântica.
- `Modifier`: origem, tipo de fonte, alvo, operação, valor e contexto de aplicação. Calculado antes da soma; valores descartados constam no detalhamento.
- `DerivedValue`: total, componentes e referências.
- `Command`: intenção do usuário validada pelo motor antes da persistência. Uma execução grava personagem e evento na mesma transação.
- `HistoryEvent`: comando, resumo, instante real, rodada do jogo e estado anterior para desfazer. Sem referência recursiva a eventos anteriores.
- `Backup`: versão de esquema, versão de regras, personagens e histórico. Importação como cópia remapeia todas as referências de personagem.

O motor usa funções puras; a aleatoriedade é fornecida às operações por um rolador que usa Web Crypto e pode receber um gerador determinístico em testes. O parser de dados não executa JavaScript.

## Interface

Cinco destinos principais. No desktop, navegação lateral e ficha em duas colunas. No mobile, navegação inferior e conteúdo em coluna única. Detalhamentos em diálogos acessíveis. O tema padrão de fantasia medieval usa superfícies escuras, bronze e dourado; PV, PM, sucesso e alerta têm tokens próprios, acompanhados de texto. Cinzel nos títulos e Source Sans 3 no corpo, distribuídas localmente pelo Fontsource. `src/ui/tokens.css` define cores e materiais; `styles.css` e `mobile.css` mantêm a estrutura e os controles; `src/ui/fantasy.css` aplica as molduras, hierarquia e acabamentos compartilhados. O inventário usa cartões de equipamento. O PDF mantém sua página original. Consulte [a identidade visual](IDENTIDADE_VISUAL.md).

## Consistência

Poderes e Magias compartilham `library-data.ts` com os seletores de criação e evolução, consultando os mesmos IDs do catálogo. `library-state.ts` conserva a consulta por personagem e módulo; `reference-navigation.ts` integra detalhes e PDF ao histórico e ao hash. `book-references.json` registra as fontes verificadas. O leitor continua único e pode sobrepor formulários sem descartar seus rascunhos. Consulte [a auditoria da biblioteca](BIBLIOTECA.md).

Revisão de personagem e ID de comando previnem gravações repetidas e edições concorrentes silenciosas. IndexedDB é a fonte persistente; consultas reativas atualizam a interface após a transação. Erros de armazenamento são apresentados. Nenhum avanço do tempo decorre do relógio real. Atualização de PWA depende de ação explícita para não interromper combate.

O banco está na versão 3. A versão 2 introduz comandos idempotentes e recuperação; a versão 3 converte pacotes de munição para unidades. Ambas preservam uma cópia integral anterior à migração. A versão do envelope JSON de backup permanece 1; pacotes de munição identificáveis em arquivos antigos são normalizados durante a prévia, com aviso.

`magicPlan`, `attackPlan` e `formPlan` produzem prévias de custos, testes e erros para uso pela interface e pelos comandos. `coverageFor` descreve o alcance parcial da automação, separadamente do catálogo oficial. `partners` calcula tipos, patamares e limites de companheiros; seus bônus usam a fonte de acúmulo `parceiro`.

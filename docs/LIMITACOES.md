# Cobertura e trabalho restante

O aplicativo já permite criar fichas, calcular valores básicos, realizar uma sessão individual, evoluir por níveis e restaurar backups. **O plano integral ainda não foi concluído.** A biblioteca é um índice das fontes fornecidas; não é uma certificação de automação completa. A interface de uso informa a cobertura parcial e permite consultar o texto de origem.

## As 17 fases

| Fase                           | Estado                                                                             |
| ------------------------------ | ---------------------------------------------------------------------------------- |
| 1. Análise dos PDFs            | Extração integral concluída; leitura e revisão visual integrais pendentes          |
| 2. Mapa da ficha               | Matriz dos campos disponível; auditoria final de cobertura pendente                |
| 3. Regras                      | Núcleo implementado; exceções e semântica de todos os verbetes pendentes           |
| 4. Modelo de dados             | Contratos tipados para personagens, sessões, efeitos, itens e histórico            |
| 5. Arquitetura                 | Catálogo, motor, IndexedDB e interface separados; PWA disponível                   |
| 6. Design system               | Tokens, componentes, foco de teclado, diálogos e navegação responsiva              |
| 7. Telas                       | Ficha, Combate, Poderes, Magias e Inventário disponíveis                           |
| 8. Criação/edição              | Assistente e revisão disponíveis; escolhas especializadas ainda incompletas        |
| 9. Cálculos                    | Valores básicos e dezenas de passivos; substituições e exceções incompletas        |
| 10. Perícias                   | 29 perícias, Ofícios, filtros, treinamento e rolagem; usos especializados parciais |
| 11. Poderes/habilidades/magias | Biblioteca e aquisição; conjuração e alguns efeitos; automação parcial             |
| 12. Inventário                 | Itens, moedas, estados, carga, consumo e fabricação básica; melhorias parciais     |
| 13. Combate                    | Ações, turnos, rodadas, iniciativa, ataques e recursos; exceções parciais          |
| 14. Condições/efeitos          | Fontes, durações, acúmulo e condições básicas; gatilhos especializados parciais    |
| 15. Evolução                   | Sequência 1–20, multiclasse e comparação; escolhas internas incompletas            |
| 16. Rolagens/histórico         | Interpretador seguro, dados individuais, crítico, transações e desfazer            |
| 17. Testes completos           | Suites de motor, armazenamento e navegador; matriz integral ainda pendente         |

## O que é calculado

Atributos de origem e raciais; envelhecimento; aumentos por poderes; nível total e níveis de classe; treinamento nos patamares 1/7/15; perícias e Ofícios; PV e PM com Constituição retroativa; Defesa, penalidade de armadura, carga e proficiências; ataques desarmados, naturais e com armas; parte das melhorias e poderes passivos.

O combate controla ações padrão/movimento/completa, ações livres e reações; gasto de PM e recursos temporários; início/fim do turno; rodada; efeitos temporizados por iniciativa; sustentação; fim de cena; dano por tipo com prévia, RD e resistências raciais; dano não letal; sangramento; inconsciência; limite de morte e recuperação. Fúria considera ataques e acontecimentos hostis informados pelo jogador.

Ataque Especial, Golpe Divino, Ataque Extra, Frenesi e Golpe Relâmpago são vinculados à rolagem. Munições comuns são consumidas por unidade. Críticos multiplicam os dados básicos e preservam modificadores e dados adicionais separados.

Magias controlam origem, círculo, custo básico, aprimoramentos selecionados, limite de PM, concentração, restrições de gestos/palavras, mão livre, memorização de mago, conjuração arcana com armadura, componentes reconhecidos e sustentação. Falhas de testes consomem ação, PM e componentes na mesma operação. Há cálculos específicos para alguns efeitos, incluindo Armadura Arcana, Curar Ferimentos, Primor Atlético, Mente Divina, Físico Divino e Heroísmo.

Forma Selvagem altera atributos, Defesa, RD, tamanho e arma natural; mantém os benefícios de itens vestidos e termina por inconsciência. Parceiros têm limite por nível e parte dos bônus passivos; companheiros animais evoluem pelo nível da classe. Familiares têm seleção própria e alguns benefícios passivos e de CD.

## Regras determinísticas que ainda precisam de implementação

Estas são lacunas do aplicativo, não decisões automaticamente transferidas ao mestre:

- Leitura e revisão integral da fonte; separação perfeita de todos os verbetes; validação de pré-requisitos com alternativas, dependências entre poderes e repetições por patamar.
- Todas as escolhas específicas de classe e suas consequências: linhagens de feiticeiro, foco de bruxo, Caminho do Cavaleiro, vínculo de paladino, Golpe Pessoal e recursos exclusivos das demais classes. As escolhas livres preservam informações, mas não substituem o assistente específico.
- Progressão completa de todas as combinações de multiclasse; obtenção retroativa de treinamentos por aumento permanente de Inteligência; revisão automática de todas as escolhas invalidadas por edições.
- Todos os efeitos e aprimoramentos das 198 magias extraídas, alvos múltiplos, testes dos oponentes, áreas, dano e cura específicos, dissipação, contramágica, conjuração prolongada durante combate, rituais e materiais com custos não numéricos. Alguns metadados ainda são reconhecidos por padrões no texto.
- Encerrar automaticamente todo efeito que se descarrega em uma circunstância específica. Por exemplo, a reação de Armadura Arcana deve ser removida após o ataque correspondente; alguns efeitos podem exigir remoção explícita no painel.
- Todas as substituições de atributos em ataques/Defesa/perícias; manobras; duas armas; dois ataques da forma ágil na mesma ação; Forma Primal; furtivos; margens/efeitos críticos especiais; rerrolagens e gatilhos de todas as habilidades.
- Parceiros com habilidades ativas, dano adicional limitado por rodada, todos os familiares, montarias, condução e queda de montaria. Os patamares de parceiros de fontes especiais além do companheiro animal precisam de conferência própria.
- Fabricação completa por categoria, tempo e CD; fórmulas alquímicas e poções com aprimoramentos; custo e manutenção de fabricação das engenhocas; todos os comportamentos de falha/reparo. Fórmulas são registradas separadamente e não podem ser lançadas como magias. Engenhocas já têm ativação, teste de Ofício, custo de aprimoramentos, uso diário e estado enguiçado.
- Todas as melhorias, materiais especiais, encantamentos e itens mágicos; armas com modos alternativos, recarga, disparos múltiplos e exceções de mãos/itens vestidos; instalação de armadura no golem pelo período de um dia.
- Todas as consequências específicas de violações de devoção; imunidades e condições vinculadas a efeitos específicos; descanso e alimentação especiais além das regras raciais já cobertas. O evento de violação de código já zera PM e bloqueia sua recuperação até o próximo dia.
- Migrações semânticas gerais entre futuras revisões do catálogo. Os registros mantêm identificadores desconhecidos e emitem aviso, mas não reinterpretam automaticamente uma escolha cujo significado mudou.

## Contexto que precisa vir da mesa

O aplicativo controla um personagem. Alvos, Defesa dos adversários, acontecimentos hostis, condição ruim/terrível de concentração, origem de um efeito, iniciativa de terceiros e demais fatos externos precisam ser informados. Decisões do mestre, como concessão de um parceiro circunstancial ou uma exceção personalizada, devem ter motivo e origem identificados.

## Limites da validação atual

Os testes cobrem o núcleo e fluxos representativos; não cobrem todas as opções das 14 classes nem todas as combinações de poderes. Os testes de navegador usam Chromium, teclado e uma viewport de celular, incluindo retomada offline. Ainda faltam uma auditoria completa de acessibilidade, testes em dispositivos móveis físicos e nos demais navegadores, atualização de service worker durante todas as fases da sessão e a matriz completa pedida no plano.

O leitor offline guarda o texto extraído. Tabelas e símbolos devem ser conferidos no PDF original enquanto a revisão visual não estiver concluída.

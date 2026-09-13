# Fontes e mapa da ficha

Fontes locais: Tormenta20 — Edição Jogo do Ano, arquivo 17-11-2023; ficha Jogo do Ano. Identidade e SHA-256 em `sources.json`. A página impressa é a página do PDF menos seis; a ficha avulsa tem uma página.

## Cobertura de campos

| Campo físico / informação complementar                         | Dados de origem                                                     | Área digital                  | Regra e dependências                                                        |
| -------------------------------------------------------------- | ------------------------------------------------------------------- | ----------------------------- | --------------------------------------------------------------------------- |
| Personagem, jogador(a), raça, origem, classe, nível, divindade | Identidade e escolhas por nível                                     | Ficha, criação e evolução     | pp. 16–105; níveis de classe separados do nível total                       |
| FOR, DES, CON, INT, SAB, CAR                                   | Valores iniciais, raça, idade, aumentos e efeitos                   | Ficha, editor de atributos    | p. 17; atributos diretos, sem conversão de modificadores de outros sistemas |
| PV máximo e atual                                              | Classe inicial, ganho por nível, Constituição, poderes, dano e cura | Ficha e Combate               | pp. 35, 106, 236; mínimo 1 PV ganho por nível                               |
| PM máximo e atual                                              | Níveis de classe, atributo concedido, poderes, sacrifícios, gastos  | Ficha e Combate               | pp. 106, 224, 226; cada atributo só é adicionado uma vez                    |
| Ataques: nome, teste, dano, crítico, tipo, alcance             | Arma ou ataque natural/desarmado, perícia, atributos e contexto     | Ficha, Ataques, Combate       | pp. 142–151, 230–231                                                        |
| Defesa: 10, Destreza, armadura, escudo, outros                 | Atributos, proficiências, itens ativos, poderes e efeitos           | Ficha e Combate, detalhamento | pp. 106, 152–153, 226                                                       |
| Armadura e escudo: Defesa e penalidade                         | Instâncias de itens e estado de uso                                 | Inventário                    | pp. 141, 152–153; distinção entre vestir e empunhar                         |
| Proficiências e outras características                         | Classe inicial, raça, poderes, escolhas e notas                     | Ficha                         | pp. 32, 106–110                                                             |
| Habilidades e magias                                           | Catálogo e aquisições do personagem                                 | Poderes, Magias, Combate      | pp. 18–105, 124–137, 170–211                                                |
| Todas as perícias: total, ½ nível, atributo, treino, outros    | Treinamentos com origem, nível total, atributo e modificadores      | Ficha e Perícias              | pp. 114–123; 29 perícias, múltiplos Ofícios                                 |
| Equipamento, T$, carga                                         | Itens, quantidades, moedas e recipientes                            | Inventário                    | pp. 140–167, 333–349; carga em espaços                                      |
| Tamanho, sentidos, deslocamentos                               | Raça, forma e efeitos                                               | Ficha e Combate               | pp. 106–107, 228–229                                                        |
| Condições, efeitos e duração                                   | Fonte e instâncias com momento de aplicação                         | Combate                       | pp. 226–229, 233, 394–395                                                   |
| Parceiros, familiar e montaria                                 | Tipo, patamar e fonte da concessão                                  | Ficha e Poderes               | pp. 38, 62, 84, 260–262                                                     |
| Experiência e evolução                                         | XP/marcos, decisões e aquisições por nível                          | Evolução e histórico          | pp. 33–35, 326                                                              |
| Aparência, idade, personalidade, história e alinhamento        | Campos descritivos, modificadores de idade                          | Ficha                         | pp. 107–110                                                                 |

## Regras verificadas e decisões de interpretação

- Treinamento +2 (níveis 1–6), +4 (7–14), +6 (15–20). Metade do nível arredondada para baixo. Fortitude, Reflexos, Vontade e Iniciativa usam as próprias perícias.
- A tabela resumida de classes informa quatro perícias à escolha para Caçador, mas sua descrição específica, p. 50, informa seis. Usa-se a descrição específica, exibindo a referência.
- Golem não recebe origem; recebe um poder geral. Humanos podem substituir um de seus dois treinamentos raciais por um poder geral.
- Constituição altera PV retroativamente. Inteligência temporária não concede treinamentos permanentes.
- Armadura pesada impede a contribuição normal de Destreza na Defesa. Anões e golens têm exceções à redução de deslocamento por armadura/carga.
- Efeitos de habilidades distintas acumulam; itens, magias, parceiros e ambiente não acumulam entre si na mesma característica, salvo exceção explícita. Armadura, escudo e um item adicional têm regra própria.
- Padrão pode virar movimento; completa consome padrão e movimento. Reações não possuem um limite geral de uma por rodada. Magia livre tem limite próprio de uma por rodada.
- Rodadas expiram imediatamente antes da iniciativa em que o efeito começou. Cena e dia são tempo da ficção; fechar o navegador não os avança.
- Fúria não dura três rodadas: termina ao fim da rodada sem ataque nem efeito hostil recebido, ressalvados seus poderes.
- Sustentação cobra por efeito; uma magia sustentada por vez, com exceções explícitas como Fluxo de Mana.
- Dano, perda de vida e dano não letal são eventos diferentes. Teste de resistência vem antes de multiplicações/divisões e RD. Crítico multiplica dados da arma, não bônus fixos ou dados extras.
- Recursos temporários são consumidos primeiro. Cura não ultrapassa máximo; o limite não remove recursos temporários.
- A aplicação oferece decisões explícitas quando falta contexto do mestre; uma decisão de mesa não se torna regra oficial.

## Processo de auditoria

`scripts/extract-sources.mjs` lê todas as páginas e gera uma referência textual offline; renderiza a ficha, tabelas e páginas com pouco texto para inspeção. `scripts/catalog-sources.mjs` segmenta os registros e as 280 linhas de progressão. `catalog-audit.json` permite conferir nomes, referências e extensão de cada registro. O catálogo mantém a descrição da fonte mesmo quando uma ação depende da mesa.

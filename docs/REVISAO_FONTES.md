# Proveniência e revisão das fontes

Fontes: livro Tormenta20 — Edição Jogo do Ano, arquivo de 17/11/2023, com 407 páginas de PDF; ficha avulsa Jogo do Ano, com uma página. Os hashes SHA-256 estão em `sources.json`. A versão do catálogo é `t20-jda-2023-11-17`.

## Estado real da análise

A extração de texto e itens posicionados das 407 páginas do livro e da ficha está concluída. A ficha e tabelas selecionadas foram conferidas visualmente durante o desenvolvimento. **A leitura humana integral e a conferência visual de todas as páginas ainda não foram concluídas.** A extração integral não substitui essa revisão.

O catálogo atual contém 1.436 registros extraídos: 55 habilidades raciais, 82 habilidades de classe, 26 escolhas internas, 295 poderes de classe, 35 origens, 35 poderes de origem, 20 divindades, 72 usos de perícias, 162 poderes gerais, 235 registros de equipamento, 198 magias, 18 parceiros, 168 registros de itens mágicos e 35 condições. Há ainda 17 raças, 29 perícias, 14 classes com suas 280 linhas de progressão e 169 modelos de inventário extraídos das tabelas.

Essas contagens descrevem a extração; não certificam que a segmentação de cada verbete nem a cobertura de todas as opções do livro estejam corretas. Cada registro contém `sourceVersion`, `page`, `pdfPage`, `endPage` e `reviewStatus: extracted`. Nenhum registro foi marcado como integralmente revisado por simples processamento automático.

## Conferências aplicadas ao motor

| Regra                                               | Páginas impressas | Evidência de implementação                                                           |
| --------------------------------------------------- | ----------------- | ------------------------------------------------------------------------------------ |
| Atributos, pontos e características raciais básicas | 17–31             | Cálculo e assistente; magias raciais com atributo e origem próprios                  |
| PV/PM das classes e multiclasse                     | 32–84             | Progressões, classe inicial, ganhos e Constituição retroativa                        |
| Briga, Ataque Especial, Ataque Extra, Golpe Divino  | 65–66, 76, 82     | Rolagem e custos em uma transação; dano básico e adicional separados                 |
| Forma Selvagem                                      | 62–63             | Cinco formas, três patamares, tamanho, atributos e arma natural                      |
| Recursos, descanso e carga                          | 106, 141          | Recuperação por nível, exceções de golem/osteon, carga por espaços                   |
| Perícias e treinamento                              | 114–123           | 29 perícias e especialidades de Ofício; patamares 7 e 15                             |
| Armaduras e escudos                                 | 152–153, 226      | Proficiência, peso, mãos, limite de itens vestidos e acúmulo                         |
| Conjuração e aprimoramentos                         | 170–173, 224–227  | Custos, círculos, testes de concentração e de armadura, falhas consumindo recursos   |
| Magias com cálculos específicos                     | 181, 189, 193–202 | Testes de Armadura Arcana, Curar Ferimentos, Primor Atlético e atributos temporários |
| Condições, ações e durações                         | 226–236, 394–395  | Efeitos com fonte, início/fim de turno, rodada e iniciativa de origem                |
| Parceiros e familiares                              | 38, 62, 260–262   | Limite de parceiros e parte dos benefícios passivos                                  |

Há testes automatizados das regras indicadas, mas os testes não representam cobertura integral dessas páginas. Exceções específicas ainda pendentes estão em `LIMITACOES.md`.

## Revisão ainda necessária

1. Conferir visualmente as páginas restantes, inclusive símbolos, tabelas, legendas e colunas fora da ordem de leitura do extrator.
2. Separar textos narrativos que permaneceram no fim de alguns registros e conferir verbetes em caixas laterais.
3. Auditar opções internas, pré-requisitos alternativos e cada aprimoramento contra o PDF.
4. Classificar a mecânica de cada registro como automática, dependente de contexto ou de decisão do mestre, separadamente do seu estado de implementação.
5. Marcar como revisado apenas o registro conferido e registrar a evidência. Referência válida e identificador único não provam fidelidade semântica.

Os números de página permitem voltar ao PDF original. O leitor reorganiza títulos e parágrafos usando fontes e posições da extração. A tabela 1-3, na página impressa 32 (PDF 38), foi reconstruída e conferida visualmente: 14 classes, seis colunas e duas notas. Os valores permanecem os da tabela, inclusive “mais 4” nas perícias do Caçador, sem substituição pelo texto específico da classe usado no motor.

O leitor agora usa o PDF original como visualização padrão, preservando tabelas, caixas e ilustrações. “Texto organizado” e “Texto extraído” continuam disponíveis como alternativas, com as limitações de disposição e hifenização da extração. A exibição do PDF não altera o estado de revisão nem a cobertura de automação do catálogo.

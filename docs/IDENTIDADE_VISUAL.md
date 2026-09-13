# Identidade visual — Diário de um aventureiro

A reformulação aplica fantasia medieval sombria à interface existente. A direção escolhida combina ferro escuro, carvão, bronze gasto e vinho, com uma cidadela discreta no cabeçalho. Molduras finas, luz nas bordas, divisores e símbolos dão profundidade sem colocar textura atrás de textos longos.

## Linguagem compartilhada

| Elemento              | Tratamento                                                                                                              |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Fundos e painéis      | Carvão `#111311`, superfícies `#1b1e1a`, bordas metálicas e cantos de 2–4 px                                            |
| Texto                 | Marfim `#ebe5d8`, secundário `#b2af9f`, títulos Cinzel, corpo e formulários Source Sans 3                               |
| Progresso e destaques | Dourado envelhecido `#c6a76b`, bronze, nível em placa e evolução com moldura própria                                    |
| Vida e perigo         | Barras segmentadas em vermelho queimado, dano e condições negativas com símbolos e texto                                |
| Magia                 | Azul `#9cbedf`, barra de PM e emblemas de magia                                                                         |
| Recuperação           | Verde `#a2c694` nos comandos de cura e recuperação                                                                      |
| Interação             | Foco dourado, iluminação discreta ao passar o ponteiro, movimento curto nas barras; respeito a `prefers-reduced-motion` |

As duas famílias tipográficas são distribuídas pelo Fontsource e incluídas no cache offline. As licenças OFL acompanham os pacotes instalados. Os controles usam Lucide; equipamentos, poderes, magias e condições usam silhuetas específicas de Game-icons.net, com cor herdada do contexto. Consulte [a auditoria e os créditos dos ícones](AUDITORIA_LEITOR.md).

## Aplicação nas telas

- **Ficha:** nome e classe sobre a paisagem, monograma em escudo, placa de nível, valores grandes de PV/PM/Defesa, ícones próprios nos seis atributos, perícias com treinamento e acesso aos cálculos.
- **Combate:** iluminação em vinho e cobre, painel de batalha com rodada e ações destacadas, ataques em cartões, efeitos com descrição, origem, modificadores e contador de rodadas quando aplicável.
- **Poderes e magias:** emblemas, distinção entre passivos, ações e magias, categorias, favoritos e comandos existentes.
- **Inventário:** cartões de equipamento, ícones de arma, armadura e escudo, moldura dourada para itens vestidos/empunhados, quantidade, espaços e situação preservados.
- **Evolução:** cabeçalho e moldura dourados, comparação antes/depois e confirmação com destaque.
- **Fluxos compartilhados:** criação, edição, condições, dados, dano, cura, catálogos, backups, histórico, ajuda e estados vazios usam as mesmas superfícies. O leitor recebe moldura escura; a página do PDF original mantém suas cores e diagramação.

Navegação, comandos, cálculos, dados de personagens e persistência continuam nos mesmos componentes e módulos. A reformulação não modifica `src/domain`, `src/storage` nem a ficha de exemplo de Budrik. A única alteração no teste de backup elimina a dependência da ordem aleatória dos UUIDs: após importar o backup completo, o teste seleciona explicitamente Aldren entre as cópias.

## Arte de ambiente

- Arquivo final: [`public/art/citadel.png`](../public/art/citadel.png), PNG 2172 × 724.
- Modo: geração original com a ferramenta integrada `image_gen`, por meio da skill `imagegen`.
- A imagem foi inspecionada e copiada para o projeto, usada apenas como fundo decorativo. Fontes, ícones e paisagem ficam disponíveis offline após o cache inicial.
- Não havia imagens de referência no anexo; a direção foi escolhida com autorização do usuário a partir do briefing textual.

Prompt final utilizado:

```text
Create one original wide panoramic dark fantasy environment illustration to use as a subdued header backdrop in a medieval tabletop role-playing character sheet app. Landscape composition, approximately 3:1. Ancient mountainous citadel on the right third, worn stone towers and a monumental gate, jagged distant peaks, storm clouds and drifting charcoal mist. A very restrained dull crimson supernatural glow behind the mountains, a few tiny warm bronze torch lights, deep near-black olive charcoal foreground. Left half must be very dark, quiet negative space suitable for readable ivory character name overlays. Painterly premium fantasy game art, sophisticated material detail, atmospheric perspective, low saturation, cinematic yet restrained, mysterious and immersive, subtle hand-painted grain. Muted aged bronze, charcoal, soot, dark oxblood. No people, no characters, no lettering, no text, no UI, no logos, no watermark, no bright central sun, no purple neon. This is a background asset, not a mockup. Produce the final image for use inside the project.
```

## Verificação

Build de produção concluído, 110 testes Vitest e 25 cenários Playwright aprovados. Os testes incluem as cinco áreas em 320, 390, 600, 768, 900, 1024 e 1440 px, os 11 passos da criação, toque, dados físicos, combate, evolução, importação/exportação, exemplo inicial e livro offline.

Revisão de capturas em desktop, tablet e celular, incluindo bibliotecas preenchidas, equipamento, evolução, criação, condições e conjuração. A checagem adicional de contraste com axe-core não apontou violações automáticas nas 25 telas e estados inspecionados; superfícies com gradientes exigem revisão visual e não constituem certificação automática de contraste. Capturas e relatório de trabalho ficam em `.cache/screenshots/fantasy/`, fora do controle de versão.

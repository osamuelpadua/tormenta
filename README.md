# Tormenta — Diário de personagens

Aplicativo em português para fichas de Tormenta20 — Jogo do Ano. React, TypeScript, Vite, Dexie/IndexedDB e PWA. Funciona localmente, sem cadastro, servidor de dados ou serviços externos.

**Estado: implementação em andamento.** O ciclo de criação, sessão, evolução e restauração de backup está disponível e tem testes de navegador. A revisão integral dos PDFs e a automação de todas as regras do plano ainda não estão concluídas. A presença de uma regra na biblioteca não significa que todos os seus efeitos estejam implementados. Consulte [a cobertura e as pendências](docs/LIMITACOES.md).

## Executar no Windows

Use Node.js 22.12 ou superior. O projeto foi validado com Node.js 24.19.

```powershell
npm.cmd ci
npm.cmd run dev
```

Abra o endereço indicado pelo Vite, normalmente `http://127.0.0.1:5173`. Use o servidor local; abrir `index.html` diretamente pelo Explorador não executa o aplicativo TypeScript.

Para a versão de produção, com suporte offline:

```powershell
npm.cmd run build
npm.cmd run preview -- --port 4173
```

Abra `http://127.0.0.1:4173` e aguarde “Aplicativo pronto para uso offline”. Depois desse carregamento, aplicação, catálogo e texto do livro ficam no cache do navegador. A instalação pode ser feita pelo menu do navegador quando disponível. A atualização do aplicativo é anunciada e depende da ação do usuário.

Mantenha o mesmo endereço, protocolo e porta para acessar a mesma base local. `localhost`, `127.0.0.1`, a porta de desenvolvimento e a porta de produção têm armazenamentos separados; use um backup para transferir personagens entre eles.

## Usar

Na primeira abertura, o app já mostra **Budrik**, anão bárbaro de nível 6, como personagem de exemplo, com 69/98 PV e 12/18 PM. A ficha pode ser editada normalmente. O exemplo só é adicionado uma vez em uma base sem personagens nem fichas arquivadas; fichas existentes são preservadas, e arquivar Budrik não faz ele reaparecer.

Os dados são físicos, rolados na mesa. Consulte os bônus na ficha; registrar um teste de perícia é opcional. Ao informar o d20, o app soma os modificadores e compara com a CD, se preenchida. Ataques, efeitos com dados e a criação por rolagem pedem os resultados físicos antes de concluir. Cancelar esse registro preserva a ficha e os recursos. Os dados informados ficam no histórico e nos backups.

1. Crie o personagem pelo assistente. Distribua os atributos, escolha raça, classe, origem, devoção, perícias, poderes, equipamento e magias. A revisão mostra escolhas pendentes e permite registrar exceções autorizadas com motivo.
2. No Inventário, diferencie itens guardados, carregados, vestidos e empunhados. Armas empunhadas aparecem nos ataques; munição é controlada em unidades.
3. Em Combate, informe a iniciativa e avance início do turno, fim do turno e rodada separadamente. Aplique dano com a prévia, sustente efeitos e informe acontecimentos externos relevantes. Ataque Especial, Golpe Divino e ataques extras são escolhidos na janela de ataque.
4. Use Evoluir para avançar um nível de cada vez, inclusive em outra classe. A comparação mostra os novos máximos; os recursos atuais ficam preservados por padrão.
5. Em Backups, exporte os personagens com histórico. A importação valida o arquivo e mostra a prévia; identificadores existentes são importados como cópias. O diário permite desfazer a última operação completa.

Personagens ficam no perfil deste navegador. Limpar os dados do site remove a base local. A recuperação local mantém cópias anteriores às migrações e fichas arquivadas; o arquivo JSON exportado permite restaurar em outro navegador ou dispositivo.

No celular e em tablets de até 900 px, use as cinco áreas na barra inferior. O menu no canto superior direito reúne livro, histórico, backups e ajuda. Na Ficha, os atalhos levam diretamente a perícias, ataques, detalhes e anotações. Os botões de PV e PM mostram a ação antes de abrir a prévia.

## Fontes e organização

As fontes são os dois PDFs fornecidos neste projeto. Páginas citadas na interface correspondem à numeração impressa do livro; a página do PDF é seis unidades maior. O leitor abre o **PDF original** com a diagramação, tabelas e ilustrações do livro, navegação por página impressa, texto selecionável, busca e zoom. O botão de porcentagem ajusta a página à largura; no celular, use o zoom e deslize para ler as colunas. Também é possível abrir o arquivo em outra aba ou selecionar os modos de texto.

O PDF tem aproximadamente 66 MB. Ele e os recursos locais do PDF.js são incluídos no cache após o primeiro carregamento completo, junto do aplicativo; aguarde o aviso de disponibilidade offline. O build precisa do PDF na raiz do projeto. `predev` e `prebuild` copiam as fontes e os decodificadores do PDF.js para `public/pdfjs`, sem servidores externos.

- [Mapa dos campos da ficha](docs/MAPEAMENTO.md)
- [Arquitetura e contratos](docs/ARQUITETURA.md)
- [Responsividade e experiência no celular](docs/RESPONSIVIDADE.md)
- [Identidade visual de fantasia medieval](docs/IDENTIDADE_VISUAL.md)
- [Cobertura por fase e limitações](docs/LIMITACOES.md)
- [Proveniência e estado da revisão](docs/REVISAO_FONTES.md)
- [Hashes dos PDFs](docs/sources.json) e [índice de extração](docs/catalog-audit.json)

`src/data` contém catálogo e fontes; `src/domain` contém cálculos e comandos; `src/storage` contém validação, transações e migrações; `src/ui` contém as telas. O catálogo embarcado usa identificadores estáveis, versão da fonte e páginas. A compilação já utiliza os JSONs gerados, portanto não precisa extrair os PDFs novamente.

Para regenerar as fontes, com os PDFs originais presentes:

```powershell
npm.cmd run sources
node scripts/catalog-sources.mjs
node scripts/equipment-sources.mjs
```

Os scripts de extração produzem candidatos a registros. Alterações no extrator exigem revisão dos registros, referências e compatibilidade dos identificadores antes de substituir uma versão distribuída.

`npm.cmd run sources:format` regenera apenas a apresentação do leitor em `src/data/book-layout.json`, usando os itens posicionados de `.cache/pdf/book.json`. Esse passo já faz parte de `npm.cmd run sources`; os valores da tabela são extraídos do PDF, independentemente do catálogo do motor.

## Verificar

```powershell
npm.cmd test
npm.cmd run build
npx.cmd playwright install chromium
npm.cmd run test:e2e
```

Vitest verifica o motor, regras de combate e magia, integridade das referências, backups, idempotência e migrações. Playwright executa os fluxos em Chromium, incluindo toque emulado e larguras de 320 a 1440 px. Os testes de navegador iniciam o servidor de produção na porta 4173; faça o build antes. Capturas ficam em `.cache/screenshots` e relatórios de falha em `test-results`.

O backup da ficha manuscrita de Budrik está em `src/data/budrik.json` e é embarcado no app para preparar o personagem de exemplo sem depender de uma requisição de rede. `predev` e `prebuild` também o copiam para `public/imports/budrik.json`, pronto para a tela Backups. Ele inclui as leituras provisórias em Anotações, os totais originais dos ataques e os recursos atuais escolhidos: 69/98 PV e 12/18 PM. O script `node scripts/import-budrik.mjs` regenera os dois arquivos a partir da transcrição registrada no projeto.

Validação da reformulação visual: build de produção, 110 testes Vitest e 25 cenários Playwright aprovados. Inclui as cinco áreas em sete larguras, formulários com altura reduzida, criação, sessão, evolução, backups e PDF offline. A regressão da piscada no leitor verifica sumiços, substituições e mudanças de tamanho com barras de rolagem visíveis como no Windows. Os limites da emulação estão em `docs/RESPONSIVIDADE.md`; a revisão integral das regras permanece pendente conforme `docs/LIMITACOES.md`.

O app está publicado em https://tormenta-osamuelpaduas-projects.vercel.app, com deploy automático da branch `main`. As fichas continuam locais ao navegador, sem sincronização em nuvem.

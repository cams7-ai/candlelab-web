# CandleLab Web 0.3.0

Interface em português para um laboratório local de backtest histórico Binance Spot, feita com React, TypeScript, Vite e **lightweight-charts 5.2.0** (versão fixada no manifesto e em `yarn.lock`). Consome o contrato HTTP v1 descrito em [docs/prompt_261114.md](docs/prompt_261114.md).

## Exportar processamento

No detalhe da sessão, cada processamento concluído em **Comparar processamentos**
oferece **Exportar PDF**. O download contém identificação da sessão e do conjunto,
resumo financeiro, parâmetros, gráfico de candles com compras e vendas executadas,
curva de patrimônio e histórico de sinais e execuções. O gráfico usa uma visão
limpa do período completo e agrupa históricos longos em até 160 barras OHLC,
indicando a agregação no relatório. Os valores das tabelas mantêm a precisão
recebida da API. A exportação usa os dados da linha escolhida e funciona no navegador.

## Executar

Requisitos: Node.js 18.19 ou superior e Yarn Classic 1.22.22. Para novas instalações, prefira uma versão LTS mantida do Node.

```bash
yarn install --frozen-lockfile
cp .env.example .env.local
yarn dev
```

Abra <http://localhost:5173>. O modo normal utiliza a API real em `http://localhost:8000/api/v1`; não há troca automática para dados fictícios em caso de erro. Configure `VITE_API_BASE_URL` em `.env.local` com a **origem**, sem o sufixo `/api/v1`, e reinicie o Vite após mudanças.

A API fica em outro repositório. Autorize a origem `http://localhost:5173` no CORS do backend, incluindo os métodos GET/POST/PUT/DELETE e os cabeçalhos `Content-Type` e `Idempotency-Key`. No desenvolvimento, a porta é fixa para que a origem não mude silenciosamente. A aplicação não precisa de chaves Binance: a aquisição externa é feita pela API.

## Demonstração independente da API

```bash
yarn demo
```

O modo `demo` ativa explicitamente o MSW, que intercepta as chamadas HTTP do mesmo cliente usado em produção. Exige navegador com Service Worker (localhost ou HTTPS). O banner identifica os dados sintéticos. Nenhuma chamada Binance real é realizada. Os mocks só são carregados com `VITE_DEMO_MODE=true`, definido em `.env.demo`.

Há uma sessão com 180 candles sintéticos e dois resultados ilustrativos (SMA + RSI e EMA). As quatro estratégias legadas e as 18 do tutorial vêm do catálogo HTTP simulado. A demonstração permite buscar dados sintéticos, importar JSON, criar sessões e acompanhar um novo processamento de `queued`/`running` até `completed`. Novos processamentos retornam um resumo neutro e séries ilustrativas; o mock **não implementa um motor financeiro** nem avalia a rentabilidade dos parâmetros escolhidos. As duas execuções de exemplo contêm sinais e fills ilustrativos para conferir a apresentação.

Os dados criados no modo demo persistem no `localStorage`, sob a chave `candlelab-demo-v1`. Para reiniciar a amostra, apague essa chave nas ferramentas do navegador e recarregue. Para testar o envio de JSON, selecione [public/candles-sinteticos.json](public/candles-sinteticos.json), com 40 candles e os 12 campos Binance originais.

## Fluxo

1. Em **Candles**, escolha **Buscar na Binance** ou **Enviar JSON**. Símbolos e intervalos vêm de `/instruments`.
2. Depois da aquisição, confira origem, quantidade e período UTC e clique em **Criar sessão**. Também é possível escolher qualquer dataset já publicado em **Nova sessão**.
3. Informe nome, caixa inicial em USDT e taxa por preenchimento em percentual, usando ponto ou vírgula decimal, sem separador de milhares. `0,1%` é enviado exatamente como `"fee_rate":"0.001"`.
4. Abra a sessão e escolha **Novo processamento**. Os campos são construídos a partir de `parameters_schema` e `defaults` de `/strategies`.
5. No detalhe, selecione uma execução acima do gráfico, use a busca por estratégia e compare os resultados concluídos. Cada opção informa estratégia, versão, ID e estado. A URL com hash conserva a sessão e a execução selecionadas ao recarregar.

Sinais e preenchimentos são conceitos distintos: setas representam sinais; círculos representam execuções. Há controles independentes para cada tipo. O histórico mostra a âncora do candle, a disponibilidade/ocorrência, o preço, a quantidade, o vínculo com o sinal e os motivos de ausência de execução. Os eventos são ordenados por âncora e sequência. Essa distinção segue o modelo de apresentação e causalidade do [ReplayQuant](https://github.com/cams7-ai/replayquant).

O resumo apresenta patrimônio, caixa, posição, retorno, taxas, P&L realizado e não realizado, contagens, acerto e drawdown. Acerto `null` aparece como **Indisponível**. Valores financeiros são preservados como strings decimais, inclusive todos os dígitos recebidos. A conversão para `Number` de preços e indicadores ocorre somente na fronteira gráfica; os cálculos de backtest pertencem à API.

## Consulta Binance e UTC

Somente `symbol` e `interval` são obrigatórios. Datas e limite começam vazios; campos vazios são omitidos. Sem datas, a API consulta os candles mais recentes, com padrão de até 500 por requisição quando o limite está vazio. O limite informado deve ser inteiro de 1 a 1000. A seleção temporal considera a abertura dos candles. O início deve ser anterior ou igual ao fim.

O formulário usa UTC, independentemente do fuso do computador. Datas são enviadas com segundos e `Z`. Exemplos do corpo de `POST /api/v1/datasets/binance`:

```json
{ "symbol": "BTCUSDT", "interval": "5m" }
```

```json
{
  "symbol": "BTCUSDT",
  "interval": "5m",
  "startTime": "2026-08-19T00:00:00Z",
  "endTime": "2026-08-22T00:00:00Z",
  "limit": 1000
}
```

O upload usa `multipart/form-data` com `file`, `symbol` e `interval`. O frontend envia o arquivo original, sem interpretar nem recodificar seus 12 campos. Erros de linha/campo enviados pela API são apresentados junto ao formulário.

## Gráficos e evolução do catálogo

O gráfico utiliza `chart.addSeries(CandlestickSeries, ...)` e `createSeriesMarkers` da versão 5.2.0, com atribuição visível ao TradingView. As séries SMA/EMA ficam sobre o preço; RSI usa painel próprio de 0 a 100 e limiares efetivos. O patrimônio tem painel separado. Os painéis compartilham o eixo temporal e o cursor. Há zoom, navegação e redimensionamento.

As páginas de candles, indicadores, eventos e patrimônio são integralmente percorridas; duplicatas são removidas por timestamp ou ID antes da ordenação. Aquecimento `null` vira dado ausente, sem preencher valores. Na troca de processamento, as séries anteriores e seus marcadores são removidos. Requisições e polling usam `AbortController`; estados terminais encerram o acompanhamento. Falhas de consulta oferecem retentativa.

O campo `auxiliary_json` permite importar/editar observações JSON de estratégias com dados adicionais. Ao importar um arquivo, seu nome aparece no formulário e é persistido no campo opcional `auxiliary_filename` do processamento, exibido em **Parâmetros efetivos** no detalhe da sessão. O conteúdo continua em `parameters.auxiliary_json`. Processamentos anteriores e JSON digitado manualmente podem não ter nome de arquivo. Novas estratégias com parâmetros numéricos dos tipos `integer`, `number` e `string` decimal aparecem a partir do catálogo sem alteração no frontend. Indicadores adicionais são renderizados por suas chaves; chaves contendo `volume` usam histogramas em painel separado. Canais como Donchian podem usar séries de preço. Tipos futuros de parâmetro ou indicadores com outras escalas exigirão uma extensão explícita do contrato e do renderizador. Nenhuma estratégia futura é anunciada antes de aparecer na API.

## Referências visuais

Os nove PNGs estão em [images/](images/). O prompt usa caminhos `../images/` porque a especificação está em `docs/`; na raiz do repositório, o caminho é `images/`.

A composição segue a navegação lateral, o tema escuro e turquesa, os formulários em duas colunas, as tabelas e o seletor acima do gráfico. Foram priorizadas as referências `07-resultados-sma-rsi.png` a `09-seletor-de-processamentos-aberto.png`, com adaptação para telas menores. Os controles usam elementos nativos acessíveis por teclado. Os PNGs não são utilizados como telas estáticas.

## Código e verificações

- `src/types.ts`: contrato HTTP tipado.
- `src/api.ts`: cliente central, multipart, paginação e erros.
- `src/components/`: telas, resumo e gráfico.
- `src/mocks/`: fixtures, handlers HTTP e persistência exclusiva do demo.
- `src/test/`: testes de integração com MSW e testes do adaptador de gráficos.

```bash
yarn test
yarn build
yarn build:demo
yarn preview
yarn format:check
```

`yarn build` gera `dist/` integrado à API real. `yarn build:demo` gera uma distribuição com mocks explícitos. `yarn preview` serve o último build. Não execute os dois builds simultaneamente, pois ambos escrevem em `dist/`.

A suíte cobre multipart sem recodificação, aquisição mínima, UTC, omissão de opcionais, limites inválidos, erros por campo, criação de sessão, catálogo extensível, polling e seu cancelamento, troca de execução, reabertura de sessão, precisão do resumo, histórico, marcadores em candles distintos, aquecimento, RSI e descarte do gráfico. O jsdom não renderiza canvas: os testes do gráfico verificam as chamadas para a API do Lightweight Charts, sem substituir a necessidade de inspeção em navegador.

Validação desta implementação (14/11/2026): registro dos comandos e resultados em [docs/validacao.md](docs/validacao.md).

Pendências de integração: a API real e o arquivo `candles-btcusdt-spot-5m_2026-08-19T0000Z_a_2026-08-22T0000Z.json` não foram disponibilizados nesta execução. Quando estiverem disponíveis, importar com BTCUSDT/5m e conferir **865 candles** e última abertura **2026-08-22T00:00:00Z**. A inspeção visual lado a lado, incluindo desktop, celular, as duas abas e o seletor aberto, permanece pendente porque o host de acesso ao navegador estava indisponível.

## Atribuição

[TradingView Lightweight Charts™](https://www.tradingview.com/) é distribuído sob Apache 2.0. O aviso e a licença completos acompanham o build em `public/THIRD_PARTY_NOTICES.txt` e `public/LICENSE-lightweight-charts.txt`. O logo de atribuição do gráfico permanece habilitado.

## Versão 0.2.0

O [prompt desta versão](docs/prompt_261116_v0.2.0.md) foi criado antes das alterações e executado neste projeto. Consulte o [guia de estratégias e importação](docs/estrategias_v0.2.0.md) para as 18 novas opções, regras, padrões e hipóteses de execução. As quatro opções anteriores permanecem disponíveis. A entrada auxiliar é importada por processamento, com snapshot persistido e validação de cobertura temporal; não há dados externos fabricados automaticamente. Suporte adicional a candles de 1 hora.

Veja os [resultados de validação 0.2.0](docs/validacao_v0.2.0.md).

## Versão 0.2.0

O [prompt desta versão](docs/prompt_261116_v0.2.0.md) foi criado antes das alterações e executado neste projeto. Consulte o [guia de estratégias e importação](docs/estrategias_v0.2.0.md) para as 18 novas opções, regras, padrões e hipóteses de execução. As quatro opções anteriores permanecem disponíveis. A entrada auxiliar é importada por processamento, com snapshot persistido e validação de cobertura temporal; não há dados externos fabricados automaticamente. Suporte adicional a candles de 1 hora.

Veja os [resultados de validação 0.2.0](docs/validacao_v0.2.0.md).

## Combinações reutilizáveis — 0.3.0

O [prompt desta atualização](docs/prompt_261119_v0.3.0.md) foi escrito após analisar Web e API e antes de implementar. Resultados em [validação 0.3.0](docs/validacao_v0.3.0.md).

Em **Estratégias → Combinações**, cadastre um nome e escolha:

- **Combinação livre**: de 2 a 8 estratégias distintas compatíveis, com parâmetros próprios e regras independentes de compra e venda: **Todas** ou **Qualquer uma**.
- **Configuração de combinação existente**: escolha uma das seis combinações publicadas e salve seus parâmetros. Quando exigidos, informe os dados auxiliares JSON correspondentes ao dataset que será usado.

Os sinais da composição livre precisam ocorrer no mesmo candle, após o aquecimento de todos os componentes. Em conflito, venda tem prioridade. Stops dos componentes participam da regra de venda escolhida. Todos os componentes observam os fills de uma única carteira Spot, com execução na abertura seguinte. DCA, grades e estratégias com dados externos ou carteiras especiais não participam da composição livre; a elegibilidade vem de `combinable` no catálogo da API.

Abra uma sessão, clique em **Novo processamento**, marque **Configuração ou combinação salva**, abra o seletor com busca, confirme em **Usar configuração** e inicie. O link **Cadastrar ou gerenciar combinações** retorna ao processamento com a combinação recém-salva selecionada. É possível editar ou excluir cadastros com confirmação. Os nomes, regras, componentes e parâmetros históricos ficam no snapshot da execução e são usados no detalhe, comparação e PDF, mesmo depois de alterar ou excluir o cadastro.

Requer a API 0.3.0 e o worker atualizado. O frontend consome `/api/v1/strategy-combinations` e envia `{ "combination_id": "..." }` na criação do processamento. Os cadastros reais ficam no MongoDB. O demo persiste seus próprios cadastros no navegador e continua oferecendo apenas resultados sintéticos. Reinicie API, worker e Vite após atualizar ambos os projetos.

### Componentes reutilizáveis e grupos

As receitas existentes agora compartilham componentes individuais de sinal, filtro e saída. Em **Estratégias → Combinações**, use **Adicionar estratégia** para escolher componentes e a categoria **Combinações cadastradas** no mesmo painel para incorporar uma cópia de outra combinação compatível com suas regras internas. Editar ou excluir a origem não altera o grupo incorporado. O catálogo e os cadastros anteriores continuam válidos; as restrições de execução Spot são mantidas.

Consulte o [guia de composição](docs/composicao_estrategias.md) para os papéis dos componentes, parâmetros, limites, compatibilidade e validação. Reinicie API, worker e frontend após atualizar os dois projetos.

### Catálogo e detalhes das estratégias

O menu **Estratégias** abre `#/strategies`, com as abas **Catálogo** e **Combinações**, seguindo o padrão visual de **Candles**. O catálogo reúne todas as estratégias e configurações salvas; a aba **Combinações** permite cadastrar e gerenciar combinações. A busca aceita nome, função, regras e identificador; o filtro separa estratégias individuais, combinações prontas e cadastros. No Catálogo, clique no nome da estratégia para consultar regras, limitações, parâmetros padrão, dados auxiliares necessários e componentes da receita. A coluna **Ações** aparece apenas quando os resultados visíveis contêm cadastros que podem ser excluídos. O retorno é contextual: **Voltar à lista de estratégias** mantém os filtros da origem; ao abrir um componente a partir de outro detalhe, **Voltar aos detalhes de [nome]** retorna à estratégia ou combinação anterior, inclusive após recarregar a página. Os detalhes de uma combinação cadastrada exibem os parâmetros salvos e os grupos incorporados com suas regras.

Combinações cadastradas podem ser editadas e excluídas a partir dos detalhes, ou excluídas diretamente na lista. A aba **Estratégias → Combinações** concentra o formulário de criação e edição; os cadastros são listados apenas no Catálogo. A exclusão segue a mesma validação das configurações personalizadas: a confirmação fica desabilitada durante a consulta, em caso de falha e enquanto houver processamentos vinculados, uso em outros grupos ou cópias sem origem confirmada. Os vínculos são verificados novamente antes de enviar DELETE; o histórico e as cópias existentes são preservados. A API e o demo também bloqueiam chamadas diretas com HTTP 409: `COMBINATION_IN_USE` para combinações cadastradas e `CONFIGURATION_IN_USE` para configurações personalizadas. Os padrões publicados do catálogo são preservados; use **Criar configuração personalizada** para salvar seus próprios valores.

### Configurações personalizadas de estratégias

Em **Estratégias → Detalhes**, clique em **Criar configuração personalizada**. Informe um nome, ajuste os parâmetros e salve. A ação **Restaurar padrões** repõe os valores do catálogo no formulário; o catálogo permanece inalterado. Configurações salvas podem ser reabertas, editadas e excluídas. O filtro **Configurações personalizadas** permite encontrá-las na lista.

No **Novo processamento**, escolha **Configuração ou combinação salva** e abra o painel de seleção. Busque por nome, estratégia base ou identificador, filtre por configurações personalizadas, receitas ou combinações livres e confirme em **Usar configuração**. Cancelar preserva o cadastro anterior; os dados auxiliares JSON aparecem como contagem de observações e podem ser inspecionados em **Ver dados auxiliares**, inicialmente recolhidos. Configurações de filtros e saídas são reutilizáveis no painel **Adicionar estratégia → Configurações personalizadas**, quando compatíveis; não são oferecidas para execução individual. Dados auxiliares JSON continuam específicos dos timestamps do dataset.

Os valores são persistidos pela API e cada processamento guarda seu snapshot, preservado após edição ou exclusão. O contrato `/strategy-combinations` aceita o tipo adicional `strategy` para estratégias individuais/clássicas, mantendo `preset` para receitas publicadas e `custom` para combinações livres. Atualize e reinicie API, worker e frontend juntos; cadastros anteriores não exigem migração.

A aba de combinações tem endereço `#/strategies?tab=combinations`. Os atalhos de edição e de retorno ao novo processamento abrem essa aba com seus parâmetros; o endereço antigo `#/combinations` continua aceito e é atualizado automaticamente. A troca entre abas preserva os filtros do catálogo e o rascunho da combinação em preenchimento.

## Ícones da interface

A interface usa [Bootstrap Icons](https://icons.getbootstrap.com/) 1.13.2, gratuito sob a [licença MIT](https://github.com/twbs/icons/blob/main/LICENSE), sem depender do framework Bootstrap. O CSS e as fontes são distribuídos localmente pelo Vite, sem CDN. A licença acompanha o build em `public/licenses/bootstrap-icons.txt`.

Use o componente `Icon` de `src/components/Icon.tsx` com um nome semântico (por exemplo, `add`, `delete`, `parameters` ou `run`) para manter a mesma ação reconhecível em todas as telas. Os ícones decorativos usam `aria-hidden`, os controles preservam seus rótulos e a animação de carregamento respeita a preferência por movimento reduzido.

## Listagem e exclusão de candles

A aba **Candles carregados** exibe a tabela ao lado do painel **Conjunto selecionado** em telas maiores, empilhando os painéis em telas menores. A listagem oferece busca por nome, par ou identificador, filtro por intervalo, contagem de resultados e ações no mesmo padrão do Catálogo de estratégias. Clique no nome do conjunto para selecioná-lo e criar uma sessão. A coluna **Ações** oferece somente a exclusão.

O popup de exclusão consulta todas as páginas de sessões e desabilita a confirmação enquanto verifica, quando há vínculos ou se a consulta falha. A checagem é repetida antes de enviar DELETE. A API e o modo demo também rejeitam conjuntos vinculados com HTTP 409 `DATASET_IN_USE`; excluir candles não remove sessões ou processamentos em cascata.

## Exclusão de sessões

Antes de excluir uma sessão, o popup consulta todos os seus processamentos, incluindo as páginas seguintes, e mantém a confirmação desabilitada durante a consulta, em caso de falha ou quando há vínculos. Os IDs encontrados aparecem na advertência. A verificação é repetida antes de enviar DELETE.

A API e o modo demo também rejeitam a exclusão com HTTP 409 `SESSION_IN_USE` enquanto houver qualquer processamento vinculado. Remova os processamentos por suas ações próprias antes de excluir a sessão; não há exclusão em cascata de processamentos e resultados a partir da sessão.

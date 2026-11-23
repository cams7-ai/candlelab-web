# Revisão das receitas e dos componentes individuais

A receita publicada executa suas regras em uma ordem definida. Uma composição livre pode reproduzir seu resultado quando usa os mesmos componentes, valores e opções de execução. Alterar as regras `all`/`any`, os parâmetros ou os grupos pode alterar o comportamento.

| Receita                                                           | Resultado da revisão                                                                                                                                                                                                                                                                                                                              |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Trend Following + ADX + ATR (`EMA_ADX_ATR@1`)                     | Parâmetros disponíveis em Direção EMA, Confirmação ADX e Saída trailing ATR; equivalência financeira verificada.                                                                                                                                                                                                                                  |
| RSI + Bollinger Bands (`RSI_BOLLINGER@1`)                         | Parâmetros disponíveis em Recuperação Bollinger e Recuperação RSI; equivalência financeira verificada.                                                                                                                                                                                                                                            |
| Breakout + Volume + ATR (`BREAKOUT_VOLUME_ATR@1`)                 | Parâmetros disponíveis nos componentes; equivalência financeira verificada, incluindo os valores compartilhados do stop e ATR.                                                                                                                                                                                                                    |
| MACD + EMA + RSI (`MACD_EMA_RSI@1`)                               | Parâmetros disponíveis em Sinal MACD, Preço acima da EMA e Faixa RSI; equivalência financeira verificada.                                                                                                                                                                                                                                         |
| Grid + ADX + ATR (`GRID_ADX_ATR@1`)                               | Faltavam o espaçamento ATR na grade individual e a ação de desativação pelo regime. Ambas as opções estão disponíveis; equivalência financeira verificada com a configuração descrita abaixo.                                                                                                                                                     |
| Momentum + Ranking de moedas (`MOMENTUM_RANKING@1`)               | Não há parâmetros ausentes nos componentes, mas a receita exige observações externas de `universe`. A composição livre OHLCV continua indisponível. Além de filtrar compras, a receita vende quando BTC perde elegibilidade; o componente individual de ranking atua como filtro de compra. Não se declara equivalência com uma composição livre. |
| SMA com confirmação RSI (`SMA_RSI_FILTER@1`, estratégia clássica) | Parâmetros disponíveis em SMA e Confirmação RSI; equivalência financeira verificada.                                                                                                                                                                                                                                                              |

## Reproduzir Grid + ADX + ATR

Na combinação livre, adicione **Grid Trading** e **Regime de grade ADX** e use compra **Todas** e venda **Qualquer uma**.

- Em Grid Trading, escolha **Modo de espaçamento → Por ATR** e preencha **Espaçamento ATR**. A distância entre os níveis é o ATR inicial multiplicado por esse valor e permanece congelada durante a execução.
- Em Regime de grade ADX, escolha **Ação ao atingir o ADX máximo → Desativar grade**. Quando a grade estiver inicializada, atingir o limite encerra a posição a mercado e impede novas compras, mesmo se o ADX voltar a cair.
- Use os mesmos valores da receita para stop, janela de análise, níveis, período do ATR, ADX máximo e espaçamento ATR. O formulário compartilha o período do ATR entre esses componentes.

O catálogo publica essas opções em `components[].parameter_overrides`. A tela de detalhes da receita mostra as opções necessárias ao lado dos componentes. O multiplicador de espaçamento da grade é diferente do multiplicador de um trailing stop; os campos não são unificados.

## Compatibilidade com cadastros existentes

Os padrões da grade individual continuam **Por níveis** e **Filtrar compras**. Dessa forma, configurações antigas sem os novos campos mantêm seu comportamento. Para mudar uma combinação existente, abra **Editar combinação**, selecione as opções desejadas e salve. O histórico das execuções e as cópias já incorporadas em outros grupos preservam seus valores anteriores.

Uma composição aceita somente uma grade em toda a árvore. Um regime com a ação **Desativar grade** exige uma grade na mesma composição; ela pode estar dentro de um grupo incorporado. Filtros externos ao grupo são avaliados antes da grade, sem usar observações futuras. As ordens limitadas e o dimensionamento continuam pertencendo à grade.

## Verificações

Os testes de `candlelab-api/tests/test_recipe_parity.py` verificam a cobertura de parâmetros de todas as receitas, comparam patrimônio por candle, resumo financeiro e fills nos cinco cenários determinísticos da regressão e em seis trajetórias reproduzíveis com parâmetros modificados. Também verificam o preço de uma ordem limitada com ATR, a causalidade dos indicadores, a desativação permanente por ADX e os padrões antigos. As receitas publicadas continuam cobertas pelos 110 resultados históricos de regressão.

Os testes do frontend cobrem edição, persistência, restauração por execução, validação das opções, orientação na receita e nomes das opções no PDF. Dados de ranking não são fabricados ou substituídos por candles OHLCV.

# Estratégias e dados auxiliares — 0.2.0

Implementação do tutorial `../candlelab-docs/tutorial_estrategias_cripto_candles/tutorial_estrategias_cripto_candles.md`.
São 12 individuais e seis combinações, além dos quatro IDs legados. Os marcadores e retornos selecionados do tutorial não foram usados como sinais do motor. Os limites e padrões que o tutorial não define são escolhas explícitas do simulador, editáveis no catálogo `GET /api/v1/strategies`.

## Entrada auxiliar

Em **Novo processamento**, selecione a estratégia e importe um arquivo JSON em **Importar dados auxiliares JSON**, ou edite o conteúdo no campo de texto. Não se importa um segundo dataset nessa tela: o arquivo pertence somente ao processamento e seu conteúdo é persistido em `parameters.auxiliary_json`. Para uso HTTP, esse campo é uma **string contendo o array JSON**, e não um objeto JSON aninhado. O exemplo abaixo mostra a construção sem escapes manuais:

```python
import json
from pathlib import Path

payload = {
    "strategy_id": "MACHINE_LEARNING@1",
    "parameters": {"auxiliary_json": Path("auxiliares.json").read_text()},
}
Path("processamento.json").write_text(json.dumps(payload))
```

```bash
curl -X POST http://localhost:8000/api/v1/sessions/SESSION_ID/runs \
  -H 'Content-Type: application/json' \
  --data-binary @processamento.json
```

O arquivo auxiliar deve conter exatamente uma observação para **cada abertura do dataset**, em ordem crescente, sem duplicatas, lacunas ou timestamps extras. Isso é verificado antes do enfileiramento. `open_time_ms` é inteiro Unix em milissegundos UTC. Demais valores numéricos são strings decimais sem expoente, até 24 dígitos/12 casas, módulo até 10¹². Preços e capacidade são positivos. Campos desconhecidos são rejeitados. Tamanho máximo: 8 MiB de texto; até 100.000 observações (a requisição também respeita o limite global configurado).

Quotes, universo e probabilidades de cada registro representam dados disponíveis na **abertura** indicada. A estratégia os consulta no fechamento desse candle. Uma decisão só executa no candle seguinte, usando o novo quote para ordens agressivas. Não há preenchimento de lacunas por repetição de observações. Para pairs trading, `eth_price` representa a abertura e `eth_close` o fechamento ETH do mesmo intervalo do candle BTC. O fechamento ETH só participa de decisões e marcação no fechamento, nunca de fills na abertura.

| Estratégia | Campos além de `open_time_ms` | Significado |
| --- | --- | --- |
| Scalping | `bid`, `ask`, `flow`, `capacity_base` | Livro do mercado; fluxo normalizado em [-1,1]; capacidade executável em BTC |
| Arbitragem | `bid`, `ask`, `bid_b`, `ask_b`, `capacity_base` | Quotes de A e B e menor capacidade executável das duas pernas |
| Market Making | `bid`, `ask`, `capacity_base`, `maker_buy_filled`, `maker_sell_filled` | Flags booleanas confirmam execução da **ordem cotada no fechamento anterior** ao preço anterior; sem flag não há fill |
| Pairs Trading | `eth_price`, `eth_close` | ETH/USDT sincronizado, abertura e fechamento |
| Machine Learning | `probability`, `trained_until_ms`, `model_id` | Probabilidade em [0,1], fim do treino estritamente anterior à observação e identificação da fonte/modelo |
| Momentum + Ranking | `universe` | Mapa de símbolos com `roc` em pontos percentuais e `liquidity` em USDT; BTCUSDT e pelo menos outro ativo |

O universo deve usar a mesma janela de ROC e definição de liquidez em todos os ativos. O ranking ordena ROC decrescente, desempata por símbolo e exclui liquidez insuficiente. Pairs e ranking exigem dataset BTCUSDT. ML **consome** probabilidades de um modelo externo; não treina um modelo, nem verifica se a declaração de treino/calibração é verdadeira. A origem das observações, sua disponibilidade temporal e a validação fora da amostra são responsabilidade do fornecedor dos dados. Nenhum dado é buscado ou inventado automaticamente para substituir o arquivo.

Exemplo mínimo de uma observação de ML (repetir com valores disponíveis para cada timestamp do dataset):

```json
[
  {
    "open_time_ms": 1787097600000,
    "probability": "0.65",
    "trained_until_ms": 1787000000000,
    "model_id": "modelo-validado-versao-1"
  }
]
```

Exemplo de ranking:

```json
[
  {
    "open_time_ms": 1787097600000,
    "universe": {
      "BTCUSDT": {"roc": "2.5", "liquidity": "10000000"},
      "ETHUSDT": {"roc": "1.2", "liquidity": "8000000"}
    }
  }
]
```

Veja o schema de cada observação em `auxiliary.schema.json`. O arquivo `auxiliares-sinteticos.json` contém todos os campos para os 40 candles de `candles-sinteticos.json`, disponíveis em `docs/examples/` na API e em `public/` no Web. São dados **fabricados para testar importação**, com probabilidades arbitrárias e flags artificiais, não evidência de calibração nem de liquidez real. Importe primeiro esses candles como BTCUSDT/5m, crie uma sessão e depois importe o auxiliar. O arquivo não corresponde à sessão demo de 180 candles nem aos datasets do tutorial. A combinação de arquivos com períodos distintos é rejeitada.

## Execução, risco e contabilidade

- **Legadas:** mantêm `CANDLELAB_ENGINE@1` e `NEXT_OPEN_ALL_IN_KEEP_OPEN@1`. Nas novas, o snapshot registra `CANDLELAB_ENGINE@2` e `TUTORIAL_NEXT_OPEN_LIMITS_COLLATERAL@1`. IDs e parâmetros anteriores permanecem utilizáveis.
- **Indicadores:** EMA inicia com SMA; ATR e ADX usam Wilder; Bollinger usa desvio padrão populacional; VWAP usa preço típico ponderado pelo volume, reiniciando por dia UTC; MACD usa 12/26/9; ROC é variação percentual. Janelas de rompimento e volume excluem o candle da decisão. Aquecimento é `null`; não há consulta a candles futuros.
- **Ordens:** sinal no fechamento e tentativa de execução no candle seguinte. Ordem agressiva usa abertura, ou ask/bid auxiliares no scalping. Stop percentual e trailing ATR são avaliados no **fechamento**, com execução na abertura seguinte; não há garantia de execução no preço do stop. A posição final permanece aberta, marcada a mercado.
- **DCA:** três orçamentos exatos de `caixa_inicial/3`, cada um incluindo a taxa de compra; quantidade arredondada para baixo pelo passo. O parâmetro `start_index=1` significa decisão no primeiro fechamento e primeira tentativa na segunda abertura. `every_candles` conta candles, não dias. DCA não força venda. Se faltar caixa ou quantidade mínima, a compra é diagnosticada e só é tentada novamente numa data agendada enquanto houver parcelas não preenchidas.
- **Grid:** a faixa é congelada com os extremos da primeira janela pronta. Há **um lote de inventário e uma ordem por candle**, com orçamento inicial/número de níveis. Compra limitada no centro menos um espaçamento; vende o lote um espaçamento acima do preço executado. Na combinação, espaçamento é ATR × múltiplo e só ativa com ADX abaixo do limite. A grade é desligada definitivamente em rompimento ou ADX forte, liquidando inventário na próxima abertura. Não representa uma grade com várias ordens simultâneas.
- **Limites grid:** ordens duram um candle; compra se mínima <= limite e venda se máxima >= limite. Se a abertura já for favorável, usa a abertura; caso contrário, usa o limite. Nesse último caso, a ocorrência é registrada conservadoramente no fechamento, pois o OHLC não revela o instante intrabar. Não se assume sequência de vários fills no mesmo candle, fila ou preenchimentos parciais.
- **Arbitragem:** escolhe a direção A→B ou B→A e, na abertura seguinte, revalida margem líquida após taxas de ambas as pernas e custo adicional proporcional ao valor da compra. Sem margem, registra `NET_EDGE_DISAPPEARED`. As duas pernas são atômicas na simulação, limitadas pelo caixa e `capacity_base`. Supõe inventário e caixa pré-financiados nos mercados; não modela transferências, falha de uma perna nem rebalanceamento entre contas. `closed_trades` conta operações completas, não pernas isoladas.
- **Market making:** cotação passiva permanece por um candle. O preço é o bid/ask conhecido na decisão anterior; flags de execução são evidência externa específica dessa ordem. Compras são limitadas pela capacidade, e vendas de inventário acima dela ficam sem execução. Stop muda a saída para ordem agressiva no bid da abertura seguinte. O motor não infere prioridade na fila a partir de candles.
- **Pairs:** z-score da razão entre fechamentos BTC/ETH; compra BTC e toma ETH emprestado para vender com nocionais próximos, arredondados pelos passos. Usa aproximadamente metade do caixa inicial em BTC e mantém o restante como colateral; passo ETH simulado é 0.000001. Taxas incidem nas quatro operações (duas de entrada e duas de saída); empréstimo é cobrado por candle com posição aberta, sobre ETH marcado no fechamento. O caixa inclui o produto bloqueado da venda de ETH: **não é saldo livre para outras operações**. Marca patrimônio como caixa + BTC − dívida ETH. `final_position_value` é o valor líquido das duas pernas e `final_position_qty` informa BTC; as quantidades de BTC e dívida ETH aparecem nos indicadores. O histórico identifica `asset=BTC/ETH`. Flags de margem geram saída na próxima abertura se o patrimônio cair abaixo de um quarto do total dos nocionais de entrada. Saldo/patrimônio negativo ou magnitude excessiva encerram o processamento com erro de colateral, em vez de ocultar insolvência. Não há engine de derivativos, funding ou garantia de liquidação intrabar.
- **Precisão:** indicadores Decimal com 50 dígitos; contabilidade com 120. Taxas/valores são strings decimais. Em pairs, custo de empréstimo entra em taxas e P&L realizado no próprio candle; P&L não realizado corresponde à marcação das duas pernas e custos de entrada. A taxa de acerto da operação inclui o empréstimo acumulado.
- **Limitações de custos:** fora dos custos explicitados, não há spread, slippage, impostos, lotes mínimos reais ou impacto de mercado. O motor aplica o passo simulado, sem afirmar equivalência com filtros da exchange. Dados importados podem continuar contendo viés ou informações retrospectivas; validação estrutural não os torna dados de produção.

## Catálogo e padrões

O endpoint é a fonte dos parâmetros, limites e defaults efetivos. A tabela abaixo registra as regras entregues; o tutorial é conceitual e não especifica todos os limiares. Estes padrões são hipóteses do laboratório, sem otimização a partir dos exemplos positivos.

| ID | Regras | Padrões (exceto auxiliar) |
| --- | --- | --- |
| `TREND_FOLLOWING@1` | EMA curta cruza acima da longa e preço acima de ambas; saída ao perder EMA longa. | `{"stop_pct": "3", "short_window": 8, "long_window": 21}` |
| `MOMENTUM@1` | ROC positivo crescente, EMA ascendente e volume acima da média anterior; saída na desaceleração. | `{"stop_pct": "3", "roc_period": 5, "ema_period": 10, "volume_period": 20}` |
| `MEAN_REVERSION@1` | Retorno à banda inferior com ADX baixo; saída na média. | `{"stop_pct": "3", "period": 20, "deviations": "2", "adx_period": 14, "adx_limit": "25"}` |
| `GRID_TRADING@1` | Grade congelada na primeira janela; uma ordem por candle e um lote de inventário por ciclo. | `{"stop_pct": "3", "lookback": 20, "levels": 5}` |
| `BREAKOUT@1` | Fechamento acima da máxima anterior com filtro ATR; saída no nível rompido ou trailing ATR. | `{"stop_pct": "3", "lookback": 20, "atr_period": 14, "atr_multiple": "2", "min_atr_pct": "0.1"}` |
| `SWING_TRADING@1` | Reação a suporte anterior com SMA20 e retorno/risco mínimo; saída na resistência. | `{"stop_pct": "3", "lookback": 20, "min_reward_risk": "2"}` |
| `SCALPING@1` | Recuperação da VWAP diária UTC com spread estreito e fluxo positivo; alvo/stop/tempo. | `{"stop_pct": "3", "max_spread_bps": "10", "target_pct": "0.5", "max_hold": 3}` |
| `ARBITRAGE@1` | Compra no ask de A e venda simultânea no bid de B, ou direção inversa, se margem líquida positiva. | `{"min_edge_bps": "1", "transfer_rate": "0"}` |
| `DCA@1` | Três compras de orçamento igual (caixa inicial/3 incluindo taxa); não força venda. | `{"every_candles": 24, "start_index": 1}` |
| `MARKET_MAKING@1` | Cotação passiva no bid/ask observado; próxima observação confirma fill explícito da ordem anterior. | `{"stop_pct": "3"}` |
| `PAIRS_TRADING@1` | Z-score causal BTC/ETH: compra BTC e vende ETH a descoberto com nocionais iguais; encerra as duas pernas na normalização/stop. | `{"stop_pct": "3", "period": 20, "entry_z": "2", "stop_z": "4", "borrow_rate_per_candle": "0.00001"}` |
| `MACHINE_LEARNING@1` | Compra acima do limiar externo; vende abaixo do limiar de saída ou stop. | `{"stop_pct": "3", "buy_probability": "0.6", "sell_probability": "0.5"}` |
| `EMA_ADX_ATR@1` | EMA curta acima da longa, ADX forte e confirmação de alta; saída por trailing ATR. | `{"stop_pct": "3", "short_window": 8, "long_window": 21, "atr_period": 14, "atr_multiple": "2", "adx_limit": "25"}` |
| `RSI_BOLLINGER@1` | RSI cruza recuperação e preço retorna à banda inferior no mesmo candle; saída na média. | `{"stop_pct": "3", "period": 20, "deviations": "2", "rsi_period": 14, "recovery": "30"}` |
| `BREAKOUT_VOLUME_ATR@1` | Rompimento da máxima anterior com volume maior que média anterior; saída no nível/trailing ATR. | `{"stop_pct": "3", "lookback": 20, "atr_period": 14, "atr_multiple": "2", "min_atr_pct": "0.1", "volume_period": 20, "volume_multiple": "1"}` |
| `MACD_EMA_RSI@1` | MACD12/26 cruza sinal9, preço acima EMA21 e RSI na faixa; saída na perda de força MACD. | `{"stop_pct": "3", "ema_period": 21, "rsi_period": 14, "rsi_min": "40", "rsi_max": "70"}` |
| `GRID_ADX_ATR@1` | Grade em regime ADX baixo, espaçamento ATR congelado; desliga em rompimento ou ADX forte. | `{"stop_pct": "3", "lookback": 20, "levels": 5, "atr_period": 14, "adx_limit": "20", "atr_multiple": "1"}` |
| `MOMENTUM_RANKING@1` | Momentum confirmado e BTC elegível no ranking de ROC de universo líquido; sai quando perde seleção. | `{"stop_pct": "3", "roc_period": 5, "ema_period": 10, "volume_period": 20, "top_n": 3, "min_liquidity": "1000000", "min_roc": "0"}` |

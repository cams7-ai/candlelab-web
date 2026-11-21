import { componentCatalog, recipeComponents } from "./componentCatalog";
import { tutorialCatalog } from "./tutorialCatalog";
import type {
  Candle,
  Dataset,
  Equity,
  Indicator,
  Run,
  Session,
  Strategy,
  Summary,
  TradeEvent,
} from "../types";
export const start = Date.UTC(2026, 7, 19);
export const candles: Candle[] = Array.from({ length: 180 }, (_, i) => {
  const open = 64100 + i * 3 + Math.sin(i / 9) * 130;
  const close = open + Math.sin(i * 2.1) * 30;
  return {
    open_time_ms: start + i * 300000,
    close_time_ms: start + (i + 1) * 300000 - 1,
    open: open.toFixed(2),
    close: close.toFixed(2),
    high: (Math.max(open, close) + 19).toFixed(2),
    low: (Math.min(open, close) - 17).toFixed(2),
    base_volume: (2 + (i % 8) / 10).toFixed(3),
  };
});
export const dataset: Dataset = {
  id: "demo-btc",
  source: "SYNTHETIC",
  symbol: "BTCUSDT",
  interval: "5m",
  base_asset: "BTC",
  quote_asset: "USDT",
  candle_count: candles.length,
  first_open_time_ms: start,
  last_open_time_ms: candles.at(-1)!.open_time_ms,
  content_hash: "synthetic-demo-v1",
};
export const session: Session = {
  id: "demo-session",
  name: "BTC · Agosto 2026",
  dataset_id: dataset.id,
  initial_cash: "1000.00",
  fee_rate: "0.001",
};
const integer = (title: string, defaultValue: number) => ({
  type: "integer" as const,
  title,
  minimum: 1,
  maximum: 500,
  default: defaultValue,
});
const decimal = (title: string, defaultValue: string) => ({
  type: "string" as const,
  title,
  minimum: 0,
  maximum: 100,
  default: defaultValue,
});
const strategyCatalog: Strategy[] = [
  {
    id: "SMA_CROSS@1",
    name: "SMA",
    parameters_schema: {
      properties: {
        short_window: integer("SMA curta", 9),
        long_window: integer("SMA longa", 21),
      },
    },
    defaults: { short_window: 9, long_window: 21 },
  },
  {
    id: "EMA_CROSS@1",
    name: "EMA",
    parameters_schema: {
      properties: {
        short_window: integer("EMA curta", 9),
        long_window: integer("EMA longa", 21),
      },
    },
    defaults: { short_window: 9, long_window: 21 },
  },
  {
    id: "RSI_REVERSION@1",
    name: "RSI",
    parameters_schema: {
      properties: {
        period: integer("Período do RSI", 14),
        oversold: decimal("Sobrevenda", "30"),
        overbought: decimal("Sobrecompra", "70"),
      },
    },
    defaults: { period: 14, oversold: "30", overbought: "70" },
  },
  {
    id: "SMA_RSI_FILTER@1",
    name: "SMA + RSI",
    parameters_schema: {
      properties: {
        short_window: integer("SMA curta", 9),
        long_window: integer("SMA longa", 21),
        rsi_period: integer("Período do RSI", 14),
        rsi_confirmation_min: decimal("Confirmação mínima do RSI", "50"),
      },
    },
    defaults: {
      short_window: 9,
      long_window: 21,
      rsi_period: 14,
      rsi_confirmation_min: "50",
    },
  },
  ...tutorialCatalog,
  ...componentCatalog,
];
export const strategies: Strategy[] = strategyCatalog.map((strategy) => ({
  ...strategy,
  components: recipeComponents[strategy.id] ?? [],
}));
export const summary: Summary = {
  initial_cash: "1000.00",
  final_cash: "1024.80",
  final_position_qty: "0",
  final_position_value: "0.00",
  initial_equity: "1000.00",
  final_equity: "1024.80",
  total_fees: "4.20",
  realized_pnl: "24.80",
  unrealized_pnl: "0.00",
  return_pct: "2.48",
  buy_fills: 2,
  sell_fills: 2,
  closed_trades: 2,
  win_rate_pct: "50",
  max_drawdown_pct: "1.35",
};
export const runs: Run[] = [
  {
    id: "demo-sma-rsi",
    session_id: session.id,
    strategy_id: "SMA_RSI_FILTER@1",
    parameters: strategies[3].defaults,
    status: "completed",
    summary,
    error: null,
  },
  {
    id: "demo-ema",
    session_id: session.id,
    strategy_id: "EMA_CROSS@1",
    parameters: strategies[1].defaults,
    status: "completed",
    summary: {
      ...summary,
      final_cash: "1018.40",
      final_equity: "1018.40",
      realized_pnl: "18.40",
      return_pct: "1.84",
      total_fees: "4.10",
      max_drawdown_pct: "1.62",
    },
    error: null,
  },
];
export function makeSeries(run: Run, data: Candle[]) {
  const indicators: Indicator[] = data.map((c, i) => {
    const values: Indicator["values"] = {};
    const prefix = run.strategy_id.startsWith("EMA")
      ? "ema"
      : run.strategy_id.startsWith("SMA")
        ? "sma"
        : null;
    if (prefix) {
      values[prefix + "_short"] =
        i < Number(run.parameters.short_window ?? 9)
          ? null
          : (Number(c.close) - 25).toFixed(2);
      values[prefix + "_long"] =
        i < Number(run.parameters.long_window ?? 21)
          ? null
          : (Number(c.close) - 65).toFixed(2);
    }
    if (run.strategy_id.includes("RSI"))
      values.rsi =
        i < Number(run.parameters.rsi_period ?? run.parameters.period ?? 14)
          ? null
          : (50 + Math.sin(i / 12) * 24).toFixed(2);
    return { open_time_ms: c.open_time_ms, values };
  });
  const events: TradeEvent[] = [28, 60, 98, 145]
    .filter((i) => i + 1 < data.length)
    .flatMap<TradeEvent>((index, n) => {
      const side = n % 2 === 0 ? "BUY" : "SELL";
      const signalId = run.id + "-signal-" + n;
      return [
        {
          id: signalId,
          seq: n * 2,
          kind: "signal" as const,
          side,
          open_time_ms: data[index].open_time_ms,
          occurred_at_ms: data[index].close_time_ms,
        },
        {
          id: run.id + "-fill-" + n,
          seq: n * 2 + 1,
          kind: "fill" as const,
          side,
          open_time_ms: data[index + 1].open_time_ms,
          occurred_at_ms: data[index + 1].open_time_ms,
          price: data[index + 1].open,
          quantity: "0.005",
          signal_id: signalId,
        },
      ];
    });
  if (data.length)
    events.push({
      id: run.id + "-skipped",
      seq: 99,
      kind: "skipped",
      side: "BUY",
      open_time_ms: data.at(-1)!.open_time_ms,
      occurred_at_ms: data.at(-1)!.close_time_ms,
      reason: "NO_FUTURE_OPEN",
    });
  const equity: Equity[] = data.map((c, i) => ({
    open_time_ms: c.open_time_ms,
    equity: (
      Number(run.summary?.initial_equity ?? "1000") +
      ((Number(run.summary?.final_equity ?? "1024.8") -
        Number(run.summary?.initial_equity ?? "1000")) *
        i) /
        Math.max(1, data.length - 1)
    ).toFixed(2),
  }));
  return {
    indicators,
    events: run.summary?.buy_fills || run.summary?.sell_fills ? events : [],
    equity,
  };
}

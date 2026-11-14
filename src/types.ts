export type Decimal = string;
export interface Page<T> {
  items: T[];
  next_cursor: string | null;
}
export interface Instrument {
  symbol: string;
  base_asset: string;
  quote_asset: string;
  intervals: string[];
}
export interface Dataset {
  id: string;
  source: string;
  symbol: string;
  interval: string;
  base_asset: string;
  quote_asset: string;
  candle_count: number;
  first_open_time_ms: number;
  last_open_time_ms: number;
  content_hash: string;
}
export interface Candle {
  open_time_ms: number;
  close_time_ms: number;
  open: Decimal;
  high: Decimal;
  low: Decimal;
  close: Decimal;
  base_volume: Decimal;
}
export interface Session {
  id: string;
  name: string;
  dataset_id: string;
  initial_cash: Decimal;
  fee_rate: Decimal;
}
export interface ParameterSchema {
  type: "integer" | "number" | "string";
  title?: string;
  minimum?: number;
  maximum?: number;
  exclusiveMinimum?: number;
  exclusiveMaximum?: number;
  default?: string | number;
  pattern?: string;
}
export interface Strategy {
  id: string;
  name: string;
  parameters_schema: {
    type?: string;
    properties: Record<string, ParameterSchema>;
    required?: string[];
  };
  defaults: Record<string, string | number>;
}
export interface ApiErrorBody {
  error: { code: string; message: string; details: unknown };
}
export interface Summary {
  initial_cash: Decimal;
  final_cash: Decimal;
  final_position_qty: Decimal;
  final_position_value: Decimal;
  initial_equity: Decimal;
  final_equity: Decimal;
  total_fees: Decimal;
  realized_pnl: Decimal;
  unrealized_pnl: Decimal;
  return_pct: Decimal;
  buy_fills: number;
  sell_fills: number;
  closed_trades: number;
  win_rate_pct: Decimal | null;
  max_drawdown_pct: Decimal;
}
export interface Run {
  id: string;
  session_id: string;
  strategy_id: string;
  parameters: Record<string, string | number>;
  status: "queued" | "running" | "completed" | "failed";
  summary: Summary | null;
  error: ApiErrorBody | null;
}
export interface Indicator {
  open_time_ms: number;
  values: Record<string, Decimal | null>;
}
export interface Equity {
  open_time_ms: number;
  equity: Decimal;
}
export interface TradeEvent {
  id: string;
  seq: number;
  kind: "signal" | "fill" | "skipped";
  side: "BUY" | "SELL";
  open_time_ms: number;
  occurred_at_ms: number;
  signal_id?: string;
  price?: Decimal;
  quantity?: Decimal;
  reason?: string;
}
export interface BinanceInput {
  symbol: string;
  interval: string;
  startTime?: string;
  endTime?: string;
  limit?: number;
}

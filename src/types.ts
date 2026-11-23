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
  name?: string;
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
  enum?: string[];
  "x-enum-labels"?: Record<string, string>;
  description?: string;
  contentMediaType?: string;
  "x-min"?: string;
  "x-max"?: string;
  "x-decimal-minimum"?: string;
  "x-decimal-maximum"?: string;
  "x-decimal-exclusiveMinimum"?: string;
  "x-decimal-exclusiveMaximum"?: string;
  maxLength?: number;
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
  composition_role?: "signal" | "filter" | "exit";
  components?: {
    strategy_id: string;
    role: "signal" | "filter" | "exit";
    parameter_overrides?: Record<string, string | number>;
  }[];
  combinable?: boolean;
  category?: "legacy" | "individual" | "combination";
  rules?: string;
  limitations?: string;
  required_data?: string[];
  id: string;
  name: string;
  parameters_schema: {
    title?: string;
    additionalProperties?: boolean;
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
  combination_snapshot?: StrategyCombination | null;
  id: string;
  session_id: string;
  strategy_id: string;
  parameters: Record<string, string | number>;
  auxiliary_filename?: string | null;
  status: "queued" | "running" | "completed" | "failed";
  summary: Summary | null;
  error: ApiErrorBody | null;
}
export interface CombinationMember {
  combination?: CombinationDefinition | null;
  strategy_id: string;
  parameters: Record<string, string | number>;
}
export interface CombinationDefinition {
  name: string;
  kind: "preset" | "custom" | "strategy";
  strategy_id: string | null;
  parameters: Record<string, string | number>;
  members: CombinationMember[];
  buy_rule: "all" | "any";
  sell_rule: "all" | "any";
}
export interface StrategyCombination extends CombinationDefinition {
  id: string;
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
  asset?: string | null;
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

import type { BinanceInput, Dataset, ParameterSchema, Strategy } from "./types";
export function candleDatasetName(
  symbol: string,
  interval: string,
  start: number,
  end: number,
) {
  const stamp = (ms: number) =>
    new Date(ms).toISOString().slice(0, 16).replace(":", "") + "Z";
  return `${symbol.toLowerCase()}_${interval}_${stamp(start)}_${stamp(end)}`;
}
export function datasetName(dataset: Dataset) {
  return (
    dataset.name ||
    candleDatasetName(
      dataset.symbol,
      dataset.interval,
      dataset.first_open_time_ms,
      dataset.last_open_time_ms,
    )
  );
}
export function decimal(value: string) {
  const normalized = value.trim().replace(",", ".");
  if (!/^\d+(\.\d+)?$/.test(normalized))
    throw new Error(
      "Informe um valor decimal válido, sem separador de milhares.",
    );
  return normalized;
}
export function percentToRate(value: string) {
  const [whole, fraction = ""] = decimal(value).split(".");
  const digits = (whole + fraction).padStart(fraction.length + 3, "0");
  const cut = digits.length - fraction.length - 2;
  return (
    digits.slice(0, cut).replace(/^0+(?=\d)/, "") +
    "." +
    digits.slice(cut)
  )
    .replace(/0+$/, "")
    .replace(/\.$/, "");
}
export function rateToPercent(value: string) {
  const [whole, fraction = ""] = value.split(".");
  const padded = fraction.padEnd(2, "0");
  return (
    (whole + padded.slice(0, 2)).replace(/^0+(?=\d)/, "") +
    (padded.slice(2) ? "." + padded.slice(2) : "")
  );
}
export function format(value: string | number | null | undefined) {
  return value == null ? "Indisponível" : String(value).replace(".", ",");
}
export function utc(ms: number) {
  return new Date(ms)
    .toISOString()
    .replace("T", " ")
    .replace(/(?:\.000)?Z$/, " UTC");
}
export function iso(value: string) {
  if (!value) return undefined;
  const normalized = value.endsWith("Z") ? value : value + "Z";
  const date = new Date(normalized);
  if (!Number.isFinite(date.getTime())) throw new Error("Data UTC inválida.");
  return date.toISOString().slice(0, 19) + "Z";
}
export function binanceInput(
  symbol: string,
  interval: string,
  start: string,
  end: string,
  limit: string,
): BinanceInput {
  const input: BinanceInput = { symbol, interval };
  if (start) input.startTime = iso(start);
  if (end) input.endTime = iso(end);
  if (input.startTime && input.endTime && input.startTime > input.endTime)
    throw new Error("O início deve ser anterior ou igual ao fim.");
  if (limit) {
    const n = Number(limit);
    if (!Number.isInteger(n) || n < 1 || n > 1000)
      throw new Error("O limite deve ser um inteiro de 1 a 1000.");
    input.limit = n;
  }
  return input;
}
export function parameterDisplayValue(
  value: string | number,
  schema?: ParameterSchema,
) {
  return schema?.["x-enum-labels"]?.[String(value)] ?? value;
}

export function parameterValue(value: string, schema: ParameterSchema) {
  if (schema.enum) {
    if (!schema.enum.includes(value))
      throw new Error("Selecione uma opção válida do catálogo.");
    return value;
  }
  if (schema.maxLength != null && value.length > schema.maxLength)
    throw new Error("Parâmetro excede o tamanho máximo do catálogo.");
  if (schema.contentMediaType === "application/json") {
    let parsed: unknown;
    try {
      parsed = JSON.parse(value);
    } catch {
      throw new Error("Dados auxiliares: JSON inválido.");
    }
    if (!Array.isArray(parsed) || parsed.length === 0)
      throw new Error(
        "Importe uma lista JSON não vazia de observações auxiliares.",
      );
    return value;
  }
  const normalized = value.trim().replace(",", ".");
  if (!/^-?\d+(\.\d+)?$/.test(normalized))
    throw new Error("Informe um parâmetro numérico válido.");
  const number = Number(normalized);
  if (schema.type === "integer" && !Number.isInteger(number))
    throw new Error("Informe um número inteiro.");
  if (
    (schema.minimum != null && number < schema.minimum) ||
    (schema.maximum != null && number > schema.maximum) ||
    (schema.exclusiveMinimum != null && number <= schema.exclusiveMinimum) ||
    (schema.exclusiveMaximum != null && number >= schema.exclusiveMaximum)
  )
    throw new Error("Parâmetro fora dos limites do catálogo.");
  if (
    (schema["x-min"] != null && number < Number(schema["x-min"])) ||
    (schema["x-max"] != null && number > Number(schema["x-max"]))
  )
    throw new Error("Parâmetro fora dos limites do catálogo.");
  if (
    (schema["x-decimal-minimum"] != null &&
      number < Number(schema["x-decimal-minimum"])) ||
    (schema["x-decimal-maximum"] != null &&
      number > Number(schema["x-decimal-maximum"])) ||
    (schema["x-decimal-exclusiveMinimum"] != null &&
      number <= Number(schema["x-decimal-exclusiveMinimum"])) ||
    (schema["x-decimal-exclusiveMaximum"] != null &&
      number >= Number(schema["x-decimal-exclusiveMaximum"]))
  )
    throw new Error("Parâmetro fora dos limites do catálogo.");
  if (schema.pattern && !new RegExp(schema.pattern).test(normalized))
    throw new Error("Formato de parâmetro inválido.");
  return schema.type === "string" ? normalized : number;
}
export const labels: Record<string, string> = {
  short_window: "Janela curta",
  long_window: "Janela longa",
  period: "Período do RSI",
  rsi_period: "Período do RSI",
  oversold: "Sobrevenda",
  overbought: "Sobrecompra",
  rsi_confirmation_min: "Confirmação mínima do RSI",
};

// Localize the generated catalog titles once for forms, summaries and reports.
// Specific titles supplied in Portuguese retain the catalog's wording.
const parameterTitleTranslations: Record<string, string> = {
  "short window": "Janela curta",
  "long window": "Janela longa",
  "roc period": "Período do ROC",
  "ema period": "Período da EMA",
  "volume period": "Período do volume",
  "adx period": "Período do ADX",
  "atr period": "Período do ATR",
  "rsi period": "Período do RSI",
  period: "Período",
  lookback: "Janela de análise",
  levels: "Número de níveis",
  "trailing atr": "Multiplicador do stop móvel por ATR",
  "max hold": "Duração máxima (candles)",
  "every candles": "Intervalo entre aportes (candles)",
  "start index": "Índice inicial",
  "top n": "Quantidade de ativos selecionados",
};

export function parameterLabel(key: string, strategy?: Strategy): string {
  const title = strategy?.parameters_schema.properties[key]?.title;
  if (title != null)
    return parameterTitleTranslations[title.trim().toLowerCase()] ?? title;
  return labels[key] ?? key;
}

export function strategyParameters(
  strategy: Strategy,
  values: Record<string, string | number>,
) {
  const parameters = Object.fromEntries(
    Object.entries(strategy.parameters_schema.properties).map(
      ([key, schema]) => [
        key,
        parameterValue(
          String(values[key] ?? strategy.defaults[key] ?? schema.default ?? ""),
          schema,
        ),
      ],
    ),
  );
  for (const [lower, upper, message] of [
    [
      "short_window",
      "long_window",
      "Exija janela curta menor que janela longa.",
    ],
    ["oversold", "overbought", "Exija sobrevenda menor que sobrecompra."],
    ["rsi_min", "rsi_max", "Exija RSI mínimo menor que RSI máximo."],
    [
      "sell_probability",
      "buy_probability",
      "Exija probabilidade de saída menor que a de entrada.",
    ],
    ["entry_z", "stop_z", "Exija Z-score de entrada menor que o de stop."],
  ]) {
    if (
      parameters[lower] != null &&
      parameters[upper] != null &&
      Number(parameters[lower]) >= Number(parameters[upper])
    )
      throw new Error(message);
  }
  return parameters;
}

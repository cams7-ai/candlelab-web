import { http, HttpResponse } from "msw";
import {
  candles,
  dataset,
  session,
  runs,
  strategies,
  summary,
  makeSeries,
} from "./fixtures";
import type { BinanceInput, Candle, Dataset, Run, Session } from "../types";
import { candleDatasetName } from "../utils";
interface Store {
  datasets: Dataset[];
  sessions: Session[];
  runs: Run[];
  candles: Record<string, Candle[]>;
}
const storageKey = "candlelab-demo-v1";
function seed(): Store {
  return structuredClone({
    datasets: [dataset],
    sessions: [session],
    runs,
    candles: { [dataset.id]: candles },
  });
}
function restore(): Store {
  try {
    const raw =
      typeof localStorage !== "undefined"
        ? localStorage.getItem(storageKey)
        : null;
    return raw ? JSON.parse(raw) : seed();
  } catch {
    return seed();
  }
}
let store = restore();
let polls: Record<string, number> = {};
export function resetStore() {
  store = seed();
  polls = {};
  save();
}
function save() {
  if (typeof localStorage !== "undefined")
    localStorage.setItem(storageKey, JSON.stringify(store));
}
const base = "*/api/v1";
const error = (status: number, message: string, details: unknown = null) =>
  HttpResponse.json(
    {
      error: {
        code:
          status === 422
            ? "VALIDATION_ERROR"
            : status === 404
              ? "NOT_FOUND"
              : "UNAVAILABLE",
        message,
        details,
      },
    },
    { status },
  );
function page<T>(items: T[], request: Request) {
  const url = new URL(request.url);
  const from = Number(url.searchParams.get("cursor") || 0);
  const limit = Number(url.searchParams.get("limit") || 75);
  return HttpResponse.json({
    items: items.slice(from, from + limit),
    next_cursor: from + limit < items.length ? String(from + limit) : null,
  });
}
function storeDataset(
  symbol: string,
  interval: string,
  data: Candle[],
  source: string,
  name?: string,
) {
  const item: Dataset = {
    id: crypto.randomUUID(),
    name:
      name ||
      candleDatasetName(
        symbol,
        interval,
        data[0].open_time_ms,
        data.at(-1)!.open_time_ms,
      ),
    symbol,
    interval,
    source,
    base_asset: symbol.replace(/USDT$/, ""),
    quote_asset: "USDT",
    candle_count: data.length,
    first_open_time_ms: data[0].open_time_ms,
    last_open_time_ms: data.at(-1)!.open_time_ms,
    content_hash: "synthetic-" + crypto.randomUUID(),
  };
  store.datasets.push(item);
  store.candles[item.id] = data;
  save();
  return item;
}
export const handlers = [
  http.get(base + "/instruments", () =>
    HttpResponse.json({
      items: [
        {
          symbol: "BTCUSDT",
          base_asset: "BTC",
          quote_asset: "USDT",
          intervals: ["5m", "1m", "1h"],
        },
        {
          symbol: "ETHUSDT",
          base_asset: "ETH",
          quote_asset: "USDT",
          intervals: ["5m", "1m", "1h"],
        },
      ],
    }),
  ),
  http.get(base + "/strategies", () =>
    HttpResponse.json({ items: strategies }),
  ),
  http.get(base + "/datasets", ({ request }) => page(store.datasets, request)),
  http.post(base + "/datasets/binance", async ({ request }) => {
    const body = (await request.json()) as BinanceInput;
    if (
      !body.symbol ||
      !body.interval ||
      (body.limit != null &&
        (!Number.isInteger(body.limit) || body.limit < 1 || body.limit > 1000))
    )
      return error(422, "Consulta inválida.", { field: "limit" });
    const durations: Record<string, number> = {
      "1m": 60000,
      "5m": 300000,
      "15m": 900000,
      "1h": 3600000,
      "1d": 86400000,
    };
    const step = durations[body.interval] ?? 300000;
    const first = body.startTime
      ? Date.parse(body.startTime)
      : body.endTime
        ? Date.parse(body.endTime) - ((body.limit ?? 500) - 1) * step
        : startTime();
    const count = Math.max(
      1,
      Math.min(
        body.limit ?? 500,
        body.endTime
          ? Math.floor((Date.parse(body.endTime) - first) / step) + 1
          : 500,
      ),
    );
    const data = Array.from({ length: count }, (_, i) => ({
      ...candles[i % candles.length],
      open_time_ms: first + i * step,
      close_time_ms: first + (i + 1) * step - 1,
    }));
    return HttpResponse.json(
      storeDataset(
        body.symbol,
        body.interval,
        data,
        "SYNTHETIC",
        candleDatasetName(
          body.symbol,
          body.interval,
          body.startTime ? Date.parse(body.startTime) : data[0].open_time_ms,
          body.endTime ? Date.parse(body.endTime) : data.at(-1)!.open_time_ms,
        ),
      ),
    );
  }),
  http.post(base + "/datasets", async ({ request }) => {
    const body = await request.formData();
    const file = body.get("file");
    if (!file || typeof file === "string")
      return error(422, "Selecione um arquivo.", { field: "file" });
    try {
      const rows = JSON.parse(await file.text());
      if (!Array.isArray(rows) || !rows.length)
        throw new Error("O arquivo deve conter uma lista não vazia.");
      for (let i = 0; i < rows.length; i++) {
        if (!Array.isArray(rows[i]) || rows[i].length !== 12)
          return error(422, "Candle inválido.", {
            line: i + 1,
            field: "file",
            message: "Esperados 12 campos Binance.",
          });
      }
      const data: Candle[] = rows.map((r: unknown[]) => ({
        open_time_ms: Number(r[0]),
        close_time_ms: Number(r[6]),
        open: String(r[1]),
        high: String(r[2]),
        low: String(r[3]),
        close: String(r[4]),
        base_volume: String(r[5]),
      }));
      if (data.some((c) => !Number.isFinite(c.open_time_ms)))
        throw new Error("Abertura inválida.");
      data.sort((a, b) => a.open_time_ms - b.open_time_ms);
      return HttpResponse.json(
        storeDataset(
          String(body.get("symbol")),
          String(body.get("interval")),
          data,
          "JSON",
          file.name,
        ),
      );
    } catch (err) {
      return error(422, "Arquivo JSON inválido.", {
        field: "file",
        message: String(err),
      });
    }
  }),
  http.get(base + "/datasets/:id", ({ params }) => {
    const d = store.datasets.find((d) => d.id === params.id);
    return d ? HttpResponse.json(d) : error(404, "Conjunto não encontrado.");
  }),
  http.delete(base + "/datasets/:id", ({ params }) => {
    if (!store.datasets.some((d) => d.id === params.id))
      return error(404, "Conjunto não encontrado.");
    const sessionIds = new Set(
      store.sessions.filter((s) => s.dataset_id === params.id).map((s) => s.id),
    );
    for (const run of store.runs.filter((r) => sessionIds.has(r.session_id)))
      delete polls[run.id];
    store.runs = store.runs.filter((r) => !sessionIds.has(r.session_id));
    store.sessions = store.sessions.filter((s) => !sessionIds.has(s.id));
    store.datasets = store.datasets.filter((d) => d.id !== params.id);
    delete store.candles[String(params.id)];
    save();
    return new HttpResponse(null, { status: 204 });
  }),
  http.get(base + "/datasets/:id/candles", ({ params, request }) => {
    const data = store.candles[String(params.id)];
    return data
      ? page(filterTime(data, request), request)
      : error(404, "Conjunto não encontrado.");
  }),
  http.get(base + "/sessions", ({ request }) => page(store.sessions, request)),
  http.post(base + "/sessions", async ({ request }) => {
    const body = (await request.json()) as Omit<Session, "id">;
    if (!store.datasets.some((d) => d.id === body.dataset_id))
      return error(422, "Conjunto inexistente.", { field: "dataset_id" });
    const s = { ...body, id: crypto.randomUUID() };
    store.sessions.push(s);
    save();
    return HttpResponse.json(s, { status: 201 });
  }),
  http.get(base + "/sessions/:id", ({ params }) => {
    const s = store.sessions.find((s) => s.id === params.id);
    return s ? HttpResponse.json(s) : error(404, "Sessão não encontrada.");
  }),
  http.delete(base + "/sessions/:id", ({ params }) => {
    if (!store.sessions.some((s) => s.id === params.id))
      return error(404, "Sessão não encontrada.");
    for (const run of store.runs.filter((r) => r.session_id === params.id))
      delete polls[run.id];
    store.runs = store.runs.filter((r) => r.session_id !== params.id);
    store.sessions = store.sessions.filter((s) => s.id !== params.id);
    save();
    return new HttpResponse(null, { status: 204 });
  }),
  http.get(base + "/sessions/:id/runs", ({ params, request }) =>
    page(
      store.runs.filter((r) => r.session_id === params.id),
      request,
    ),
  ),
  http.post(base + "/sessions/:id/runs", async ({ params, request }) => {
    if (!store.sessions.some((s) => s.id === params.id))
      return error(404, "Sessão não encontrada.");
    const body = (await request.json()) as Pick<
      Run,
      "strategy_id" | "parameters"
    >;
    if (!strategies.some((s) => s.id === body.strategy_id))
      return error(422, "Estratégia inexistente.", { field: "strategy_id" });
    const strategy = strategies.find((s) => s.id === body.strategy_id)!;
    if (strategy.required_data?.length) {
      try {
        const rows = JSON.parse(String(body.parameters.auxiliary_json));
        const sess = store.sessions.find((s) => s.id === params.id)!;
        const data = store.candles[sess.dataset_id];
        if (
          !Array.isArray(rows) ||
          rows.length !== data.length ||
          rows.some(
            (row, index) =>
              row.open_time_ms !== data[index].open_time_ms ||
              strategy.required_data!.some((key) => row[key] == null),
          )
        )
          return error(
            422,
            "Dados auxiliares incompletos: importe uma observação por candle e todos os campos exigidos.",
          );
      } catch {
        return error(422, "Dados auxiliares: JSON inválido.");
      }
    }
    const run: Run = {
      ...body,
      id: crypto.randomUUID(),
      session_id: String(params.id),
      status: "queued",
      summary: null,
      error: null,
    };
    store.runs.push(run);
    save();
    return HttpResponse.json(run, { status: 202 });
  }),
  http.delete(base + "/runs/:id", ({ params }) => {
    const run = store.runs.find((r) => r.id === params.id);
    if (!run) return error(404, "Processamento não encontrado.");
    if (run.status !== "completed" && run.status !== "failed")
      return error(409, "Aguarde o término do processamento para excluir.");
    store.runs = store.runs.filter((r) => r.id !== params.id);
    delete polls[run.id];
    save();
    return new HttpResponse(null, { status: 204 });
  }),
  http.get(base + "/runs/:id", ({ params }) => {
    const run = store.runs.find((r) => r.id === params.id);
    if (!run) return error(404, "Processamento não encontrado.");
    if (run.status === "queued" || run.status === "running") {
      const n = (polls[run.id] = (polls[run.id] ?? 0) + 1);
      run.status = n > 2 ? "completed" : "running";
      if (run.status === "completed") {
        const s = store.sessions.find((s) => s.id === run.session_id)!;
        run.summary = {
          ...summary,
          initial_cash: s.initial_cash,
          initial_equity: s.initial_cash,
          final_cash: s.initial_cash,
          final_equity: s.initial_cash,
          realized_pnl: "0",
          return_pct: "0",
          total_fees: "0",
          buy_fills: 0,
          sell_fills: 0,
          closed_trades: 0,
          win_rate_pct: null,
          max_drawdown_pct: "0",
        };
      }
      save();
    }
    return HttpResponse.json(run);
  }),
  http.get(base + "/runs/:id/series", ({ params, request }) => {
    const run = store.runs.find((r) => r.id === params.id);
    if (!run) return error(404, "Processamento não encontrado.");
    if (run.status !== "completed")
      return error(409, "Séries ainda indisponíveis.");
    const s = store.sessions.find((s) => s.id === run.session_id)!;
    const result = makeSeries(run, store.candles[s.dataset_id]);
    const kind = new URL(request.url).searchParams.get("kind");
    if (kind !== "indicators" && kind !== "events" && kind !== "equity")
      return error(422, "Tipo de série inválido.", { field: "kind" });
    return page(
      filterTime<{ open_time_ms: number }>(result[kind], request),
      request,
    );
  }),
];
function startTime() {
  return dataset.first_open_time_ms;
}
function filterTime<T extends { open_time_ms: number }>(
  items: T[],
  request: Request,
) {
  const q = new URL(request.url).searchParams;
  return items.filter(
    (i) =>
      (!q.has("from_ms") || i.open_time_ms >= Number(q.get("from_ms"))) &&
      (!q.has("to_ms") || i.open_time_ms < Number(q.get("to_ms"))),
  );
}

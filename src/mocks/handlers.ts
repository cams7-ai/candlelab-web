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
import { memberKey } from "../combinations";
import {
  findConfigurationUsage,
  configurationDeletionBlocked,
} from "../configurationUsage";
import {
  candleDatasetName,
  parameterValue,
  strategyParameters,
} from "../utils";
import type { CombinationDefinition, StrategyCombination } from "../types";
interface Store {
  combinations: StrategyCombination[];
  datasets: Dataset[];
  sessions: Session[];
  runs: Run[];
  candles: Record<string, Candle[]>;
}
const storageKey = "candlelab-demo-v1";
function seed(): Store {
  return structuredClone({
    combinations: [],
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
    return raw ? { ...seed(), ...JSON.parse(raw) } : seed();
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

function normalizeCombination(
  body: CombinationDefinition,
  depth = 1,
  counter = { leaves: 0 },
): CombinationDefinition {
  if (depth > 4)
    throw new Error("Combinações aceitam até 4 níveis de agrupamento.");
  if (
    typeof body.name !== "string" ||
    !body.name.trim() ||
    body.name.trim().length > 200
  )
    throw new Error("Informe um nome de até 200 caracteres.");
  if (!["preset", "custom", "strategy"].includes(body.kind))
    throw new Error("Tipo de combinação inválido.");
  const normalize = (id: string, values: Record<string, string | number>) => {
    const strategy = strategies.find((s) => s.id === id);
    if (!strategy) throw new Error("Estratégia inexistente.");
    const parsed = strategyParameters(strategy, values);
    return parsed;
  };
  const definition: CombinationDefinition = {
    name: body.name.trim(),
    kind: body.kind,
    strategy_id: body.strategy_id ?? null,
    parameters: body.parameters ?? {},
    members: body.members ?? [],
    buy_rule: body.buy_rule ?? "all",
    sell_rule: body.sell_rule ?? "any",
  };
  if (
    !["all", "any"].includes(definition.buy_rule) ||
    !["all", "any"].includes(definition.sell_rule)
  )
    throw new Error("Regra inválida.");
  if (definition.kind !== "custom") {
    if (
      definition.members.length ||
      definition.buy_rule !== "all" ||
      definition.sell_rule !== "any" ||
      !strategies.some(
        (s) =>
          s.id === definition.strategy_id &&
          (definition.kind === "preset"
            ? s.category === "combination"
            : s.category !== "combination"),
      )
    )
      throw new Error("Selecione uma combinação publicada.");
    const strategy = strategies.find((s) => s.id === definition.strategy_id)!;
    if (
      depth > 1 &&
      (["DCA@1", "GRID_TRADING@1", "GRID_ADX_ATR@1"].includes(strategy.id) ||
        strategy.required_data?.length)
    )
      throw new Error(
        "Combinação publicada incompatível com composição Spot OHLCV.",
      );
    definition.parameters = normalize(
      definition.strategy_id!,
      definition.parameters,
    );
    counter.leaves += 1;
  } else {
    if (
      definition.strategy_id ||
      Object.keys(definition.parameters).length ||
      definition.members.length < 2 ||
      definition.members.length > 8 ||
      new Set(definition.members.map(memberKey)).size !==
        definition.members.length
    )
      throw new Error("Selecione de 2 a 8 estratégias distintas.");
    definition.members = definition.members.map((member) => {
      if (member.combination) {
        if (member.strategy_id || Object.keys(member.parameters ?? {}).length)
          throw new Error("Um grupo recebe somente o snapshot da combinação.");
        return {
          strategy_id: "",
          parameters: {},
          combination: normalizeCombination(
            member.combination,
            depth + 1,
            counter,
          ),
        };
      }
      counter.leaves += 1;
      const strategy = strategies.find((s) => s.id === member.strategy_id);
      if (
        !strategy ||
        ["DCA@1", "GRID_TRADING@1", "GRID_ADX_ATR@1"].includes(strategy.id) ||
        strategy.required_data?.length
      )
        throw new Error("Estratégia incompatível com composição Spot OHLCV.");
      return {
        ...member,
        parameters: normalize(member.strategy_id, member.parameters),
      };
    });
  }
  if (counter.leaves > 64)
    throw new Error("Combinações aceitam até 64 estratégias no total.");
  if (
    definition.kind === "custom" &&
    !definition.members.some(
      (m) =>
        m.combination?.kind === "custom" ||
        (strategies.find(
          (s) => s.id === (m.combination?.strategy_id ?? m.strategy_id),
        )?.composition_role ?? "signal") === "signal",
    )
  )
    throw new Error(
      "Inclua pelo menos uma estratégia de sinal, além de filtros e saídas.",
    );
  return definition;
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
    HttpResponse.json({
      items: strategies.map((strategy) => ({
        ...strategy,
        combinable:
          !["DCA@1", "GRID_TRADING@1", "GRID_ADX_ATR@1"].includes(
            strategy.id,
          ) && !strategy.required_data?.length,
      })),
    }),
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
    const sessions = store.sessions.filter(
      (session) => session.dataset_id === params.id,
    );
    if (sessions.length)
      return HttpResponse.json(
        {
          error: {
            code: "DATASET_IN_USE",
            message:
              "Este conjunto de candles não pode ser excluído: existem sessões vinculadas.",
            details: [
              {
                field: "dataset_id",
                sessions: sessions.map(({ id, name }) => ({ id, name })),
              },
            ],
          },
        },
        { status: 409 },
      );
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
  http.get(base + "/strategy-combinations", ({ request }) =>
    page(store.combinations, request),
  ),
  http.post(base + "/strategy-combinations", async ({ request }) => {
    try {
      const definition = normalizeCombination(
        (await request.json()) as CombinationDefinition,
      );
      if (
        store.combinations.some(
          (c) =>
            c.name.toLocaleLowerCase() === definition.name.toLocaleLowerCase(),
        )
      )
        return error(409, "Já existe uma combinação com esse nome.");
      const saved = { ...definition, id: crypto.randomUUID() };
      store.combinations.push(saved);
      save();
      return HttpResponse.json(saved, { status: 201 });
    } catch (err) {
      return error(
        422,
        err instanceof Error ? err.message : "Combinação inválida.",
      );
    }
  }),
  http.put(base + "/strategy-combinations/:id", async ({ request, params }) => {
    const index = store.combinations.findIndex((c) => c.id === params.id);
    if (index < 0) return error(404, "Combinação não encontrada.");
    try {
      const definition = normalizeCombination(
        (await request.json()) as CombinationDefinition,
      );
      if (
        store.combinations.some(
          (c) =>
            c.id !== params.id &&
            c.name.toLocaleLowerCase() === definition.name.toLocaleLowerCase(),
        )
      )
        return error(409, "Já existe uma combinação com esse nome.");
      const saved = { ...definition, id: String(params.id) };
      store.combinations[index] = saved;
      save();
      return HttpResponse.json(saved);
    } catch (err) {
      return error(
        422,
        err instanceof Error ? err.message : "Combinação inválida.",
      );
    }
  }),
  http.delete(base + "/strategy-combinations/:id", ({ params }) => {
    const target = store.combinations.find((c) => c.id === params.id);
    if (!target) return error(404, "Combinação não encontrada.");
    const usage = findConfigurationUsage(
      target,
      store.combinations,
      store.runs,
    );
    if (configurationDeletionBlocked(usage)) {
      const configuration = target.kind === "strategy";
      const noun = configuration ? "configuração" : "combinação";
      return HttpResponse.json(
        {
          error: {
            code: configuration ? "CONFIGURATION_IN_USE" : "COMBINATION_IN_USE",
            message: `Esta ${noun} não pode ser excluída: existem vínculos ou cópias cuja origem não pode ser descartada.`,
            details: [
              {
                field: "combination_id",
                reason: `Remova os vínculos antes de excluir a ${noun}. Cópias sem identificador de origem exigem revisão.`,
                runs: usage.runs,
                combinations: usage.combinations,
                uncertain_copies: usage.uncertainCopies,
              },
            ],
          },
        },
        { status: 409 },
      );
    }
    store.combinations = store.combinations.filter((c) => c.id !== params.id);
    save();
    return new HttpResponse(null, { status: 204 });
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
    const runs = store.runs.filter((run) => run.session_id === params.id);
    if (runs.length)
      return HttpResponse.json(
        {
          error: {
            code: "SESSION_IN_USE",
            message:
              "Esta sessão não pode ser excluída: existem processamentos vinculados.",
            details: [
              {
                field: "session_id",
                runs: runs.map(({ id, status }) => ({ id, status })),
              },
            ],
          },
        },
        { status: 409 },
      );
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
    const incoming = (await request.json()) as Partial<Run> & {
      combination_id?: string;
    };
    let combination: StrategyCombination | undefined;
    if (incoming.combination_id) {
      if (
        incoming.strategy_id ||
        Object.keys(incoming.parameters ?? {}).length ||
        incoming.auxiliary_filename
      )
        return error(
          422,
          "Selecione estratégia ou combinação, exclusivamente.",
        );
      combination = store.combinations.find(
        (c) => c.id === incoming.combination_id,
      );
      if (!combination) return error(404, "Combinação não encontrada.");
    }
    const body = combination
      ? {
          strategy_id:
            combination.kind === "custom"
              ? "CUSTOM_COMBINATION@1"
              : combination.strategy_id!,
          parameters:
            combination.kind === "custom"
              ? {
                  definition_json: JSON.stringify(
                    Object.fromEntries(
                      Object.entries(combination).filter(
                        ([key]) => key !== "id",
                      ),
                    ),
                  ),
                }
              : structuredClone(combination.parameters),
          combination_snapshot: structuredClone(combination),
        }
      : (incoming as Pick<
          Run,
          "strategy_id" | "parameters" | "auxiliary_filename"
        >);
    if (
      body.strategy_id !== "CUSTOM_COMBINATION@1" &&
      !strategies.some((s) => s.id === body.strategy_id)
    )
      return error(422, "Estratégia inexistente.", { field: "strategy_id" });
    const strategy = strategies.find((s) => s.id === body.strategy_id)!;
    if (strategy?.required_data?.length) {
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

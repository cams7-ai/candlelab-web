import { it, expect } from "vitest";
import { buildRunPdf, reportBars } from "../runPdf";
import { runParameterLabel } from "../combinations";
import type { StrategyCombination } from "../types";
import {
  candles,
  dataset,
  makeSeries,
  runs,
  session,
  strategies,
} from "../mocks/fixtures";

it("agrega OHLC em ordem preservando extremos e o período completo", () => {
  const bars = reportBars([...candles].reverse(), 2);
  expect(bars).toHaveLength(2);
  expect(bars[0]).toMatchObject({
    from: candles[0].open_time_ms,
    to: candles[89].open_time_ms,
    open: Number(candles[0].open),
    close: Number(candles[89].close),
    high: Math.max(...candles.slice(0, 90).map((c) => Number(c.high))),
    low: Math.min(...candles.slice(0, 90).map((c) => Number(c.low))),
  });
  expect(bars.at(-1)!.to).toBe(candles.at(-1)!.open_time_ms);
  expect(reportBars([])).toEqual([]);
});

it("gera PDF paginado com valores extensos, parâmetros e histórico", () => {
  const data = makeSeries(runs[0], candles);
  const doc = buildRunPdf({
    session,
    dataset,
    candles,
    ...data,
    strategyName: "SMA com filtro RSI",
    run: {
      ...runs[0],
      summary: {
        ...runs[0].summary!,
        max_drawdown_pct: "0." + "123456789".repeat(15),
      },
    },
    events: Array.from({ length: 90 }, (_, i) => ({
      ...data.events[i % data.events.length],
      id: `event-${i}`,
      reason: "Motivo de execução com informação adicional ".repeat(8),
    })),
  });
  expect(doc.output().startsWith("%PDF-")).toBe(true);
  expect(doc.getNumberOfPages()).toBeGreaterThan(3);
});

it.each(["strategy", "preset"] as const)(
  "identifica o cadastro %s pela cópia preservada e inclui as condições e o arquivo auxiliar",
  (kind) => {
    const doc = buildRunPdf({
      session,
      dataset: { ...dataset, quote_asset: "BRL" },
      candles: [],
      events: [],
      equity: [],
      strategyName: "Nome atual que não pertence ao histórico",
      run: {
        ...runs[0],
        auxiliary_filename: "previsoes-originais.json",
        strategy_id: "MACHINE_LEARNING@1",
        parameters: {
          threshold: "0.123456789012345678",
          auxiliary_json: '[{"private_data":"não exportar o conteúdo"}]',
        },
        combination_snapshot: {
          id: "cadastro-preservado",
          name: "Configuração histórica",
          kind,
          strategy_id: "MACHINE_LEARNING@1",
          parameters: {
            threshold: "999",
            auxiliary_json: '[{"private_data":"não exportar o conteúdo"}]',
          },
          members: [],
          buy_rule: "all",
          sell_rule: "any",
        },
      },
    });
    const text = doc.internal.pages.flat().join("\n");
    expect(text).toContain(
      kind === "strategy" ? "Configuração personalizada" : "receita publicada",
    );
    expect(text).toContain("Configuração histórica");
    expect(text).toContain("cadastro-preservado");
    expect(text).toContain("MACHINE_LEARNING@1");
    expect(text).toContain("0,123456789012345678");
    expect(text).toContain("previsoes-originais.json");
    expect(text).toContain("1 observação importada");
    expect(text).toContain("0,1%");
    expect(text).toContain("1000,00 BRL");
    expect(text).not.toContain("Nome atual que não pertence");
    expect(text).not.toContain("private_data");
    expect(text).not.toContain("(999) Tj");
  },
);

it("preserva a hierarquia e as regras próprias de cada grupo no PDF", () => {
  const doc = buildRunPdf({
    session,
    dataset,
    candles: [],
    events: [],
    equity: [],
    strategyName: "Cadastro editado depois da execução",
    run: {
      ...runs[0],
      combination_snapshot: {
        id: "raiz-historica",
        name: "Grupo principal histórico",
        kind: "custom",
        strategy_id: null,
        parameters: {},
        buy_rule: "all",
        sell_rule: "any",
        members: [
          {
            strategy_id: "",
            parameters: {},
            combination: {
              name: "Alternativas preservadas",
              kind: "custom",
              strategy_id: null,
              parameters: {},
              buy_rule: "any",
              sell_rule: "all",
              members: [
                {
                  strategy_id: "SMA_CROSS@1",
                  parameters: { short_window: 3, long_window: 8 },
                },
                {
                  strategy_id: "EMA_CROSS@1",
                  parameters: { short_window: 5, long_window: 13 },
                },
              ],
            },
          },
          {
            strategy_id: "ADX_CONFIRMATION@1",
            parameters: { adx_limit: "32.123456789" },
          },
        ],
      },
    },
  });
  const text = doc.internal.pages.flat().join("\n");
  expect(text).toContain("1. Grupo: Alternativas preservadas");
  expect(text).toContain("1.1. Estratégia: SMA_CROSS@1");
  expect(text).toContain("1.2. Estratégia: EMA_CROSS@1");
  expect(text).toContain("2. Estratégia: ADX_CONFIRMATION@1");
  expect(text).toContain("Todas");
  expect(text).toContain("Qualquer uma");
  expect(text).toContain("32,123456789");
  expect(text).not.toContain("Cadastro editado depois");
});

it("mantém os parâmetros registrados para estratégias sem cadastro salvo", () => {
  const doc = buildRunPdf({
    session,
    dataset,
    run: {
      ...runs[0],
      combination_snapshot: null,
      parameters: { custom_parameter: "0.123456789" },
    },
    strategyName: "Estratégia original",
    candles: [],
    events: [],
    equity: [],
  });
  const text = doc.internal.pages.flat().join("\n");
  expect(text).toContain("Estratégia do catálogo");
  expect(text).toContain("Estratégia original");
  expect(text).toContain("0,123456789");
  expect(text).not.toContain("Cadastro de origem");
});

it("usa os títulos dos campos do catálogo para estratégias e aplica os mesmos fallbacks da tela", () => {
  const strategy = {
    ...strategies[0],
    parameters_schema: {
      properties: {
        short_window: {
          type: "integer" as const,
          title: "SMA curta exibida na tela",
        },
        long_window: { type: "integer" as const },
      },
    },
  };
  const doc = buildRunPdf({
    session,
    dataset,
    candles: [],
    events: [],
    equity: [],
    strategyName: strategy.name,
    strategies: [strategy],
    run: {
      ...runs[0],
      strategy_id: strategy.id,
      combination_snapshot: null,
      parameters: {
        short_window: 9,
        long_window: 21,
        unknown_parameter: "0.123456789",
      },
    },
  });
  const text = doc.internal.pages.flat().join("\n");
  expect(text).toContain("SMA curta exibida na tela");
  expect(text).toContain("Janela longa");
  expect(text).toContain("unknown_parameter");
  expect(text).not.toContain("Janela curta");
});

it("resolve o nome de cada parâmetro pela estratégia correta em grupos e configurações aninhados", () => {
  const catalog = strategies.map((strategy) => ({
    ...strategy,
    parameters_schema: {
      ...strategy.parameters_schema,
      properties: {
        ...strategy.parameters_schema.properties,
        short_window: {
          type: "integer" as const,
          title:
            strategy.id === "SMA_CROSS@1"
              ? "SMA curta exclusiva"
              : "EMA curta exclusiva",
        },
      },
    },
  }));
  const snapshot: StrategyCombination = {
    id: "historico-com-rotulos",
    name: "Grupo principal",
    kind: "custom",
    strategy_id: null,
    parameters: {},
    buy_rule: "all",
    sell_rule: "any",
    members: [
      {
        strategy_id: "",
        parameters: {},
        combination: {
          name: "Grupo interno",
          kind: "custom",
          strategy_id: null,
          parameters: {},
          buy_rule: "any",
          sell_rule: "all",
          members: [
            { strategy_id: "SMA_CROSS@1", parameters: { short_window: 3 } },
            {
              strategy_id: "",
              parameters: {},
              combination: {
                name: "EMA personalizada",
                kind: "strategy",
                strategy_id: "EMA_CROSS@1",
                parameters: { short_window: 5 },
                members: [],
                buy_rule: "all",
                sell_rule: "any",
              },
            },
          ],
        },
      },
    ],
  };
  const run = { ...runs[0], combination_snapshot: snapshot };
  const doc = buildRunPdf({
    session,
    dataset,
    run,
    strategies: catalog,
    strategyName: snapshot.name,
    candles: [],
    events: [],
    equity: [],
  });
  const text = doc.internal.pages.flat().join("\n");
  const first = text.indexOf("1.1. Estratégia: SMA_CROSS@1");
  const second = text.indexOf("1.2. Configuração: EMA personalizada");
  expect(first).toBeGreaterThan(-1);
  expect(second).toBeGreaterThan(first);
  expect(text.slice(first, second)).toContain("SMA curta exclusiva");
  expect(text.slice(first, second)).not.toContain("EMA curta exclusiva");
  expect(text.slice(second)).toContain("EMA curta exclusiva");
  expect(runParameterLabel(run, "1 · 1 · short_window", catalog)).toBe(
    "1 · 1 · SMA curta exclusiva",
  );
  expect(runParameterLabel(run, "1 · 2 · short_window", catalog)).toBe(
    "1 · 2 · EMA curta exclusiva",
  );
});

it("exporta os parâmetros e grupos da definição ajustada usada na execução", () => {
  const definition = {
    name: "Combinação ajustada",
    kind: "custom",
    strategy_id: null,
    parameters: {},
    buy_rule: "all",
    sell_rule: "any",
    members: [
      {
        strategy_id: "SMA_CROSS@1",
        parameters: { short_window: 4, long_window: 12 },
      },
      {
        strategy_id: "EMA_CROSS@1",
        parameters: { short_window: 5, long_window: 13 },
      },
    ],
  };
  const run = {
    ...runs[0],
    strategy_id: "CUSTOM_COMBINATION@1",
    combination_snapshot: null,
    parameters: { definition_json: JSON.stringify(definition) },
  };
  const doc = buildRunPdf({
    session,
    dataset,
    run,
    strategyName: definition.name,
    candles: [],
    events: [],
    equity: [],
  });
  const text = doc.internal.pages.flat().join("\n");
  expect(text).toContain(definition.name);
  expect(text).toContain("1. Estratégia: SMA_CROSS@1");
  expect(text).toContain("2. Estratégia: EMA_CROSS@1");
  expect(text).not.toContain("definition_json");
  expect(text).not.toContain("Cadastro de origem (ID)");
});

it("prioriza a definição efetiva mesmo quando o snapshot conserva parâmetros da origem", () => {
  const origin: StrategyCombination = {
    id: "origin",
    name: "ATR original (0.2)",
    kind: "custom",
    strategy_id: null,
    parameters: {},
    buy_rule: "all",
    sell_rule: "any",
    members: [
      { strategy_id: "BREAKOUT@1", parameters: { atr_multiple: "0.2" } },
      { strategy_id: "ATR_EXIT@1", parameters: { atr_multiple: "0.2" } },
    ],
  };
  const execution = {
    ...origin,
    name: "Execução ajustada",
    members: origin.members.map((member) => ({
      ...member,
      parameters: { atr_multiple: "2.3456789" },
    })),
  };
  const run = {
    ...runs[0],
    strategy_id: "CUSTOM_COMBINATION@1",
    combination_snapshot: origin,
    parameters: { definition_json: JSON.stringify(execution) },
  };
  const doc = buildRunPdf({
    session,
    dataset,
    run,
    strategyName: origin.name,
    strategies,
    candles: [],
    events: [],
    equity: [],
  });
  const text = doc.internal.pages.flat().join("\n");
  expect(text).toContain("Execução ajustada");
  expect(text.match(/2,3456789/g)).toHaveLength(2);
  expect(text).not.toContain("ATR original");
  expect(runParameterLabel(run, "1 · atr_multiple", strategies)).toBe(
    "1 · Multiplicador do stop móvel por ATR",
  );
});

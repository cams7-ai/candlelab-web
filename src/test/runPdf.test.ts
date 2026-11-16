import { it, expect } from "vitest";
import { buildRunPdf, reportBars } from "../runPdf";
import { candles, dataset, makeSeries, runs, session } from "../mocks/fixtures";

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

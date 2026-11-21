import { fireEvent, render, screen } from "@testing-library/react";
import { vi, it, expect } from "vitest";
import { candles, makeSeries, runs } from "../mocks/fixtures";
const mocks = vi.hoisted(() => {
  const series = () => ({ setData: vi.fn(), createPriceLine: vi.fn() });
  const price = series();
  const lines: ReturnType<typeof series>[] = [];
  const timeScale = {
    fitContent: vi.fn(),
    getVisibleLogicalRange: vi.fn(() => ({ from: 0, to: 100 })),
    setVisibleLogicalRange: vi.fn(),
  };
  const chart = {
    addSeries: vi.fn((type: unknown) => {
      const s = type === "candles" ? price : series();
      if (type !== "candles") lines.push(s);
      return s;
    }),
    priceScale: () => ({ applyOptions: vi.fn() }),
    panes: () => [{ setHeight: vi.fn() }],
    timeScale: () => timeScale,
    remove: vi.fn(),
  };
  return {
    chart,
    price,
    lines,
    timeScale,
    detach: vi.fn(),
    setMarkers: vi.fn(),
  };
});
vi.mock("lightweight-charts", () => ({
  CandlestickSeries: "candles",
  LineSeries: "line",
  HistogramSeries: "histogram",
  ColorType: { Solid: "solid" },
  LineStyle: { Dashed: 2 },
  createChart: vi.fn(() => mocks.chart),
  createSeriesMarkers: vi.fn(() => ({
    detach: mocks.detach,
    setMarkers: mocks.setMarkers,
  })),
}));
import type { Run } from "../types";
import { Chart, chartTime, markersFor } from "../components/Chart";
it("separa RSI de cada membro e usa seus limiares sem misturar com o preço", () => {
  const run: Run = {
    ...runs[0],
    strategy_id: "CUSTOM_COMBINATION@1",
    parameters: { definition_json: "{}" },
    combination_snapshot: {
      id: "snapshot",
      name: "SMA e RSI",
      kind: "custom" as const,
      strategy_id: null,
      parameters: {},
      buy_rule: "all" as const,
      sell_rule: "any" as const,
      members: [
        {
          strategy_id: "SMA_CROSS@1",
          parameters: { short_window: 2, long_window: 3 },
        },
        {
          strategy_id: "RSI_REVERSION@1",
          parameters: { period: 3, oversold: "25", overbought: "75" },
        },
      ],
    },
  };
  render(
    <Chart
      candles={candles}
      indicators={[
        {
          open_time_ms: candles[0].open_time_ms,
          values: { member_1__sma_short: "100", member_2__rsi: null },
        },
        {
          open_time_ms: candles[1].open_time_ms,
          values: { member_1__sma_short: "102", member_2__rsi: "30" },
        },
      ]}
      events={[]}
      equity={[]}
      run={run}
      signals
      fills
    />,
  );
  const calls = mocks.chart.addSeries.mock.calls as unknown[][];
  const sma = calls.find(
    (call) => (call[1] as { title?: string })?.title === "member_1__sma_short",
  );
  const rsi = calls.find(
    (call) => (call[1] as { title?: string })?.title === "member_2__rsi",
  );
  expect(sma?.[2]).toBe(0);
  expect(rsi?.[2]).toBe(1);
  expect(
    (
      rsi?.[1] as { autoscaleInfoProvider: () => unknown }
    ).autoscaleInfoProvider(),
  ).toEqual({ priceRange: { minValue: 0, maxValue: 100 } });
  const lines = mocks.lines.find((line) =>
    line.createPriceLine.mock.calls.some(([options]) => options.price === 25),
  )!;
  expect(lines.createPriceLine).toHaveBeenCalledWith(
    expect.objectContaining({ price: 75 }),
  );
  expect(lines.setData.mock.calls[0][0][0]).not.toHaveProperty("value");
});
it("preserva o zoom e a posição ao alternar sinais e execuções", () => {
  const data = makeSeries(runs[0], candles);
  const view = render(
    <Chart candles={candles} {...data} run={runs[0]} signals fills />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Zoom +" }));
  const fitCalls = mocks.timeScale.fitContent.mock.calls.length;
  const rangeCalls = mocks.timeScale.setVisibleLogicalRange.mock.calls.length;
  const removeCalls = mocks.chart.remove.mock.calls.length;
  const seriesCalls = mocks.chart.addSeries.mock.calls.length;

  for (const [signals, fills] of [
    [false, true],
    [false, false],
    [true, false],
    [true, true],
  ]) {
    view.rerender(
      <Chart
        candles={candles}
        {...data}
        run={runs[0]}
        signals={signals}
        fills={fills}
      />,
    );
    expect(mocks.setMarkers).toHaveBeenLastCalledWith(
      markersFor(data.events, signals, fills),
    );
  }

  expect(mocks.timeScale.fitContent).toHaveBeenCalledTimes(fitCalls);
  expect(mocks.timeScale.setVisibleLogicalRange).toHaveBeenCalledTimes(
    rangeCalls,
  );
  expect(mocks.chart.remove).toHaveBeenCalledTimes(removeCalls);
  expect(mocks.chart.addSeries).toHaveBeenCalledTimes(seriesCalls);
});
it("aproxima e afasta a área visível pelo centro e permite ver todo o histórico", () => {
  const data = makeSeries(runs[0], candles);
  render(<Chart candles={candles} {...data} run={runs[0]} signals fills />);

  fireEvent.click(screen.getByRole("button", { name: "Zoom +" }));
  expect(mocks.timeScale.setVisibleLogicalRange).toHaveBeenLastCalledWith({
    from: 10,
    to: 90,
  });

  fireEvent.click(screen.getByRole("button", { name: "Zoom -" }));
  expect(mocks.timeScale.setVisibleLogicalRange).toHaveBeenLastCalledWith({
    from: -12.5,
    to: 112.5,
  });

  const calls = mocks.timeScale.fitContent.mock.calls.length;
  fireEvent.click(screen.getByRole("button", { name: "Ver tudo" }));
  expect(mocks.timeScale.fitContent).toHaveBeenCalledTimes(calls + 1);
});
it("ancora sinais e fills em candles distintos com ordem estável", () => {
  const { events } = makeSeries(runs[0], candles);
  const markers = markersFor([...events].reverse(), true, true);
  expect(markers).toHaveLength(8);
  expect(markers[0].shape).toBe("arrowUp");
  expect(markers[1].shape).toBe("circle");
  expect(Number(markers[1].time) - Number(markers[0].time)).toBe(300);
  expect(markersFor(events, false, true)).toHaveLength(4);
  expect(markersFor(events, true, false)).toHaveLength(4);
  expect(chartTime(1787097600123)).toBe(1787097600);
});
it("usa painel RSI de 0 a 100, limiar efetivo, lacunas e limpa o gráfico", () => {
  const data = makeSeries(runs[0], candles);
  const view = render(
    <Chart candles={candles} {...data} run={runs[0]} signals fills />,
  );
  const rsiCall = mocks.chart.addSeries.mock.calls.find(
    (call) =>
      (call as unknown[])[1] &&
      ((call as unknown[])[1] as { title: string }).title === "rsi",
  ) as unknown[] | undefined;
  expect(rsiCall?.[2]).toBe(1);
  const options = rsiCall?.[1] as { autoscaleInfoProvider: () => unknown };
  expect(options.autoscaleInfoProvider()).toEqual({
    priceRange: { minValue: 0, maxValue: 100 },
  });
  const rsi = mocks.lines.find((s) => s.createPriceLine.mock.calls.length)!;
  expect(rsi.createPriceLine).toHaveBeenCalledWith(
    expect.objectContaining({ price: 50 }),
  );
  expect(rsi.setData.mock.calls[0][0][0]).toEqual({
    time: chartTime(candles[0].open_time_ms),
  });
  view.rerender(
    <Chart
      candles={candles}
      {...makeSeries(runs[1], candles)}
      run={runs[1]}
      signals
      fills
    />,
  );
  expect(mocks.detach).toHaveBeenCalledTimes(1);
  expect(mocks.chart.remove).toHaveBeenCalledTimes(1);
  view.unmount();
  expect(mocks.chart.remove).toHaveBeenCalledTimes(2);
});

it("mantém fills ETH no histórico sem plotá-los na escala de BTC", () => {
  const events = [
    {
      id: "eth",
      seq: 1,
      kind: "fill" as const,
      side: "SELL" as const,
      asset: "ETH",
      open_time_ms: 1787097600000,
      occurred_at_ms: 1787097600000,
    },
  ];
  expect(markersFor(events, true, true)).toEqual([]);
});

it("separa RSI aninhado e usa os limiares do membro interno", () => {
  const run: Run = {
    ...runs[0],
    combination_snapshot: {
      id: "outer",
      name: "Grupo externo",
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
            name: "Grupo RSI",
            kind: "custom",
            strategy_id: null,
            parameters: {},
            buy_rule: "any",
            sell_rule: "all",
            members: [
              { strategy_id: "SMA_CROSS@1", parameters: {} },
              {
                strategy_id: "RSI_REVERSION@1",
                parameters: { oversold: "27", overbought: "73" },
              },
            ],
          },
        },
        { strategy_id: "EMA_CROSS@1", parameters: {} },
      ],
    },
  };
  const startIndex = mocks.chart.addSeries.mock.calls.length;
  render(
    <Chart
      candles={candles}
      indicators={[
        {
          open_time_ms: candles[0].open_time_ms,
          values: { member_1__member_2__rsi: "35" },
        },
      ]}
      events={[]}
      equity={[]}
      run={run}
      signals
      fills
    />,
  );
  const calls = mocks.chart.addSeries.mock.calls.slice(
    startIndex,
  ) as unknown[][];
  const rsiIndex = calls.findIndex(
    (call) =>
      (call[1] as { title?: string })?.title === "member_1__member_2__rsi",
  );
  expect(rsiIndex).toBeGreaterThanOrEqual(0);
  expect(calls[rsiIndex][2]).toBeGreaterThan(0);
  const series =
    mocks.chart.addSeries.mock.results[startIndex + rsiIndex].value;
  expect(series.createPriceLine).toHaveBeenCalledWith(
    expect.objectContaining({ price: 27 }),
  );
  expect(series.createPriceLine).toHaveBeenCalledWith(
    expect.objectContaining({ price: 73 }),
  );
});

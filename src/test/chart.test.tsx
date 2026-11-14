import { render } from "@testing-library/react";
import { vi, it, expect } from "vitest";
import { candles, makeSeries, runs } from "../mocks/fixtures";
const mocks = vi.hoisted(() => {
  const series = () => ({ setData: vi.fn(), createPriceLine: vi.fn() });
  const price = series();
  const lines: ReturnType<typeof series>[] = [];
  const chart = {
    addSeries: vi.fn((type: unknown) => {
      const s = type === "candles" ? price : series();
      if (type !== "candles") lines.push(s);
      return s;
    }),
    priceScale: () => ({ applyOptions: vi.fn() }),
    panes: () => [{ setHeight: vi.fn() }],
    timeScale: () => ({ fitContent: vi.fn() }),
    remove: vi.fn(),
  };
  return { chart, price, lines, detach: vi.fn() };
});
vi.mock("lightweight-charts", () => ({
  CandlestickSeries: "candles",
  LineSeries: "line",
  HistogramSeries: "histogram",
  ColorType: { Solid: "solid" },
  LineStyle: { Dashed: 2 },
  createChart: vi.fn(() => mocks.chart),
  createSeriesMarkers: vi.fn(() => ({ detach: mocks.detach })),
}));
import { Chart, chartTime, markersFor } from "../components/Chart";
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

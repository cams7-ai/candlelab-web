import { useEffect, useRef } from "react";
import {
  CandlestickSeries,
  ColorType,
  createChart,
  createSeriesMarkers,
  HistogramSeries,
  LineSeries,
  LineStyle,
  type IChartApi,
  type ISeriesMarkersPluginApi,
  type UTCTimestamp,
  type SeriesMarker,
  type Time,
} from "lightweight-charts";
import type { Candle, Equity, Indicator, Run, TradeEvent } from "../types";
export const chartTime = (ms: number) => Math.floor(ms / 1000) as UTCTimestamp;
export function markersFor(
  events: TradeEvent[],
  signals: boolean,
  fills: boolean,
): SeriesMarker<Time>[] {
  return events
    .filter((e) => e.asset !== "ETH")
    .filter((e) =>
      e.kind === "signal" ? signals : e.kind === "fill" ? fills : false,
    )
    .sort((a, b) => a.open_time_ms - b.open_time_ms || a.seq - b.seq)
    .map((e) => ({
      time: chartTime(e.open_time_ms),
      position: e.side === "BUY" ? "belowBar" : "aboveBar",
      color: e.side === "BUY" ? "#13dfbe" : "#ff626e",
      shape:
        e.kind === "fill"
          ? "circle"
          : e.side === "BUY"
            ? "arrowUp"
            : "arrowDown",
      text: `${e.kind === "fill" ? "Execução" : "Sinal"} ${e.side === "BUY" ? "compra" : "venda"}`,
      id: e.id,
    }));
}
const palette = ["#f5c344", "#19d9e2", "#cb77f3", "#77c783", "#ed9567"];
export function Chart({
  candles,
  indicators,
  events,
  equity,
  run,
  signals,
  fills,
}: {
  candles: Candle[];
  indicators: Indicator[];
  events: TradeEvent[];
  equity: Equity[];
  run?: Run;
  signals: boolean;
  fills: boolean;
}) {
  const host = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const markersRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);
  function zoom(factor: number) {
    const timeScale = chartRef.current?.timeScale();
    const range = timeScale?.getVisibleLogicalRange();
    if (!timeScale || !range) return;
    const center = (range.from + range.to) / 2;
    const halfRange = Math.max(1, ((range.to - range.from) * factor) / 2);
    timeScale.setVisibleLogicalRange({
      from: center - halfRange,
      to: center + halfRange,
    });
  }
  useEffect(() => {
    if (!host.current) return;
    const chart = createChart(host.current, {
      autoSize: true,
      height: 580,
      layout: {
        background: { type: ColorType.Solid, color: "#0c1a24" },
        textColor: "#bbcad5",
        panes: { separatorColor: "#36505e", enableResize: true },
      },
      grid: {
        vertLines: { color: "#213540" },
        horzLines: { color: "#213540" },
      },
      rightPriceScale: { borderColor: "#36505e" },
      timeScale: {
        borderColor: "#36505e",
        timeVisible: true,
        secondsVisible: false,
      },
      localization: { locale: "pt-BR" },
      crosshair: { mode: 0 },
    });
    chartRef.current = chart;
    const price = chart.addSeries(CandlestickSeries, {
      upColor: "#13dfbe",
      downColor: "#ff626e",
      borderVisible: false,
      wickUpColor: "#13dfbe",
      wickDownColor: "#ff626e",
    });
    price.setData(
      candles.map((c) => ({
        time: chartTime(c.open_time_ms),
        open: Number(c.open),
        high: Number(c.high),
        low: Number(c.low),
        close: Number(c.close),
      })),
    );
    const markers = createSeriesMarkers(price);
    markersRef.current = markers;
    const keys = Array.from(
      new Set(indicators.flatMap((i) => Object.keys(i.values))),
    );
    let pane = 1;
    const groups = new Map<string, number>();
    keys.forEach((key, index) => {
      const separate =
        /^(rsi|roc|adx|atr|macd|macd_signal|spread_bps|edge_bps|flow|zscore|probability|rank|btc_position|eth_short_position|eth_price)$/.test(
          key,
        ) || /volume/i.test(key);
      let paneIndex = 0;
      if (separate) {
        const group = key.startsWith("macd")
          ? "macd"
          : key.endsWith("position")
            ? "positions"
            : key;
        if (!groups.has(group)) groups.set(group, pane++);
        paneIndex = groups.get(group)!;
      }
      const options = {
        color: palette[index % palette.length],
        lineWidth: 2 as const,
        title: key,
        priceLineVisible: false,
        lastValueVisible: true,
        ...(key === "rsi"
          ? {
              autoscaleInfoProvider: () => ({
                priceRange: { minValue: 0, maxValue: 100 },
              }),
            }
          : {}),
      };
      const data = indicators.map((i) =>
        i.values[key] == null
          ? { time: chartTime(i.open_time_ms) }
          : { time: chartTime(i.open_time_ms), value: Number(i.values[key]) },
      );
      if (/volume/i.test(key)) {
        chart
          .addSeries(
            HistogramSeries,
            { color: "#13dfbe80", title: key, priceFormat: { type: "volume" } },
            paneIndex,
          )
          .setData(data);
      } else {
        const series = chart.addSeries(LineSeries, options, paneIndex);
        series.setData(data);
        if (key === "rsi")
          chart
            .priceScale("right", paneIndex)
            .applyOptions({ scaleMargins: { top: 0, bottom: 0 } });
        if (key === "rsi" && run) {
          [
            "oversold",
            "overbought",
            "rsi_confirmation_min",
            "recovery",
            "rsi_min",
            "rsi_max",
          ].forEach((k) => {
            if (run.parameters[k] != null)
              series.createPriceLine({
                price: Number(run.parameters[k]),
                color: "#a1e766",
                lineWidth: 1,
                lineStyle: LineStyle.Dashed,
                axisLabelVisible: true,
                title: k,
              });
          });
        }
      }
    });
    if (equity.length) {
      const s = chart.addSeries(
        LineSeries,
        {
          color: "#7caafc",
          title: "Patrimônio (USDT)",
          priceLineVisible: false,
        },
        pane++,
      );
      s.setData(
        equity.map((e) => ({
          time: chartTime(e.open_time_ms),
          value: Number(e.equity),
        })),
      );
    }
    chart.panes().forEach((p, index) => p.setHeight(index === 0 ? 350 : 120));
    chart.timeScale().fitContent();
    return () => {
      chartRef.current = null;
      markersRef.current = null;
      markers.detach();
      chart.remove();
    };
  }, [candles, indicators, equity, run]);
  useEffect(() => {
    markersRef.current?.setMarkers(markersFor(events, signals, fills));
  }, [candles, indicators, equity, run, events, signals, fills]);
  return (
    <div>
      <div
        className="chart-controls"
        role="group"
        aria-label="Visualização do gráfico"
      >
        <button type="button" onClick={() => zoom(0.8)}>
          Zoom +
        </button>
        <button type="button" onClick={() => zoom(1.25)}>
          Zoom -
        </button>
        <button
          type="button"
          onClick={() => chartRef.current?.timeScale().fitContent()}
        >
          <span aria-hidden="true">↔</span> Ver tudo
        </button>
      </div>
      <div
        ref={host}
        className="chart"
        role="img"
        aria-label="Gráfico de candles com indicadores e painéis sincronizados"
      />
      <div className="chart-credit">
        Gráficos por{" "}
        <a href="https://www.tradingview.com/" target="_blank" rel="noreferrer">
          TradingView Lightweight Charts™
        </a>{" "}
        · Horários em UTC · Setas = sinais · Círculos = execuções
      </div>
    </div>
  );
}

import { useEffect, useRef } from "react";
import {
  CandlestickSeries,
  ColorType,
  createChart,
  createSeriesMarkers,
  HistogramSeries,
  LineSeries,
  LineStyle,
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
    const markers = createSeriesMarkers(
      price,
      markersFor(events, signals, fills),
    );
    const keys = Array.from(
      new Set(indicators.flatMap((i) => Object.keys(i.values))),
    );
    let pane = 1;
    keys.forEach((key, index) => {
      const separate = key === "rsi" || /volume/i.test(key);
      let paneIndex = 0;
      if (separate) {
        paneIndex = pane++;
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
          ["oversold", "overbought", "rsi_confirmation_min"].forEach((k) => {
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
      markers.detach();
      chart.remove();
    };
  }, [candles, indicators, events, equity, run, signals, fills]);
  return (
    <div>
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

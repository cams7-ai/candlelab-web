import { jsPDF } from "jspdf";
import type {
  Candle,
  Dataset,
  Equity,
  Run,
  Session,
  TradeEvent,
} from "./types";
import { summaryLabels, summaryOrder } from "./financialSummary";
import { datasetName, format, labels, utc } from "./utils";

export interface RunReport {
  session: Session;
  dataset: Dataset;
  run: Run;
  strategyName: string;
  candles: Candle[];
  events: TradeEvent[];
  equity: Equity[];
}

// Group consecutive candles into OHLC bars so long histories remain readable on paper.
export function reportBars(candles: Candle[], maxBars = 160) {
  const sorted = [...candles].sort((a, b) => a.open_time_ms - b.open_time_ms);
  const size = Math.max(1, Math.ceil(sorted.length / maxBars));
  return Array.from({ length: Math.ceil(sorted.length / size) }, (_, i) => {
    const group = sorted.slice(i * size, (i + 1) * size);
    return {
      from: group[0].open_time_ms,
      to: group.at(-1)!.open_time_ms,
      open: Number(group[0].open),
      close: Number(group.at(-1)!.close),
      high: Math.max(...group.map((c) => Number(c.high))),
      low: Math.min(...group.map((c) => Number(c.low))),
      count: group.length,
    };
  });
}

export function buildRunPdf(report: RunReport) {
  const { session, dataset, run, candles, events, equity } = report;
  if (run.status !== "completed" || !run.summary)
    throw new Error("O PDF está disponível para processamentos concluídos.");
  const doc = new jsPDF({
    orientation: "landscape",
    unit: "mm",
    format: "a4",
    compress: true,
  });
  doc.setProperties({
    title: `Processamento ${run.id}`,
    author: "CandleLab",
    subject: session.name,
  });
  const margin = 14;
  const width = doc.internal.pageSize.getWidth();
  const height = doc.internal.pageSize.getHeight();
  const contentWidth = width - margin * 2;
  const bottom = height - 17;
  let y = 30;
  const text = (value: string, x: number, top: number, size = 9) => {
    doc.setFontSize(size).setTextColor("#182d3c").text(value, x, top);
  };
  const header = () => {
    doc.setFillColor("#0c2632").rect(0, 0, width, 21, "F");
    doc.setFont("helvetica", "bold").setTextColor("#ffffff").setFontSize(15);
    doc.text("CandleLab | Relatório de processamento", margin, 14);
    doc.setFont("helvetica", "normal");
  };
  const newPage = () => {
    doc.addPage();
    header();
    y = 30;
  };
  const title = (value: string) => {
    if (y + 15 > bottom) newPage();
    doc.setFont("helvetica", "bold");
    text(value, margin, y, 12);
    doc.setFont("helvetica", "normal");
    y += 7;
  };
  const table = (
    heading: string,
    headings: string[],
    rows: string[][],
    widths: number[],
  ) => {
    title(heading);
    const tableHead = () => {
      doc.setFillColor("#e9f0f3").rect(margin, y - 4, contentWidth, 8, "F");
      let x = margin;
      doc.setFont("helvetica", "bold");
      headings.forEach((label, i) => {
        text(label, x + 2, y + 1);
        x += widths[i];
      });
      doc.setFont("helvetica", "normal");
      y += 9;
    };
    tableHead();
    rows.forEach((row) => {
      doc.setFontSize(9);
      const cells: string[][] = row.map((cell, i) =>
        doc.splitTextToSize(cell, widths[i] - 4),
      );
      const length = Math.max(...cells.map((cell) => cell.length));
      for (let offset = 0; offset < length; ) {
        if (y + 7 > bottom) {
          newPage();
          title(`${heading} (continuação)`);
          tableHead();
        }
        const count = Math.min(
          length - offset,
          Math.max(1, Math.floor((bottom - y - 3) / 4)),
        );
        let x = margin;
        cells.forEach((cell, i) => {
          cell
            .slice(offset, offset + count)
            .forEach((line, j) => text(line, x + 2, y + j * 4));
          x += widths[i];
        });
        y += count * 4 + 3;
        doc
          .setDrawColor("#d7e1e6")
          .setLineWidth(0.2)
          .line(margin, y - 4, width - margin, y - 4);
        offset += count;
      }
    });
    y += 5;
  };
  header();
  table(
    "Identificação",
    ["Campo", "Informação"],
    [
      ["Sessão", session.name],
      ["Processamento", run.id],
      ["Estratégia", `${report.strategyName} | ${run.strategy_id}`],
      ["Conjunto", datasetName(dataset)],
      [
        "Mercado",
        `${dataset.base_asset}/${dataset.quote_asset} | ${dataset.interval} | ${candles.length} candles`,
      ],
      [
        "Período (UTC)",
        `${utc(dataset.first_open_time_ms)} a ${utc(dataset.last_open_time_ms)}`,
      ],
    ],
    [48, contentWidth - 48],
  );
  table(
    "Resumo financeiro",
    ["Métrica", "Valor"],
    summaryOrder.map((key) => {
      const value = run.summary![key];
      const unit =
        value == null
          ? ""
          : key.endsWith("_pct")
            ? "%"
            : typeof value === "number" || key === "final_position_qty"
              ? ""
              : " USDT";
      return [summaryLabels[key], format(value) + unit];
    }),
    [65, contentWidth - 65],
  );
  table(
    "Parâmetros efetivos",
    ["Parâmetro", "Valor"],
    Object.entries(run.parameters).map(([key, value]) => [
      labels[key] ?? key,
      key === "auxiliary_json"
        ? `${JSON.parse(String(value)).length} observações importadas`
        : format(value),
    ]),
    [80, contentWidth - 80],
  );

  newPage();
  title("Candles e operações executadas");
  const bars = reportBars(candles);
  const green = "#087f65";
  const red = "#bf3545";
  const left = margin + 24;
  const top = 47;
  const chartWidth = contentWidth - 28;
  const chartHeight = 87;
  if (bars.length) {
    let min = Math.min(...bars.map((b) => b.low));
    let max = Math.max(...bars.map((b) => b.high));
    const padding = (max - min || Math.abs(max) * 0.01 || 1) * 0.14;
    min -= padding;
    max += padding;
    const priceY = (value: number) =>
      top + chartHeight - ((value - min) / (max - min)) * chartHeight;
    const step = chartWidth / bars.length;
    const candleX = (index: number) => left + (index + 0.5) * step;
    for (let i = 0; i <= 4; i++) {
      const level = min + ((max - min) * i) / 4;
      const lineY = priceY(level);
      doc
        .setDrawColor("#dfe7eb")
        .setLineWidth(0.2)
        .line(left, lineY, left + chartWidth, lineY);
      text(
        level.toLocaleString("pt-BR", { maximumSignificantDigits: 7 }),
        margin,
        lineY + 1,
        8,
      );
    }
    const markers = new Map<number, Set<string>>();
    const candleIndices = new Map(
      [...candles]
        .sort((a, b) => a.open_time_ms - b.open_time_ms)
        .map((c, i) => [c.open_time_ms, i]),
    );
    const groupSize = Math.max(1, Math.ceil(candles.length / 160));
    events
      .filter(
        (event) =>
          event.kind === "fill" &&
          (!event.asset || event.asset === dataset.base_asset),
      )
      .forEach((event) => {
        const index = candleIndices.get(event.open_time_ms);
        if (index === undefined) return;
        const group = Math.floor(index / groupSize);
        if (!markers.has(group)) markers.set(group, new Set());
        markers.get(group)!.add(event.side);
      });
    bars.forEach((bar, i) => {
      const x = candleX(i);
      const color = bar.close >= bar.open ? green : red;
      doc.setDrawColor(color).setFillColor(color).setLineWidth(0.25);
      doc.line(x, priceY(bar.high), x, priceY(bar.low));
      doc.rect(
        x - step * 0.3,
        Math.min(priceY(bar.open), priceY(bar.close)),
        step * 0.6,
        Math.max(0.25, Math.abs(priceY(bar.open) - priceY(bar.close))),
        "F",
      );
      if (markers.get(i)?.has("BUY")) {
        const cy = priceY(bar.low) + 2;
        doc
          .setFillColor(green)
          .triangle(x, cy, x - 1.1, cy + 2, x + 1.1, cy + 2, "F");
      }
      if (markers.get(i)?.has("SELL")) {
        const cy = priceY(bar.high) - 2;
        doc
          .setFillColor(red)
          .triangle(x, cy, x - 1.1, cy - 2, x + 1.1, cy - 2, "F");
      }
    });
    [
      ...new Set([0, Math.floor((bars.length - 1) / 2), bars.length - 1]),
    ].forEach((index, i, indices) => {
      const label = utc(
        i === indices.length - 1 ? bars[index].to : bars[index].from,
      ).slice(0, 16);
      doc
        .setFontSize(8)
        .setTextColor("#182d3c")
        .text(label, candleX(index), top + chartHeight + 7, {
          align:
            i === 0 ? "left" : i === indices.length - 1 ? "right" : "center",
        });
    });
    text(`Preço (${dataset.quote_asset}) | Tempo (UTC)`, left, 41, 9);
    text(
      "Triângulo verde: compra | Triângulo vermelho: venda | Uma marca por lado em cada barra.",
      margin,
      151,
      9,
    );
    text(
      `Visão do período completo: ${candles.length} candles em ${bars.length} barras OHLC${bars.some((b) => b.count > 1) ? " agregadas" : ""}.`,
      margin,
      157,
      9,
    );
  } else text("Nenhum candle disponível.", margin, 50);
  if (equity.length) {
    titleAtEquity();
  }
  function titleAtEquity() {
    const points = [...equity].sort((a, b) => a.open_time_ms - b.open_time_ms);
    text("Evolução do patrimônio (USDT)", left, 168, 10);
    const values = points.map((p) => Number(p.equity));
    const min = values.reduce((a, b) => Math.min(a, b), Infinity),
      max = values.reduce((a, b) => Math.max(a, b), -Infinity);
    const range = max - min || 1;
    const first = points[0].open_time_ms,
      span = points.at(-1)!.open_time_ms - first || 1;
    doc.setDrawColor("#3167a3").setLineWidth(0.5);
    points.forEach((point, i) => {
      const x = left + ((point.open_time_ms - first) / span) * chartWidth;
      const py = 186 - ((Number(point.equity) - min) / range) * 12;
      if (i) {
        const previous = points[i - 1];
        doc.line(
          left + ((previous.open_time_ms - first) / span) * chartWidth,
          186 - ((Number(previous.equity) - min) / range) * 12,
          x,
          py,
        );
      }
    });
    text(`Mín.: ${format(min)} | Máx.: ${format(max)}`, margin, 193, 8);
  }
  if (events.length) {
    newPage();
    table(
      "Histórico de sinais e execuções",
      [
        "Candle / ocorrência (UTC)",
        "Tipo / lado / ativo",
        "Preço",
        "Quantidade",
        "Vínculo / motivo",
      ],
      [...events]
        .sort((a, b) => a.open_time_ms - b.open_time_ms || a.seq - b.seq)
        .map((event) => [
          `${utc(event.open_time_ms)}\n${utc(event.occurred_at_ms)}`,
          `${event.kind === "fill" ? "Execução" : event.kind === "signal" ? "Sinal" : "Sem execução"} / ${event.side === "BUY" ? "Compra" : "Venda"}${event.asset ? ` / ${event.asset}` : ""}`,
          format(event.price),
          format(event.quantity),
          [event.signal_id, event.reason].filter(Boolean).join(" | ") || "-",
        ]),
      [57, 52, 40, 40, contentWidth - 189],
    );
  }
  const pageCount = doc.getNumberOfPages();
  for (let page = 1; page <= pageCount; page++) {
    doc.setPage(page);
    text(
      "CandleLab | Backtest histórico | Horários em UTC",
      margin,
      height - 7,
      8,
    );
    doc.text(`${page} / ${pageCount}`, width - margin, height - 7, {
      align: "right",
    });
  }
  return doc;
}

export function downloadRunPdf(report: RunReport) {
  buildRunPdf(report).save(
    `candlelab-processamento-${report.run.id.replace(/[^a-zA-Z0-9_-]/g, "_")}.pdf`,
  );
}

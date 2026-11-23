import { render, screen, within } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { apiBase } from "../api";
import { SessionDetail } from "../components/SessionDetail";
import { runParameterLabel, runParameters } from "../combinations";
import { dataset, session, strategies } from "../mocks/fixtures";
import { buildRunPdf } from "../runPdf";
import { server } from "./setup";
import { auxiliaryMarker, auxiliaryRun } from "./fixtures/auxiliaryRun";

vi.mock("../components/Chart", () => ({ Chart: () => <div /> }));

it.each(["individual", "direct", "nested"] as const)(
  "oculta dados auxiliares de %s no detalhe, na comparação e no PDF",
  async (mode) => {
    const run = auxiliaryRun(mode);
    const original = structuredClone(run);
    server.use(
      http.get(apiBase + `/runs/${run.id}`, () => HttpResponse.json(run)),
      http.get(apiBase + `/sessions/${session.id}/runs`, () =>
        HttpResponse.json({ items: [run], next_cursor: null }),
      ),
    );
    render(<SessionDetail id={session.id} runId={run.id} navigate={vi.fn()} />);
    const detail = (
      await screen.findByRole("heading", { name: "Parâmetros efetivos" })
    ).parentElement!;
    const key = runParameters(run).find(([key]) => key.endsWith("min_roc"))![0];
    const label = runParameterLabel(run, key, strategies);
    await within(detail).findByText(label);
    const comparison = screen.getByRole("heading", {
      name: "Comparar processamentos",
    }).parentElement!;
    expect(comparison).toHaveTextContent(`${label}: -1`);
    for (const section of [detail, comparison]) {
      expect(section).not.toHaveTextContent(auxiliaryMarker);
      expect(section).not.toHaveTextContent("auxiliary_json");
      expect(section).not.toHaveTextContent("Dados auxiliares JSON");
    }
    expect(detail).toHaveTextContent("ranking-importado.json");
    expect(comparison).toHaveTextContent("ranking-importado.json");
    if (mode !== "individual") {
      const prefix = mode === "nested" ? "2 · 2" : "2";
      expect(detail).toHaveTextContent(`${prefix} · Arquivo auxiliar JSON`);
      expect(comparison).toHaveTextContent(
        `${prefix} · Arquivo auxiliar JSON: ranking-importado.json`,
      );
    }
    const doc = buildRunPdf({
      session,
      dataset,
      run,
      strategies,
      strategyName: "Momentum com ranking",
      candles: [],
      events: [],
      equity: [],
    });
    const text = doc.internal.pages.flat().join("\n");
    expect(text).not.toContain(auxiliaryMarker);
    expect(text).not.toContain("auxiliary_json");
    expect(text).not.toContain("Dados auxiliares JSON");
    expect(text).toContain("ROC mínimo");
    expect(text).toContain("ranking-importado.json");
    expect(run).toEqual(original);
  },
);

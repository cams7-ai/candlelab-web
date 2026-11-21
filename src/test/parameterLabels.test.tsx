import { render, screen, within } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { api, request } from "../api";
import { NewRun } from "../components/NewRun";
import { SessionDetail } from "../components/SessionDetail";
import { dataset, session, strategies } from "../mocks/fixtures";
import { buildRunPdf } from "../runPdf";
import type { Run } from "../types";
import { parameterLabel } from "../utils";

vi.mock("../components/Chart", () => ({ Chart: () => <div /> }));

it("mantém os nomes em português entre a configuração salva, o detalhe da sessão e o PDF", async () => {
  const saved = await api.saveCombination({
    name: "Trend Following (3,5,6)",
    kind: "strategy",
    strategy_id: "TREND_FOLLOWING@1",
    parameters: { stop_pct: "3", short_window: 5, long_window: 6 },
    members: [],
    buy_rule: "all",
    sell_rule: "any",
  });
  const view = render(
    <NewRun id={session.id} combinationId={saved.id} navigate={vi.fn()} />,
  );
  await screen.findByRole("button", {
    name: "Selecionar configuração ou combinação",
  });
  const preview = screen.getByRole("region", {
    name: "Configuração da combinação",
  });
  const previewLabels = Array.from(
    preview.querySelectorAll("dt"),
    (element) => element.textContent,
  );
  expect(previewLabels).toEqual([
    "Stop no fechamento (%)",
    "Janela curta",
    "Janela longa",
  ]);
  view.unmount();
  const created = await api.createRun(session.id, { combination_id: saved.id });
  let run: Run = created;
  for (let index = 0; index < 3; index++)
    run = await request<Run>(`/runs/${created.id}`);
  render(<SessionDetail id={session.id} runId={run.id} navigate={vi.fn()} />);
  const heading = await screen.findByRole("heading", {
    name: "Parâmetros efetivos",
  });
  await within(heading.parentElement!).findByText("Janela curta");
  const detailLabels = Array.from(
    heading.parentElement!.querySelectorAll("dt"),
    (element) => element.textContent,
  );
  expect(detailLabels).toEqual(previewLabels);
  const comparison = screen.getByRole("heading", {
    name: "Comparar processamentos",
  }).parentElement!;
  expect(comparison).toHaveTextContent("Janela curta: 5");
  expect(comparison).toHaveTextContent("Janela longa: 6");
  const doc = buildRunPdf({
    session,
    dataset,
    run,
    strategies,
    strategyName: saved.name,
    candles: [],
    events: [],
    equity: [],
  });
  const text = doc.internal.pages.flat().join("\n");
  expect(text).toContain("Janela curta");
  expect(text).toContain("Janela longa");
  expect(text).not.toContain("Short Window");
  expect(text).not.toContain("Long Window");
  expect(run.combination_snapshot?.parameters).toEqual(saved.parameters);
});

it("traduz o período sem atribuir um indicador incorreto e preserva títulos específicos em português", () => {
  const bollinger = strategies.find(
    (strategy) => strategy.id === "BOLLINGER_RECOVERY@1",
  )!;
  const momentum = strategies.find((strategy) => strategy.id === "MOMENTUM@1")!;
  expect(parameterLabel("period", bollinger)).toBe("Período");
  expect(parameterLabel("ema_period", momentum)).toBe("Período da EMA");
  expect(parameterLabel("roc_period", momentum)).toBe("Período do ROC");
  expect(parameterLabel("volume_period", momentum)).toBe("Período do volume");
  expect(parameterLabel("deviations", bollinger)).toBe("Desvios Bollinger");
});

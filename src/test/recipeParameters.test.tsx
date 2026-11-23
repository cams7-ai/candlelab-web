import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { selectRunStrategy } from "./helpers/selectRunStrategy";
import { api, request } from "../api";
import { Combinations } from "../components/Combinations";
import { StrategyDetail } from "../components/StrategyDetail";
import { StrategyConfigurationForm } from "../components/StrategyConfigurationForm";
import { NewRun } from "../components/NewRun";
import { buildRunPdf } from "../runPdf";
import { strategies, session, dataset, runs } from "../mocks/fixtures";
import type { CombinationDefinition, Run } from "../types";
import { runParameterValue } from "../combinations";

const gridDefinition = (): CombinationDefinition => ({
  name: "Minha grade ATR",
  kind: "custom",
  strategy_id: null,
  parameters: {},
  buy_rule: "all",
  sell_rule: "any",
  members: [
    {
      strategy_id: "GRID_TRADING@1",
      parameters: { spacing_mode: "atr", atr_period: 14, atr_multiple: "0.25" },
    },
    {
      strategy_id: "GRID_REGIME@1",
      parameters: {
        regime_action: "disable_grid",
        atr_period: 14,
        adx_limit: "20",
      },
    },
  ],
});

it("edita e reabre o espaçamento ATR e a ação ADX na combinação cadastrada", async () => {
  const saved = await api.saveCombination(gridDefinition());
  const view = render(<Combinations editId={saved.id} navigate={vi.fn()} />);
  await waitFor(() =>
    expect(screen.getByLabelText("Nome da combinação")).toHaveValue(saved.name),
  );
  expect(screen.getByLabelText("Modo de espaçamento")).toHaveValue("atr");
  expect(screen.getByLabelText("Espaçamento ATR")).toHaveValue("0.25");
  expect(screen.getByLabelText("Ação ao atingir o ADX máximo")).toHaveValue(
    "disable_grid",
  );
  expect(screen.getAllByLabelText("Período do ATR")).toHaveLength(1);
  fireEvent.change(screen.getByLabelText("Espaçamento ATR"), {
    target: { value: "0.5" },
  });
  await userEvent.click(
    screen.getByRole("button", { name: "Salvar combinação" }),
  );
  await screen.findByText(`Combinação “${saved.name}” salva.`);
  view.unmount();
  const updated = (await api.combinations())[0];
  expect(updated.members[0].parameters).toMatchObject({
    spacing_mode: "atr",
    atr_multiple: "0.5",
  });
  expect(updated.members[1].parameters.regime_action).toBe("disable_grid");
  render(<StrategyDetail id={saved.id} source="saved" navigate={vi.fn()} />);
  await screen.findByRole("heading", { name: saved.name });
  expect(screen.getByText("Por ATR")).toBeVisible();
  expect(screen.getByText("Desativar grade")).toBeVisible();
});

it("explica as opções usadas pelos componentes da receita pronta", async () => {
  render(
    <StrategyDetail id="GRID_ADX_ATR@1" source="catalog" navigate={vi.fn()} />,
  );
  const title = await screen.findByRole("heading", {
    name: "Componentes da receita",
  });
  expect(title.parentElement).toHaveTextContent("Modo de espaçamento: Por ATR");
  expect(title.parentElement).toHaveTextContent(
    "Ação ao atingir o ADX máximo: Desativar grade",
  );
});

it("permite salvar uma configuração individual com espaçamento ATR", async () => {
  const strategy = strategies.find((item) => item.id === "GRID_TRADING@1")!;
  const onSaved = vi.fn();
  render(
    <StrategyConfigurationForm
      strategy={strategy}
      onCancel={vi.fn()}
      onSaved={onSaved}
    />,
  );
  await userEvent.selectOptions(
    screen.getByLabelText("Modo de espaçamento"),
    "atr",
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Salvar configuração" }),
  );
  await waitFor(() => expect(onSaved).toHaveBeenCalled());
  expect(onSaved.mock.calls[0][0].parameters.spacing_mode).toBe("atr");
});

it("ajusta as opções por execução, restaura o cadastro e preserva os nomes no PDF", async () => {
  const saved = await api.saveCombination(gridDefinition());
  const navigate = vi.fn();
  render(
    <NewRun id={session.id} combinationId={saved.id} navigate={navigate} />,
  );
  await userEvent.click(
    await screen.findByRole("button", {
      name: "Editar parâmetros para esta execução",
    }),
  );
  const mode = screen.getByLabelText("Modo de espaçamento");
  await userEvent.selectOptions(mode, "range");
  await userEvent.click(
    screen.getByRole("button", { name: "Restaurar parâmetros salvos" }),
  );
  await userEvent.click(
    screen.getByRole("button", {
      name: "Editar parâmetros para esta execução",
    }),
  );
  expect(screen.getByLabelText("Modo de espaçamento")).toHaveValue("atr");
  const run = {
    ...runs[0],
    strategy_id: "CUSTOM_COMBINATION@1",
    combination_snapshot: saved,
    parameters: { definition_json: JSON.stringify(saved) },
  };
  expect(runParameterValue(run, "1 · spacing_mode", "atr", strategies)).toBe(
    "Por ATR",
  );
  const pdf = buildRunPdf({
    session,
    dataset,
    run,
    strategies,
    strategyName: saved.name,
    candles: [],
    events: [],
    equity: [],
  })
    .internal.pages.flat()
    .join("\n");
  expect(pdf).toContain("Por ATR");
  expect(pdf).toContain("Desativar grade");
  expect(pdf).not.toContain("disable_grid");
});

it("rejeita opções inválidas e desativação sem uma grade", async () => {
  const invalid = gridDefinition();
  invalid.members[0].parameters.spacing_mode = "unsupported";
  await expect(api.saveCombination(invalid)).rejects.toMatchObject({
    status: 422,
  });
  const noGrid = gridDefinition();
  noGrid.members[0] = { strategy_id: "SMA_CROSS@1", parameters: {} };
  await expect(api.saveCombination(noGrid)).rejects.toMatchObject({
    status: 422,
  });
});

it("executa Grid individual com a opção de espaçamento escolhida", async () => {
  const navigate = vi.fn();
  render(<NewRun id={session.id} navigate={navigate} />);
  await screen.findByRole("button", { name: "Selecionar estratégia" });
  await selectRunStrategy("GRID_TRADING@1");
  await userEvent.selectOptions(
    screen.getByLabelText("Modo de espaçamento"),
    "atr",
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Iniciar processamento" }),
  );
  await waitFor(() => expect(navigate).toHaveBeenCalled());
  const id = new URL(
    navigate.mock.calls[0][0],
    "http://local",
  ).searchParams.get("run")!;
  const run = await request<Run>(`/runs/${id}`);
  expect(run.parameters.spacing_mode).toBe("atr");
});

it("explica a restrição de dados externos da receita Momentum com Ranking", async () => {
  render(
    <StrategyDetail
      id="MOMENTUM_RANKING@1"
      source="catalog"
      navigate={vi.fn()}
    />,
  );
  expect(
    await screen.findByText("Indisponível: exige dados auxiliares externos"),
  ).toBeVisible();
  expect(
    screen.getByText(/Esta receita depende de dados auxiliares externos/),
  ).toBeVisible();
});

import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";
import App from "../App";
import { api, apiBase, request } from "../api";
import { StrategyDetail } from "../components/StrategyDetail";
import { NewRun } from "../components/NewRun";
import { Combinations } from "../components/Combinations";
import type { Run, Strategy } from "../types";
import { session } from "../mocks/fixtures";
import { server } from "./setup";

async function editor() {
  await userEvent.click(
    await screen.findByRole("button", {
      name: "Criar configuração personalizada",
    }),
  );
  return screen.getByRole("region", {
    name: "Nova configuração personalizada",
  });
}

it("cria, reabre e edita parâmetros sem alterar o catálogo ou o snapshot de execuções", async () => {
  location.hash = "/strategies/SMA_CROSS%401";
  const view = render(<App />);
  const form = await editor();
  fireEvent.change(within(form).getByLabelText("Nome da configuração"), {
    target: { value: "SMA ajustada" },
  });
  fireEvent.change(within(form).getByLabelText(/SMA curta/), {
    target: { value: "3" },
  });
  fireEvent.change(within(form).getByLabelText(/SMA longa/), {
    target: { value: "8" },
  });
  await userEvent.click(
    within(form).getByRole("button", { name: "Salvar configuração" }),
  );
  await screen.findByRole("heading", { level: 1, name: "SMA ajustada" });
  const saved = (await api.combinations())[0];
  expect(saved.kind).toBe("strategy");
  expect(saved.parameters).toEqual({ short_window: 3, long_window: 8 });
  const catalog = await request<{ items: Strategy[] }>("/strategies");
  expect(
    catalog.items.find((s) => s.id === "SMA_CROSS@1")?.defaults.short_window,
  ).toBe(9);
  const run = await api.createRun(session.id, { combination_id: saved.id });
  view.unmount();
  render(<App />);
  await userEvent.click(
    await screen.findByRole("button", { name: "Editar parâmetros" }),
  );
  expect(screen.getByLabelText(/SMA curta/)).toHaveValue("3");
  fireEvent.change(screen.getByLabelText(/SMA curta/), {
    target: { value: "4" },
  });
  await userEvent.click(
    screen.getByRole("button", { name: "Salvar configuração" }),
  );
  await waitFor(() =>
    expect(
      screen.queryByLabelText("Nome da configuração"),
    ).not.toBeInTheDocument(),
  );
  expect((await api.combinations())[0].parameters.short_window).toBe(4);
  const historical = await request<Run>(`/runs/${run.id}`);
  expect(historical.combination_snapshot).toEqual(saved);
  expect(historical.parameters.short_window).toBe(3);
  await userEvent.click(
    screen.getByRole("button", { name: "Excluir configuração" }),
  );
  const dialog = within(
    screen.getByRole("alertdialog", { name: "Excluir configuração?" }),
  );
  expect(await dialog.findByRole("alert")).toHaveTextContent(
    "Processamentos vinculados: 1",
  );
  expect(
    dialog.getByRole("button", { name: "Excluir configuração" }),
  ).toBeDisabled();
  expect(await api.combinations()).toHaveLength(1);
  expect((await request<Run>(`/runs/${run.id}`)).combination_snapshot).toEqual(
    saved,
  );
  for (let index = 0; index < 3; index++) await request(`/runs/${run.id}`);
  await api.deleteRun(run.id);
  await userEvent.click(
    dialog.getByRole("button", { name: "Verificar vínculos novamente" }),
  );
  await waitFor(() =>
    expect(
      dialog.getByRole("button", { name: "Excluir configuração" }),
    ).toBeEnabled(),
  );
  await userEvent.click(
    dialog.getByRole("button", { name: "Excluir configuração" }),
  );
  await screen.findByRole("heading", { level: 1, name: "SMA" });
  expect(await api.combinations()).toEqual([]);
});

it("preserva decimais como texto e permite salvar uma receita publicada", async () => {
  const navigate = vi.fn();
  render(
    <StrategyDetail
      id="RSI_BOLLINGER@1"
      source="catalog"
      navigate={navigate}
    />,
  );
  const form = await editor();
  fireEvent.change(within(form).getByLabelText(/Recuperação RSI/), {
    target: { value: "25,123456789012" },
  });
  await userEvent.click(
    within(form).getByRole("button", { name: "Salvar configuração" }),
  );
  await waitFor(() => expect(navigate).toHaveBeenCalled());
  const saved = (await api.combinations())[0];
  expect(saved.kind).toBe("preset");
  expect(saved.parameters.recovery).toBe("25.123456789012");
});

it("valida parâmetros, preserva o formulário em falha e permite retentar", async () => {
  const navigate = vi.fn();
  render(
    <StrategyDetail id="SMA_CROSS@1" source="catalog" navigate={navigate} />,
  );
  const form = await editor();
  fireEvent.change(within(form).getByLabelText(/SMA curta/), {
    target: { value: "30" },
  });
  await userEvent.click(
    within(form).getByRole("button", { name: "Salvar configuração" }),
  );
  expect(await screen.findByRole("alert")).toHaveTextContent("janela curta");
  expect(await api.combinations()).toEqual([]);
  await userEvent.click(
    within(form).getByRole("button", { name: "Restaurar padrões" }),
  );
  expect(within(form).getByLabelText(/SMA curta/)).toHaveValue("9");
  server.use(
    http.post(apiBase + "/strategy-combinations", () =>
      HttpResponse.json(
        {
          error: {
            code: "UNAVAILABLE",
            message: "Falha ao salvar",
            details: null,
          },
        },
        { status: 503 },
      ),
    ),
  );
  fireEvent.change(within(form).getByLabelText(/SMA curta/), {
    target: { value: "5" },
  });
  await userEvent.click(
    within(form).getByRole("button", { name: "Salvar configuração" }),
  );
  expect(await screen.findByRole("alert")).toHaveTextContent("Falha ao salvar");
  expect(within(form).getByLabelText(/SMA curta/)).toHaveValue("5");
  server.resetHandlers();
  await userEvent.click(
    within(form).getByRole("button", { name: "Salvar configuração" }),
  );
  await waitFor(() => expect(navigate).toHaveBeenCalled());
  expect((await api.combinations())[0].parameters.short_window).toBe(5);
});

it("cancela a edição sem criar um cadastro e valida JSON auxiliar", async () => {
  render(
    <StrategyDetail
      id="MACHINE_LEARNING@1"
      source="catalog"
      navigate={vi.fn()}
    />,
  );
  const form = await editor();
  fireEvent.change(within(form).getByLabelText("Dados auxiliares JSON"), {
    target: { value: "{" },
  });
  await userEvent.click(
    within(form).getByRole("button", { name: "Salvar configuração" }),
  );
  expect(await screen.findByRole("alert")).toHaveTextContent("JSON inválido");
  await userEvent.click(
    within(form).getByRole("button", { name: "Cancelar edição" }),
  );
  expect(
    screen.queryByLabelText("Nome da configuração"),
  ).not.toBeInTheDocument();
  expect(await api.combinations()).toEqual([]);
});

it("oferece configurações de sinal no processamento e mantém filtros fora da execução individual", async () => {
  const saved = await api.saveCombination({
    name: "SMA personalizada",
    kind: "strategy",
    strategy_id: "SMA_CROSS@1",
    parameters: { short_window: 3, long_window: 8 },
    members: [],
    buy_rule: "all",
    sell_rule: "any",
  });
  const { id: _id, ...definition } = saved;
  await api.saveCombination({
    ...definition,
    name: "ADX forte",
    strategy_id: "ADX_CONFIRMATION@1",
    parameters: { adx_limit: "30" },
  });
  const navigate = vi.fn();
  render(
    <NewRun id={session.id} combinationId={saved.id} navigate={navigate} />,
  );
  expect(
    await screen.findByRole("button", {
      name: "Selecionar configuração ou combinação",
    }),
  ).toHaveTextContent(saved.name);
  await userEvent.click(
    screen.getByRole("button", {
      name: "Selecionar configuração ou combinação",
    }),
  );
  expect(
    within(screen.getByRole("dialog")).queryByRole("radio", {
      name: "ADX forte",
    }),
  ).not.toBeInTheDocument();
  await userEvent.click(
    within(screen.getByRole("dialog")).getByRole("button", {
      name: "Cancelar",
    }),
  );
  await userEvent.click(
    screen.getByRole("button", { name: /Iniciar processamento/ }),
  );
  await waitFor(() => expect(navigate).toHaveBeenCalled());
  const run = await request<Run>(
    `/runs/${navigate.mock.calls[0][0].split("run=")[1]}`,
  );
  expect(run.parameters.short_window).toBe(3);
  expect(run.combination_snapshot?.id).toBe(saved.id);
});

it("reutiliza uma configuração de filtro em combinação com seu papel preservado", async () => {
  const saved = await api.saveCombination({
    name: "ADX forte",
    kind: "strategy",
    strategy_id: "ADX_CONFIRMATION@1",
    parameters: { adx_limit: "30" },
    members: [],
    buy_rule: "all",
    sell_rule: "any",
  });
  render(<Combinations navigate={vi.fn()} />);
  fireEvent.change(await screen.findByLabelText("Nome da combinação"), {
    target: { value: "Sinal com ADX" },
  });
  await userEvent.click(
    screen.getByRole("button", { name: "Adicionar estratégia" }),
  );
  const dialog = screen.getByRole("dialog");
  await userEvent.type(within(dialog).getByRole("searchbox"), "SMA_CROSS@1");
  await userEvent.click(within(dialog).getByRole("checkbox"));
  await userEvent.clear(within(dialog).getByRole("searchbox"));
  await userEvent.click(
    within(dialog).getByRole("button", {
      name: "Configurações personalizadas",
    }),
  );
  await userEvent.click(
    within(dialog).getByRole("checkbox", { name: "ADX forte" }),
  );
  await userEvent.click(
    within(dialog).getByRole("button", { name: "Adicionar selecionadas (2)" }),
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Salvar combinação" }),
  );
  await screen.findByText("Combinação “Sinal com ADX” salva.");
  const combo = (await api.combinations()).find(
    (item) => item.name === "Sinal com ADX",
  )!;
  expect(combo.members[1].combination?.strategy_id).toBe(saved.strategy_id);
  expect(combo.members[1].combination?.parameters.adx_limit).toBe("30");
});

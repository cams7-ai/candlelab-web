import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { expect, it, vi } from "vitest";
import { api, apiBase, request } from "../api";
import {
  indicatorContext,
  runParameters,
  runStrategyName,
} from "../combinations";
import type { CombinationMember, Run } from "../types";
import { NewRun } from "../components/NewRun";
import { session } from "../mocks/fixtures";
import { server } from "./setup";

async function seed() {
  const base = {
    kind: "strategy" as const,
    strategy_id: "SMA_CROSS@1",
    parameters: { short_window: 3, long_window: 8 },
    members: [],
    buy_rule: "all" as const,
    sell_rule: "any" as const,
  };
  const [configuration, recipe, combination, auxiliary] = await Promise.all([
    api.saveCombination({ ...base, name: "SMA personalizada" }),
    api.saveCombination({
      ...base,
      kind: "preset",
      strategy_id: "EMA_ADX_ATR@1",
      parameters: {},
      name: "Receita de tendência",
    }),
    api.saveCombination({
      ...base,
      kind: "custom",
      strategy_id: null,
      parameters: {},
      name: "Grupo livre",
      members: [
        { strategy_id: "SMA_CROSS@1", parameters: {} },
        { strategy_id: "EMA_CROSS@1", parameters: {} },
      ],
    }),
    api.saveCombination({
      ...base,
      name: "Arbitragem personalizada",
      strategy_id: "ARBITRAGE@1",
      parameters: {
        auxiliary_json:
          '[{"open_time_ms":0,"bid":"100","ask":"101","bid_b":"102","ask_b":"103","capacity_base":"1"}]',
      },
    }),
  ]);
  await api.saveCombination({
    ...base,
    name: "Filtro ADX personalizado",
    strategy_id: "ADX_CONFIRMATION@1",
    parameters: { adx_limit: "30" },
  });
  return { configuration, recipe, combination, auxiliary };
}
async function open() {
  const trigger = await screen.findByRole("button", {
    name: "Selecionar configuração ou combinação",
  });
  await userEvent.click(trigger);
  return {
    trigger,
    dialog: within(
      screen.getByRole("dialog", {
        name: "Selecionar configuração ou combinação",
      }),
    ),
  };
}

it("busca cadastros e estratégias base, filtra os tipos e oferece somente configurações executáveis", async () => {
  const { configuration, auxiliary } = await seed();
  render(
    <NewRun
      id={session.id}
      combinationId={configuration.id}
      navigate={vi.fn()}
    />,
  );
  const { dialog } = await open();
  const search = dialog.getByRole("searchbox", {
    name: "Buscar configurações e combinações",
  });
  expect(search).toHaveFocus();
  expect(dialog.getAllByRole("radio")).toHaveLength(4);
  expect(
    dialog.queryByRole("radio", { name: "Filtro ADX personalizado" }),
  ).not.toBeInTheDocument();
  expect(
    dialog
      .getByRole("radio", { name: configuration.name })
      .closest(".picker-option")
      ?.querySelector(".picker-parameter-preview"),
  ).toHaveTextContent("SMA curta");
  await userEvent.click(dialog.getByRole("button", { name: "Receitas" }));
  expect(dialog.getAllByRole("radio")).toHaveLength(1);
  expect(
    dialog.getByRole("radio", { name: "Receita de tendência" }),
  ).toBeInTheDocument();
  await userEvent.click(
    dialog.getByRole("button", { name: "Combinações livres" }),
  );
  expect(dialog.getAllByRole("radio")).toHaveLength(1);
  expect(
    dialog.getByRole("radio", { name: "Grupo livre" }),
  ).toBeInTheDocument();
  await userEvent.click(dialog.getByRole("button", { name: "Todas" }));
  await userEvent.type(search, "ARBITRAGE@1");
  expect(dialog.getAllByRole("radio")).toHaveLength(1);
  expect(dialog.getByRole("radio", { name: auxiliary.name })).toBeEnabled();
  await userEvent.clear(search);
  await userEvent.type(search, auxiliary.id);
  expect(dialog.getAllByRole("radio")).toHaveLength(1);
  await userEvent.clear(search);
  await userEvent.type(search, "nome inexistente");
  expect(
    dialog.getByText("Nenhuma configuração encontrada"),
  ).toBeInTheDocument();
  await userEvent.click(
    dialog.getByRole("button", { name: "Ver todas as opções" }),
  );
  expect(dialog.getAllByRole("radio")).toHaveLength(4);
});

it("descarta uma troca pendente ao cancelar e preserva a seleção ao filtrar", async () => {
  const { configuration, recipe } = await seed();
  render(
    <NewRun
      id={session.id}
      combinationId={configuration.id}
      navigate={vi.fn()}
    />,
  );
  const { trigger, dialog } = await open();
  await userEvent.click(dialog.getByRole("radio", { name: recipe.name }));
  expect(
    dialog.getByRole("radio", { name: configuration.name }),
  ).not.toBeChecked();
  expect(trigger).toHaveTextContent(configuration.name);
  await userEvent.keyboard("{Escape}");
  expect(trigger).toHaveFocus();
  expect(trigger).toHaveTextContent(configuration.name);
  const reopened = (await open()).dialog;
  expect(
    reopened.getByRole("radio", { name: configuration.name }),
  ).toBeChecked();
  await userEvent.click(
    reopened.getByRole("button", { name: "Combinações livres" }),
  );
  await userEvent.click(reopened.getByRole("button", { name: "Todas" }));
  expect(
    reopened.getByRole("radio", { name: configuration.name }),
  ).toBeChecked();
  await userEvent.click(reopened.getByRole("button", { name: "Cancelar" }));
  expect(trigger).toHaveTextContent(configuration.name);
});

it("aplica a escolha somente ao confirmar e envia apenas o ID do cadastro selecionado", async () => {
  const { configuration, combination } = await seed();
  const sent = vi.fn();
  const navigate = vi.fn();
  server.use(
    http.post(apiBase + `/sessions/${session.id}/runs`, async ({ request }) => {
      sent(await request.json());
      return HttpResponse.json({ id: "new-saved-run" }, { status: 202 });
    }),
  );
  render(
    <NewRun
      id={session.id}
      combinationId={configuration.id}
      navigate={navigate}
    />,
  );
  const { trigger, dialog } = await open();
  await userEvent.type(dialog.getByRole("searchbox"), "grupo livre{Enter}");
  await userEvent.click(dialog.getByRole("radio", { name: combination.name }));
  expect(sent).not.toHaveBeenCalled();
  expect(trigger).toHaveTextContent(configuration.name);
  await userEvent.click(
    dialog.getByRole("button", { name: "Usar configuração" }),
  );
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(trigger).toHaveTextContent(combination.name);
  await userEvent.click(
    screen.getByRole("button", { name: /Iniciar processamento/ }),
  );
  await waitFor(() =>
    expect(navigate).toHaveBeenCalledWith(
      `/sessions/${session.id}?run=new-saved-run`,
    ),
  );
  expect(sent).toHaveBeenCalledWith({ combination_id: combination.id });
});

it("mantém o JSON auxiliar recolhido com contagem de observações e permite inspecionar o conteúdo", async () => {
  const { auxiliary } = await seed();
  render(
    <NewRun id={session.id} combinationId={auxiliary.id} navigate={vi.fn()} />,
  );
  await screen.findByRole("button", {
    name: "Selecionar configuração ou combinação",
  });
  const preview = within(
    screen.getByRole("region", { name: "Configuração da combinação" }),
  );
  expect(preview.getByText("1 observação importada")).toBeVisible();
  const summary = preview.getByText("Ver dados auxiliares");
  const details = summary.closest("details")!;
  expect(details).not.toHaveAttribute("open");
  expect(details.querySelector("pre")).not.toBeInTheDocument();
  await userEvent.click(summary);
  expect(details).toHaveAttribute("open");
  await waitFor(() => expect(details.querySelector("pre")).toBeVisible());
  expect(details).toHaveTextContent('"capacity_base":"1"');
});

it("edita uma configuração somente para a execução e valida seus parâmetros", async () => {
  const { configuration } = await seed();
  const sent = vi.fn();
  const navigate = vi.fn();
  server.use(
    http.post(apiBase + `/sessions/${session.id}/runs`, async ({ request }) => {
      sent(await request.json());
      return HttpResponse.json({ id: "adjusted" }, { status: 202 });
    }),
  );
  render(
    <NewRun
      id={session.id}
      combinationId={configuration.id}
      navigate={navigate}
    />,
  );
  await userEvent.click(
    await screen.findByRole("button", {
      name: "Editar parâmetros para esta execução",
    }),
  );
  const short = screen.getByLabelText("SMA curta");
  expect(short).toHaveValue("3");
  await userEvent.clear(short);
  await userEvent.type(short, "10");
  await userEvent.click(
    screen.getByRole("button", { name: "Iniciar processamento" }),
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "janela curta menor",
  );
  expect(sent).not.toHaveBeenCalled();
  expect(short).toHaveValue("10");
  await userEvent.clear(short);
  await userEvent.type(short, "5");
  await userEvent.click(
    screen.getByRole("button", { name: "Iniciar processamento" }),
  );
  await waitFor(() => expect(navigate).toHaveBeenCalled());
  expect(sent).toHaveBeenCalledWith({
    strategy_id: "SMA_CROSS@1",
    parameters: expect.objectContaining({ short_window: 5, long_window: 8 }),
  });
  expect(
    (await api.combinations()).find((item) => item.id === configuration.id),
  ).toEqual(configuration);
});

it("edita os parâmetros compartilhados e grupos internos sem alterar os cadastros", async () => {
  const group = {
    name: "Grupo ATR",
    kind: "custom" as const,
    strategy_id: null,
    parameters: {},
    buy_rule: "all" as const,
    sell_rule: "any" as const,
    members: [
      { strategy_id: "BREAKOUT@1", parameters: { atr_multiple: "2" } },
      { strategy_id: "ATR_EXIT@1", parameters: { atr_multiple: "2" } },
    ],
  };
  const saved = await api.saveCombination({
    ...group,
    name: "Com grupos",
    members: [
      ...group.members,
      { strategy_id: "", parameters: {}, combination: group },
    ],
  });
  const navigate = vi.fn();
  render(
    <NewRun id={session.id} combinationId={saved.id} navigate={navigate} />,
  );
  await userEvent.click(
    await screen.findByRole("button", {
      name: "Editar parâmetros para esta execução",
    }),
  );
  const root = within(
    screen.getAllByRole("region", { name: "Parâmetros da combinação" })[0],
  );
  expect(
    root.getAllByLabelText("Multiplicador do stop móvel por ATR"),
  ).toHaveLength(1);
  await userEvent.clear(
    root.getByLabelText("Multiplicador do stop móvel por ATR"),
  );
  await userEvent.type(
    root.getByLabelText("Multiplicador do stop móvel por ATR"),
    "0.2",
  );
  const nested = within(
    screen.getByRole("region", { name: "Parâmetros do grupo Grupo ATR" }),
  );
  await userEvent.clear(nested.getByLabelText("Período do ATR"));
  await userEvent.type(nested.getByLabelText("Período do ATR"), "21");
  await userEvent.click(
    screen.getByRole("button", { name: "Iniciar processamento" }),
  );
  await waitFor(() => expect(navigate).toHaveBeenCalled());
  const runId = new URL(
    navigate.mock.calls[0][0],
    "http://local",
  ).searchParams.get("run")!;
  const run = await request<Run>(`/runs/${runId}`);
  const definition = JSON.parse(String(run.parameters.definition_json));
  expect(definition).not.toHaveProperty("id");
  expect(
    definition.members
      .slice(0, 2)
      .map((member: CombinationMember) => member.parameters.atr_multiple),
  ).toEqual(["0.2", "0.2"]);
  expect(
    definition.members[2].combination.members.map(
      (member: CombinationMember) => member.parameters.atr_period,
    ),
  ).toEqual([21, 21]);
  expect(runStrategyName(run)).toBe(saved.name);
  expect(runParameters(run)).toContainEqual(["1 · atr_multiple", "0.2"]);
  expect(
    indicatorContext(run, "member_3__member_1__atr").parameters.atr_period,
  ).toBe(21);
  expect(
    (await api.combinations()).find((item) => item.id === saved.id),
  ).toEqual(saved);
});

it("preserva ajustes ao cancelar a seleção e restaura os parâmetros salvos", async () => {
  const { configuration, recipe } = await seed();
  const sent = vi.fn();
  server.use(
    http.post(apiBase + `/sessions/${session.id}/runs`, async ({ request }) => {
      sent(await request.json());
      return HttpResponse.json({ id: "restored" }, { status: 202 });
    }),
  );
  render(
    <NewRun
      id={session.id}
      combinationId={configuration.id}
      navigate={vi.fn()}
    />,
  );
  await userEvent.click(
    await screen.findByRole("button", {
      name: "Editar parâmetros para esta execução",
    }),
  );
  const input = screen.getByLabelText("SMA curta");
  await userEvent.clear(input);
  await userEvent.type(input, "5");
  const { dialog } = await open();
  await userEvent.click(dialog.getByRole("radio", { name: recipe.name }));
  await userEvent.click(dialog.getByRole("button", { name: "Cancelar" }));
  expect(input).toHaveValue("5");
  await userEvent.click(
    screen.getByRole("button", { name: "Restaurar parâmetros salvos" }),
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Iniciar processamento" }),
  );
  await waitFor(() =>
    expect(sent).toHaveBeenCalledWith({ combination_id: configuration.id }),
  );
});

it("edita uma receita salva e redefine o rascunho ao trocar de cadastro", async () => {
  const { configuration, recipe } = await seed();
  const sent = vi.fn();
  server.use(
    http.post(apiBase + `/sessions/${session.id}/runs`, async ({ request }) => {
      sent(await request.json());
      return HttpResponse.json({ id: "recipe-adjusted" }, { status: 202 });
    }),
  );
  render(
    <NewRun
      id={session.id}
      combinationId={configuration.id}
      navigate={vi.fn()}
    />,
  );
  await userEvent.click(
    await screen.findByRole("button", {
      name: "Editar parâmetros para esta execução",
    }),
  );
  const { dialog } = await open();
  await userEvent.click(dialog.getByRole("radio", { name: recipe.name }));
  await userEvent.click(
    dialog.getByRole("button", { name: "Usar configuração" }),
  );
  expect(screen.queryByLabelText("SMA curta")).not.toBeInTheDocument();
  await userEvent.click(
    screen.getByRole("button", {
      name: "Editar parâmetros para esta execução",
    }),
  );
  const stop = screen.getByLabelText("Stop no fechamento (%)");
  await userEvent.clear(stop);
  await userEvent.type(stop, "4.5");
  await userEvent.click(
    screen.getByRole("button", { name: "Iniciar processamento" }),
  );
  await waitFor(() =>
    expect(sent).toHaveBeenCalledWith({
      strategy_id: "EMA_ADX_ATR@1",
      parameters: expect.objectContaining({ stop_pct: "4.5" }),
    }),
  );
  expect(
    (await api.combinations()).find((item) => item.id === recipe.id),
  ).toEqual(recipe);
});

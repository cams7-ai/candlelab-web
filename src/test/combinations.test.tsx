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
import { Combinations } from "../components/Combinations";
import { NewRun } from "../components/NewRun";
import {
  indicatorContext,
  runParameters,
  runStrategyName,
} from "../combinations";
import type { CombinationDefinition, Run } from "../types";
import { session } from "../mocks/fixtures";
import { server } from "./setup";

const definition = (name = "SMA e EMA"): CombinationDefinition => ({
  name,
  kind: "custom",
  strategy_id: null,
  parameters: {},
  members: ["SMA_CROSS@1", "EMA_CROSS@1"].map((strategy_id) => ({
    strategy_id,
    parameters: { short_window: 2, long_window: 3 },
  })),
  buy_rule: "all",
  sell_rule: "any",
});

async function addOptions(...queries: string[]) {
  await userEvent.click(
    await screen.findByRole("button", { name: "Adicionar estratégia" }),
  );
  const dialog = screen.getByRole("dialog", { name: "Adicionar estratégia" });
  const search = within(dialog).getByRole("searchbox", {
    name: "Buscar estratégias",
  });
  for (const query of queries) {
    await userEvent.clear(search);
    await userEvent.type(search, query);
    await userEvent.click(within(dialog).getByRole("checkbox"));
  }
  await userEvent.click(
    within(dialog).getByRole("button", { name: /^Adicionar selecionadas/ }),
  );
}

async function openImporter() {
  const summary = screen.getByText("Importar componentes de uma combinação");
  if (!summary.closest("details")?.open) await userEvent.click(summary);
}

async function configure(name: string) {
  const summary = screen.getByText(`Configurar ${name}`);
  if (!summary.closest("details")?.open) await userEvent.click(summary);
}

it("cadastra combinação livre, reabre, edita e exclui com confirmação", async () => {
  const view = render(<Combinations navigate={vi.fn()} />);
  await screen.findByLabelText("Nome da combinação");
  await userEvent.type(
    screen.getByLabelText("Nome da combinação"),
    "SMA e EMA",
  );
  await addOptions("SMA_CROSS@1");
  await addOptions("EMA_CROSS@1");
  expect(screen.queryByRole("option", { name: /DCA/ })).not.toBeInTheDocument();
  await userEvent.selectOptions(
    screen.getByLabelText("Regra de compra"),
    "any",
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Salvar combinação" }),
  );
  await screen.findByRole("button", { name: "Editar SMA e EMA" });
  view.unmount();
  render(<Combinations navigate={vi.fn()} />);
  await userEvent.click(
    await screen.findByRole("button", { name: "Editar SMA e EMA" }),
  );
  expect(screen.getByLabelText("Nome da combinação")).toHaveValue("SMA e EMA");
  expect(screen.getByLabelText("Regra de compra")).toHaveValue("any");
  await userEvent.clear(screen.getByLabelText("Nome da combinação"));
  await userEvent.type(screen.getByLabelText("Nome da combinação"), "Editada");
  await userEvent.click(
    screen.getByRole("button", { name: "Salvar combinação" }),
  );
  await userEvent.click(
    await screen.findByRole("button", { name: "Excluir Editada" }),
  );
  const dialog = screen.getByRole("alertdialog", {
    name: "Excluir combinação?",
  });
  expect(dialog).toHaveTextContent("configuração original");
  await userEvent.click(
    within(dialog).getByRole("button", { name: "Cancelar" }),
  );
  expect(
    screen.getByRole("button", { name: "Excluir Editada" }),
  ).toBeInTheDocument();
  await userEvent.click(
    screen.getByRole("button", { name: "Excluir Editada" }),
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Excluir combinação" }),
  );
  await screen.findByText("Nenhuma combinação cadastrada.");
});

it("salva parâmetros de uma combinação publicada e retorna ao novo processamento", async () => {
  const navigate = vi.fn();
  render(
    <Combinations
      navigate={navigate}
      returnTo={`/sessions/${session.id}/runs/new`}
    />,
  );
  await screen.findByLabelText("Nome da combinação");
  await userEvent.selectOptions(
    screen.getByLabelText("Tipo de combinação"),
    "preset",
  );
  await userEvent.type(
    screen.getByLabelText("Nome da combinação"),
    "EMA ADX ajustada",
  );
  await userEvent.selectOptions(
    screen.getByLabelText("Combinação publicada"),
    "EMA_ADX_ATR@1",
  );
  const short = screen.getByLabelText(/Janela curta/);
  fireEvent.change(short, { target: { value: "5" } });
  await userEvent.click(
    screen.getByRole("button", { name: "Salvar combinação" }),
  );
  await waitFor(() =>
    expect(navigate).toHaveBeenCalledWith(
      expect.stringContaining(`/sessions/${session.id}/runs/new?combination=`),
    ),
  );
  const saved = (await api.combinations())[0];
  expect(saved.parameters.short_window).toBe(5);
  expect(saved.parameters.stop_pct).toBe("3");
});

it("preserva formulário em falha e permite corrigir parâmetros e tentar novamente", async () => {
  server.use(
    http.post(apiBase + "/strategy-combinations", () =>
      HttpResponse.json(
        {
          error: {
            code: "UNAVAILABLE",
            message: "Falha ao salvar combinação",
            details: null,
          },
        },
        { status: 503 },
      ),
    ),
  );
  render(<Combinations navigate={vi.fn()} />);
  await screen.findByLabelText("Nome da combinação");
  await userEvent.type(
    screen.getByLabelText("Nome da combinação"),
    "Preservada",
  );
  await addOptions("SMA_CROSS@1");
  await userEvent.click(
    screen.getByRole("button", { name: "Salvar combinação" }),
  );
  expect(await screen.findByRole("alert")).toHaveTextContent("pelo menos duas");
  await addOptions("EMA_CROSS@1");
  await userEvent.click(
    screen.getByRole("button", { name: "Salvar combinação" }),
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Falha ao salvar combinação",
  );
  expect(screen.getByLabelText("Nome da combinação")).toHaveValue("Preservada");
  expect(
    screen.getByRole("button", { name: "Salvar combinação" }),
  ).toBeEnabled();
});

it("seleciona combinação e envia somente seu ID para iniciar processamento", async () => {
  const saved = await api.saveCombination(definition());
  const navigate = vi.fn();
  let sent: unknown;
  server.use(
    http.post(apiBase + `/sessions/${session.id}/runs`, async ({ request }) => {
      sent = await request.json();
      return HttpResponse.json({ id: "combined-run" }, { status: 202 });
    }),
  );
  render(
    <NewRun id={session.id} navigate={navigate} combinationId={saved.id} />,
  );
  expect(
    await screen.findByRole("button", {
      name: "Selecionar configuração ou combinação",
    }),
  ).toHaveTextContent(saved.name);
  await userEvent.click(
    await screen.findByRole("button", { name: /Iniciar processamento/ }),
  );
  await waitFor(() =>
    expect(navigate).toHaveBeenCalledWith(
      `/sessions/${session.id}?run=combined-run`,
    ),
  );
  expect(sent).toEqual({ combination_id: saved.id });
});

it("mantém o snapshot do processamento após editar e excluir cadastro no demo", async () => {
  const saved = await api.saveCombination(definition());
  const run = await api.createRun(session.id, { combination_id: saved.id });
  await api.saveCombination(
    { ...definition("Novo nome"), buy_rule: "any" },
    saved.id,
  );
  await api.deleteCombination(saved.id);
  const historical = await request<Run>(`/runs/${run.id}`);
  expect(historical.combination_snapshot).toEqual(saved);
  expect(runStrategyName(historical)).toBe("SMA e EMA");
  expect(runParameters(historical)).toContainEqual([
    "Regra de compra",
    "Todas",
  ]);
  expect(historical.parameters.definition_json).toContain("SMA_CROSS@1");
});

it("oferece retentativa na consulta e não seleciona combinação indisponível", async () => {
  server.use(
    http.get(apiBase + "/strategy-combinations", () =>
      HttpResponse.json(
        {
          error: {
            code: "UNAVAILABLE",
            message: "Falha no catálogo de combinações",
            details: null,
          },
        },
        { status: 503 },
      ),
    ),
  );
  render(<NewRun id={session.id} navigate={vi.fn()} combinationId="missing" />);
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Falha no catálogo",
  );
  expect(
    screen.getByRole("button", { name: /Iniciar processamento/ }),
  ).toBeDisabled();
  server.resetHandlers();
  await userEvent.click(
    screen.getByRole("button", { name: "Tentar novamente" }),
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "não está disponível",
  );
});

it("abre o endereço antigo na aba Combinações de Estratégias", async () => {
  location.hash = "/combinations";
  render(<App />);
  await screen.findByLabelText("Nome da combinação");
  expect(
    screen.getByRole("heading", { name: "Estratégias", level: 1 }),
  ).toBeInTheDocument();
  expect(screen.getByRole("tab", { name: "Combinações" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  const nav = screen.getByRole("navigation", { name: "Navegação principal" });
  expect(
    within(nav).queryByRole("link", { name: "Combinações" }),
  ).not.toBeInTheDocument();
  expect(within(nav).getByRole("link", { name: "Estratégias" })).toHaveClass(
    "active",
  );
  expect(
    new URL(location.hash.slice(1), "http://local").searchParams.get("tab"),
  ).toBe("combinations");
});

it("importa componentes em um novo cadastro sem alterar a origem ou suas regras", async () => {
  const original = await api.saveCombination({
    ...definition("Origem"),
    buy_rule: "any",
    sell_rule: "all",
  });
  render(<Combinations navigate={vi.fn()} />);
  await screen.findByLabelText("Nome da combinação");
  await userEvent.type(screen.getByLabelText("Nome da combinação"), "Derivada");
  await openImporter();
  await userEvent.selectOptions(
    screen.getByLabelText("Importar estratégias de uma combinação"),
    original.id,
  );
  await configure("SMA");
  await configure("EMA");
  expect(screen.getByLabelText(/SMA curta/)).toHaveValue("2");
  expect(screen.getByLabelText(/EMA longa/)).toHaveValue("3");
  expect(screen.getByLabelText("Regra de compra")).toHaveValue("all");
  expect(screen.getByLabelText("Regra de venda")).toHaveValue("any");
  fireEvent.change(screen.getByLabelText(/SMA curta/), {
    target: { value: "1" },
  });
  await userEvent.click(
    screen.getByRole("button", { name: "Salvar combinação" }),
  );
  await screen.findByRole("button", { name: "Editar Derivada" });
  const saved = await api.combinations();
  expect(saved.find((item) => item.id === original.id)).toEqual(original);
  const derived = saved.find((item) => item.name === "Derivada")!;
  expect(derived.id).not.toBe(original.id);
  expect(derived.members[0].parameters.short_window).toBe(1);
  expect(derived.buy_rule).toBe("all");
  expect(derived.sell_rule).toBe("any");
});

it("importa várias origens sem duplicar estratégias ou substituir parâmetros do formulário", async () => {
  const first = await api.saveCombination(definition("Primeira"));
  const second = await api.saveCombination({
    ...definition("Segunda"),
    members: [
      {
        strategy_id: "SMA_CROSS@1",
        parameters: { short_window: 5, long_window: 10 },
      },
      {
        strategy_id: "RSI_REVERSION@1",
        parameters: { period: 14, oversold: "30", overbought: "70" },
      },
    ],
  });
  render(<Combinations navigate={vi.fn()} />);
  await screen.findByLabelText("Nome da combinação");
  await openImporter();
  const selector = await screen.findByLabelText(
    "Importar estratégias de uma combinação",
  );
  await userEvent.selectOptions(selector, first.id);
  await configure("SMA");
  fireEvent.change(screen.getByLabelText(/SMA curta/), {
    target: { value: "1" },
  });
  await userEvent.selectOptions(selector, second.id);
  expect(screen.getAllByLabelText(/SMA curta/)).toHaveLength(1);
  expect(screen.getByLabelText(/SMA curta/)).toHaveValue("1");
  expect(screen.getByLabelText(/EMA curta/)).toHaveValue("2");
  expect(screen.getByLabelText(/Período do RSI/)).toHaveValue("14");
  expect(screen.getByRole("status")).toHaveTextContent(
    "1 repetida(s) ignorada(s)",
  );
  await userEvent.selectOptions(selector, second.id);
  expect(screen.getByRole("status")).toHaveTextContent(
    "0 estratégia(s) importada(s)",
  );
  expect(await api.combinations()).toEqual([first, second]);
});

it("rejeita importação incompatível sem alterar o formulário", async () => {
  const original = await api.saveCombination(definition());
  server.use(
    http.get(apiBase + "/strategies", () => HttpResponse.json({ items: [] })),
  );
  render(<Combinations navigate={vi.fn()} />);
  await screen.findByLabelText("Nome da combinação");
  await openImporter();
  await userEvent.selectOptions(
    await screen.findByLabelText("Importar estratégias de uma combinação"),
    original.id,
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Nenhuma estratégia foi importada",
  );
  expect(
    screen.queryByRole("button", { name: /Remover/ }),
  ).not.toBeInTheDocument();
  expect(await api.combinations()).toEqual([original]);
});

it("rejeita importação que excede oito componentes sem adicionar parte deles", async () => {
  const items = Array.from({ length: 9 }, (_, index) => ({
    id: `strategy-${index}`,
    name: `Estratégia ${index}`,
    combinable: true,
    parameters_schema: { properties: {} },
    defaults: {},
  }));
  server.use(
    http.get(apiBase + "/strategies", () => HttpResponse.json({ items })),
    http.get(apiBase + "/strategy-combinations", () =>
      HttpResponse.json({
        items: [
          {
            ...definition("Oito"),
            id: "eight",
            members: items
              .slice(0, 8)
              .map((s) => ({ strategy_id: s.id, parameters: {} })),
          },
        ],
      }),
    ),
  );
  render(<Combinations navigate={vi.fn()} />);
  await addOptions("strategy-8");
  await openImporter();
  await userEvent.selectOptions(
    screen.getByLabelText("Importar estratégias de uma combinação"),
    "eight",
  );
  expect(await screen.findByRole("alert")).toHaveTextContent("limite de 8");
  expect(screen.getAllByRole("button", { name: /Remover/ })).toHaveLength(1);
  expect(
    screen.getByRole("button", { name: "Remover Estratégia 8" }),
  ).toBeInTheDocument();
});

it("adiciona uma combinação como grupo preservando regras e snapshots após alterações na origem", async () => {
  const original = await api.saveCombination({
    ...definition("Grupo origem"),
    buy_rule: "any",
    sell_rule: "all",
  });
  render(<Combinations navigate={vi.fn()} />);
  await userEvent.type(
    await screen.findByLabelText("Nome da combinação"),
    "Composta",
  );
  await addOptions(original.id);
  expect(
    screen.getByRole("button", { name: "Remover Grupo origem" }),
  ).toBeInTheDocument();
  await addOptions("RSI_REVERSION@1");
  await userEvent.click(
    screen.getByRole("button", { name: "Salvar combinação" }),
  );
  await screen.findByRole("button", { name: "Editar Composta" });
  const saved = (await api.combinations()).find(
    (item) => item.name === "Composta",
  )!;
  expect(saved.members[0].combination?.buy_rule).toBe("any");
  expect(saved.members[0].combination?.sell_rule).toBe("all");
  expect(saved.buy_rule).toBe("all");
  const run = await api.createRun(session.id, { combination_id: saved.id });
  await api.saveCombination(definition("Origem editada"), original.id);
  await api.deleteCombination(original.id);
  const historical = await request<Run>(`/runs/${run.id}`);
  expect(historical.combination_snapshot).toEqual(saved);
  expect(runParameters(historical)).toContainEqual([
    "1 · Regra de compra",
    "Qualquer uma",
  ]);
  expect(
    (await api.combinations()).find((item) => item.id === saved.id),
  ).toEqual(saved);
});

it("reutiliza uma combinação publicada como grupo e mostra seus componentes individuais", async () => {
  const preset = await api.saveCombination({
    ...definition("Receita MACD"),
    kind: "preset",
    strategy_id: "MACD_EMA_RSI@1",
    members: [],
    parameters: { rsi_min: "45" },
  });
  render(<Combinations navigate={vi.fn()} />);
  await userEvent.type(
    await screen.findByLabelText("Nome da combinação"),
    "MACD com SMA",
  );
  await addOptions(preset.id);
  await addOptions("SMA_CROSS@1");
  await userEvent.click(
    screen.getByRole("button", { name: "Salvar combinação" }),
  );
  await screen.findByRole("button", { name: "Editar MACD com SMA" });
  const saved = (await api.combinations()).find(
    (item) => item.name === "MACD com SMA",
  )!;
  expect(saved.members[0].combination?.strategy_id).toBe("MACD_EMA_RSI@1");
  expect(saved.members[0].combination?.parameters.rsi_min).toBe("45");
  await addOptions("MACD_EMA_RSI@1");
  await configure("MACD + EMA + RSI");
  const recipe = screen.getByRole("list", {
    name: "Componentes de MACD + EMA + RSI",
  });
  expect(recipe).toHaveTextContent("Sinal MACD · Sinal");
  expect(recipe).toHaveTextContent("Preço acima da EMA · Filtro de compra");
  expect(recipe).toHaveTextContent("Faixa RSI · Filtro de compra");
  await userEvent.click(
    screen.getByRole("button", { name: "Adicionar estratégia" }),
  );
  expect(
    screen.getByRole("checkbox", { name: "Confirmação ADX" }),
  ).toBeInTheDocument();
});

it("não oferece grupos com execução incompatível e recusa combinações sem sinal", async () => {
  const grid = await api.saveCombination({
    ...definition("Grade"),
    kind: "preset",
    strategy_id: "GRID_ADX_ATR@1",
    members: [],
  });
  render(<Combinations navigate={vi.fn()} />);
  await userEvent.click(
    await screen.findByRole("button", { name: "Adicionar estratégia" }),
  );
  expect(screen.getByRole("checkbox", { name: "Grade" })).toBeDisabled();
  await userEvent.click(screen.getByRole("button", { name: "Cancelar" }));
  await expect(
    api.saveCombination({
      ...definition(),
      members: [
        { strategy_id: "ADX_CONFIRMATION@1", parameters: {} },
        { strategy_id: "ATR_EXIT@1", parameters: {} },
      ],
    }),
  ).rejects.toThrow(/sinal/);
  expect((await api.combinations()).map((item) => item.id)).toContain(grid.id);
});

it("resolve os parâmetros de indicadores dentro de grupos aninhados", () => {
  const snapshot = {
    ...definition(),
    id: "nested",
    members: [{ strategy_id: "", parameters: {}, combination: definition() }],
  };
  const run = { combination_snapshot: snapshot, parameters: {} } as Run;
  expect(indicatorContext(run, "member_1__member_2__rsi")).toEqual({
    prefix: "member_1__member_2__",
    indicatorKey: "rsi",
    parameters: { short_window: 2, long_window: 3 },
  });
});

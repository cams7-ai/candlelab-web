import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";
import App from "../App";
import { api, apiBase, request } from "../api";
import { Strategies } from "../components/Strategies";
import { StrategyDetail } from "../components/StrategyDetail";
import { Combinations } from "../components/Combinations";
import { session } from "../mocks/fixtures";
import type { CombinationDefinition, Run } from "../types";
import { server } from "./setup";

const definition = (name = "Minha combinação"): CombinationDefinition => ({
  name,
  kind: "custom",
  strategy_id: null,
  parameters: {},
  buy_rule: "any",
  sell_rule: "all",
  members: [
    {
      strategy_id: "SMA_CROSS@1",
      parameters: { short_window: 2, long_window: 5 },
    },
    {
      strategy_id: "EMA_CROSS@1",
      parameters: { short_window: 3, long_window: 6 },
    },
  ],
});

it("lista o catálogo completo e cadastros, com busca sem acentos e filtros", async () => {
  await api.saveCombination(definition());
  render(<Strategies />);
  await screen.findByRole("link", { name: "Grid Trading" });
  expect(
    screen.getByRole("link", { name: "Machine Learning" }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("link", { name: "Saída trailing ATR" }),
  ).toBeInTheDocument();
  expect(screen.getByText(`35 de 35 estratégias`)).toBeInTheDocument();
  expect(
    screen.getByRole("columnheader", { name: "Ações" }),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole("link", { name: /^Ver detalhes/ }),
  ).not.toBeInTheDocument();
  await userEvent.type(
    screen.getByLabelText("Buscar estratégias"),
    "recuperacao bollinger",
  );
  expect(
    screen.getByRole("link", { name: "Recuperação Bollinger" }),
  ).toBeInTheDocument();
  expect(screen.getByText("2 de 35 estratégias")).toBeInTheDocument();
  expect(
    screen.queryByRole("columnheader", { name: "Ações" }),
  ).not.toBeInTheDocument();
  for (const row of screen.getAllByRole("row").slice(1)) {
    expect(within(row).getAllByRole("cell")).toHaveLength(3);
  }
  await userEvent.clear(screen.getByLabelText("Buscar estratégias"));
  await userEvent.selectOptions(
    screen.getByLabelText("Tipo de estratégia"),
    "saved",
  );
  expect(
    screen.getByRole("link", { name: "Minha combinação" }),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole("link", { name: "Grid Trading" }),
  ).not.toBeInTheDocument();
  expect(
    screen.getByRole("columnheader", { name: "Ações" }),
  ).toBeInTheDocument();
  await userEvent.type(
    screen.getByLabelText("Buscar estratégias"),
    "inexistente",
  );
  expect(
    screen.getByText("Nenhuma estratégia encontrada para estes filtros."),
  ).toBeInTheDocument();
});

it("abre detalhes pela lista e navega para os componentes da receita", async () => {
  location.hash = "/strategies";
  render(<App />);
  await userEvent.click(
    await screen.findByRole("link", { name: "Trend Following + ADX + ATR" }),
  );
  expect(
    await screen.findByRole("heading", {
      level: 1,
      name: "Trend Following + ADX + ATR",
    }),
  ).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Estratégias" })).toHaveClass(
    "active",
  );
  const components = screen.getByRole("region", {
    name: "Componentes da receita",
  });
  expect(within(components).getAllByRole("listitem")).toHaveLength(3);
  await userEvent.click(
    within(components).getByRole("link", { name: "Confirmação ADX" }),
  );
  expect(
    await screen.findByRole("heading", { level: 1, name: "Confirmação ADX" }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("region", { name: "Parâmetros padrão" }),
  ).toHaveTextContent("ADX mínimo");
});

it("abre URL direta com versão e exibe regras, limites e dados auxiliares", async () => {
  location.hash = "/strategies/SCALPING%401";
  render(<App />);
  await screen.findByRole("heading", { level: 1, name: "Scalping" });
  expect(
    screen.getByRole("region", { name: "Regras e funcionamento" }),
  ).toHaveTextContent("VWAP");
  const data = screen.getByRole("region", { name: "Dados necessários" });
  for (const field of ["bid", "ask", "flow", "capacity_base"])
    expect(within(data).getByText(field)).toBeInTheDocument();
  expect(
    screen.getByRole("table", { name: "Parâmetros padrão de Scalping" }),
  ).toHaveTextContent("≤ 1000");
  expect(
    screen.queryByRole("button", { name: "Excluir combinação" }),
  ).not.toBeInTheDocument();
});

it("informa estratégia ausente e permite voltar à lista", async () => {
  render(<StrategyDetail id="missing@1" source="catalog" navigate={vi.fn()} />);
  await screen.findByRole("heading", { name: "Estratégia não encontrada" });
  expect(
    screen.getByRole("link", { name: /Voltar à lista de estratégias/ }),
  ).toHaveAttribute("href", "#/strategies");
});

it("permite tentar novamente após falha ao carregar o catálogo", async () => {
  server.use(
    http.get(apiBase + "/strategies", () =>
      HttpResponse.json(
        {
          error: {
            code: "UNAVAILABLE",
            message: "Catálogo indisponível",
            details: null,
          },
        },
        { status: 503 },
      ),
    ),
  );
  render(<Strategies />);
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Catálogo indisponível",
  );
  server.resetHandlers();
  await userEvent.click(
    screen.getByRole("button", { name: "Tentar novamente" }),
  );
  expect(
    await screen.findByRole("link", { name: "Momentum" }),
  ).toBeInTheDocument();
});

it("mostra grupos e parâmetros preservados e abre a combinação para editar", async () => {
  const original = await api.saveCombination(definition("Origem"));
  const { id: _, ...snapshot } = original;
  const saved = await api.saveCombination({
    ...definition("Derivada"),
    members: [
      { strategy_id: "", parameters: {}, combination: snapshot },
      { strategy_id: "RSI_REVERSION@1", parameters: {} },
    ],
  });
  location.hash = `/strategies/combinations/${saved.id}`;
  render(<App />);
  await screen.findByRole("heading", { level: 1, name: "Derivada" });
  expect(
    screen.getByRole("region", { name: "Composição e parâmetros" }),
  ).toHaveTextContent("Qualquer uma");
  await userEvent.click(screen.getByText("Ver grupo Origem"));
  expect(screen.getByRole("link", { name: "SMA" })).toBeInTheDocument();
  expect(screen.getByText("SMA curta")).toBeInTheDocument();
  await userEvent.click(
    screen.getByRole("link", { name: "Editar combinação" }),
  );
  await screen.findByRole("heading", { name: "Editar combinação" });
  expect(screen.getByLabelText("Nome da combinação")).toHaveValue("Derivada");
  expect(screen.getByLabelText("Regra de venda")).toHaveValue("all");
});

it("cancela e confirma exclusão na lista, preservando o snapshot do processamento", async () => {
  const saved = await api.saveCombination(definition());
  const run = await api.createRun(session.id, { combination_id: saved.id });
  render(<Strategies />);
  const remove = await screen.findByRole("button", {
    name: "Excluir combinação Minha combinação",
  });
  await userEvent.click(remove);
  const dialog = screen.getByRole("alertdialog", {
    name: "Excluir combinação?",
  });
  expect(dialog).toHaveTextContent("cópias incorporadas");
  await userEvent.click(
    within(dialog).getByRole("button", { name: "Cancelar" }),
  );
  expect(await api.combinations()).toHaveLength(1);
  await userEvent.click(remove);
  await userEvent.click(
    screen.getByRole("button", { name: "Excluir combinação" }),
  );
  await waitFor(() =>
    expect(
      screen.queryByRole("link", { name: "Minha combinação" }),
    ).not.toBeInTheDocument(),
  );
  const historical = await request<Run>(`/runs/${run.id}`);
  expect(historical.combination_snapshot).toEqual(saved);
  expect(await api.combinations()).toEqual([]);
});

it("preserva o cadastro quando a exclusão falha e permite repetir pelos detalhes", async () => {
  const saved = await api.saveCombination(definition());
  const navigate = vi.fn();
  server.use(
    http.delete(apiBase + `/strategy-combinations/${saved.id}`, () =>
      HttpResponse.json(
        {
          error: {
            code: "UNAVAILABLE",
            message: "Não foi possível excluir",
            details: null,
          },
        },
        { status: 503 },
      ),
    ),
  );
  render(<StrategyDetail id={saved.id} source="saved" navigate={navigate} />);
  await userEvent.click(
    await screen.findByRole("button", { name: "Excluir combinação" }),
  );
  await userEvent.click(
    within(screen.getByRole("alertdialog")).getByRole("button", {
      name: "Excluir combinação",
    }),
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Não foi possível excluir",
  );
  expect(await api.combinations()).toHaveLength(1);
  expect(navigate).not.toHaveBeenCalled();
  server.resetHandlers();
  await userEvent.click(
    within(screen.getByRole("alertdialog")).getByRole("button", {
      name: "Excluir combinação",
    }),
  );
  await waitFor(() => expect(navigate).toHaveBeenCalledWith("/strategies"));
  expect(await api.combinations()).toEqual([]);
});

it("mostra a exclusão antes dos parâmetros na tela de combinações", async () => {
  await api.saveCombination(definition());
  render(<Combinations navigate={vi.fn()} />);
  expect(
    await screen.findByRole("button", { name: "Excluir Minha combinação" }),
  ).toBeVisible();
  expect(
    screen.getByRole("link", { name: "Ver detalhes de Minha combinação" }),
  ).toBeVisible();
  expect(
    screen.getByText("Ver configuração de Minha combinação").closest("details"),
  ).not.toHaveAttribute("open");
});

it("exibe os parâmetros efetivos de uma receita cadastrada", async () => {
  const saved = await api.saveCombination({
    ...definition("RSI ajustada"),
    buy_rule: "all",
    sell_rule: "any",
    kind: "preset",
    strategy_id: "RSI_BOLLINGER@1",
    members: [],
    parameters: { recovery: "35" },
  });
  render(<StrategyDetail id={saved.id} source="saved" navigate={vi.fn()} />);
  await screen.findByRole("heading", { level: 1, name: "RSI ajustada" });
  const composition = screen.getByRole("region", {
    name: "Composição e parâmetros",
  });
  expect(
    within(composition).getByRole("link", { name: "RSI + Bollinger Bands" }),
  ).toHaveAttribute(
    "href",
    expect.stringContaining("#/strategies/RSI_BOLLINGER%401?trail="),
  );
  expect(composition).toHaveTextContent("35");
});

it("preserva busca e tipo ao voltar dos detalhes pelo link Voltar à lista de estratégias", async () => {
  location.hash = "/strategies";
  render(<App />);
  await screen.findByLabelText("Buscar estratégias");
  await userEvent.selectOptions(
    screen.getByLabelText("Tipo de estratégia"),
    "recipe",
  );
  await userEvent.type(screen.getByLabelText("Buscar estratégias"), "ADX");
  const filteredHash = location.hash;
  await userEvent.click(
    screen.getByRole("link", { name: "Trend Following + ADX + ATR" }),
  );
  await screen.findByRole("heading", {
    level: 1,
    name: "Trend Following + ADX + ATR",
  });
  expect(
    screen.getByRole("link", { name: /Voltar à lista de estratégias/ }),
  ).toHaveAttribute("href", filteredHash);
  await userEvent.click(
    screen.getByRole("link", { name: /Voltar à lista de estratégias/ }),
  );
  expect(await screen.findByLabelText("Buscar estratégias")).toHaveValue("ADX");
  expect(screen.getByLabelText("Tipo de estratégia")).toHaveValue("recipe");
  expect(
    screen.getByRole("link", { name: "Grid + ADX + ATR" }),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole("link", { name: "Momentum" }),
  ).not.toBeInTheDocument();
});

it("preserva filtros após reabrir o detalhe por URL e navegar pelos seus componentes", async () => {
  const name = "RSI + EMA & confirmação";
  await api.saveCombination(definition(name));
  location.hash = "/strategies";
  const view = render(<App />);
  await screen.findByLabelText("Buscar estratégias");
  await userEvent.selectOptions(
    screen.getByLabelText("Tipo de estratégia"),
    "saved",
  );
  await userEvent.type(screen.getByLabelText("Buscar estratégias"), name);
  const filteredHash = location.hash;
  await userEvent.click(screen.getByRole("link", { name }));
  await screen.findByRole("heading", { level: 1, name });
  view.unmount();
  render(<App />);
  await screen.findByRole("heading", { level: 1, name });
  await userEvent.click(screen.getByRole("link", { name: "SMA" }));
  await screen.findByRole("heading", { level: 1, name: "SMA" });
  await userEvent.click(
    screen.getByRole("link", { name: `Voltar aos detalhes de ${name}` }),
  );
  await screen.findByRole("heading", { level: 1, name });
  expect(
    screen.getByRole("link", { name: /Voltar à lista de estratégias/ }),
  ).toHaveAttribute("href", filteredHash);
  await userEvent.click(
    screen.getByRole("link", { name: /Voltar à lista de estratégias/ }),
  );
  expect(await screen.findByLabelText("Buscar estratégias")).toHaveValue(name);
  expect(screen.getByLabelText("Tipo de estratégia")).toHaveValue("saved");
  expect(screen.getByRole("link", { name })).toBeInTheDocument();
});

it("restaura filtros com o voltar do navegador sem criar histórico para cada letra", async () => {
  location.hash = "/strategies";
  render(<App />);
  await screen.findByLabelText("Buscar estratégias");
  const historyLength = history.length;
  await userEvent.type(screen.getByLabelText("Buscar estratégias"), "Momentum");
  await userEvent.selectOptions(
    screen.getByLabelText("Tipo de estratégia"),
    "individual",
  );
  expect(history.length).toBe(historyLength);
  const filteredHash = location.hash;
  await userEvent.click(screen.getByRole("link", { name: "Momentum" }));
  await screen.findByRole("heading", { level: 1, name: "Momentum" });
  history.back();
  expect(await screen.findByLabelText("Buscar estratégias")).toHaveValue(
    "Momentum",
  );
  expect(screen.getByLabelText("Tipo de estratégia")).toHaveValue("individual");
  expect(location.hash).toBe(filteredHash);
});

it("retorna à listagem filtrada após excluir uma combinação pelos detalhes", async () => {
  await api.saveCombination(definition("Alvo"));
  location.hash = "/strategies?q=Alvo&type=saved";
  render(<App />);
  await userEvent.click(await screen.findByRole("link", { name: "Alvo" }));
  await userEvent.click(
    await screen.findByRole("button", { name: "Excluir combinação" }),
  );
  await userEvent.click(
    within(screen.getByRole("alertdialog")).getByRole("button", {
      name: "Excluir combinação",
    }),
  );
  expect(await screen.findByLabelText("Buscar estratégias")).toHaveValue(
    "Alvo",
  );
  expect(screen.getByLabelText("Tipo de estratégia")).toHaveValue("saved");
  expect(
    screen.getByText("Nenhuma estratégia encontrada para estes filtros."),
  ).toBeInTheDocument();
});

it("volta ao detalhe de origem em vários níveis e mantém o filtro após reabrir a página", async () => {
  await api.saveCombination({
    ...definition("Combinação principal"),
    members: [
      { strategy_id: "EMA_ADX_ATR@1", parameters: {} },
      { strategy_id: "SMA_CROSS@1", parameters: {} },
    ],
  });
  location.hash = "/strategies?q=principal&type=saved";
  const view = render(<App />);
  await userEvent.click(
    await screen.findByRole("link", { name: "Combinação principal" }),
  );
  await screen.findByRole("heading", {
    level: 1,
    name: "Combinação principal",
  });
  const rootHash = location.hash;
  await userEvent.click(
    screen.getByRole("link", { name: "Trend Following + ADX + ATR" }),
  );
  await screen.findByRole("heading", {
    level: 1,
    name: "Trend Following + ADX + ATR",
  });
  expect(
    screen.getByRole("link", {
      name: "Voltar aos detalhes de Combinação principal",
    }),
  ).toHaveAttribute("href", rootHash);
  const recipeHash = location.hash;
  await userEvent.click(screen.getByRole("link", { name: "Confirmação ADX" }));
  await screen.findByRole("heading", { level: 1, name: "Confirmação ADX" });
  view.unmount();
  render(<App />);
  await screen.findByRole("heading", { level: 1, name: "Confirmação ADX" });
  const backToRecipe = screen.getByRole("link", {
    name: "Voltar aos detalhes de Trend Following + ADX + ATR",
  });
  expect(backToRecipe).toHaveAttribute("href", recipeHash);
  expect(
    screen.queryByRole("link", { name: "Voltar à lista de estratégias" }),
  ).not.toBeInTheDocument();
  await userEvent.click(backToRecipe);
  await screen.findByRole("heading", {
    level: 1,
    name: "Trend Following + ADX + ATR",
  });
  await userEvent.click(
    screen.getByRole("link", {
      name: "Voltar aos detalhes de Combinação principal",
    }),
  );
  await screen.findByRole("heading", {
    level: 1,
    name: "Combinação principal",
  });
  await userEvent.click(
    screen.getByRole("link", { name: "Voltar à lista de estratégias" }),
  );
  expect(await screen.findByLabelText("Buscar estratégias")).toHaveValue(
    "principal",
  );
  expect(screen.getByLabelText("Tipo de estratégia")).toHaveValue("saved");
});

it.each([
  "not-json",
  JSON.stringify([{ id: "SMA_CROSS@1", source: "invalid" }]),
  JSON.stringify([{ id: "removed", source: "saved" }]),
])(
  "retorna à lista filtrada quando a origem está inválida ou indisponível (%s)",
  async (trail) => {
    render(
      <StrategyDetail
        id="SMA_CROSS@1"
        source="catalog"
        navigate={vi.fn()}
        returnTo="/strategies?type=recipe"
        trail={trail}
      />,
    );
    await screen.findByRole("heading", { level: 1, name: "SMA" });
    expect(
      screen.getByRole("link", { name: "Voltar à lista de estratégias" }),
    ).toHaveAttribute("href", "#/strategies?type=recipe");
  },
);

import { selectRunStrategy } from "./helpers/selectRunStrategy";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import App from "../App";
import { NewRun } from "../components/NewRun";
import { session, strategies } from "../mocks/fixtures";

it("não inventa categoria quando o catálogo não a informa e mostra os papéis da receita", async () => {
  render(<NewRun id={session.id} navigate={vi.fn()} />);
  await screen.findByRole("button", { name: "Selecionar estratégia" });
  expect(screen.queryByText("Legada")).not.toBeInTheDocument();
  expect(
    screen.getByRole("region", { name: "Regras da estratégia" }),
  ).not.toHaveTextContent("·");
  await selectRunStrategy("EMA_ADX_ATR@1");
  const rules = screen.getByRole("region", { name: "Regras da estratégia" });
  expect(
    within(rules).getByRole("heading", { name: "Componentes da receita" }),
  ).toBeInTheDocument();
  for (const component of strategies.find(
    (item) => item.id === "EMA_ADX_ATR@1",
  )!.components!) {
    expect(
      within(rules).getByText(
        strategies.find((item) => item.id === component.strategy_id)!.name,
      ),
    ).toBeInTheDocument();
  }
  expect(within(rules).getByText("Sinal")).toBeInTheDocument();
  expect(within(rules).getByText("Filtro de compra")).toBeInTheDocument();
  expect(within(rules).getByText("Saída")).toBeInTheDocument();
});

it("preserva o retorno ao processamento pelo catálogo, detalhes e filtros", async () => {
  const processing = `/sessions/${session.id}/runs/new`;
  location.hash = processing;
  render(<App />);
  await userEvent.click(
    await screen.findByRole("link", {
      name: "Consultar estratégias e configurações",
    }),
  );
  await userEvent.type(
    await screen.findByRole("searchbox", { name: "Buscar estratégias" }),
    "SMA",
  );
  await userEvent.click(await screen.findByRole("link", { name: "SMA" }));
  await screen.findByRole("heading", { level: 1, name: "SMA" });
  await userEvent.click(
    screen.getByRole("link", { name: "Voltar à lista de estratégias" }),
  );
  expect(
    await screen.findByRole("searchbox", { name: "Buscar estratégias" }),
  ).toHaveValue("SMA");
  const back = screen.getByRole("link", { name: "Voltar ao processamento" });
  expect(back).toHaveAttribute("href", `#${processing}`);
  await userEvent.click(back);
  expect(
    await screen.findByRole("heading", {
      level: 1,
      name: "Novo processamento",
    }),
  ).toBeInTheDocument();
});

it("busca por nome sem acentos, filtra receitas e limita a seleção a uma estratégia executável", async () => {
  render(<NewRun id={session.id} navigate={vi.fn()} />);
  await userEvent.click(
    await screen.findByRole("button", { name: "Selecionar estratégia" }),
  );
  const dialog = within(screen.getByRole("dialog"));
  const search = dialog.getByRole("searchbox");
  expect(search).toHaveFocus();
  expect(dialog.queryByRole("checkbox")).not.toBeInTheDocument();
  const available = strategies.filter(
    (item) => !item.composition_role || item.composition_role === "signal",
  );
  expect(dialog.getAllByRole("radio")).toHaveLength(available.length);
  for (const item of strategies.filter(
    (item) =>
      item.composition_role === "filter" || item.composition_role === "exit",
  )) {
    expect(
      dialog.queryByRole("radio", { name: item.name }),
    ).not.toBeInTheDocument();
  }
  await userEvent.click(
    dialog.getByRole("button", { name: "Combinações prontas" }),
  );
  const recipes = available.filter(
    (item) => item.category === "combination" || item.components?.length,
  );
  expect(dialog.getAllByRole("radio")).toHaveLength(recipes.length);
  await userEvent.click(dialog.getByRole("button", { name: "Todas" }));
  await userEvent.type(search, "direcao ema");
  expect(dialog.getAllByRole("radio")).toHaveLength(1);
  await userEvent.click(dialog.getByRole("radio"));
  await userEvent.clear(search);
  await userEvent.type(search, "ARBITRAGE@1");
  const arbitrage = dialog.getByRole("radio");
  expect(arbitrage).not.toBeDisabled();
  await userEvent.click(arbitrage);
  await userEvent.clear(search);
  expect(
    dialog
      .getAllByRole("radio")
      .filter((item) => (item as HTMLInputElement).checked),
  ).toHaveLength(1);
  await userEvent.click(
    dialog.getByRole("button", { name: "Usar estratégia" }),
  );
  expect(
    screen.getByRole("button", { name: "Selecionar estratégia" }),
  ).toHaveTextContent("ARBITRAGE@1");
  expect(screen.getByLabelText("Dados auxiliares JSON")).toBeInTheDocument();
});

it("preserva os parâmetros ao cancelar ou confirmar a mesma estratégia e os redefine ao trocar", async () => {
  render(<NewRun id={session.id} navigate={vi.fn()} />);
  const trigger = await screen.findByRole("button", {
    name: "Selecionar estratégia",
  });
  const short = screen.getByLabelText(/SMA curta/);
  await userEvent.clear(short);
  await userEvent.type(short, "5");
  await userEvent.click(trigger);
  let dialog = within(screen.getByRole("dialog"));
  await userEvent.type(dialog.getByRole("searchbox"), "EMA_CROSS@1");
  await userEvent.click(dialog.getByRole("radio"));
  await userEvent.keyboard("{Escape}");
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(trigger).toHaveFocus();
  expect(short).toHaveValue("5");
  await userEvent.click(trigger);
  dialog = within(screen.getByRole("dialog"));
  expect(dialog.getByRole("radio", { name: "SMA" })).toBeChecked();
  await userEvent.click(
    dialog.getByRole("button", { name: "Usar estratégia" }),
  );
  expect(short).toHaveValue("5");
  await selectRunStrategy("EMA_CROSS@1");
  expect(screen.getByLabelText(/EMA curta/)).toHaveValue("9");
});

it("explica uma busca sem resultados e recupera as opções", async () => {
  render(<NewRun id={session.id} navigate={vi.fn()} />);
  await userEvent.click(
    await screen.findByRole("button", { name: "Selecionar estratégia" }),
  );
  const dialog = within(screen.getByRole("dialog"));
  await userEvent.type(dialog.getByRole("searchbox"), "estratégia inexistente");
  expect(dialog.getByText("Nenhuma estratégia encontrada")).toBeInTheDocument();
  await userEvent.click(
    dialog.getByRole("button", { name: "Ver todas as opções" }),
  );
  expect(dialog.getByRole("searchbox")).toHaveValue("");
  expect(dialog.getAllByRole("radio").length).toBeGreaterThan(0);
  await userEvent.click(dialog.getByRole("button", { name: "Cancelar" }));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});

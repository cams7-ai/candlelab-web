import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { Combinations } from "../components/Combinations";
import { apiBase } from "../api";
import { server } from "./setup";

async function openPicker() {
  const trigger = await screen.findByRole("button", {
    name: "Adicionar estratégia",
  });
  await userEvent.click(trigger);
  return {
    trigger,
    dialog: screen.getByRole("dialog", { name: "Adicionar estratégia" }),
  };
}

it("seleciona em várias categorias, confirma em lote e recolhe os parâmetros", async () => {
  render(<Combinations navigate={vi.fn()} />);
  const { dialog } = await openPicker();
  const search = within(dialog).getByRole("searchbox", {
    name: "Buscar estratégias",
  });
  await userEvent.type(search, "SMA_CROSS@1");
  await userEvent.click(within(dialog).getByRole("checkbox", { name: "SMA" }));
  await userEvent.clear(search);
  await userEvent.click(
    within(dialog).getByRole("button", {
      name: "Filtros de compra",
    }),
  );
  await userEvent.type(search, "confirmacao adx");
  expect(within(dialog).getAllByRole("checkbox")).toHaveLength(1);
  await userEvent.click(
    within(dialog).getByRole("checkbox", { name: "Confirmação ADX" }),
  );
  expect(
    screen.queryByRole("button", { name: "Remover SMA" }),
  ).not.toBeInTheDocument();
  await userEvent.click(
    within(dialog).getByRole("button", { name: "Adicionar selecionadas (2)" }),
  );
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(screen.getByText("2 de 8 adicionados")).toBeInTheDocument();
  const configure = screen.getByText("Configurar SMA");
  expect(configure.closest("details")).not.toHaveAttribute("open");
  await userEvent.click(configure);
  const short = screen.getByLabelText(/SMA curta/);
  await userEvent.clear(short);
  await userEvent.type(short, "5");
  await openPicker();
  const repeated = screen.getByRole("checkbox", { name: "SMA" });
  expect(repeated).toBeChecked();
  expect(repeated).toBeDisabled();
  await userEvent.click(screen.getByRole("button", { name: "Cancelar" }));
  expect(short).toHaveValue("5");
});

it("mantém foco no painel, cancela com Escape e devolve foco ao botão", async () => {
  render(<Combinations navigate={vi.fn()} />);
  const previousOverflow = document.body.style.overflow;
  const { trigger, dialog } = await openPicker();
  const search = within(dialog).getByRole("searchbox");
  expect(search).toHaveFocus();
  expect(document.body.style.overflow).toBe("hidden");
  await userEvent.type(search, "SMA_CROSS@1");
  await userEvent.click(within(dialog).getByRole("checkbox"));
  const close = within(dialog).getByRole("button", {
    name: "Fechar seletor de estratégias",
  });
  close.focus();
  await userEvent.tab({ shift: true });
  expect(
    within(dialog).getByRole("button", { name: "Adicionar selecionadas (1)" }),
  ).toHaveFocus();
  await userEvent.tab();
  expect(close).toHaveFocus();
  await userEvent.keyboard("{Escape}");
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(trigger).toHaveFocus();
  expect(document.body.style.overflow).toBe(previousOverflow);
  expect(screen.getByText("0 de 8 adicionados")).toBeInTheDocument();
});

it("limita a seleção às vagas restantes sem impedir desmarcar e substituir", async () => {
  const items = Array.from({ length: 9 }, (_, index) => ({
    id: `signal-${index}`,
    name: `Sinal ${index}`,
    combinable: true,
    parameters_schema: { properties: {} },
    defaults: {},
  }));
  server.use(
    http.get(apiBase + "/strategies", () => HttpResponse.json({ items })),
  );
  render(<Combinations navigate={vi.fn()} />);
  const { dialog } = await openPicker();
  for (let index = 0; index < 8; index++)
    await userEvent.click(
      within(dialog).getByRole("checkbox", { name: `Sinal ${index}` }),
    );
  expect(
    within(dialog).getByRole("checkbox", { name: "Sinal 8" }),
  ).toBeDisabled();
  await userEvent.click(
    within(dialog).getByRole("checkbox", { name: "Sinal 0" }),
  );
  expect(
    within(dialog).getByRole("checkbox", { name: "Sinal 8" }),
  ).toBeEnabled();
  await userEvent.click(
    within(dialog).getByRole("checkbox", { name: "Sinal 8" }),
  );
  await userEvent.click(
    within(dialog).getByRole("button", { name: "Adicionar selecionadas (8)" }),
  );
  expect(
    screen.getAllByRole("button", { name: /^Remover Sinal/ }),
  ).toHaveLength(8);
  expect(
    screen.getByRole("button", { name: "Adicionar estratégia" }),
  ).toBeDisabled();
  expect(
    screen.getByRole("heading", { name: "Componentes da combinação" }),
  ).toHaveFocus();
  expect(
    screen.queryByRole("button", { name: "Remover Sinal 0" }),
  ).not.toBeInTheDocument();
  await userEvent.click(
    screen.getByRole("button", { name: "Remover Sinal 1" }),
  );
  await openPicker();
  await userEvent.click(screen.getByRole("checkbox", { name: "Sinal 0" }));
  expect(screen.getByRole("checkbox", { name: "Sinal 1" })).toBeDisabled();
});

it("explica busca vazia, mostra identificadores nos detalhes e recupera a lista", async () => {
  render(<Combinations navigate={vi.fn()} />);
  const { dialog } = await openPicker();
  await userEvent.click(
    within(dialog).getByRole("button", {
      name: "Combinações prontas",
    }),
  );
  const search = within(dialog).getByRole("searchbox");
  await userEvent.type(search, "MACD_EMA_RSI@1");
  const detail = within(dialog).getByLabelText("Detalhes de MACD + EMA + RSI");
  expect(detail.closest("details")).not.toHaveAttribute("open");
  await userEvent.click(detail);
  expect(within(dialog).getByText("MACD_EMA_RSI@1")).toBeVisible();
  expect(
    within(dialog).getByRole("list", {
      name: "Componentes de MACD + EMA + RSI",
    }),
  ).toBeVisible();
  await userEvent.clear(search);
  await userEvent.type(search, "nenhuma-opcao");
  expect(
    within(dialog).getByText("Nenhuma estratégia encontrada"),
  ).toBeInTheDocument();
  await userEvent.click(
    within(dialog).getByRole("button", { name: "Ver todas as opções" }),
  );
  expect(search).toHaveValue("");
  expect(within(dialog).getByRole("button", { name: "Todas" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  expect(within(dialog).getAllByRole("checkbox").length).toBeGreaterThan(1);
});

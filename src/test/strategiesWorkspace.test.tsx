import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it } from "vitest";
import App from "../App";
import { api } from "../api";
import { session } from "../mocks/fixtures";
import type { CombinationDefinition } from "../types";

const definition: CombinationDefinition = {
  name: "Minha combinação",
  kind: "custom",
  strategy_id: null,
  parameters: {},
  buy_rule: "all",
  sell_rule: "any",
  members: [
    { strategy_id: "SMA_CROSS@1", parameters: {} },
    { strategy_id: "EMA_CROSS@1", parameters: {} },
  ],
};
async function addStrategy(id: string) {
  await userEvent.click(
    screen.getByRole("button", { name: "Adicionar estratégia" }),
  );
  const dialog = screen.getByRole("dialog");
  await userEvent.type(within(dialog).getByRole("searchbox"), id);
  await userEvent.click(within(dialog).getByRole("checkbox"));
  await userEvent.click(
    within(dialog).getByRole("button", { name: "Adicionar selecionadas (1)" }),
  );
}

it("preserva filtros e rascunho ao alternar abas e atualiza o catálogo após salvar", async () => {
  location.hash = "/strategies";
  render(<App />);
  await screen.findByLabelText("Buscar estratégias");
  await userEvent.type(screen.getByLabelText("Buscar estratégias"), "SMA");
  await userEvent.selectOptions(
    screen.getByLabelText("Tipo de estratégia"),
    "individual",
  );
  await userEvent.click(screen.getByRole("tab", { name: "Combinações" }));
  fireEvent.change(await screen.findByLabelText("Nome da combinação"), {
    target: { value: "Rascunho" },
  });
  await addStrategy("SMA_CROSS@1");
  await userEvent.click(screen.getByRole("tab", { name: "Catálogo" }));
  expect(await screen.findByLabelText("Buscar estratégias")).toHaveValue("SMA");
  expect(screen.getByLabelText("Tipo de estratégia")).toHaveValue("individual");
  expect(
    screen.queryByRole("textbox", { name: "Nome da combinação" }),
  ).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole("tab", { name: "Combinações" }));
  expect(await screen.findByLabelText("Nome da combinação")).toHaveValue(
    "Rascunho",
  );
  expect(
    await screen.findByRole("button", { name: "Remover SMA" }),
  ).toBeInTheDocument();
  await addStrategy("EMA_CROSS@1");
  await userEvent.click(
    screen.getByRole("button", { name: "Salvar combinação" }),
  );
  await screen.findByRole("button", { name: "Editar Rascunho" });
  await userEvent.click(screen.getByRole("tab", { name: "Catálogo" }));
  await screen.findByRole("searchbox", { name: "Buscar estratégias" });
  await userEvent.clear(screen.getByLabelText("Buscar estratégias"));
  await userEvent.selectOptions(
    screen.getByLabelText("Tipo de estratégia"),
    "saved",
  );
  expect(
    await screen.findByRole("link", { name: "Rascunho" }),
  ).toBeInTheDocument();
});

it("mantém edição e retorno ao processamento ao abrir um endereço antigo", async () => {
  const saved = await api.saveCombination(definition);
  const returnTo = `/sessions/${session.id}/runs/new`;
  location.hash = `/combinations?edit=${saved.id}&returnTo=${encodeURIComponent(returnTo)}`;
  render(<App />);
  expect(await screen.findByLabelText("Nome da combinação")).toHaveValue(
    "Minha combinação",
  );
  const url = new URL(location.hash.slice(1), "http://local");
  expect(url.pathname).toBe("/strategies");
  expect(url.searchParams.get("tab")).toBe("combinations");
  expect(url.searchParams.get("returnTo")).toBe(returnTo);
  expect(url.searchParams.get("edit")).toBe(saved.id);
  fireEvent.change(screen.getByLabelText("Nome da combinação"), {
    target: { value: "Editada na aba" },
  });
  await userEvent.click(
    screen.getByRole("button", { name: "Salvar combinação" }),
  );
  expect(
    await screen.findByRole("button", {
      name: "Selecionar configuração ou combinação",
    }),
  ).toHaveTextContent("Editada na aba");
  expect(
    screen.getByRole("heading", { name: "Editada na aba" }),
  ).toBeInTheDocument();
});

it("abre a aba pelo novo processamento e volta a ela a partir dos detalhes", async () => {
  const saved = await api.saveCombination(definition);
  location.hash = `/sessions/${session.id}/runs/new`;
  render(<App />);
  const manage = await screen.findByRole("link", {
    name: "Cadastrar ou gerenciar combinações",
  });
  expect(manage.getAttribute("href")).toContain("/strategies?tab=combinations");
  await userEvent.click(manage);
  await screen.findByLabelText("Nome da combinação");
  expect(screen.getByRole("tab", { name: "Combinações" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  const pane = screen.getByRole("tabpanel", { name: "Combinações" });
  await userEvent.click(
    within(pane).getByRole("link", {
      name: "Ver detalhes de Minha combinação",
    }),
  );
  await screen.findByRole("heading", { level: 1, name: "Minha combinação" });
  await userEvent.click(
    screen.getByRole("link", { name: "Voltar às combinações" }),
  );
  expect(
    await screen.findByLabelText("Nome da combinação"),
  ).toBeInTheDocument();
  expect(screen.getByRole("tab", { name: "Combinações" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  expect(
    new URL(location.hash.slice(1), "http://local").searchParams.get(
      "returnTo",
    ),
  ).toBe(`/sessions/${session.id}/runs/new`);
  expect((await api.combinations())[0].id).toBe(saved.id);
});

it("navega entre abas pelo teclado e fecha o seletor ao voltar pelo navegador", async () => {
  location.hash = "/strategies";
  render(<App />);
  const catalog = screen.getByRole("tab", { name: "Catálogo" });
  catalog.focus();
  await userEvent.keyboard("{ArrowRight}");
  const combinations = screen.getByRole("tab", { name: "Combinações" });
  await waitFor(() =>
    expect(combinations).toHaveAttribute("aria-selected", "true"),
  );
  expect(combinations).toHaveFocus();
  await userEvent.keyboard("{Home}");
  await waitFor(() => expect(catalog).toHaveAttribute("aria-selected", "true"));
  expect(catalog).toHaveFocus();
  await userEvent.keyboard("{End}");
  await screen.findByRole("button", { name: "Adicionar estratégia" });
  await userEvent.click(
    screen.getByRole("button", { name: "Adicionar estratégia" }),
  );
  expect(screen.getByRole("dialog")).toBeInTheDocument();
  history.back();
  await waitFor(() => expect(catalog).toHaveAttribute("aria-selected", "true"));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  await waitFor(() => expect(document.body.style.overflow).not.toBe("hidden"));
});

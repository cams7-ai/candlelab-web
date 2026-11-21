import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { expect, it, vi } from "vitest";
import { api, apiBase } from "../api";
import { Strategies } from "../components/Strategies";
import { session, runs } from "../mocks/fixtures";
import type { CombinationDefinition, StrategyCombination } from "../types";
import { server } from "./setup";

const definition: CombinationDefinition = {
  name: "SMA personalizada",
  kind: "strategy",
  strategy_id: "SMA_CROSS@1",
  parameters: { short_window: 3, long_window: 8 },
  members: [],
  buy_rule: "all",
  sell_rule: "any",
};
function copy(saved: StrategyCombination): CombinationDefinition {
  const { id: _id, ...definition } = saved;
  return structuredClone(definition);
}
function group(
  name: string,
  child: CombinationDefinition,
): CombinationDefinition {
  return {
    name,
    kind: "custom",
    strategy_id: null,
    parameters: {},
    buy_rule: "all",
    sell_rule: "any",
    members: [
      { strategy_id: "", parameters: {}, combination: child },
      { strategy_id: "EMA_CROSS@1", parameters: {} },
    ],
  };
}
async function open(name = definition.name) {
  render(<Strategies />);
  await userEvent.click(
    await screen.findByRole("button", {
      name: `Excluir configuração ${name}`,
    }),
  );
  return within(
    screen.getByRole("alertdialog", { name: "Excluir configuração?" }),
  );
}
function watchDeletion() {
  const remove = vi.fn(() => new HttpResponse(null, { status: 204 }));
  server.use(http.delete(apiBase + "/strategy-combinations/:id", remove));
  return remove;
}

it("mantém a confirmação desabilitada enquanto verifica e permite excluir uma configuração sem vínculos", async () => {
  const saved = await api.saveCombination(definition);
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  server.use(
    http.get(apiBase + "/sessions", async () => {
      await pending;
      return HttpResponse.json({ items: [], next_cursor: null });
    }),
  );
  const dialog = await open();
  expect(
    dialog.getByRole("button", { name: "Excluir configuração" }),
  ).toBeDisabled();
  expect(dialog.getByRole("status")).toHaveTextContent("Verificando vínculos");
  release();
  await waitFor(() =>
    expect(
      dialog.getByRole("button", { name: "Excluir configuração" }),
    ).toBeEnabled(),
  );
  await userEvent.click(
    dialog.getByRole("button", { name: "Excluir configuração" }),
  );
  await waitFor(() =>
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument(),
  );
  expect((await api.combinations()).some((item) => item.id === saved.id)).toBe(
    false,
  );
});

it("bloqueia processamentos pelo ID preservado mesmo após alterar nome e parâmetros da origem", async () => {
  const saved = await api.saveCombination(definition);
  const run = await api.createRun(session.id, { combination_id: saved.id });
  await api.saveCombination(
    {
      ...copy(saved),
      name: "SMA editada",
      parameters: { short_window: 5, long_window: 13 },
    },
    saved.id,
  );
  const remove = watchDeletion();
  const dialog = await open("SMA editada");
  expect(await dialog.findByRole("alert")).toHaveTextContent(run.id);
  expect(
    dialog.getByRole("button", { name: "Excluir configuração" }),
  ).toBeDisabled();
  await userEvent.click(
    dialog.getByRole("button", { name: "Excluir configuração" }),
  );
  expect(remove).not.toHaveBeenCalled();
});

it("encontra configurações incorporadas em grupos aninhados antes de tentar excluir", async () => {
  const saved = await api.saveCombination(definition);
  await api.saveCombination(
    group("Grupo externo", group("Grupo interno", copy(saved))),
  );
  const remove = watchDeletion();
  const dialog = await open();
  expect(await dialog.findByRole("alert")).toHaveTextContent("Grupo externo");
  expect(
    dialog.getByRole("button", { name: "Excluir configuração" }),
  ).toBeDisabled();
  expect(remove).not.toHaveBeenCalled();
});

it("verifica a composição preservada nos processamentos mesmo depois de excluir o grupo cadastrado", async () => {
  const saved = await api.saveCombination(definition);
  const combined = await api.saveCombination(
    group("Grupo histórico", copy(saved)),
  );
  const run = await api.createRun(session.id, { combination_id: combined.id });
  await api.deleteCombination(combined.id);
  const remove = watchDeletion();
  const dialog = await open();
  expect(await dialog.findByRole("alert")).toHaveTextContent(run.id);
  expect(
    dialog.getByRole("button", { name: "Excluir configuração" }),
  ).toBeDisabled();
  expect(remove).not.toHaveBeenCalled();
});

it("não confunde outro cadastro da mesma estratégia base com um vínculo direto", async () => {
  const saved = await api.saveCombination(definition);
  const other = await api.saveCombination({
    ...definition,
    name: "Outra SMA",
    parameters: { short_window: 5, long_window: 13 },
  });
  await api.createRun(session.id, { combination_id: other.id });
  const dialog = await open();
  await waitFor(() =>
    expect(
      dialog.getByRole("button", { name: "Excluir configuração" }),
    ).toBeEnabled(),
  );
  await userEvent.click(
    dialog.getByRole("button", { name: "Excluir configuração" }),
  );
  await waitFor(() =>
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument(),
  );
  expect((await api.combinations()).map((item) => item.id)).toEqual([other.id]);
  expect(saved.id).not.toBe(other.id);
});

it("bloqueia e explica cópias antigas cuja origem não pode ser confirmada após edições", async () => {
  const saved = await api.saveCombination(definition);
  await api.saveCombination(
    group("Composição antiga", {
      ...copy(saved),
      name: "Nome anterior",
      parameters: { short_window: 5, long_window: 13 },
    }),
  );
  const dialog = await open();
  expect(await dialog.findByRole("alert")).toHaveTextContent(
    "sem identificador de origem",
  );
  expect(
    dialog.getByRole("button", { name: "Excluir configuração" }),
  ).toBeDisabled();
});

it("falha de consulta mantém a exclusão bloqueada e permite verificar novamente", async () => {
  await api.saveCombination(definition);
  const remove = watchDeletion();
  server.use(
    http.get(apiBase + "/sessions", () =>
      HttpResponse.json(
        {
          error: {
            code: "UNAVAILABLE",
            message: "Falha ao consultar sessões",
            details: null,
          },
        },
        { status: 503 },
      ),
    ),
  );
  const dialog = await open();
  expect(await dialog.findByRole("alert")).toHaveTextContent(
    "Falha ao consultar sessões",
  );
  expect(
    dialog.getByRole("button", { name: "Excluir configuração" }),
  ).toBeDisabled();
  expect(remove).not.toHaveBeenCalled();
  server.resetHandlers();
  await userEvent.click(
    dialog.getByRole("button", { name: "Tentar novamente" }),
  );
  await waitFor(() =>
    expect(
      dialog.getByRole("button", { name: "Excluir configuração" }),
    ).toBeEnabled(),
  );
});

it("revalida antes de enviar DELETE se um processamento for criado com o popup aberto", async () => {
  const saved = await api.saveCombination(definition);
  const remove = watchDeletion();
  const dialog = await open();
  await waitFor(() =>
    expect(
      dialog.getByRole("button", { name: "Excluir configuração" }),
    ).toBeEnabled(),
  );
  const run = await api.createRun(session.id, { combination_id: saved.id });
  await userEvent.click(
    dialog.getByRole("button", { name: "Excluir configuração" }),
  );
  expect(await dialog.findByRole("alert")).toHaveTextContent(run.id);
  expect(
    dialog.getByRole("button", { name: "Excluir configuração" }),
  ).toBeDisabled();
  expect(remove).not.toHaveBeenCalled();
});

it("consulta todas as páginas de sessões, combinações e processamentos", async () => {
  const saved = { ...definition, id: "saved" };
  const linked = {
    ...runs[0],
    id: "run-second-page",
    combination_snapshot: saved,
  };
  server.use(
    http.get(apiBase + "/strategy-combinations", ({ request }) =>
      HttpResponse.json(
        new URL(request.url).searchParams.has("cursor")
          ? { items: [saved], next_cursor: null }
          : { items: [], next_cursor: "next" },
      ),
    ),
    http.get(apiBase + "/sessions", ({ request }) =>
      HttpResponse.json(
        new URL(request.url).searchParams.has("cursor")
          ? { items: [{ ...session, id: "other-session" }], next_cursor: null }
          : { items: [], next_cursor: "next" },
      ),
    ),
    http.get(apiBase + "/sessions/other-session/runs", ({ request }) =>
      HttpResponse.json(
        new URL(request.url).searchParams.has("cursor")
          ? { items: [linked], next_cursor: null }
          : { items: [], next_cursor: "next" },
      ),
    ),
  );
  expect((await api.configurationUsage(saved)).runs).toEqual([linked.id]);
});

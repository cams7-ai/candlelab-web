import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { expect, it, vi } from "vitest";
import { api, apiBase, request } from "../api";
import { Sessions } from "../components/Sessions";
import { dataset, runs, session } from "../mocks/fixtures";
import { server } from "./setup";

async function open(name = session.name) {
  render(<Sessions navigate={vi.fn()} />);
  const link = await screen.findByRole("link", { name });
  await userEvent.click(
    within(link.closest("tr")!).getByRole("button", { name: "Excluir" }),
  );
  return {
    dialog: within(
      screen.getByRole("alertdialog", { name: "Excluir sessão?" }),
    ),
    link,
  };
}
function watchDelete() {
  const remove = vi.fn(() => new HttpResponse(null, { status: 204 }));
  server.use(http.delete(apiBase + "/sessions/:id", remove));
  return remove;
}
async function freeSession() {
  const { id: _id, ...body } = session;
  return api.createSession({ ...body, name: "Sessão livre" });
}

it("mantém a confirmação bloqueada durante a consulta e encontra processamentos nas páginas seguintes", async () => {
  let calls = 0;
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  server.use(
    http.get(apiBase + `/sessions/${session.id}/runs`, async ({ request }) => {
      if (++calls === 1)
        return HttpResponse.json({ items: [], next_cursor: null });
      await pending;
      return HttpResponse.json(
        new URL(request.url).searchParams.has("cursor")
          ? { items: runs, next_cursor: null }
          : { items: [], next_cursor: "next" },
      );
    }),
  );
  const remove = watchDelete();
  const { dialog } = await open();
  expect(dialog.getByRole("button", { name: "Excluir sessão" })).toBeDisabled();
  expect(dialog.getByRole("status")).toHaveTextContent(
    "Verificando processamentos vinculados",
  );
  release();
  expect(await dialog.findByRole("alert")).toHaveTextContent(
    "Processamentos vinculados: 2",
  );
  expect(dialog.getByRole("button", { name: "Excluir sessão" })).toBeDisabled();
  expect(remove).not.toHaveBeenCalled();
});

it("permite excluir uma sessão sem processamentos sem afetar outras sessões e candles", async () => {
  const saved = await freeSession();
  const { dialog, link } = await open(saved.name);
  const confirm = dialog.getByRole("button", { name: "Excluir sessão" });
  await waitFor(() => expect(confirm).toBeEnabled());
  await userEvent.click(confirm);
  await waitFor(() => expect(link).not.toBeInTheDocument());
  await expect(request(`/sessions/${saved.id}`)).rejects.toMatchObject({
    status: 404,
  });
  expect(await request(`/sessions/${session.id}`)).toMatchObject({
    id: session.id,
  });
  expect(await request(`/datasets/${dataset.id}`)).toMatchObject({
    id: dataset.id,
  });
});

it("falhas de consulta mantêm a exclusão bloqueada e permitem tentar novamente", async () => {
  let calls = 0;
  server.use(
    http.get(apiBase + `/sessions/${session.id}/runs`, () =>
      ++calls === 1
        ? HttpResponse.json({ items: runs, next_cursor: null })
        : HttpResponse.json(
            {
              error: {
                code: "UNAVAILABLE",
                message: "Falha ao verificar processamentos",
                details: null,
              },
            },
            { status: 503 },
          ),
    ),
  );
  const remove = watchDelete();
  const { dialog } = await open();
  expect(await dialog.findByRole("alert")).toHaveTextContent(
    "Falha ao verificar processamentos",
  );
  expect(dialog.getByRole("button", { name: "Excluir sessão" })).toBeDisabled();
  expect(remove).not.toHaveBeenCalled();
  server.resetHandlers();
  await userEvent.click(
    dialog.getByRole("button", { name: "Tentar novamente" }),
  );
  expect(await dialog.findByRole("alert")).toHaveTextContent(
    "Processamentos vinculados: 2",
  );
});

it("verifica novamente se um processamento é criado com o popup aberto", async () => {
  const saved = await freeSession();
  const remove = watchDelete();
  const { dialog } = await open(saved.name);
  const confirm = dialog.getByRole("button", { name: "Excluir sessão" });
  await waitFor(() => expect(confirm).toBeEnabled());
  const run = await api.createRun(saved.id, {
    strategy_id: "SMA_CROSS@1",
    parameters: { short_window: 3, long_window: 8 },
  });
  await userEvent.click(confirm);
  expect(await dialog.findByRole("alert")).toHaveTextContent(run.id);
  expect(confirm).toBeDisabled();
  expect(remove).not.toHaveBeenCalled();
});

it("o modo demo também rejeita a exclusão direta de sessões com processamentos", async () => {
  await expect(api.deleteSession(session.id)).rejects.toMatchObject({
    status: 409,
    body: { error: { code: "SESSION_IN_USE" } },
  });
  expect(await request(`/sessions/${session.id}`)).toMatchObject({
    id: session.id,
  });
  for (const run of runs)
    expect(await request(`/runs/${run.id}`)).toMatchObject({ id: run.id });
});

it("mantém a confirmação bloqueada se a API detectar um vínculo após a verificação do popup", async () => {
  const saved = await freeSession();
  let calls = 0;
  server.use(
    http.delete(apiBase + `/sessions/${saved.id}`, async () => {
      calls++;
      await api.createRun(saved.id, {
        strategy_id: "SMA_CROSS@1",
        parameters: { short_window: 3, long_window: 8 },
      });
      return HttpResponse.json(
        {
          error: {
            code: "SESSION_IN_USE",
            message: "A API detectou um processamento vinculado",
            details: [],
          },
        },
        { status: 409 },
      );
    }),
  );
  const { dialog } = await open(saved.name);
  const confirm = dialog.getByRole("button", { name: "Excluir sessão" });
  await waitFor(() => expect(confirm).toBeEnabled());
  await userEvent.click(confirm);
  expect(await dialog.findByRole("alert")).toHaveTextContent(
    "A API detectou um processamento vinculado",
  );
  expect(confirm).toBeDisabled();
  await userEvent.click(
    dialog.getByRole("button", { name: "Tentar novamente" }),
  );
  expect(await dialog.findByRole("alert")).toHaveTextContent(
    "Processamentos vinculados: 1",
  );
  expect(confirm).toBeDisabled();
  expect(calls).toBe(1);
});

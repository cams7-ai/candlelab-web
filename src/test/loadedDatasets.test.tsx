import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { expect, it, vi } from "vitest";
import { api, apiBase, request } from "../api";
import { Acquisition } from "../components/Acquisition";
import { dataset, session, runs } from "../mocks/fixtures";
import { server } from "./setup";

async function loaded() {
  const navigate = vi.fn();
  render(<Acquisition navigate={navigate} />);
  await userEvent.click(
    screen.getByRole("tab", { name: "Candles carregados" }),
  );
  const table = await screen.findByRole("table", {
    name: "Conjuntos de candles carregados",
  });
  return { table: within(table), navigate };
}
async function openDelete() {
  const { table } = await loaded();
  await userEvent.click(table.getByRole("button", { name: "Excluir" }));
  return within(
    screen.getByRole("alertdialog", { name: "Excluir conjunto de candles?" }),
  );
}
function watchDelete() {
  const remove = vi.fn(() => new HttpResponse(null, { status: 204 }));
  server.use(http.delete(apiBase + "/datasets/:id", remove));
  return remove;
}

it("busca os conjuntos e filtra por intervalo, preservando a seleção e a criação de sessão", async () => {
  const second = {
    ...dataset,
    id: "eth-hour",
    name: "Série ETH",
    symbol: "ETHUSDT",
    base_asset: "ETH",
    interval: "1h",
  };
  server.use(
    http.get(apiBase + "/datasets", () =>
      HttpResponse.json({ items: [dataset, second], next_cursor: null }),
    ),
  );
  const { table, navigate } = await loaded();
  const search = screen.getByRole("searchbox", {
    name: "Buscar conjuntos de candles",
  });
  await userEvent.type(search, "serie");
  expect(table.getAllByRole("row")).toHaveLength(2);
  expect(screen.getByRole("status")).toHaveTextContent("1 de 2 conjuntos");
  await userEvent.selectOptions(
    screen.getByRole("combobox", { name: "Intervalo dos candles" }),
    "5m",
  );
  expect(
    screen.getByText("Nenhum conjunto encontrado para os filtros informados."),
  ).toBeInTheDocument();
  await userEvent.clear(search);
  expect(table.getAllByRole("row")).toHaveLength(2);
  await userEvent.selectOptions(
    screen.getByRole("combobox", { name: "Intervalo dos candles" }),
    "1h",
  );
  await userEvent.click(table.getByRole("button", { name: "Série ETH" }));
  expect(table.getByRole("button", { name: "Série ETH" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await userEvent.click(screen.getByRole("button", { name: "Criar sessão" }));
  expect(navigate).toHaveBeenCalledWith("/sessions/new?dataset=eth-hour");
});

it("mantém a confirmação desabilitada durante a consulta e encontra sessões nas páginas seguintes", async () => {
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  server.use(
    http.get(apiBase + "/sessions", async ({ request }) => {
      await pending;
      return HttpResponse.json(
        new URL(request.url).searchParams.has("cursor")
          ? { items: [session], next_cursor: null }
          : { items: [], next_cursor: "next" },
      );
    }),
  );
  const remove = watchDelete();
  const dialog = await openDelete();
  expect(
    dialog.getByRole("button", { name: "Excluir candles" }),
  ).toBeDisabled();
  expect(dialog.getByRole("status")).toHaveTextContent(
    "Verificando sessões vinculadas",
  );
  release();
  expect(await dialog.findByRole("alert")).toHaveTextContent(session.name);
  expect(
    dialog.getByRole("button", { name: "Excluir candles" }),
  ).toBeDisabled();
  expect(remove).not.toHaveBeenCalled();
});

it("falhas na verificação bloqueiam a exclusão e permitem uma nova consulta", async () => {
  server.use(
    http.get(apiBase + "/sessions", () =>
      HttpResponse.json(
        {
          error: {
            code: "UNAVAILABLE",
            message: "Falha ao verificar sessões",
            details: null,
          },
        },
        { status: 503 },
      ),
    ),
  );
  const remove = watchDelete();
  const dialog = await openDelete();
  expect(await dialog.findByRole("alert")).toHaveTextContent(
    "Falha ao verificar sessões",
  );
  expect(
    dialog.getByRole("button", { name: "Excluir candles" }),
  ).toBeDisabled();
  expect(remove).not.toHaveBeenCalled();
  server.resetHandlers();
  await userEvent.click(
    dialog.getByRole("button", { name: "Tentar novamente" }),
  );
  expect(await dialog.findByRole("alert")).toHaveTextContent(
    "Sessões vinculadas: 1",
  );
});

it("reverifica os vínculos quando uma sessão é criada com o popup aberto", async () => {
  for (const run of runs) await api.deleteRun(run.id);
  await api.deleteSession(session.id);
  const remove = watchDelete();
  const dialog = await openDelete();
  const confirm = dialog.getByRole("button", { name: "Excluir candles" });
  await waitFor(() => expect(confirm).toBeEnabled());
  const { id: _id, ...body } = session;
  await api.createSession({
    ...body,
    name: "Sessão criada durante a confirmação",
  });
  await userEvent.click(confirm);
  expect(await dialog.findByRole("alert")).toHaveTextContent(
    "Sessão criada durante a confirmação",
  );
  expect(confirm).toBeDisabled();
  expect(remove).not.toHaveBeenCalled();
});

it("o modo demo também rejeita exclusão direta de candles vinculados", async () => {
  await expect(api.deleteDataset(dataset.id)).rejects.toMatchObject({
    status: 409,
    body: { error: { code: "DATASET_IN_USE" } },
  });
  expect(await request(`/datasets/${dataset.id}`)).toMatchObject({
    id: dataset.id,
  });
  expect(await request(`/sessions/${session.id}`)).toMatchObject({
    id: session.id,
  });
});

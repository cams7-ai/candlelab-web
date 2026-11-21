import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";
import { api, apiBase, request } from "../api";
import { findConfigurationUsage } from "../configurationUsage";
import { Strategies } from "../components/Strategies";
import { runs, session } from "../mocks/fixtures";
import type { CombinationDefinition, StrategyCombination, Run } from "../types";
import { server } from "./setup";

function definition(kind: "custom" | "preset"): CombinationDefinition {
  return {
    name: `Combinação ${kind}`,
    kind,
    strategy_id: kind === "preset" ? "EMA_ADX_ATR@1" : null,
    parameters: {},
    buy_rule: "all",
    sell_rule: "any",
    members:
      kind === "custom"
        ? ["SMA_CROSS@1", "EMA_CROSS@1"].map((strategy_id) => ({
            strategy_id,
            parameters: { short_window: 3, long_window: 8 },
          }))
        : [],
  };
}
function group(saved: StrategyCombination): CombinationDefinition {
  const { id: _id, ...copy } = saved;
  return {
    ...definition("custom"),
    name: "Grupo externo",
    members: [
      {
        strategy_id: "",
        parameters: {},
        combination: {
          ...definition("custom"),
          name: "Grupo interno",
          members: [
            { strategy_id: "", parameters: {}, combination: copy },
            { strategy_id: "RSI_REVERSION@1", parameters: {} },
          ],
        },
      },
      { strategy_id: "MOMENTUM@1", parameters: {} },
    ],
  };
}
async function open(name: string) {
  render(<Strategies />);
  await userEvent.selectOptions(
    await screen.findByLabelText("Tipo de estratégia"),
    "saved",
  );
  await userEvent.click(
    await screen.findByRole("button", { name: `Excluir combinação ${name}` }),
  );
  return within(
    screen.getByRole("alertdialog", { name: "Excluir combinação?" }),
  );
}
function watchDeletion() {
  const remove = vi.fn(() => new HttpResponse(null, { status: 204 }));
  server.use(http.delete(apiBase + "/strategy-combinations/:id", remove));
  return remove;
}

describe.each(["custom", "preset"] as const)(
  "exclusão de combinação %s",
  (kind) => {
    it("aguarda a verificação e exclui somente quando não há vínculos", async () => {
      const saved = await api.saveCombination(definition(kind));
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
      const dialog = await open(saved.name);
      const confirm = dialog.getByRole("button", {
        name: "Excluir combinação",
      });
      expect(confirm).toBeDisabled();
      expect(dialog.getByRole("status")).toHaveTextContent(
        "Verificando vínculos da combinação",
      );
      release();
      await waitFor(() => expect(confirm).toBeEnabled());
      await userEvent.click(confirm);
      await waitFor(() =>
        expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument(),
      );
      expect(await api.combinations()).toEqual([]);
    });

    it("bloqueia processamentos mesmo após editar nome e parâmetros do cadastro", async () => {
      const saved = await api.saveCombination(definition(kind));
      const run = await api.createRun(session.id, { combination_id: saved.id });
      const { id: _id, ...copy } = saved;
      await api.saveCombination(
        { ...copy, name: "Combinação editada" },
        saved.id,
      );
      const remove = watchDeletion();
      const dialog = await open("Combinação editada");
      expect(await dialog.findByRole("alert")).toHaveTextContent(run.id);
      const confirm = dialog.getByRole("button", {
        name: "Excluir combinação",
      });
      expect(confirm).toBeDisabled();
      await userEvent.click(confirm);
      expect(remove).not.toHaveBeenCalled();
    });

    it("bloqueia combinações incorporadas em outros grupos aninhados", async () => {
      const saved = await api.saveCombination(definition(kind));
      await api.saveCombination(group(saved));
      const remove = watchDeletion();
      const dialog = await open(saved.name);
      expect(await dialog.findByRole("alert")).toHaveTextContent(
        "Grupo externo",
      );
      expect(
        dialog.getByRole("button", { name: "Excluir combinação" }),
      ).toBeDisabled();
      expect(remove).not.toHaveBeenCalled();
    });

    it("preserva o bloqueio se a consulta falha e permite tentar novamente", async () => {
      const saved = await api.saveCombination(definition(kind));
      const remove = watchDeletion();
      server.use(
        http.get(apiBase + "/sessions", () =>
          HttpResponse.json(
            {
              error: {
                code: "UNAVAILABLE",
                message: "Falha ao consultar vínculos",
                details: null,
              },
            },
            { status: 503 },
          ),
        ),
      );
      const dialog = await open(saved.name);
      expect(await dialog.findByRole("alert")).toHaveTextContent(
        "Falha ao consultar vínculos",
      );
      expect(
        dialog.getByRole("button", { name: "Excluir combinação" }),
      ).toBeDisabled();
      expect(remove).not.toHaveBeenCalled();
      server.resetHandlers();
      await userEvent.click(
        dialog.getByRole("button", { name: "Tentar novamente" }),
      );
      await waitFor(() =>
        expect(
          dialog.getByRole("button", { name: "Excluir combinação" }),
        ).toBeEnabled(),
      );
    });

    it("revalida antes do DELETE quando surge um processamento com o modal aberto", async () => {
      const saved = await api.saveCombination(definition(kind));
      const remove = watchDeletion();
      const dialog = await open(saved.name);
      const confirm = dialog.getByRole("button", {
        name: "Excluir combinação",
      });
      await waitFor(() => expect(confirm).toBeEnabled());
      const run = await api.createRun(session.id, { combination_id: saved.id });
      await userEvent.click(confirm);
      expect(await dialog.findByRole("alert")).toHaveTextContent(run.id);
      expect(confirm).toBeDisabled();
      expect(remove).not.toHaveBeenCalled();
    });

    it("detecta cópias sem origem e processamentos que preservam grupos excluídos", async () => {
      const saved = await api.saveCombination(definition(kind));
      const container = { ...group(saved), id: "container" };
      expect(
        findConfigurationUsage(saved, [saved, container], []).combinations,
      ).toEqual([container.name]);
      const snapshot = {
        ...runs[0],
        id: "historic-run",
        combination_snapshot: container,
      };
      expect(findConfigurationUsage(saved, [saved], [snapshot]).runs).toEqual([
        snapshot.id,
      ]);
      const renamed = { ...saved, name: "Nome alterado" };
      expect(
        findConfigurationUsage(renamed, [renamed, container], [])
          .uncertainCopies,
      ).toEqual([`Combinação: ${container.name}`]);
    });

    it("não confunde o ID de outro cadastro usado diretamente em um processamento", async () => {
      const saved = await api.saveCombination(definition(kind));
      const other = { ...saved, id: "other", name: "Outra combinação" };
      expect(
        findConfigurationUsage(
          saved,
          [saved, other],
          [{ ...runs[0], combination_snapshot: other }],
        ),
      ).toEqual({ runs: [], combinations: [], uncertainCopies: [] });
    });
  },
);

it.each(["strategy", "custom", "preset"] as const)(
  "o demo rejeita DELETE direto de %s vinculado e permite excluir após remover o processamento",
  async (kind) => {
    const body =
      kind === "strategy"
        ? {
            ...definition("custom"),
            kind,
            strategy_id: "SMA_CROSS@1",
            members: [],
          }
        : definition(kind);
    const saved = await api.saveCombination(body);
    const run = await api.createRun(session.id, { combination_id: saved.id });
    const code =
      kind === "strategy" ? "CONFIGURATION_IN_USE" : "COMBINATION_IN_USE";
    await expect(api.deleteCombination(saved.id)).rejects.toMatchObject({
      status: 409,
      body: {
        error: { code, details: [expect.objectContaining({ runs: [run.id] })] },
      },
    });
    expect(
      (await request<Run>(`/runs/${run.id}`)).combination_snapshot,
    ).toEqual(saved);
    expect(await api.combinations()).toEqual([saved]);
    for (let i = 0; i < 3; i++) await request(`/runs/${run.id}`);
    await api.deleteRun(run.id);
    await api.deleteCombination(saved.id);
    expect(await api.combinations()).toEqual([]);
    await expect(api.deleteCombination(saved.id)).rejects.toMatchObject({
      status: 404,
    });
  },
);

it.each(["custom", "preset"] as const)(
  "o demo rejeita DELETE direto de %s incorporado e preserva o grupo",
  async (kind) => {
    const saved = await api.saveCombination(definition(kind));
    const parent = await api.saveCombination(group(saved));
    await expect(api.deleteCombination(saved.id)).rejects.toMatchObject({
      status: 409,
      body: {
        error: {
          code: "COMBINATION_IN_USE",
          details: [expect.objectContaining({ combinations: [parent.name] })],
        },
      },
    });
    expect(
      (await api.combinations()).find((item) => item.id === parent.id),
    ).toEqual(parent);
    await api.deleteCombination(parent.id);
    await api.deleteCombination(saved.id);
    expect(await api.combinations()).toEqual([]);
  },
);

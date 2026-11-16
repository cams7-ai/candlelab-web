import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { NewRun } from "../components/NewRun";
import { apiBase } from "../api";
import { candles, runs, strategies } from "../mocks/fixtures";
import { parameterValue } from "../utils";
import { server } from "./setup";

it("publica 12 individuais e 6 combinações e preserva as quatro legadas", () => {
  expect(strategies).toHaveLength(22);
  expect(strategies.filter((s) => s.category === "individual")).toHaveLength(
    12,
  );
  expect(strategies.filter((s) => s.category === "combination")).toHaveLength(
    6,
  );
});

it("rejeita JSON auxiliar inválido, vazio e limites numéricos novos", () => {
  const schema = {
    type: "string" as const,
    contentMediaType: "application/json",
  };
  expect(() => parameterValue("{", schema)).toThrow("JSON inválido");
  expect(() => parameterValue("[]", schema)).toThrow("não vazia");
  expect(parameterValue('[{"probability":"0.6"}]', schema)).toBe(
    '[{"probability":"0.6"}]',
  );
  expect(() =>
    parameterValue("101", { type: "string", "x-max": "100" }),
  ).toThrow("limites");
});

it("edita e envia snapshot auxiliar preservando os decimais", async () => {
  let sent:
    | { parameters: { auxiliary_json: string }; strategy_id: string }
    | undefined;
  const navigate = vi.fn();
  server.use(
    http.post(apiBase + "/sessions/:id/runs", async ({ request }) => {
      sent = (await request.json()) as typeof sent;
      return HttpResponse.json(runs[0], { status: 202 });
    }),
  );
  render(<NewRun id="demo-session" navigate={navigate} />);
  await screen.findByRole("combobox");
  await userEvent.selectOptions(
    screen.getByRole("combobox"),
    "MACHINE_LEARNING@1",
  );
  expect(screen.getByText(/Dados auxiliares obrigatórios/)).toHaveTextContent(
    "trained_until_ms",
  );
  const raw = JSON.stringify([
    {
      open_time_ms: candles[0].open_time_ms,
      probability: "0.700000000001",
      trained_until_ms: 0,
      model_id: "validated-model",
    },
  ]);
  fireEvent.change(screen.getByLabelText("Dados auxiliares JSON"), {
    target: { value: raw },
  });
  await userEvent.click(
    screen.getByRole("button", { name: /Iniciar processamento/ }),
  );
  await waitFor(() => expect(navigate).toHaveBeenCalled());
  expect(sent?.strategy_id).toBe("MACHINE_LEARNING@1");
  expect(sent?.parameters.auxiliary_json).toBe(raw);
});

it("importa arquivo JSON e mostra erro antes de enviar conteúdo inválido", async () => {
  render(<NewRun id="demo-session" navigate={vi.fn()} />);
  await screen.findByRole("combobox");
  await userEvent.selectOptions(screen.getByRole("combobox"), "ARBITRAGE@1");
  const file = new File(
    ['[{"open_time_ms":1787097600000,"bid":"100"}]'],
    "aux.json",
    { type: "application/json" },
  );
  Object.defineProperty(file, "text", {
    value: async () => '[{"open_time_ms":1787097600000,"bid":"100"}]',
  });
  await userEvent.upload(
    screen.getByLabelText("Importar dados auxiliares JSON"),
    file,
  );
  await waitFor(() =>
    expect(screen.getByLabelText("Dados auxiliares JSON")).toHaveValue(
      '[{"open_time_ms":1787097600000,"bid":"100"}]',
    ),
  );
  fireEvent.change(screen.getByLabelText("Dados auxiliares JSON"), {
    target: { value: "{" },
  });
  await userEvent.click(
    screen.getByRole("button", { name: /Iniciar processamento/ }),
  );
  expect(await screen.findByRole("alert")).toHaveTextContent("JSON inválido");
  await userEvent.selectOptions(screen.getByRole("combobox"), "DCA@1");
  expect(
    screen.queryByLabelText("Dados auxiliares JSON"),
  ).not.toBeInTheDocument();
});

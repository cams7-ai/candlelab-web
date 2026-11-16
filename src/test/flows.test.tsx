import {
  render,
  screen,
  waitFor,
  within,
  fireEvent,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi, it, expect } from "vitest";
import { http, HttpResponse } from "msw";
import App from "../App";
import { apiBase } from "../api";
import { Acquisition } from "../components/Acquisition";
import { NewSession } from "../components/Sessions";
import { NewRun } from "../components/NewRun";
import { SessionDetail } from "../components/SessionDetail";
import { dataset, runs, session, strategies } from "../mocks/fixtures";
import { server } from "./setup";
vi.mock("../components/Chart", () => ({
  Chart: (props: { run?: { id: string }; indicators: unknown[] }) => (
    <div data-testid="chart">
      Gráfico {props.run?.id} · {props.indicators.length} indicadores
    </div>
  ),
}));
it("cria sessão com taxa exata e navega para o detalhe", async () => {
  const navigate = vi.fn();
  let sent: unknown;
  server.use(
    http.post(apiBase + "/sessions", async ({ request }) => {
      sent = await request.json();
      return HttpResponse.json({ ...session, id: "created" }, { status: 201 });
    }),
  );
  render(<NewSession navigate={navigate} datasetId={dataset.id} />);
  await screen.findByLabelText("Nome da sessão");
  await userEvent.type(screen.getByLabelText("Nome da sessão"), "Minha sessão");
  await userEvent.click(screen.getByRole("button", { name: "Criar sessão" }));
  await waitFor(() =>
    expect(navigate).toHaveBeenCalledWith("/sessions/created"),
  );
  expect(sent).toEqual({
    name: "Minha sessão",
    dataset_id: dataset.id,
    initial_cash: "1000",
    fee_rate: "0.001",
  });
});
it("alterna as abas e exibe validação por linha e campo", async () => {
  server.use(
    http.post(apiBase + "/datasets", () =>
      HttpResponse.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Preço inválido",
            details: { line: 2, field: "close" },
          },
        },
        { status: 422 },
      ),
    ),
  );
  render(<Acquisition navigate={vi.fn()} />);
  await screen.findByLabelText("Símbolo *");
  expect(screen.getByLabelText("Início (UTC)")).toHaveValue("");
  await userEvent.click(screen.getByRole("tab", { name: "Enviar JSON" }));
  expect(screen.queryByLabelText("Início (UTC)")).not.toBeInTheDocument();
  await userEvent.upload(
    screen.getByLabelText(/Arquivo JSON/),
    new File(["[]"], "bad.json", { type: "application/json" }),
  );
  // jsdom does not update its internal required-file validity after userEvent.upload.
  expect(
    (screen.getByLabelText(/Arquivo JSON/) as HTMLInputElement).files,
  ).toHaveLength(1);
  fireEvent.submit(
    screen.getByRole("button", { name: "Importar candles" }).closest("form")!,
  );
  const alert = await screen.findByRole("alert");
  expect(alert).toHaveTextContent("Preço inválido");
  expect(alert).toHaveTextContent('"line": 2');
  expect(alert).toHaveTextContent("close");
  await userEvent.click(screen.getByRole("tab", { name: "Buscar na Binance" }));
  expect(screen.getByLabelText("Fim (UTC)")).toBeInTheDocument();
});
it("consulta mínima apresenta conjunto e ação de criar sessão", async () => {
  render(<Acquisition navigate={vi.fn()} />);
  await screen.findByLabelText("Símbolo *");
  await userEvent.click(screen.getByRole("button", { name: "Buscar candles" }));
  await screen.findByText("Dados disponíveis");
  expect(screen.getByText("500 candles")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Criar sessão" })).toBeEnabled();
  await userEvent.click(
    screen.getByRole("tab", { name: "Candles carregados" }),
  );
  await screen.findByRole("table");
  expect(screen.getAllByRole("row")).toHaveLength(3);
});
it("lista todas as páginas de conjuntos carregados e permite selecionar para criar sessão", async () => {
  const second = {
    ...dataset,
    id: "loaded-eth",
    base_asset: "ETH",
    symbol: "ETHUSDT",
    candle_count: 250,
  };
  server.use(
    http.get(apiBase + "/datasets", ({ request }) =>
      HttpResponse.json(
        new URL(request.url).searchParams.has("cursor")
          ? { items: [second], next_cursor: null }
          : { items: [dataset], next_cursor: "next" },
      ),
    ),
  );
  const navigate = vi.fn();
  render(<Acquisition navigate={navigate} />);
  await userEvent.click(
    screen.getByRole("tab", { name: "Candles carregados" }),
  );
  await screen.findByRole("table");
  expect(screen.getAllByRole("row")).toHaveLength(3);
  const select = screen.getByRole("button", {
    name: /Selecionar conjunto ETH/,
  });
  await userEvent.click(select);
  expect(select).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByText("250 candles")).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Criar sessão" }));
  expect(navigate).toHaveBeenCalledWith("/sessions/new?dataset=loaded-eth");
});
it("permite tentar novamente ao falhar a listagem e informa quando não há conjuntos", async () => {
  let reads = 0;
  server.use(
    http.get(apiBase + "/datasets", () => {
      reads++;
      return reads === 1
        ? HttpResponse.json(
            {
              error: {
                code: "UNAVAILABLE",
                message: "Falha na listagem",
                details: null,
              },
            },
            { status: 503 },
          )
        : HttpResponse.json({ items: [], next_cursor: null });
    }),
  );
  render(<Acquisition navigate={vi.fn()} />);
  await userEvent.click(
    screen.getByRole("tab", { name: "Candles carregados" }),
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Falha na listagem",
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Tentar novamente" }),
  );
  await screen.findByText(/Nenhum conjunto carregado/);
  expect(
    screen.queryByRole("button", { name: "Criar sessão" }),
  ).not.toBeInTheDocument();
});
it("carrega estratégias novas e parâmetros a partir do catálogo HTTP", async () => {
  let sent: unknown;
  const future = {
    id: "FUTURE@2",
    name: "Nova combinação",
    defaults: { window: 15, threshold: "0.1" },
    parameters_schema: {
      properties: {
        window: { type: "integer", minimum: 1, title: "Janela futura" },
        threshold: {
          type: "string",
          minimum: 0,
          maximum: 1,
          title: "Limiar futuro",
        },
      },
    },
  };
  server.use(
    http.get(apiBase + "/strategies", () =>
      HttpResponse.json({ items: [...strategies, future] }),
    ),
    http.post(apiBase + "/sessions/:id/runs", async ({ request }) => {
      sent = await request.json();
      expect(request.headers.get("Idempotency-Key")).toBeTruthy();
      return HttpResponse.json({ ...runs[0], id: "new-run" }, { status: 202 });
    }),
  );
  const navigate = vi.fn();
  render(<NewRun id={session.id} navigate={navigate} />);
  await screen.findByLabelText("Estratégia");
  await userEvent.selectOptions(
    screen.getByLabelText("Estratégia"),
    "FUTURE@2",
  );
  expect(screen.getByLabelText(/Janela futura/)).toHaveValue("15");
  await userEvent.clear(screen.getByLabelText(/Limiar futuro/));
  await userEvent.type(
    screen.getByLabelText(/Limiar futuro/),
    "0,123456789012345678",
  );
  await userEvent.click(
    screen.getByRole("button", { name: /Iniciar processamento/ }),
  );
  await waitFor(() => expect(navigate).toHaveBeenCalled());
  expect(sent).toEqual({
    strategy_id: "FUTURE@2",
    parameters: { window: 15, threshold: "0.123456789012345678" },
  });
});
it("reabre sessão pela URL e troca resumo, parâmetros, eventos e gráfico", async () => {
  location.hash = "/sessions/demo-session?run=demo-sma-rsi";
  const view = render(<App />);
  await screen.findByRole("heading", { name: "BTC · Agosto 2026" });
  await waitFor(() =>
    expect(screen.getByTestId("chart")).toHaveTextContent("demo-sma-rsi"),
  );
  expect(screen.getAllByText("1024,80 USDT").length).toBeGreaterThan(0);
  expect(screen.getByText("NO_FUTURE_OPEN")).toBeInTheDocument();
  const summary = screen.getByText("Processamento").parentElement!;
  const details = summary.querySelector("summary")!;
  fireEvent.click(details);
  await userEvent.type(screen.getByLabelText("Buscar estratégia"), "EMA");
  const menu = summary.querySelector(".selector-menu")!;
  await userEvent.click(
    within(menu as HTMLElement).getByRole("button", { name: /EMA/ }),
  );
  await waitFor(() =>
    expect(screen.getByTestId("chart")).toHaveTextContent("demo-ema"),
  );
  expect(location.hash).toContain("run=demo-ema");
  expect(screen.getAllByText("1018,40 USDT").length).toBeGreaterThan(0);
  expect(
    screen.queryByText("Confirmação mínima do RSI"),
  ).not.toBeInTheDocument();
  view.unmount();
  render(<App />);
  await waitFor(() =>
    expect(screen.getByTestId("chart")).toHaveTextContent("demo-ema"),
  );
});
it("mantém o novo resultado na comparação ao selecionar outro processamento", async () => {
  const pending = { ...runs[1], status: "running", summary: null };
  let reads = 0;
  server.use(
    http.get(apiBase + "/sessions/:id/runs", () =>
      HttpResponse.json({ items: [runs[0], pending], next_cursor: null }),
    ),
    http.get(apiBase + `/runs/${pending.id}`, () => {
      reads++;
      return HttpResponse.json(reads === 1 ? pending : runs[1]);
    }),
  );
  location.hash = `/sessions/${session.id}?run=${pending.id}`;
  render(<App />);
  await screen.findByText("Em andamento");
  await screen.findByText("Concluído", {}, { timeout: 1800 });
  const comparison = screen.getByRole("heading", {
    name: "Comparar processamentos",
  }).parentElement!;
  expect(within(comparison).getAllByRole("row")).toHaveLength(3);

  await userEvent.click(
    within(comparison).getByRole("button", {
      name: new RegExp(runs[0].id),
    }),
  );
  await waitFor(() =>
    expect(screen.getByTestId("chart")).toHaveTextContent(runs[0].id),
  );
  expect(within(comparison).getAllByRole("row")).toHaveLength(3);

  await userEvent.click(
    within(comparison).getByRole("button", {
      name: new RegExp(pending.id),
    }),
  );
  await waitFor(() =>
    expect(screen.getByTestId("chart")).toHaveTextContent(pending.id),
  );
  expect(within(comparison).getAllByRole("row")).toHaveLength(3);
});
it("acompanha queued e running até completed e termina o polling", async () => {
  let reads = 0;
  const queued = { ...runs[0], id: "pending", status: "queued", summary: null };
  server.use(
    http.get(apiBase + "/runs/pending", () => {
      reads++;
      return HttpResponse.json(
        reads === 1
          ? queued
          : reads === 2
            ? { ...queued, status: "running" }
            : { ...runs[0], id: "pending" },
      );
    }),
  );
  const view = render(
    <SessionDetail id={session.id} runId="pending" navigate={vi.fn()} />,
  );
  await screen.findByText("Na fila");
  await screen.findByText("Em andamento", {}, { timeout: 1800 });
  await screen.findByText("Concluído", {}, { timeout: 1800 });
  expect(reads).toBe(3);
  await new Promise((r) => setTimeout(r, 1100));
  expect(reads).toBe(3);
  view.unmount();
}, 7000);
it("interrompe polling ao trocar execução e apresenta failed", async () => {
  let reads = 0;
  server.use(
    http.get(apiBase + "/runs/pending", () => {
      reads++;
      return HttpResponse.json({
        ...runs[0],
        id: "pending",
        status: "running",
        summary: null,
      });
    }),
    http.get(apiBase + "/runs/broken", () =>
      HttpResponse.json({
        ...runs[0],
        id: "broken",
        status: "failed",
        summary: null,
        error: {
          error: {
            code: "FAILED",
            message: "Falha na estratégia",
            details: { field: "period" },
          },
        },
      }),
    ),
  );
  const view = render(
    <SessionDetail id={session.id} runId="pending" navigate={vi.fn()} />,
  );
  await screen.findByText("Em andamento");
  view.rerender(
    <SessionDetail id={session.id} runId="broken" navigate={vi.fn()} />,
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Falha na estratégia",
  );
  await new Promise((r) => setTimeout(r, 1100));
  expect(reads).toBe(1);
});
it("mostra acerto indisponível sem arredondar resumo financeiro", async () => {
  server.use(
    http.get(apiBase + "/runs/demo-sma-rsi", () =>
      HttpResponse.json({
        ...runs[0],
        summary: {
          ...runs[0].summary,
          win_rate_pct: null,
          final_equity: "1024.123456789012345678",
        },
      }),
    ),
  );
  render(
    <SessionDetail id={session.id} runId={runs[0].id} navigate={vi.fn()} />,
  );
  await screen.findAllByText("1024,123456789012345678 USDT");
  const metric = screen.getByText("Acerto").parentElement!;
  expect(metric).toHaveTextContent("Indisponível");
});
it("exibe falha de consulta e permite retentativa", async () => {
  let calls = 0;
  server.use(
    http.get(apiBase + "/instruments", () => {
      calls++;
      return calls === 1
        ? HttpResponse.json(
            {
              error: {
                code: "DEPENDENCY",
                message: "Serviço indisponível",
                details: null,
              },
            },
            { status: 503 },
          )
        : HttpResponse.json({
            items: [
              {
                symbol: "BTCUSDT",
                base_asset: "BTC",
                quote_asset: "USDT",
                intervals: ["5m"],
              },
            ],
          });
    }),
  );
  render(<Acquisition navigate={vi.fn()} />);
  await screen.findByRole("alert");
  await userEvent.click(
    screen.getByRole("button", { name: "Tentar novamente" }),
  );
  await screen.findByLabelText("Símbolo *");
});

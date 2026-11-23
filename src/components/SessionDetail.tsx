import { Icon } from "./Icon";
import {
  runParameterLabel,
  runParameterValue,
  runParameters,
  runStrategyName,
} from "../combinations";
import { useEffect, useRef, useState } from "react";
import { allPages, api, request, resource } from "../api";
import { useQuery } from "../hooks";
import type {
  Candle,
  Dataset,
  Equity,
  Indicator,
  Run,
  Session,
  Strategy,
  Summary,
  TradeEvent,
} from "../types";
import { format, utc } from "../utils";
import { Chart } from "./Chart";
import { summaryLabels, summaryOrder } from "../financialSummary";
import { Empty, ErrorNotice, Loading } from "./common";
import { DeleteConfirmationDialog } from "./DeleteConfirmationDialog";
const statusLabels = {
  queued: "Na fila",
  running: "Em andamento",
  completed: "Concluído",
  failed: "Falhou",
};
export function FinancialSummary({ summary }: { summary: Summary }) {
  return (
    <dl>
      {summaryOrder.map((key) => (
        <div className="metric" key={key}>
          <dt>{summaryLabels[key]}</dt>
          <dd
            className={
              ["return_pct", "realized_pnl", "unrealized_pnl"].includes(key)
                ? String(summary[key]).startsWith("-")
                  ? "negative"
                  : "accent"
                : ""
            }
          >
            {format(summary[key])}
            {summary[key] != null
              ? key.endsWith("_pct")
                ? "%"
                : typeof summary[key] === "number" ||
                    key === "final_position_qty"
                  ? ""
                  : " USDT"
              : ""}
          </dd>
        </div>
      ))}
    </dl>
  );
}
export async function loadSeries(id: string, signal: AbortSignal) {
  const path = `/runs/${resource(id)}/series`;
  const [indicators, events, equity] = await Promise.all([
    allPages<Indicator>(path + "?kind=indicators", signal, (i) =>
      String(i.open_time_ms),
    ),
    allPages<TradeEvent>(path + "?kind=events", signal, (e) => e.id),
    allPages<Equity>(path + "?kind=equity", signal, (e) =>
      String(e.open_time_ms),
    ),
  ]);
  return {
    indicators: indicators.sort((a, b) => a.open_time_ms - b.open_time_ms),
    events: events.sort(
      (a, b) => a.open_time_ms - b.open_time_ms || a.seq - b.seq,
    ),
    equity: equity.sort((a, b) => a.open_time_ms - b.open_time_ms),
  };
}
export function SessionDetail({
  id,
  runId,
  navigate,
}: {
  id: string;
  runId: string | null;
  navigate: (path: string) => void;
}) {
  const query = useQuery(
    async (signal) => {
      const session = await request<Session>(`/sessions/${resource(id)}`, {
        signal,
      });
      const [dataset, catalog, runs, candles] = await Promise.all([
        request<Dataset>(`/datasets/${resource(session.dataset_id)}`, {
          signal,
        }),
        request<{ items: Strategy[] }>("/strategies", { signal }),
        allPages<Run>(`/sessions/${resource(id)}/runs`, signal, (r) => r.id),
        allPages<Candle>(
          `/datasets/${resource(session.dataset_id)}/candles`,
          signal,
          (c) => String(c.open_time_ms),
        ),
      ]);
      return {
        session,
        dataset,
        strategies: catalog.items,
        runs,
        candles: candles.sort((a, b) => a.open_time_ms - b.open_time_ms),
      };
    },
    [id],
  );
  const [deletedIds, setDeletedIds] = useState<string[]>([]);
  const selectedId =
    runId && !deletedIds.includes(runId)
      ? runId
      : query.data?.runs.find((r) => !deletedIds.includes(r.id))?.id;
  const [run, setRun] = useState<Run>();
  const [updatedRuns, setUpdatedRuns] = useState<Record<string, Run>>({});
  const [pollError, setPollError] = useState<unknown>();
  const [retry, setRetry] = useState(0);
  const [search, setSearch] = useState("");
  const [signals, setSignals] = useState(true);
  const [fills, setFills] = useState(true);
  const [showParameters, setShowParameters] = useState(true);
  const [exportingId, setExportingId] = useState<string>();
  const [exportError, setExportError] = useState<unknown>();
  const [deletingId, setDeletingId] = useState<string>();
  const [deleteTarget, setDeleteTarget] = useState<Run>();
  const [deleteError, setDeleteError] = useState<unknown>();
  const deleteController = useRef<AbortController>();
  useEffect(() => () => deleteController.current?.abort(), []);
  const exportController = useRef<AbortController>();
  const selector = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    setExportingId(undefined);
    setExportError(undefined);
    return () => exportController.current?.abort();
  }, [id]);
  async function exportPdf(result: Run) {
    if (!query.data || exportingId) return;
    const { session, dataset, candles } = query.data;
    const controller = new AbortController();
    exportController.current = controller;
    setExportingId(result.id);
    setExportError(undefined);
    try {
      const path = `/runs/${resource(result.id)}/series`;
      const [execution, events, equity, { downloadRunPdf }] = await Promise.all(
        [
          request<Run>(`/runs/${resource(result.id)}`, {
            signal: controller.signal,
          }),
          allPages<TradeEvent>(
            path + "?kind=events",
            controller.signal,
            (event) => event.id,
          ),
          allPages<Equity>(path + "?kind=equity", controller.signal, (point) =>
            String(point.open_time_ms),
          ),
          import("../runPdf"),
        ],
      );
      if (!controller.signal.aborted)
        downloadRunPdf({
          session,
          dataset,
          candles,
          run: execution,
          events,
          equity,
          strategyName: runStrategyName(execution, query.data.strategies),
          strategies: query.data.strategies,
        });
    } catch (error) {
      if (!controller.signal.aborted) setExportError(error);
    } finally {
      if (!controller.signal.aborted) setExportingId(undefined);
    }
  }
  useEffect(() => {
    setRun(undefined);
    setPollError(undefined);
    if (!selectedId) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const result = await request<Run>(`/runs/${resource(selectedId!)}`, {
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        if (result.session_id !== id)
          throw new Error("O processamento pertence a outra sessão.");
        setRun(result);
        setUpdatedRuns((previous) => ({ ...previous, [result.id]: result }));
        if (result.status === "queued" || result.status === "running")
          timer = setTimeout(poll, 1000);
      } catch (error) {
        if (!controller.signal.aborted) setPollError(error);
      }
    }
    void poll();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [selectedId, id, retry]);
  const series = useQuery(
    (signal) =>
      run?.status === "completed"
        ? loadSeries(run.id, signal)
        : Promise.resolve({ indicators: [], events: [], equity: [] }),
    [run?.id, run?.status],
  );
  const name = (r: Run) =>
    `${runStrategyName(r, query.data?.strategies)} · ${r.strategy_id}`;
  function select(next: string) {
    if (selector.current) selector.current.open = false;
    setSearch("");
    navigate(
      `/sessions/${encodeURIComponent(id)}?run=${encodeURIComponent(next)}`,
    );
  }
  if (query.loading) return <Loading />;
  if (query.error)
    return <ErrorNotice error={query.error} retry={query.retry} />;
  if (!query.data) return null;
  const { session, dataset, strategies } = query.data;
  const runsById = new Map(query.data.runs.map((r) => [r.id, r]));
  Object.values(updatedRuns).forEach((r) => {
    if (r.session_id === id) runsById.set(r.id, r);
  });
  const runs = Array.from(runsById.values()).filter(
    (r) => !deletedIds.includes(r.id),
  );
  async function deleteRun(result: Run) {
    if (deletingId || exportingId) return;
    const controller = new AbortController();
    deleteController.current = controller;
    setDeletingId(result.id);
    setDeleteError(undefined);
    try {
      await api.deleteRun(result.id, controller.signal);
      if (controller.signal.aborted) return;
      setDeletedIds((previous) => [...previous, result.id]);
      setDeleteTarget(undefined);
      if (selectedId === result.id) {
        const next = runs.find((r) => r.id !== result.id);
        navigate(
          `/sessions/${encodeURIComponent(id)}${next ? `?run=${encodeURIComponent(next.id)}` : ""}`,
        );
      }
    } catch (error) {
      if (!controller.signal.aborted) setDeleteError(error);
    } finally {
      if (!controller.signal.aborted) setDeletingId(undefined);
    }
  }
  return (
    <>
      {deleteTarget && (
        <DeleteConfirmationDialog
          targetId={deleteTarget.id}
          targetName={name(deleteTarget)}
          title="Excluir processamento?"
          description="Os resultados e o relatório deste processamento serão removidos permanentemente. Esta ação não pode ser desfeita."
          confirmLabel="Excluir processamento"
          busy={deletingId != null}
          error={deleteError}
          onCancel={() => setDeleteTarget(undefined)}
          onConfirm={() => void deleteRun(deleteTarget)}
        />
      )}
      <header>
        <div>
          <a className="breadcrumb" href="#/sessions">
            <Icon name="back" />
            Sessões › Detalhe da sessão
          </a>
          <h1>{session.name}</h1>
          <p className="muted">
            {dataset.base_asset}/{dataset.quote_asset} · {dataset.interval} ·{" "}
            {dataset.candle_count} candles
            <br />
            {utc(dataset.first_open_time_ms)} — {utc(dataset.last_open_time_ms)}
          </p>
        </div>
        <button
          className="primary"
          onClick={() =>
            navigate(`/sessions/${encodeURIComponent(id)}/runs/new`)
          }
        >
          <Icon name="run" />
          Novo processamento
        </button>
      </header>
      <div className="detail-grid">
        <section className="chart-column">
          <div className="panel toolbar">
            <strong>Processamento</strong>
            <details className="run-selector" ref={selector}>
              <summary>
                <Icon name="history" />
                {run
                  ? name(run)
                  : selectedId
                    ? "Carregando…"
                    : "Selecionar processamento"}
              </summary>
              <div className="selector-menu">
                <span className="search-field">
                  <Icon name="search" standalone />
                  <input
                    aria-label="Buscar estratégia"
                    placeholder="Buscar estratégia"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </span>
                {runs
                  .filter((r) =>
                    name(r).toLowerCase().includes(search.toLowerCase()),
                  )
                  .map((r) => (
                    <button
                      className={r.id === selectedId ? "selected" : ""}
                      aria-pressed={r.id === selectedId}
                      key={r.id}
                      onClick={() => select(r.id)}
                    >
                      {r.id === selectedId && <Icon name="check" />}
                      {name(r)}
                      <small>
                        {r.id} · {statusLabels[r.status]}
                      </small>
                    </button>
                  ))}
                {!runs.some((r) =>
                  name(r).toLowerCase().includes(search.toLowerCase()),
                ) && <p className="muted">Nenhum processamento encontrado.</p>}
              </div>
            </details>
            <button
              aria-pressed={showParameters}
              onClick={() => setShowParameters(!showParameters)}
            >
              <Icon name="parameters" />
              Parâmetros
            </button>
            <label className="toggle">
              <input
                type="checkbox"
                checked={signals}
                onChange={(e) => setSignals(e.target.checked)}
              />
              <span>
                <Icon name="signal" />
                Sinais
              </span>
            </label>
            <label className="toggle">
              <input
                type="checkbox"
                checked={fills}
                onChange={(e) => setFills(e.target.checked)}
              />
              <span>
                <Icon name="check" />
                Execuções
              </span>
            </label>
          </div>
          {pollError != null ? (
            <ErrorNotice
              error={pollError}
              retry={() => setRetry((n) => n + 1)}
            />
          ) : selectedId && !run ? (
            <Loading />
          ) : null}
          {run && (
            <p className="run-status" role="status">
              <span className={"status " + run.status}>
                <Icon
                  name={
                    run.status === "queued"
                      ? "pending"
                      : run.status === "running"
                        ? "loading"
                        : run.status === "completed"
                          ? "success"
                          : "failure"
                  }
                  spin={run.status === "running"}
                />
                {statusLabels[run.status]}
              </span>{" "}
              {run.id}
              {run.status === "running" || run.status === "queued"
                ? " · Acompanhando automaticamente…"
                : ""}
            </p>
          )}
          {run?.error && (
            <ErrorNotice
              error={
                new Error(
                  run.error.error.message +
                    " " +
                    JSON.stringify(run.error.error.details),
                )
              }
            />
          )}
          {series.error ? (
            <ErrorNotice error={series.error} retry={series.retry} />
          ) : series.loading ? (
            <Loading />
          ) : (
            <div className="panel chart-panel">
              {!query.data.candles.length ? (
                <Empty>Nenhum candle disponível.</Empty>
              ) : (
                <Chart
                  candles={query.data.candles}
                  indicators={series.data?.indicators ?? []}
                  events={series.data?.events ?? []}
                  equity={series.data?.equity ?? []}
                  run={run}
                  signals={signals}
                  fills={fills}
                />
              )}
            </div>
          )}
          {!runs.length && (
            <Empty>
              Nenhum processamento. Inicie uma estratégia para visualizar os
              resultados.
            </Empty>
          )}
        </section>
        <aside className="results-column">
          <section className="panel">
            <h2>
              <Icon name="money" />
              Resumo financeiro
            </h2>
            {run?.summary ? (
              <FinancialSummary summary={run.summary} />
            ) : (
              <Empty>
                O resumo estará disponível após a conclusão do processamento.
              </Empty>
            )}
          </section>
          {showParameters && (
            <section className="panel">
              <h2>
                <Icon name="parameters" />
                Parâmetros efetivos
              </h2>
              {run ? (
                <>
                  <p className="muted">{name(run)}</p>
                  <dl>
                    {run.auxiliary_filename && (
                      <div className="metric">
                        <dt>Arquivo auxiliar JSON</dt>
                        <dd className="auxiliary-filename">
                          {run.auxiliary_filename}
                        </dd>
                      </div>
                    )}
                    {runParameters(run).map(([k, v]) => (
                      <div className="metric" key={k}>
                        <dt>{runParameterLabel(run, k, strategies)}</dt>
                        <dd>
                          {k === "auxiliary_json"
                            ? `${JSON.parse(String(v)).length} observações importadas`
                            : format(runParameterValue(run, k, v, strategies))}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </>
              ) : (
                <Empty>Selecione um processamento.</Empty>
              )}
            </section>
          )}
        </aside>
      </div>
      {run?.strategy_id === "PAIRS_TRADING@1" && (
        <p className="panel muted">
          Carteira simulada com BTC comprado e dívida em ETH. O caixa inclui o
          valor bloqueado da venda de ETH; a posição final e o patrimônio
          consideram as duas pernas. As quantidades de cada ativo aparecem nos
          indicadores e no histórico.
        </p>
      )}
      <section className="panel">
        <h2>
          <Icon name="compare" />
          Comparar processamentos
        </h2>
        {exportError != null && <ErrorNotice error={exportError} />}
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Estratégia / versão</th>
                <th>Parâmetros</th>
                <th>Patrimônio final</th>
                <th>Retorno</th>
                <th>Taxas</th>
                <th>Drawdown</th>
                <th>Relatório</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {runs
                .filter((r) => r.status === "completed" && r.summary)
                .map((r) => (
                  <tr
                    key={r.id}
                    className={r.id === selectedId ? "selected" : ""}
                  >
                    <td>
                      <button
                        className="text-button"
                        onClick={() => select(r.id)}
                      >
                        <Icon name={r.id === selectedId ? "check" : "run"} />
                        {name(r)}
                        <small>{r.id}</small>
                      </button>
                    </td>
                    <td className="parameters-cell">
                      {runParameters(r)
                        .map(
                          ([k, v]) =>
                            `${runParameterLabel(r, k, strategies)}: ${k === "auxiliary_json" ? "snapshot JSON importado" : format(runParameterValue(r, k, v, strategies))}`,
                        )
                        .join(" · ")}
                    </td>
                    <td title={`${format(r.summary!.final_equity)} USDT`}>
                      {format(Number(r.summary!.final_equity).toFixed(2))} USDT
                    </td>
                    <td title={`${format(r.summary!.return_pct)}%`}>
                      {format(Number(r.summary!.return_pct).toFixed(2))}%
                    </td>
                    <td title={`${format(r.summary!.total_fees)} USDT`}>
                      {format(Number(r.summary!.total_fees).toFixed(2))} USDT
                    </td>
                    <td title={`${format(r.summary!.max_drawdown_pct)}%`}>
                      {format(Number(r.summary!.max_drawdown_pct).toFixed(2))}%
                    </td>
                    <td>
                      <button
                        type="button"
                        disabled={exportingId != null || deletingId != null}
                        onClick={() => void exportPdf(r)}
                      >
                        <Icon
                          name={exportingId === r.id ? "loading" : "pdf"}
                          spin={exportingId === r.id}
                        />
                        {exportingId === r.id ? "Gerando PDF…" : "Exportar PDF"}
                      </button>
                    </td>
                    <td>
                      <button
                        type="button"
                        className="negative"
                        disabled={deletingId != null || exportingId != null}
                        onClick={() => {
                          setDeleteError(undefined);
                          setDeleteTarget(r);
                        }}
                      >
                        <Icon
                          name={deletingId === r.id ? "loading" : "delete"}
                          spin={deletingId === r.id}
                        />
                        {deletingId === r.id ? "Excluindo…" : "Excluir"}
                      </button>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
        {!runs.some((r) => r.status === "completed") && (
          <Empty>Nenhum resultado concluído para comparar.</Empty>
        )}
      </section>
      <section className="panel">
        <h2>
          <Icon name="history" />
          Histórico de sinais e execuções
        </h2>
        <p className="muted">
          A âncora identifica o candle. A disponibilidade do sinal e o
          preenchimento seguem seus próprios horários.
        </p>
        {series.loading ? (
          <Loading />
        ) : series.error ? (
          <ErrorNotice error={series.error} retry={series.retry} />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Tipo</th>
                  <th>Lado</th>
                  <th>Candle (UTC)</th>
                  <th>Ocorrência / disponibilidade (UTC)</th>
                  <th>Preço</th>
                  <th>Quantidade</th>
                  <th>Vínculo / motivo</th>
                </tr>
              </thead>
              <tbody>
                {series.data?.events.map((e) => (
                  <tr key={e.id}>
                    <td>
                      {e.kind === "signal"
                        ? "Sinal"
                        : e.kind === "fill"
                          ? "Execução"
                          : "Sem execução"}
                    </td>
                    <td className={e.side === "BUY" ? "accent" : "negative"}>
                      {e.side === "BUY" ? "Compra" : "Venda"}
                    </td>
                    <td>{utc(e.open_time_ms)}</td>
                    <td>{utc(e.occurred_at_ms)}</td>
                    <td>{format(e.price)}</td>
                    <td>
                      {format(e.quantity)} {e.asset ?? ""}
                    </td>
                    <td>
                      {e.signal_id} {e.reason}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!series.data?.events.length && (
              <Empty>Nenhum evento disponível.</Empty>
            )}
          </div>
        )}
      </section>
    </>
  );
}

import { Icon } from "./Icon";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { allPages, api, request } from "../api";
import { useQuery } from "../hooks";
import type { Dataset, Instrument, Session } from "../types";
import { binanceInput, datasetName, utc } from "../utils";
import { DatasetCard, Empty, ErrorNotice, Loading } from "./common";
import { DeleteConfirmationDialog } from "./DeleteConfirmationDialog";
function LoadedDatasets({
  selectedId,
  onSelect,
  onDelete,
}: {
  selectedId?: string;
  onSelect: (dataset: Dataset) => void;
  onDelete: (id: string) => void;
}) {
  const [deleteTarget, setDeleteTarget] = useState<Dataset>();
  const [deleting, setDeleting] = useState(false);
  const [checkingBeforeDelete, setCheckingBeforeDelete] = useState(false);
  const [deleteError, setDeleteError] = useState<unknown>();
  const [validation, setValidation] = useState<{
    id: string;
    sessions?: Session[];
    error?: unknown;
  }>();
  const [revision, setRevision] = useState(0);
  const [deletedIds, setDeletedIds] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [interval, setInterval] = useState("");
  const activeDelete = useRef<AbortController>();
  useEffect(() => () => activeDelete.current?.abort(), []);
  const query = useQuery(
    (signal) => allPages<Dataset>("/datasets", signal, (d) => d.id),
    [],
  );
  useEffect(() => {
    if (!deleteTarget) return;
    const controller = new AbortController();
    setValidation(undefined);
    api.datasetSessions(deleteTarget.id, controller.signal).then(
      (sessions) => {
        if (!controller.signal.aborted)
          setValidation({ id: deleteTarget.id, sessions });
      },
      (error) => {
        if (!controller.signal.aborted)
          setValidation({ id: deleteTarget.id, error });
      },
    );
    return () => controller.abort();
  }, [deleteTarget?.id, revision]);
  const linkedSessions =
    validation?.id === deleteTarget?.id ? validation?.sessions : undefined;
  const blocked = !linkedSessions || linkedSessions.length > 0;
  const retryValidation = () => {
    setDeleteError(undefined);
    setValidation(undefined);
    setRevision((value) => value + 1);
  };
  const datasets = query.data?.filter((d) => !deletedIds.includes(d.id)) ?? [];
  const normalize = (value: string) =>
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLocaleLowerCase("pt-BR");
  const term = normalize(search.trim());
  const filtered = datasets.filter(
    (dataset) =>
      (!interval || dataset.interval === interval) &&
      normalize(
        `${datasetName(dataset)} ${dataset.id} ${dataset.symbol} ${dataset.base_asset}/${dataset.quote_asset} ${dataset.source}`,
      ).includes(term),
  );
  async function deleteDataset() {
    if (!deleteTarget || deleting || blocked) return;
    const controller = new AbortController();
    activeDelete.current = controller;
    setDeleting(true);
    setCheckingBeforeDelete(true);
    setDeleteError(undefined);
    let checking = true;
    try {
      const sessions = await api.datasetSessions(
        deleteTarget.id,
        controller.signal,
      );
      if (controller.signal.aborted) return;
      setValidation({ id: deleteTarget.id, sessions });
      if (sessions.length) return;
      checking = false;
      setCheckingBeforeDelete(false);
      await api.deleteDataset(deleteTarget.id, controller.signal);
      if (controller.signal.aborted) return;
      setDeletedIds((previous) => [...previous, deleteTarget.id]);
      onDelete(deleteTarget.id);
      setDeleteTarget(undefined);
    } catch (error) {
      if (!controller.signal.aborted) {
        if (checking) setValidation({ id: deleteTarget.id, error });
        else setDeleteError(error);
      }
    } finally {
      if (!controller.signal.aborted) {
        setDeleting(false);
        setCheckingBeforeDelete(false);
      }
    }
  }
  return (
    <section
      className="panel loaded-datasets-panel"
      aria-label="Conjuntos de candles carregados"
    >
      {deleteTarget && (
        <DeleteConfirmationDialog
          targetId={deleteTarget.id}
          targetName={datasetName(deleteTarget)}
          title="Excluir conjunto de candles?"
          description="Este conjunto só pode ser excluído quando não houver sessões vinculadas. A exclusão dos candles não pode ser desfeita."
          confirmLabel="Excluir candles"
          busy={deleting}
          busyLabel={checkingBeforeDelete ? "Verificando vínculos…" : undefined}
          confirmDisabled={blocked}
          validation={
            !validation || validation.id !== deleteTarget.id ? (
              <p role="status">
                <Icon name="loading" spin />
                Verificando sessões vinculadas…
              </p>
            ) : validation.error ? (
              <div>
                <p>
                  A exclusão permanece desabilitada porque não foi possível
                  consultar as sessões.
                </p>
                <ErrorNotice error={validation.error} retry={retryValidation} />
              </div>
            ) : linkedSessions?.length ? (
              <div className="deletion-warning" role="alert">
                <p>
                  <Icon name="warning" />
                  Este conjunto não pode ser excluído.
                </p>
                <p>
                  Sessões vinculadas: {linkedSessions.length}.{" "}
                  {linkedSessions
                    .slice(0, 3)
                    .map((session) => session.name)
                    .join(", ")}
                  {linkedSessions.length > 3
                    ? ` e mais ${linkedSessions.length - 3}`
                    : ""}
                  .
                </p>
                <button type="button" onClick={retryValidation}>
                  <Icon name="refresh" />
                  Verificar vínculos novamente
                </button>
              </div>
            ) : null
          }
          error={deleteError}
          onCancel={() => setDeleteTarget(undefined)}
          onConfirm={() => void deleteDataset()}
        />
      )}
      {query.loading ? (
        <Loading />
      ) : query.error ? (
        <ErrorNotice error={query.error} retry={query.retry} />
      ) : (
        <>
          <div className="catalog-toolbar">
            <label>
              Buscar conjuntos de candles
              <span className="search-field">
                <Icon name="search" standalone />
                <input
                  type="search"
                  placeholder="Nome, par ou identificador"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </span>
            </label>
            <label>
              <span>
                <Icon name="filter" />
                Intervalo dos candles
              </span>
              <select
                value={interval}
                onChange={(event) => setInterval(event.target.value)}
              >
                <option value="">Todos</option>
                {[...new Set(datasets.map((dataset) => dataset.interval))]
                  .sort()
                  .map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
              </select>
            </label>
          </div>
          <p className="muted" role="status">
            {filtered.length} de {datasets.length} conjuntos de candles
          </p>
          <div className="table-wrap">
            <table className="loaded-datasets-table">
              <caption className="sr-only">
                Conjuntos de candles carregados
              </caption>
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Par / intervalo</th>
                  <th>Candles</th>
                  <th>Período (UTC)</th>
                  <th>Origem</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((d) => (
                  <tr
                    key={d.id}
                    className={selectedId === d.id ? "selected" : ""}
                  >
                    <td>
                      <button
                        type="button"
                        className="text-button dataset-name"
                        aria-pressed={selectedId === d.id}
                        onClick={() => onSelect(d)}
                      >
                        <Icon
                          name={selectedId === d.id ? "check" : "database"}
                        />
                        {datasetName(d)}
                      </button>
                    </td>
                    <td>
                      {d.base_asset}/{d.quote_asset} · {d.interval}
                    </td>
                    <td>{d.candle_count}</td>
                    <td>
                      {utc(d.first_open_time_ms)}
                      <br />
                      {utc(d.last_open_time_ms)}
                    </td>
                    <td>{d.source}</td>
                    <td>
                      <div className="actions table-row-actions">
                        <button
                          type="button"
                          className="table-row-action danger-outline"
                          disabled={deleting}
                          onClick={() => {
                            setDeleteError(undefined);
                            setValidation(undefined);
                            setDeleteTarget(d);
                          }}
                        >
                          <Icon name="delete" />
                          Excluir
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!datasets.length ? (
            <Empty>
              Nenhum conjunto carregado. Busque candles na Binance ou envie um
              JSON.
            </Empty>
          ) : (
            !filtered.length && (
              <Empty>
                Nenhum conjunto encontrado para os filtros informados.
              </Empty>
            )
          )}
        </>
      )}
    </section>
  );
}

export function Acquisition({
  navigate,
}: {
  navigate: (path: string) => void;
}) {
  const catalog = useQuery(
    (signal) => request<{ items: Instrument[] }>("/instruments", { signal }),
    [],
  );
  const [mode, setMode] = useState<"binance" | "json" | "loaded">("binance");
  const [symbol, setSymbol] = useState("");
  const [interval, setInterval] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [limit, setLimit] = useState("");
  const [file, setFile] = useState<File>();
  const [dataset, setDataset] = useState<Dataset>();
  const datasetDetails = useRef<HTMLElement>(null);
  function showDetails() {
    datasetDetails.current?.scrollIntoView?.({
      behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches
        ? "auto"
        : "smooth",
      block: "nearest",
    });
  }
  useEffect(() => {
    if (mode === "loaded" && dataset) showDetails();
  }, [mode, dataset?.id]);

  const [error, setError] = useState<unknown>();
  const [busy, setBusy] = useState(false);
  const active = useRef<AbortController>();
  useEffect(() => () => active.current?.abort(), []);
  const instruments = catalog.data?.items ?? [];
  const instrument =
    instruments.find((i) => i.symbol === symbol) ?? instruments[0];
  const actualSymbol = instrument?.symbol ?? "";
  const actualInterval = instrument?.intervals.includes(interval)
    ? interval
    : (instrument?.intervals[0] ?? "");
  function switchMode(next: "binance" | "json" | "loaded") {
    active.current?.abort();
    setBusy(false);
    setError(undefined);
    setDataset(undefined);
    setMode(next);
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    active.current?.abort();
    const controller = new AbortController();
    active.current = controller;
    setError(undefined);
    setDataset(undefined);
    setBusy(true);
    try {
      if (!actualSymbol || !actualInterval)
        throw new Error("Selecione símbolo e intervalo.");
      const result =
        mode === "binance"
          ? await api.binance(
              binanceInput(actualSymbol, actualInterval, start, end, limit),
              controller.signal,
            )
          : file
            ? await api.upload(
                file,
                actualSymbol,
                actualInterval,
                controller.signal,
              )
            : (() => {
                throw new Error("Selecione um arquivo JSON.");
              })();
      if (!controller.signal.aborted) setDataset(result);
    } catch (err) {
      if (!controller.signal.aborted) setError(err);
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }
  return (
    <>
      <header>
        <div>
          <p className="eyebrow">DADOS DE MERCADO</p>
          <h1>Candles</h1>
        </div>
      </header>
      <div className="tabs" role="tablist" aria-label="Aquisição de candles">
        <button
          role="tab"
          aria-selected={mode === "loaded"}
          onClick={() => switchMode("loaded")}
        >
          <Icon name="database" />
          Candles carregados
        </button>
        <button
          role="tab"
          aria-selected={mode === "binance"}
          onClick={() => switchMode("binance")}
        >
          <Icon name="download" />
          Buscar na Binance
        </button>
        <button
          role="tab"
          aria-selected={mode === "json"}
          onClick={() => switchMode("json")}
        >
          <Icon name="upload" />
          Enviar JSON
        </button>
      </div>
      <div
        className={mode === "loaded" ? "loaded-datasets-layout" : "two-columns"}
      >
        {mode === "loaded" ? (
          <LoadedDatasets
            selectedId={dataset?.id}
            onSelect={(next) => {
              setDataset(next);
              if (next.id === dataset?.id) showDetails();
            }}
            onDelete={(id) =>
              setDataset((current) =>
                current?.id === id ? undefined : current,
              )
            }
          />
        ) : catalog.loading ? (
          <Loading />
        ) : catalog.error ? (
          <ErrorNotice error={catalog.error} retry={catalog.retry} />
        ) : (
          <form className="panel form" onSubmit={submit}>
            <label>
              Símbolo *
              <select
                value={actualSymbol}
                onChange={(e) => setSymbol(e.target.value)}
                required
              >
                {instruments.map((i) => (
                  <option key={i.symbol} value={i.symbol}>
                    {i.base_asset}/{i.quote_asset}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Intervalo *
              <select
                value={actualInterval}
                onChange={(e) => setInterval(e.target.value)}
                required
              >
                {instrument?.intervals.map((i) => <option key={i}>{i}</option>)}
              </select>
            </label>
            {mode === "binance" ? (
              <>
                <div className="field-grid">
                  <label>
                    Início (UTC)
                    <input
                      type="datetime-local"
                      step="1"
                      value={start}
                      onChange={(e) => setStart(e.target.value)}
                    />
                  </label>
                  <label>
                    Fim (UTC)
                    <input
                      type="datetime-local"
                      step="1"
                      value={end}
                      onChange={(e) => setEnd(e.target.value)}
                    />
                  </label>
                </div>
                <label>
                  Limite por requisição
                  <input
                    type="number"
                    min="1"
                    max="1000"
                    step="1"
                    placeholder="Opcional"
                    value={limit}
                    onChange={(e) => setLimit(e.target.value)}
                  />
                </label>
                <p className="muted">
                  Somente símbolo e intervalo são obrigatórios. Datas em UTC
                  consideram a abertura dos candles. Sem datas, serão buscados
                  os mais recentes; limite padrão de até 500.
                </p>
              </>
            ) : (
              <label className="upload">
                Arquivo JSON *
                <Icon name="json" standalone className="upload-icon" />
                <input
                  type="file"
                  accept=".json,application/json"
                  required
                  onChange={(e) => setFile(e.target.files?.[0])}
                />
                <span className="muted">
                  Arquivo original de candles Binance, com os 12 campos por
                  linha.
                </span>
              </label>
            )}
            {error != null && <ErrorNotice error={error} />}
            <button className="primary" disabled={busy || !instrument}>
              <Icon
                name={
                  busy ? "loading" : mode === "binance" ? "download" : "import"
                }
                spin={busy}
              />
              {busy
                ? "Aguarde…"
                : mode === "binance"
                  ? "Buscar candles"
                  : "Importar candles"}
            </button>
          </form>
        )}
        <DatasetCard dataset={dataset} elementRef={datasetDetails}>
          {dataset && (
            <>
              <p role="status" className="accent">
                <Icon name="check" />
                {mode === "json"
                  ? "Importação concluída"
                  : mode === "loaded"
                    ? "Conjunto pronto para criar sessão"
                    : "Dados disponíveis"}
              </p>
              <button
                className="primary"
                onClick={() =>
                  navigate(
                    "/sessions/new?dataset=" + encodeURIComponent(dataset.id),
                  )
                }
              >
                <Icon name="add" />
                Criar sessão
              </button>
            </>
          )}
        </DatasetCard>
      </div>
    </>
  );
}

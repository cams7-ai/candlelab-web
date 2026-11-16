import { useEffect, useRef, useState, type FormEvent } from "react";
import { allPages, api, request } from "../api";
import { useQuery } from "../hooks";
import type { Dataset, Instrument } from "../types";
import { binanceInput, utc } from "../utils";
import { DatasetCard, Empty, ErrorNotice, Loading } from "./common";
function LoadedDatasets({
  selectedId,
  onSelect,
}: {
  selectedId?: string;
  onSelect: (dataset: Dataset) => void;
}) {
  const query = useQuery(
    (signal) => allPages<Dataset>("/datasets", signal, (d) => d.id),
    [],
  );
  return (
    <section className="panel table-wrap">
      <h2>Candles carregados</h2>
      {query.loading ? (
        <Loading />
      ) : query.error ? (
        <ErrorNotice error={query.error} retry={query.retry} />
      ) : !query.data?.length ? (
        <Empty>
          Nenhum conjunto carregado. Busque candles na Binance ou envie um JSON.
        </Empty>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Par / intervalo</th>
              <th>Candles</th>
              <th>Período (UTC)</th>
              <th>Origem</th>
              <th>Ação</th>
            </tr>
          </thead>
          <tbody>
            {query.data.map((d) => (
              <tr key={d.id} className={selectedId === d.id ? "selected" : ""}>
                <td>
                  {d.base_asset}/{d.quote_asset} · {d.interval}
                  <small>{d.id}</small>
                </td>
                <td>{d.candle_count}</td>
                <td>
                  {utc(d.first_open_time_ms)}
                  <br />
                  {utc(d.last_open_time_ms)}
                </td>
                <td>{d.source}</td>
                <td>
                  <button
                    type="button"
                    aria-pressed={selectedId === d.id}
                    aria-label={`Selecionar conjunto ${d.base_asset}/${d.quote_asset} ${d.interval} ${d.id}`}
                    onClick={() => onSelect(d)}
                  >
                    {selectedId === d.id ? "Selecionado" : "Selecionar"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
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
          Candles carregados
        </button>
        <button
          role="tab"
          aria-selected={mode === "binance"}
          onClick={() => switchMode("binance")}
        >
          Buscar na Binance
        </button>
        <button
          role="tab"
          aria-selected={mode === "json"}
          onClick={() => switchMode("json")}
        >
          Enviar JSON
        </button>
      </div>
      <div className="two-columns">
        {mode === "loaded" ? (
          <LoadedDatasets selectedId={dataset?.id} onSelect={setDataset} />
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
                Arquivo JSON *<span className="upload-icon">{"{ }"}</span>
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
              {busy
                ? "Aguarde…"
                : mode === "binance"
                  ? "Buscar candles"
                  : "Importar candles"}
            </button>
          </form>
        )}
        <DatasetCard dataset={dataset}>
          {dataset && (
            <>
              <p role="status" className="accent">
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
                Criar sessão
              </button>
            </>
          )}
        </DatasetCard>
      </div>
    </>
  );
}

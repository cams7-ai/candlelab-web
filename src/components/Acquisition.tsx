import { useEffect, useRef, useState, type FormEvent } from "react";
import { api, request } from "../api";
import { useQuery } from "../hooks";
import type { Dataset, Instrument } from "../types";
import { binanceInput } from "../utils";
import { DatasetCard, ErrorNotice, Loading } from "./common";
export function Acquisition({
  navigate,
}: {
  navigate: (path: string) => void;
}) {
  const catalog = useQuery(
    (signal) => request<{ items: Instrument[] }>("/instruments", { signal }),
    [],
  );
  const [mode, setMode] = useState<"binance" | "json">("binance");
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
  function switchMode(next: "binance" | "json") {
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
          <h1>Adicionar candles</h1>
        </div>
      </header>
      <div className="tabs" role="tablist" aria-label="Aquisição de candles">
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
      {catalog.loading ? (
        <Loading />
      ) : catalog.error ? (
        <ErrorNotice error={catalog.error} retry={catalog.retry} />
      ) : (
        <div className="two-columns">
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
          <DatasetCard dataset={dataset}>
            {dataset && (
              <>
                <p role="status" className="accent">
                  {mode === "json"
                    ? "Importação concluída"
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
      )}
    </>
  );
}

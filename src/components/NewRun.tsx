import { useEffect, useRef, useState, type FormEvent } from "react";
import { api, request, resource } from "../api";
import { useQuery } from "../hooks";
import type { Dataset, Session, Strategy } from "../types";
import { format, labels, parameterValue, rateToPercent } from "../utils";
import { Empty, ErrorNotice, Loading } from "./common";
export function NewRun({
  id,
  navigate,
}: {
  id: string;
  navigate: (path: string) => void;
}) {
  const query = useQuery(
    async (signal) => {
      const [session, catalog] = await Promise.all([
        request<Session>(`/sessions/${resource(id)}`, { signal }),
        request<{ items: Strategy[] }>("/strategies", { signal }),
      ]);
      const dataset = await request<Dataset>(
        `/datasets/${resource(session.dataset_id)}`,
        { signal },
      );
      return { session, dataset, strategies: catalog.items };
    },
    [id],
  );
  const [strategyId, setStrategyId] = useState("");
  const [values, setValues] = useState<Record<string, string>>({});
  const [error, setError] = useState<unknown>();
  const [busy, setBusy] = useState(false);
  const active = useRef<AbortController>();
  const importRevision = useRef(0);
  useEffect(() => () => active.current?.abort(), []);
  const strategy =
    query.data?.strategies.find((s) => s.id === strategyId) ??
    query.data?.strategies[0];
  useEffect(
    () => () => {
      importRevision.current += 1;
    },
    [],
  );
  function change(id: string) {
    importRevision.current += 1;
    setStrategyId(id);
    setValues({});
    setError(undefined);
  }
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!strategy) return;
    const controller = new AbortController();
    active.current = controller;
    setBusy(true);
    setError(undefined);
    try {
      const parameters = Object.fromEntries(
        Object.entries(strategy.parameters_schema.properties).map(
          ([key, schema]) => [
            key,
            parameterValue(
              values[key] ??
                String(strategy.defaults[key] ?? schema.default ?? ""),
              schema,
            ),
          ],
        ),
      );
      const run = await api.createRun(
        id,
        { strategy_id: strategy.id, parameters },
        controller.signal,
      );
      if (!controller.signal.aborted)
        navigate(
          `/sessions/${encodeURIComponent(id)}?run=${encodeURIComponent(run.id)}`,
        );
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
          <h1>Novo processamento</h1>
          <p className="muted">
            Configure os parâmetros e inicie um novo processamento de backtest.
          </p>
        </div>
      </header>
      {query.loading ? (
        <Loading />
      ) : query.error ? (
        <ErrorNotice error={query.error} retry={query.retry} />
      ) : (
        query.data && (
          <div className="two-columns">
            <form className="panel form" onSubmit={submit}>
              <h2>Dados do processamento</h2>
              <label>
                Estratégia
                <select
                  value={strategy?.id ?? ""}
                  onChange={(e) => change(e.target.value)}
                >
                  {query.data.strategies.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} · {s.id}
                    </option>
                  ))}
                </select>
              </label>
              {!strategy && (
                <Empty>Nenhuma estratégia publicada no catálogo.</Empty>
              )}
              {strategy && (
                <section aria-label="Regras da estratégia">
                  <p>
                    <strong>
                      {strategy.category === "combination"
                        ? "Combinação"
                        : strategy.category === "individual"
                          ? "Individual"
                          : "Legada"}
                    </strong>{" "}
                    · {strategy.rules}
                  </p>
                  {strategy.limitations && (
                    <p className="muted">{strategy.limitations}</p>
                  )}
                  {!!strategy.required_data?.length && (
                    <p>
                      Dados auxiliares obrigatórios:{" "}
                      <code>{strategy.required_data.join(", ")}</code>. Uma
                      observação por <code>open_time_ms</code> do dataset, sem
                      lacunas. Preços e valores decimais como strings;
                      timestamps em milissegundos UTC. Quotes e previsões
                      representam o instante de abertura indicado.
                    </p>
                  )}
                </section>
              )}
              {!!strategy?.required_data?.length && (
                <p className="muted">
                  <a href="/auxiliares-sinteticos.json" download>
                    Baixar exemplo auxiliar sintético
                  </a>{" "}
                  (somente para os 40 candles do arquivo
                  candles-sinteticos.json; adapte aos timestamps do seu
                  dataset).
                </p>
              )}
              <div className="field-grid">
                {strategy &&
                  Object.entries(strategy.parameters_schema.properties).map(
                    ([key, schema]) => (
                      <label key={key}>
                        {schema.title ?? labels[key] ?? key}
                        {schema.contentMediaType === "application/json" ? (
                          <>
                            <input
                              type="file"
                              accept=".json,application/json"
                              aria-label="Importar dados auxiliares JSON"
                              onChange={async (e) => {
                                const file = e.target.files?.[0];
                                if (!file) return;
                                try {
                                  if (file.size > 8 * 1024 * 1024)
                                    throw new Error(
                                      "Arquivo auxiliar excede 8 MiB.",
                                    );
                                  const revision = importRevision.current;
                                  const raw = await file.text();
                                  if (revision !== importRevision.current)
                                    return;
                                  parameterValue(raw, schema);
                                  setValues((previous) => ({
                                    ...previous,
                                    [key]: raw,
                                  }));
                                  setError(undefined);
                                } catch (err) {
                                  setError(err);
                                }
                              }}
                            />
                            <textarea
                              required
                              aria-label="Dados auxiliares JSON"
                              rows={8}
                              value={
                                values[key] ??
                                String(strategy.defaults[key] ?? "[]")
                              }
                              onChange={(e) =>
                                setValues({ ...values, [key]: e.target.value })
                              }
                            />
                          </>
                        ) : (
                          <input
                            required
                            inputMode={
                              schema.type === "integer" ? "numeric" : "decimal"
                            }
                            value={
                              values[key] ??
                              String(
                                strategy.defaults[key] ?? schema.default ?? "",
                              )
                            }
                            onChange={(e) =>
                              setValues({ ...values, [key]: e.target.value })
                            }
                          />
                        )}
                        <small className="muted">
                          {schema.contentMediaType === "application/json"
                            ? "Lista JSON · snapshot persistido no processamento"
                            : schema.type === "integer"
                              ? "Inteiro"
                              : "Decimal"}
                          {schema.description ? ` · ${schema.description}` : ""}
                          {schema["x-min"] != null
                            ? ` · mínimo ${schema["x-min"]}`
                            : ""}
                          {schema["x-max"] != null
                            ? ` · máximo ${schema["x-max"]}`
                            : ""}
                          {schema.minimum != null
                            ? ` · mínimo ${schema.minimum}`
                            : ""}
                          {schema.maximum != null
                            ? ` · máximo ${schema.maximum}`
                            : ""}
                        </small>
                      </label>
                    ),
                  )}
              </div>
              {error != null && <ErrorNotice error={error} />}
              <footer className="actions">
                <button
                  type="button"
                  onClick={() =>
                    navigate("/sessions/" + encodeURIComponent(id))
                  }
                >
                  Cancelar
                </button>
                <button className="primary" disabled={busy || !strategy}>
                  {busy ? "Iniciando…" : "▶ Iniciar processamento"}
                </button>
              </footer>
            </form>
            <aside className="panel">
              <h2>Sessão selecionada</h2>
              <h3>{query.data.session.name}</h3>
              <p>
                {query.data.dataset.base_asset}/{query.data.dataset.quote_asset}{" "}
                · {query.data.dataset.interval}
              </p>
              <dl>
                <dt>Caixa inicial</dt>
                <dd>{format(query.data.session.initial_cash)} USDT</dd>
                <dt>Taxa por preenchimento</dt>
                <dd>{format(rateToPercent(query.data.session.fee_rate))}%</dd>
              </dl>
              <p className="muted">
                Cada processamento começa com o caixa inicial da sessão.
                Simulações incluem taxas da sessão; stops são observados no
                fechamento. Dados sintéticos do tutorial são exemplos didáticos
                e não garantem rentabilidade.
              </p>
            </aside>
          </div>
        )
      )}
    </>
  );
}

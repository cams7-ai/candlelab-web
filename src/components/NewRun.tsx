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
  useEffect(() => () => active.current?.abort(), []);
  const strategy =
    query.data?.strategies.find((s) => s.id === strategyId) ??
    query.data?.strategies[0];
  function change(id: string) {
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
              <div className="field-grid">
                {strategy &&
                  Object.entries(strategy.parameters_schema.properties).map(
                    ([key, schema]) => (
                      <label key={key}>
                        {schema.title ?? labels[key] ?? key}
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
                        <small className="muted">
                          {schema.type === "integer" ? "Inteiro" : "Decimal"}
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
              </p>
            </aside>
          </div>
        )
      )}
    </>
  );
}

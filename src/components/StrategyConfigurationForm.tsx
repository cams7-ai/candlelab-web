import { Icon } from "./Icon";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { api } from "../api";
import type { Strategy, StrategyCombination } from "../types";
import { parameterLabel, parameterValue, strategyParameters } from "../utils";
import { ErrorNotice } from "./common";

export function StrategyConfigurationForm({
  strategy,
  existing,
  onCancel,
  onSaved,
}: {
  strategy: Strategy;
  existing?: StrategyCombination;
  onCancel: () => void;
  onSaved: (saved: StrategyCombination) => void;
}) {
  const [name, setName] = useState(
    existing?.name ?? `${strategy.name} personalizada`.slice(0, 200),
  );
  const [values, setValues] = useState<Record<string, string | number>>({
    ...strategy.defaults,
    ...existing?.parameters,
  });
  const [busy, setBusy] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<unknown>();
  const active = useRef<AbortController>();
  const revision = useRef(0);
  const nameInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    nameInput.current?.focus();
    return () => {
      active.current?.abort();
      revision.current++;
    };
  }, []);
  async function save(event: FormEvent) {
    event.preventDefault();
    if (busy || importing) return;
    const controller = new AbortController();
    active.current = controller;
    setBusy(true);
    setError(undefined);
    try {
      if (!name.trim()) throw new Error("Informe o nome da configuração.");
      const saved = await api.saveCombination(
        {
          name: name.trim(),
          kind: strategy.category === "combination" ? "preset" : "strategy",
          strategy_id: strategy.id,
          parameters: strategyParameters(strategy, values),
          members: [],
          buy_rule: "all",
          sell_rule: "any",
        },
        existing?.id,
        controller.signal,
      );
      if (!controller.signal.aborted) onSaved(saved);
    } catch (error) {
      if (!controller.signal.aborted) setError(error);
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }
  return (
    <section
      className="panel configuration-editor"
      aria-labelledby="configuration-editor-title"
    >
      <h2 id="configuration-editor-title">
        {existing ? "Editar parâmetros" : "Nova configuração personalizada"}
      </h2>
      <p className="muted">
        Os valores serão salvos nesta configuração. Os padrões do catálogo e os
        processamentos anteriores serão preservados.
      </p>
      <form className="form" onSubmit={save}>
        <fieldset className="combination-fields" disabled={busy}>
          <label>
            Nome da configuração
            <input
              ref={nameInput}
              required
              maxLength={200}
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          {!!strategy.required_data?.length && (
            <p className="muted">
              Os dados auxiliares JSON são específicos do conjunto de candles.
              Reutilize esta configuração com um dataset que tenha os mesmos
              timestamps.
            </p>
          )}
          <div className="field-grid">
            {Object.entries(strategy.parameters_schema.properties).map(
              ([key, schema]) => (
                <label key={key}>
                  {parameterLabel(key, strategy)}
                  {schema.contentMediaType === "application/json" ? (
                    <>
                      <input
                        type="file"
                        accept=".json,application/json"
                        aria-label="Importar dados auxiliares JSON"
                        onChange={async (event) => {
                          const file = event.target.files?.[0];
                          if (!file) return;
                          const current = ++revision.current;
                          setImporting(true);
                          try {
                            if (file.size > 8 * 1024 * 1024)
                              throw new Error("Arquivo auxiliar excede 8 MiB.");
                            const raw = await file.text();
                            if (current !== revision.current) return;
                            parameterValue(raw, schema);
                            setValues((previous) => ({
                              ...previous,
                              [key]: raw,
                            }));
                            setError(undefined);
                          } catch (error) {
                            if (current === revision.current) setError(error);
                          } finally {
                            if (current === revision.current)
                              setImporting(false);
                          }
                        }}
                      />
                      <textarea
                        required
                        aria-label="Dados auxiliares JSON"
                        rows={8}
                        value={String(values[key] ?? schema.default ?? "[]")}
                        onChange={(event) => {
                          revision.current++;
                          setImporting(false);
                          setValues({ ...values, [key]: event.target.value });
                        }}
                      />
                    </>
                  ) : (
                    <input
                      required
                      inputMode={
                        schema.type === "integer" ? "numeric" : "decimal"
                      }
                      value={String(values[key] ?? schema.default ?? "")}
                      onChange={(event) =>
                        setValues({ ...values, [key]: event.target.value })
                      }
                    />
                  )}
                  <small className="muted">
                    {schema.description ??
                      (schema.contentMediaType === "application/json"
                        ? "Lista JSON de observações auxiliares"
                        : schema.type === "integer"
                          ? "Inteiro"
                          : "Decimal")}
                  </small>
                </label>
              ),
            )}
          </div>
          {!Object.keys(strategy.parameters_schema.properties).length && (
            <p className="muted">
              Esta estratégia não possui parâmetros adicionais. Você pode salvar
              uma configuração com um nome próprio.
            </p>
          )}
        </fieldset>
        {error != null && <ErrorNotice error={error} />}
        <footer className="actions configuration-editor-actions">
          <button
            type="button"
            disabled={busy || importing}
            onClick={() => {
              setValues({ ...strategy.defaults });
              setError(undefined);
            }}
          >
            <Icon name="reset" />
            Restaurar padrões
          </button>
          <button type="button" disabled={busy} onClick={onCancel}>
            <Icon name="cancel" />
            Cancelar edição
          </button>
          <button className="primary" disabled={busy || importing}>
            <Icon name={busy ? "loading" : "save"} spin={busy} />
            {busy ? "Salvando…" : "Salvar configuração"}
          </button>
        </footer>
      </form>
    </section>
  );
}

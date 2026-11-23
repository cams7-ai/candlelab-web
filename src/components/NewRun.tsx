import { ParameterSelect } from "./ParameterSelect";
import { Icon } from "./Icon";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { api, request, resource } from "../api";
import { strategyRole, strategyWorkspacePath } from "../strategies";
import { useQuery } from "../hooks";
import type {
  CombinationDefinition,
  Dataset,
  Session,
  Strategy,
} from "../types";
import {
  format,
  parameterLabel,
  parameterValue,
  rateToPercent,
} from "../utils";
import { normalizeCombination } from "../combinations";
import { RunCombinationParameters } from "./RunCombinationParameters";
import { CombinationSummary } from "./CombinationSummary";
import { StrategyPicker } from "./StrategyPicker";
import { Empty, ErrorNotice, Loading } from "./common";
export function NewRun({
  id,
  navigate,
  combinationId,
}: {
  id: string;
  combinationId?: string | null;
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
      return {
        catalog: catalog.items,
        session,
        dataset,
        strategies: catalog.items.filter(
          (s) => !s.composition_role || s.composition_role === "signal",
        ),
      };
    },
    [id],
  );
  const returnTo = `/sessions/${encodeURIComponent(id)}/runs/new`;
  const combinations = useQuery((signal) => api.combinations(signal), []);
  const [mode, setMode] = useState<"strategy" | "combination">(
    combinationId ? "combination" : "strategy",
  );
  const [selectedCombination, setSelectedCombination] = useState(
    combinationId ?? "",
  );
  const runnable =
    combinations.data?.filter(
      (item) =>
        item.kind !== "strategy" ||
        query.data?.strategies.some(
          (strategy) => strategy.id === item.strategy_id,
        ),
    ) ?? [];
  const combination = runnable.find((item) => item.id === selectedCombination);
  const [combinationDraft, setCombinationDraft] =
    useState<CombinationDefinition>();
  const [strategyId, setStrategyId] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [savedPickerOpen, setSavedPickerOpen] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const [auxiliaryFilename, setAuxiliaryFilename] = useState<string>();
  const [importing, setImporting] = useState(false);
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
    setAuxiliaryFilename(undefined);
    setImporting(false);
    setError(undefined);
  }
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy || importing || (mode === "strategy" ? !strategy : !combination))
      return;
    const controller = new AbortController();
    active.current = controller;
    setBusy(true);
    setError(undefined);
    try {
      const parameters =
        mode === "combination"
          ? {}
          : Object.fromEntries(
              Object.entries(strategy!.parameters_schema.properties).map(
                ([key, schema]) => [
                  key,
                  parameterValue(
                    values[key] ??
                      String(strategy!.defaults[key] ?? schema.default ?? ""),
                    schema,
                  ),
                ],
              ),
            );
      let savedRun:
        | { combination_id: string }
        | { strategy_id: string; parameters: Record<string, string | number> } =
        { combination_id: combination?.id ?? "" };
      if (mode === "combination" && combinationDraft) {
        const definition = normalizeCombination(
          combinationDraft,
          query.data!.catalog,
        );
        const original = normalizeCombination(
          combination!,
          query.data!.catalog,
        );
        if (JSON.stringify(definition) !== JSON.stringify(original)) {
          savedRun =
            definition.kind === "custom"
              ? {
                  strategy_id: "CUSTOM_COMBINATION@1",
                  parameters: { definition_json: JSON.stringify(definition) },
                }
              : {
                  strategy_id: definition.strategy_id!,
                  parameters: definition.parameters,
                };
        }
      }
      const run = await api.createRun(
        id,
        mode === "combination"
          ? savedRun
          : {
              strategy_id: strategy!.id,
              parameters,
              ...(auxiliaryFilename
                ? { auxiliary_filename: auxiliaryFilename }
                : {}),
            },
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
            Escolha uma estratégia ou um cadastro salvo e inicie um novo
            backtest.
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
              <fieldset className="processing-mode" disabled={busy}>
                <legend>Usar no processamento</legend>
                {(["strategy", "combination"] as const).map((value) => (
                  <label key={value}>
                    <input
                      type="radio"
                      name="processing-mode"
                      value={value}
                      checked={mode === value}
                      onChange={() => {
                        change(strategy?.id ?? "");
                        setMode(value);
                      }}
                    />
                    <span>
                      <strong>
                        {value === "strategy"
                          ? "Estratégia do catálogo"
                          : "Configuração ou combinação salva"}
                      </strong>
                      <small className="muted">
                        {value === "strategy"
                          ? "Defina os parâmetros para esta execução."
                          : "Use ou ajuste os parâmetros de um cadastro existente."}
                      </small>
                    </span>
                  </label>
                ))}
              </fieldset>
              <p>
                <a href={`#${strategyWorkspacePath({ returnTo })}`}>
                  <Icon name="catalog" />
                  Consultar estratégias e configurações
                </a>
                {" · "}
                <a
                  href={`#${strategyWorkspacePath({ tab: "combinations", returnTo })}`}
                >
                  <Icon name="combination" />
                  Cadastrar ou gerenciar combinações
                </a>
              </p>
              {mode === "combination" ? (
                <>
                  {combinations.loading ? (
                    <Loading />
                  ) : combinations.error ? (
                    <ErrorNotice
                      error={combinations.error}
                      retry={combinations.retry}
                    />
                  ) : (
                    <>
                      <div className="run-strategy-field">
                        <span id="run-saved-label">
                          Configuração ou combinação salva
                        </span>
                        <button
                          type="button"
                          className="run-strategy-trigger"
                          aria-label="Selecionar configuração ou combinação"
                          aria-describedby="run-saved-label"
                          aria-haspopup="dialog"
                          aria-expanded={savedPickerOpen}
                          disabled={busy || !runnable.length}
                          onClick={() => setSavedPickerOpen(true)}
                        >
                          <span>
                            <strong>
                              {combination?.name ??
                                "Selecione uma configuração ou combinação"}
                            </strong>
                            {combination && (
                              <small className="muted">
                                {combination.kind === "custom"
                                  ? "Combinação livre"
                                  : combination.kind === "preset"
                                    ? "Receita"
                                    : "Configuração personalizada"}
                              </small>
                            )}
                          </span>
                          <span className="run-strategy-change">
                            <Icon name="search" />
                            {combination ? "Alterar" : "Selecionar"}
                          </span>
                        </button>
                      </div>
                      {!runnable.length && (
                        <Empty>
                          Nenhuma configuração ou combinação disponível. Crie
                          uma configuração nos detalhes de uma estratégia ou
                          cadastre uma combinação para continuar.
                        </Empty>
                      )}
                      {selectedCombination && !combination && (
                        <p role="alert">
                          O cadastro selecionado não está disponível. Escolha
                          outra configuração ou combinação.
                        </p>
                      )}
                      {combination && (
                        <>
                          <p className="muted">
                            Ajuste os parâmetros para esta execução. O cadastro
                            salvo e os processamentos anteriores permanecem
                            inalterados.
                          </p>
                          {combinationDraft ? (
                            <fieldset
                              className="combination-fields"
                              disabled={busy}
                            >
                              <RunCombinationParameters
                                definition={combinationDraft}
                                strategies={query.data.catalog}
                                onChange={setCombinationDraft}
                              />
                              <button
                                type="button"
                                onClick={() => {
                                  setCombinationDraft(undefined);
                                  setError(undefined);
                                }}
                              >
                                Restaurar parâmetros salvos
                              </button>
                              <details>
                                <summary>Ver resumo da execução</summary>
                                <CombinationSummary
                                  combination={combinationDraft}
                                  strategies={query.data.catalog}
                                />
                              </details>
                            </fieldset>
                          ) : (
                            <>
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() =>
                                  setCombinationDraft(
                                    structuredClone(combination),
                                  )
                                }
                              >
                                <Icon name="settings" />
                                Editar parâmetros para esta execução
                              </button>
                              <CombinationSummary
                                key={combination.id}
                                combination={combination}
                                strategies={query.data.catalog}
                              />
                            </>
                          )}
                        </>
                      )}
                    </>
                  )}
                </>
              ) : (
                <>
                  <div className="run-strategy-field">
                    <span id="run-strategy-label">Estratégia</span>
                    <button
                      type="button"
                      className="run-strategy-trigger"
                      aria-label="Selecionar estratégia"
                      aria-describedby="run-strategy-label"
                      aria-haspopup="dialog"
                      aria-expanded={pickerOpen}
                      disabled={busy || !query.data.strategies.length}
                      onClick={() => setPickerOpen(true)}
                    >
                      <span>
                        <strong>
                          {strategy?.name ?? "Selecione uma estratégia"}
                        </strong>
                        {strategy && (
                          <small className="muted">
                            {strategyRole(strategy)} · {strategy.id}
                          </small>
                        )}
                      </span>
                      <span className="run-strategy-change">
                        <Icon name="search" />
                        Alterar
                      </span>
                    </button>
                  </div>
                  {!strategy && (
                    <Empty>Nenhuma estratégia publicada no catálogo.</Empty>
                  )}
                  {strategy && (
                    <section aria-label="Regras da estratégia">
                      <p>
                        {strategy.category && (
                          <strong>
                            {strategy.category === "combination"
                              ? "Combinação publicada"
                              : strategy.category === "individual"
                                ? "Estratégia individual"
                                : "Estratégia clássica"}
                          </strong>
                        )}
                        {strategy.category && strategy.rules ? " · " : ""}
                        {strategy.rules}
                      </p>
                      {!!strategy.components?.length && (
                        <div>
                          <h3>Componentes da receita</h3>
                          <ul className="strategy-recipe-list">
                            {strategy.components.map((component) => (
                              <li key={component.strategy_id}>
                                <span>
                                  {query.data?.catalog.find(
                                    (item) => item.id === component.strategy_id,
                                  )?.name ?? component.strategy_id}
                                </span>
                                <span className="strategy-badge">
                                  {component.role === "filter"
                                    ? "Filtro de compra"
                                    : component.role === "exit"
                                      ? "Saída"
                                      : "Sinal"}
                                </span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {strategy.limitations && (
                        <p className="muted">{strategy.limitations}</p>
                      )}
                      {!!strategy.required_data?.length && (
                        <p>
                          Dados auxiliares obrigatórios:{" "}
                          <code>{strategy.required_data.join(", ")}</code>. Uma
                          observação por <code>open_time_ms</code> do dataset,
                          sem lacunas. Preços e valores decimais como strings;
                          timestamps em milissegundos UTC. Quotes e previsões
                          representam o instante de abertura indicado.
                        </p>
                      )}
                    </section>
                  )}
                  {!!strategy?.required_data?.length && (
                    <p className="muted">
                      <a href="/auxiliares-sinteticos.json" download>
                        <Icon name="download" />
                        Baixar exemplo auxiliar sintético
                      </a>{" "}
                      (somente para os 40 candles do arquivo
                      candles-sinteticos.json; adapte aos timestamps do seu
                      dataset).
                    </p>
                  )}
                  <div className="field-grid">
                    {strategy &&
                      Object.entries(
                        strategy!.parameters_schema.properties,
                      ).map(([key, schema]) => (
                        <label key={key}>
                          {parameterLabel(key, strategy)}
                          {schema.enum ? (
                            <ParameterSelect
                              label={parameterLabel(key, strategy)}
                              schema={schema}
                              value={String(
                                values[key] ??
                                  strategy.defaults[key] ??
                                  schema.default ??
                                  "",
                              )}
                              onChange={(value) =>
                                setValues({ ...values, [key]: value })
                              }
                            />
                          ) : schema.contentMediaType === "application/json" ? (
                            <>
                              <input
                                key={strategy.id}
                                type="file"
                                accept=".json,application/json"
                                aria-label="Importar dados auxiliares JSON"
                                onChange={async (e) => {
                                  const file = e.target.files?.[0];
                                  if (!file) return;
                                  const revision = ++importRevision.current;
                                  setImporting(true);
                                  try {
                                    if (file.size > 8 * 1024 * 1024)
                                      throw new Error(
                                        "Arquivo auxiliar excede 8 MiB.",
                                      );
                                    const raw = await file.text();
                                    if (revision !== importRevision.current)
                                      return;
                                    parameterValue(raw, schema);
                                    setValues((previous) => ({
                                      ...previous,
                                      [key]: raw,
                                    }));
                                    setAuxiliaryFilename(file.name);
                                    setError(undefined);
                                  } catch (err) {
                                    if (revision === importRevision.current)
                                      setError(err);
                                  } finally {
                                    if (revision === importRevision.current)
                                      setImporting(false);
                                  }
                                }}
                              />
                              {auxiliaryFilename && (
                                <small className="muted auxiliary-filename">
                                  Arquivo carregado: {auxiliaryFilename}
                                </small>
                              )}
                              <textarea
                                required
                                aria-label="Dados auxiliares JSON"
                                rows={8}
                                value={
                                  values[key] ??
                                  String(strategy.defaults[key] ?? "[]")
                                }
                                onChange={(e) => {
                                  importRevision.current += 1;
                                  setImporting(false);
                                  setValues({
                                    ...values,
                                    [key]: e.target.value,
                                  });
                                }}
                              />
                            </>
                          ) : (
                            <input
                              required
                              inputMode={
                                schema.type === "integer"
                                  ? "numeric"
                                  : "decimal"
                              }
                              value={
                                values[key] ??
                                String(
                                  strategy.defaults[key] ??
                                    schema.default ??
                                    "",
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
                              : schema.enum
                                ? "Opção"
                                : schema.type === "integer"
                                  ? "Inteiro"
                                  : "Decimal"}
                            {schema.description
                              ? ` · ${schema.description}`
                              : ""}
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
                      ))}
                  </div>
                </>
              )}
              {error != null && <ErrorNotice error={error} />}
              <footer className="actions">
                <button
                  type="button"
                  onClick={() =>
                    navigate("/sessions/" + encodeURIComponent(id))
                  }
                >
                  <Icon name="cancel" />
                  Cancelar
                </button>
                <button
                  className="primary"
                  disabled={
                    busy ||
                    importing ||
                    (mode === "strategy" ? !strategy : !combination)
                  }
                >
                  <Icon name={busy ? "loading" : "run"} spin={busy} />
                  {busy ? "Iniciando…" : "Iniciar processamento"}
                </button>
              </footer>
            </form>
            <aside className="panel">
              <h2>
                <Icon name="sessions" />
                Sessão selecionada
              </h2>
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
      {savedPickerOpen && query.data && (
        <StrategyPicker
          mode="saved"
          strategies={query.data.catalog}
          combinations={runnable}
          selectedId={combination?.id}
          onClose={() => setSavedPickerOpen(false)}
          onSelect={(selected) => {
            if (selected.id !== combination?.id) setCombinationDraft(undefined);
            setSelectedCombination(selected.id);
            setError(undefined);
          }}
        />
      )}
      {pickerOpen && query.data && (
        <StrategyPicker
          mode="single"
          strategies={query.data.catalog}
          selectedId={strategy?.id}
          onClose={() => setPickerOpen(false)}
          onSelect={(selected) => {
            if (selected.id !== strategy?.id) change(selected.id);
          }}
        />
      )}
    </>
  );
}

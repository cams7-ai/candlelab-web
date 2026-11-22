import {
  CombinationParameters,
  appendCombinationMembers,
} from "./CombinationParameters";
import { CombinationSummary } from "./CombinationSummary";
import { Icon } from "./Icon";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { api, request } from "../api";
import { useQuery, useRefreshOnActivate } from "../hooks";
import type {
  CombinationDefinition,
  CombinationMember,
  Strategy,
} from "../types";
import { parameterLabel, parameterValue } from "../utils";
import { compositionCompatible, memberKey, ruleLabel } from "../combinations";
import { ErrorNotice, Loading } from "./common";
import { StrategyPicker } from "./StrategyPicker";
import { combinationPath, strategyRole } from "../strategies";

const empty = (): CombinationDefinition => ({
  name: "",
  kind: "custom",
  strategy_id: null,
  parameters: {},
  members: [],
  buy_rule: "all",
  sell_rule: "any",
});

export function Combinations({
  navigate,
  returnTo,
  editId,
  embedded = false,
  active: tabActive = true,
}: {
  navigate: (path: string) => void;
  embedded?: boolean;
  active?: boolean;
  returnTo?: string | null;
  editId?: string | null;
}) {
  const query = useQuery(async (signal) => {
    const [combinations, catalog] = await Promise.all([
      api.combinations(signal),
      request<{ items: Strategy[] }>("/strategies", { signal }),
    ]);
    return { combinations, strategies: catalog.items };
  }, []);
  useRefreshOnActivate(tabActive, query.retry);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [draft, setDraft] = useState<CombinationDefinition>(empty);
  const [editing, setEditing] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  const [notice, setNotice] = useState("");
  useEffect(() => {
    if (!tabActive) {
      setPickerOpen(false);
    }
  }, [tabActive]);
  const active = useRef<AbortController>();
  const nameInput = useRef<HTMLInputElement>(null);
  useEffect(() => () => active.current?.abort(), []);
  const strategies = query.data?.strategies ?? [];
  const compatible = strategies.filter((s) => s.combinable);
  const presets = strategies.filter((s) => s.category === "combination");
  const loadedEdit = useRef<string>();
  useEffect(() => {
    if (!editId || !query.data || loadedEdit.current === editId) return;
    loadedEdit.current = editId;
    const combination = query.data.combinations.find(
      (item) => item.id === editId,
    );
    if (!combination) {
      setError(
        new Error("A combinação selecionada não está disponível para edição."),
      );
      return;
    }
    if (combination.kind === "strategy") {
      navigate(combinationPath(combination.id));
      return;
    }
    const { id, ...definition } = combination;
    setEditing(id);
    setDraft(structuredClone(definition));
    setError(undefined);
    setNotice("");
    nameInput.current?.focus();
  }, [editId, query.data]);
  const importable = (query.data?.combinations ?? []).filter(
    (combination) => combination.kind === "custom",
  );
  function importMembers(id: string) {
    const source = importable.find((combination) => combination.id === id);
    if (!source) return;
    setError(undefined);
    setNotice("");
    if (
      source.members.some((member) =>
        member.combination
          ? !compositionCompatible(member.combination, strategies)
          : !compatible.some((s) => s.id === member.strategy_id),
      )
    ) {
      setError(
        new Error(
          "Esta combinação contém estratégias indisponíveis ou incompatíveis. Nenhuma estratégia foi importada.",
        ),
      );
      return;
    }
    const ids = new Set(draft.members.map(memberKey));
    const additions = source.members.filter((member) => {
      if (ids.has(memberKey(member))) return false;
      ids.add(memberKey(member));
      return true;
    });
    if (draft.members.length + additions.length > 8) {
      setError(
        new Error(
          "A importação ultrapassaria o limite de 8 estratégias. Remova estratégias antes de tentar novamente. Nenhuma estratégia foi importada.",
        ),
      );
      return;
    }
    setDraft({
      ...draft,
      members: [...draft.members, ...structuredClone(additions)],
    });
    const skipped = source.members.length - additions.length;
    setNotice(
      `${additions.length} estratégia(s) importada(s) de “${source.name}”.${skipped ? ` ${skipped} repetida(s) ignorada(s); os parâmetros já presentes no formulário foram mantidos.` : ""} As regras de compra e venda do formulário foram mantidas. A combinação de origem permanece inalterada.`,
    );
  }
  function addMembers(additions: CombinationMember[]): string | undefined {
    if (draft.members.length + additions.length > 8)
      return "O limite é de 8 membros. Remova um componente para adicionar outro.";
    const keys = new Set(draft.members.map(memberKey));
    for (const member of additions) {
      if (keys.has(memberKey(member)))
        return "Uma das opções já foi adicionada.";
      keys.add(memberKey(member));
      if (
        member.combination
          ? !compositionCompatible(member.combination, strategies, 2)
          : !compatible.some((strategy) => strategy.id === member.strategy_id)
      )
        return "Uma das opções está indisponível ou excede o limite de agrupamento.";
    }
    function leaves(members: CombinationMember[]): number {
      return members.reduce(
        (total, member) =>
          total +
          (member.combination?.kind === "custom"
            ? leaves(member.combination.members)
            : 1),
        0,
      );
    }
    if (leaves([...draft.members, ...additions]) > 64)
      return "Esta seleção ultrapassa o limite de 64 estratégias nos grupos.";
    setDraft({
      ...draft,
      members: appendCombinationMembers(draft.members, additions, strategies),
    });
    setError(undefined);
    setNotice(
      `${additions.length} componente(s) adicionado(s). Configure os parâmetros no formulário abaixo.`,
    );
  }
  function recipe(strategy: Strategy | undefined) {
    if (!strategy?.components?.length) return null;
    return (
      <ul aria-label={`Componentes de ${strategy.name}`}>
        {strategy.components.map((component) => (
          <li key={component.strategy_id}>
            {strategies.find((item) => item.id === component.strategy_id)
              ?.name ?? component.strategy_id}
            {" · "}
            {component.role === "filter"
              ? "Filtro de compra"
              : component.role === "exit"
                ? "Saída"
                : "Sinal"}
          </li>
        ))}
      </ul>
    );
  }
  function reset() {
    setDraft(empty());
    setEditing(undefined);
    setError(undefined);
  }
  function parameterFields(
    strategy: Strategy | undefined,
    values: Record<string, string | number>,
    change: (key: string, value: string) => void,
  ) {
    return (
      strategy && (
        <div className="field-grid">
          {Object.entries(strategy.parameters_schema.properties).map(
            ([key, schema]) => (
              <label key={key}>
                {parameterLabel(key, strategy)}
                {schema.contentMediaType === "application/json" ? (
                  <textarea
                    required
                    rows={5}
                    value={String(
                      values[key] ?? strategy.defaults[key] ?? "[]",
                    )}
                    onChange={(e) => change(key, e.target.value)}
                  />
                ) : (
                  <input
                    required
                    inputMode={
                      schema.type === "integer" ? "numeric" : "decimal"
                    }
                    value={String(
                      values[key] ??
                        strategy.defaults[key] ??
                        schema.default ??
                        "",
                    )}
                    onChange={(e) => change(key, e.target.value)}
                  />
                )}
                <small className="muted">
                  {schema.description ??
                    (schema.type === "integer"
                      ? "Inteiro"
                      : schema.contentMediaType
                        ? "Dados auxiliares JSON específicos do dataset"
                        : "Decimal")}
                </small>
              </label>
            ),
          )}
        </div>
      )
    );
  }
  function normalized(
    strategyId: string,
    values: Record<string, string | number>,
  ) {
    const strategy = strategies.find((s) => s.id === strategyId);
    if (!strategy) throw new Error("Selecione uma estratégia disponível.");
    return Object.fromEntries(
      Object.entries(strategy.parameters_schema.properties).map(
        ([key, schema]) => [
          key,
          parameterValue(
            String(
              values[key] ?? strategy.defaults[key] ?? schema.default ?? "",
            ),
            schema,
          ),
        ],
      ),
    );
  }
  async function save(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    const controller = new AbortController();
    active.current = controller;
    setBusy(true);
    setError(undefined);
    setNotice("");
    try {
      const body = {
        ...draft,
        name: draft.name.trim(),
        parameters:
          draft.kind === "preset"
            ? normalized(draft.strategy_id ?? "", draft.parameters)
            : {},
        members:
          draft.kind === "custom"
            ? draft.members.map((member) => ({
                ...member,
                parameters: member.combination
                  ? {}
                  : normalized(member.strategy_id, member.parameters),
              }))
            : [],
      };
      if (!body.name) throw new Error("Informe o nome da combinação.");
      if (body.kind === "custom" && body.members.length < 2)
        throw new Error("Selecione pelo menos duas estratégias.");
      const saved = await api.saveCombination(body, editing, controller.signal);
      if (controller.signal.aborted) return;
      reset();
      setNotice(`Combinação “${saved.name}” salva.`);
      query.retry();
      if (returnTo?.startsWith("/sessions/") && returnTo.endsWith("/runs/new"))
        navigate(`${returnTo}?combination=${encodeURIComponent(saved.id)}`);
    } catch (err) {
      if (!controller.signal.aborted) setError(err);
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }
  return (
    <>
      {!embedded && (
        <header>
          <div>
            <h1>Combinações</h1>
            <p className="muted">
              Cadastre estratégias e parâmetros para reutilizar em novos
              processamentos.
            </p>
          </div>
        </header>
      )}
      {notice && (
        <p role="status" className="accent">
          {notice}
        </p>
      )}
      {query.loading ? (
        <Loading />
      ) : query.error ? (
        <ErrorNotice error={query.error} retry={query.retry} />
      ) : (
        <div>
          <form className="panel form" onSubmit={save}>
            <h2>{editing ? "Editar combinação" : "Nova combinação"}</h2>
            <fieldset
              disabled={busy}
              className="combination-fields"
              onInvalid={(event) => {
                const details = (event.target as HTMLElement).closest(
                  "details",
                );
                if (details) details.open = true;
              }}
            >
              <label>
                Nome da combinação
                <input
                  ref={nameInput}
                  required
                  maxLength={200}
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                />
              </label>
              <label>
                Tipo de combinação
                <select
                  value={draft.kind}
                  onChange={(e) => {
                    const kind = e.target
                      .value as CombinationDefinition["kind"];
                    setDraft({
                      ...empty(),
                      name: draft.name,
                      kind,
                      strategy_id:
                        kind === "preset" ? (presets[0]?.id ?? null) : null,
                    });
                    setError(undefined);
                  }}
                >
                  <option value="custom">Combinação livre</option>
                  <option value="preset">
                    Configuração de combinação existente
                  </option>
                </select>
              </label>
              {draft.kind === "custom" ? (
                <>
                  <p className="muted">
                    Combine de 2 a 8 sinais, filtros, saídas ou combinações.
                    Preencha os parâmetros no formulário único e escolha suas
                    regras de compra e venda.
                  </p>
                  <div className="field-grid">
                    {(["buy_rule", "sell_rule"] as const).map((key) => (
                      <label key={key}>
                        {key === "buy_rule"
                          ? "Regra de compra"
                          : "Regra de venda"}
                        <select
                          value={draft[key]}
                          onChange={(e) =>
                            setDraft({ ...draft, [key]: e.target.value })
                          }
                        >
                          <option value="all">{ruleLabel("all")}</option>
                          <option value="any">{ruleLabel("any")}</option>
                        </select>
                      </label>
                    ))}
                  </div>
                  <details className="combination-help">
                    <summary>
                      <Icon name="details" />
                      Como as regras são aplicadas
                    </summary>
                    <p className="muted">
                      Todos os filtros devem permitir a compra, inclusive na
                      regra “Qualquer uma”. Os sinais precisam ocorrer no mesmo
                      candle, após o aquecimento de todos os componentes. Venda
                      tem prioridade em conflitos. Stops seguem a regra de venda
                      escolhida, com execução na próxima abertura.
                    </p>
                    <p className="muted">
                      Grupos preservam suas regras e parâmetros em uma cópia:
                      editar ou excluir a origem não altera esta combinação. São
                      permitidos até 4 níveis de grupos e 64 estratégias no
                      total. Estratégias com dados externos, grade e DCA exigem
                      políticas próprias e não estão disponíveis nesta
                      modalidade Spot.
                    </p>
                  </details>
                  <section
                    className="combination-builder"
                    aria-labelledby="combination-members-title"
                  >
                    <div className="combination-builder-header">
                      <div>
                        <h3 id="combination-members-title" tabIndex={-1}>
                          Componentes da combinação
                        </h3>
                        <span className="muted">
                          {draft.members.length} de 8 adicionados
                        </span>
                      </div>
                      <button
                        type="button"
                        className="primary"
                        aria-haspopup="dialog"
                        disabled={draft.members.length >= 8}
                        onClick={() => setPickerOpen(true)}
                      >
                        <Icon name="add" />
                        Adicionar estratégia
                      </button>
                    </div>
                    {!draft.members.length && (
                      <div className="combination-builder-empty">
                        <strong>Comece pelos sinais da sua estratégia</strong>
                        <p className="muted">
                          Adicione os componentes e depois refine as entradas
                          com filtros e saídas.
                        </p>
                      </div>
                    )}
                    {draft.members.map((member, index) => {
                      const strategy = strategies.find(
                        (s) => s.id === member.strategy_id,
                      );
                      const name =
                        member.combination?.name ??
                        strategy?.name ??
                        member.strategy_id;
                      return (
                        <section
                          className="combination-member member-card"
                          key={`${member.strategy_id}-${index}`}
                          aria-label={`Componente ${index + 1}: ${name}`}
                        >
                          <div className="member-card-header">
                            <div>
                              <span className="member-role">
                                {member.combination
                                  ? member.combination.kind === "strategy"
                                    ? "Configuração personalizada"
                                    : "Combinação cadastrada"
                                  : strategyRole(strategy)}
                              </span>
                              <h3>{name}</h3>
                            </div>
                            <button
                              type="button"
                              className="member-remove"
                              aria-label={`Remover ${name}`}
                              onClick={() =>
                                setDraft({
                                  ...draft,
                                  members: draft.members.filter(
                                    (_, i) => i !== index,
                                  ),
                                })
                              }
                            >
                              <Icon name="delete" />
                              Remover
                            </button>
                          </div>
                          <p className="muted">
                            {member.combination
                              ? "Grupo com regras e parâmetros preservados. Alterações na origem não modificam esta cópia."
                              : strategy?.rules}
                          </p>
                          <details className="member-config">
                            <summary>
                              <Icon name="settings" />
                              {member.combination
                                ? "Ver configuração"
                                : "Ver detalhes"}{" "}
                              {name}
                            </summary>
                            {member.combination ? (
                              <CombinationSummary
                                combination={member.combination}
                                strategies={strategies}
                              />
                            ) : (
                              <>
                                <p className="muted member-identifier">
                                  Identificador: {member.strategy_id}
                                </p>
                                {recipe(strategy)}
                              </>
                            )}
                          </details>
                        </section>
                      );
                    })}
                    {draft.members.length >= 8 && (
                      <p className="muted">
                        Limite de 8 membros atingido. Remova um componente para
                        adicionar outro.
                      </p>
                    )}
                  </section>
                  <CombinationParameters
                    members={draft.members}
                    strategies={strategies}
                    onChange={(members) => setDraft({ ...draft, members })}
                  />
                  <details className="combination-import">
                    <summary>
                      <Icon name="import" />
                      Importar componentes de uma combinação
                    </summary>
                    <p className="muted" id="combination-import-help">
                      Copia componentes e parâmetros, mantendo as regras deste
                      formulário. Componentes repetidos mantêm os parâmetros já
                      preenchidos. Para preservar também as regras da origem,
                      use “Adicionar estratégia” e escolha “Combinações
                      cadastradas”.
                    </p>
                    <label>
                      Importar estratégias de uma combinação
                      <select
                        value=""
                        disabled={!importable.length}
                        aria-describedby="combination-import-help"
                        onChange={(e) => importMembers(e.target.value)}
                      >
                        <option value="">Selecione uma combinação salva</option>
                        {importable.map((combination) => (
                          <option key={combination.id} value={combination.id}>
                            {combination.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  </details>
                </>
              ) : (
                <>
                  <label>
                    Combinação publicada
                    <select
                      required
                      value={draft.strategy_id ?? ""}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          strategy_id: e.target.value,
                          parameters: {},
                        })
                      }
                    >
                      <option value="">Selecione uma combinação</option>
                      {presets.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name} · {s.id}
                        </option>
                      ))}
                    </select>
                  </label>
                  <p className="muted">
                    {strategies.find((s) => s.id === draft.strategy_id)?.rules}
                  </p>
                  {recipe(strategies.find((s) => s.id === draft.strategy_id))}
                  {parameterFields(
                    strategies.find((s) => s.id === draft.strategy_id),
                    draft.parameters,
                    (key, value) =>
                      setDraft({
                        ...draft,
                        parameters: { ...draft.parameters, [key]: value },
                      }),
                  )}
                </>
              )}
            </fieldset>
            {error != null && <ErrorNotice error={error} />}
            <footer className="actions">
              <button type="button" disabled={busy} onClick={reset}>
                <Icon name="clear" />
                Limpar formulário
              </button>
              <button className="primary" disabled={busy}>
                <Icon name={busy ? "loading" : "save"} spin={busy} />
                {busy ? "Salvando…" : "Salvar combinação"}
              </button>
            </footer>
          </form>
        </div>
      )}
      {pickerOpen && (
        <StrategyPicker
          strategies={strategies}
          combinations={query.data?.combinations ?? []}
          members={draft.members}
          editingId={editing}
          onClose={() => setPickerOpen(false)}
          onAdd={addMembers}
        />
      )}
    </>
  );
}

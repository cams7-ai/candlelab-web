import { CombinationSummary } from "./CombinationSummary";
import { parameterLabel } from "../utils";
import { Icon, type IconName } from "./Icon";
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { compositionCompatible, memberKey, ruleLabel } from "../combinations";
import type {
  CombinationMember,
  CombinationDefinition,
  Strategy,
  StrategyCombination,
} from "../types";

const categories = [
  ["all", "Todas"],
  ["signal", "Sinais"],
  ["filter", "Filtros de compra"],
  ["exit", "Saídas"],
  ["recipe", "Combinações prontas"],
  ["saved", "Combinações cadastradas"],
  ["configuration", "Configurações personalizadas"],
] as const;
const runCategories = [
  ["all", "Todas"],
  ["individual", "Estratégias individuais"],
  ["legacy", "Estratégias clássicas"],
  ["recipe", "Combinações prontas"],
] as const;
const savedCategories = [
  ["all", "Todas"],
  ["configuration", "Configurações personalizadas"],
  ["recipe", "Receitas"],
  ["saved", "Combinações livres"],
] as const;
type Category =
  | (typeof categories)[number][0]
  | (typeof runCategories)[number][0];

const categoryIcons: Record<Category, IconName> = {
  all: "catalog",
  signal: "signal",
  filter: "filter",
  exit: "exit",
  recipe: "combination",
  saved: "saved",
  configuration: "parameters",
  individual: "signal",
  legacy: "history",
};

type PickerProps = {
  strategies: Strategy[];
  onClose: () => void;
} & (
  | {
      mode: "single";
      selectedId?: string;
      onSelect: (strategy: Strategy) => void;
    }
  | {
      mode: "saved";
      combinations: StrategyCombination[];
      selectedId?: string;
      onSelect: (combination: StrategyCombination) => void;
    }
  | {
      mode?: "multiple";
      combinations: StrategyCombination[];
      members: CombinationMember[];
      editingId?: string;
      onAdd: (members: CombinationMember[]) => string | undefined;
    }
);

type Option = {
  key: string;
  name: string;
  description: string;
  category: Exclude<Category, "all">;
  member: CombinationMember;
  strategy?: Strategy;
  identifier: string;
  unavailable?: string;
  saved?: StrategyCombination;
  searchText?: string;
};

const searchable = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR");

export function StrategyPicker(props: PickerProps) {
  const { strategies, onClose } = props;
  const savedOnly = props.mode === "saved";
  const single = props.mode === "single" || savedOnly;
  const combinations = props.mode === "single" ? [] : props.combinations;
  const members =
    props.mode === "single" || props.mode === "saved" ? [] : props.members;
  const editingId =
    props.mode === "single" || props.mode === "saved"
      ? undefined
      : props.editingId;
  const displayCategories = savedOnly
    ? savedCategories
    : single
      ? runCategories
      : categories;
  const id = useId();
  const dialog = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const [term, setTerm] = useState("");
  const [category, setCategory] = useState<Category>("all");
  const [selected, setSelected] = useState<string[]>(
    (props.mode === "single" || props.mode === "saved") && props.selectedId
      ? [`${props.mode === "saved" ? "saved" : "strategy"}:${props.selectedId}`]
      : [],
  );
  const [error, setError] = useState<string>();
  const [openDetails, setOpenDetails] = useState<string[]>([]);
  const slots = Math.max(0, 8 - members.length);
  const current = new Set(members.map(memberKey));
  function definitionSearch(definition: CombinationDefinition): string {
    const strategy = strategies.find(
      (item) => item.id === definition.strategy_id,
    );
    return [
      definition.name,
      definition.strategy_id,
      strategy?.name,
      ...definition.members.map((member) =>
        member.combination
          ? definitionSearch(member.combination)
          : `${member.strategy_id} ${strategies.find((item) => item.id === member.strategy_id)?.name ?? ""}`,
      ),
    ].join(" ");
  }
  const options: Option[] = [
    ...strategies
      .filter(
        (strategy) =>
          !savedOnly &&
          (single
            ? !strategy.composition_role ||
              strategy.composition_role === "signal"
            : strategy.combinable),
      )
      .map(
        (strategy): Option => ({
          key: `strategy:${strategy.id}`,
          name: strategy.name,
          description:
            strategy.rules ||
            (single
              ? "Consulte os parâmetros após selecionar esta estratégia."
              : "Combine este sinal com outras estratégias e ajuste seus parâmetros após adicionar."),
          category:
            strategy.category === "combination" || strategy.components?.length
              ? "recipe"
              : single
                ? strategy.category === "legacy"
                  ? "legacy"
                  : "individual"
                : (strategy.composition_role ?? "signal"),
          strategy,
          identifier: strategy.id,
          member: { strategy_id: strategy.id, parameters: {} },
        }),
      ),
    ...combinations
      .filter(
        (combination) =>
          combination.id !== editingId &&
          (!savedOnly ||
            combination.kind !== "strategy" ||
            strategies.some(
              (strategy) =>
                strategy.id === combination.strategy_id &&
                (!strategy.composition_role ||
                  strategy.composition_role === "signal"),
            )),
      )
      .map((combination): Option => {
        const { id: sourceId, ...definition } = combination;
        return {
          key: `saved:${sourceId}`,
          name: combination.name,
          category:
            combination.kind === "strategy"
              ? "configuration"
              : savedOnly && combination.kind === "preset"
                ? "recipe"
                : "saved",
          identifier: sourceId,
          saved: combination,
          strategy: savedOnly
            ? strategies.find((item) => item.id === combination.strategy_id)
            : undefined,
          searchText: savedOnly ? definitionSearch(combination) : "",
          description: savedOnly
            ? combination.kind === "custom"
              ? `${combination.members.length} componentes no grupo principal · Compra: ${ruleLabel(combination.buy_rule)} · Venda: ${ruleLabel(combination.sell_rule)}`
              : `Estratégia base: ${strategies.find((item) => item.id === combination.strategy_id)?.name ?? combination.strategy_id} · ${combination.strategy_id}`
            : combination.kind === "strategy"
              ? "Reutiliza os parâmetros salvos desta estratégia. Alterações na origem não modificam esta cópia."
              : "Adiciona uma cópia como grupo, preservando suas regras e parâmetros. Alterações na origem não modificam esta cópia.",
          member: { strategy_id: "", parameters: {}, combination: definition },
          unavailable:
            savedOnly || compositionCompatible(definition, strategies, 2)
              ? undefined
              : "Incompatível com esta composição Spot ou com o limite de agrupamento.",
        };
      }),
  ];
  const terms = searchable(term.trim()).split(/\s+/).filter(Boolean);
  const visible = options.filter((option) => {
    const haystack = searchable(
      `${option.name} ${option.description} ${option.identifier} ${option.searchText ?? ""} ${option.strategy?.required_data?.join(" ") ?? ""}`,
    );
    return (
      (category === "all" || option.category === category) &&
      terms.every((term) => haystack.includes(term))
    );
  });

  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    const app = document.querySelector<HTMLElement>(".app");
    const previousInert = app?.inert ?? false;
    if (app) app.inert = true;
    document.body.style.overflow = "hidden";
    search.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      if (app) app.inert = previousInert;
      if (previousFocus?.isConnected && !previousFocus.matches(":disabled"))
        previousFocus.focus();
      else document.getElementById("combination-members-title")?.focus();
    };
  }, []);

  function add() {
    if (props.mode === "saved") {
      const option = options.find((option) => option.key === selected[0]);
      if (option?.saved && !option.unavailable) {
        props.onSelect(option.saved);
        onClose();
      }
      return;
    }
    if (props.mode === "single") {
      const strategy = options.find(
        (option) => option.key === selected[0],
      )?.strategy;
      if (strategy) {
        props.onSelect(strategy);
        onClose();
      }
      return;
    }
    const additions = selected.flatMap((key) => {
      const option = options.find((item) => item.key === key);
      return option &&
        !option.unavailable &&
        !current.has(memberKey(option.member))
        ? [structuredClone(option.member)]
        : [];
    });
    if (!additions.length) return;
    const message = props.onAdd(additions);
    if (message) setError(message);
    else onClose();
  }

  return createPortal(
    <div
      className="modal-backdrop strategy-picker-backdrop"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialog}
        className="strategy-picker"
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-title`}
        aria-describedby={`${id}-description`}
        tabIndex={-1}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            onClose();
          }
          if (event.key !== "Tab") return;
          const focusable = Array.from(
            dialog.current?.querySelectorAll<HTMLElement>(
              'button:not(:disabled), input:not(:disabled), summary, [tabindex="0"]',
            ) ?? [],
          ).filter((element) => {
            const closed = element.closest("details:not([open])");
            return !closed || closed.querySelector("summary") === element;
          });
          const first = focusable[0];
          const last = focusable[focusable.length - 1];
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last?.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first?.focus();
          }
        }}
      >
        <div className="strategy-picker-top">
          <div className="strategy-picker-heading">
            <div>
              <h2 id={`${id}-title`}>
                {savedOnly
                  ? "Selecionar configuração ou combinação"
                  : single
                    ? "Selecionar estratégia"
                    : "Adicionar estratégia"}
              </h2>
              <p id={`${id}-description`} className="muted">
                {savedOnly
                  ? "Busque um cadastro salvo e confirme a configuração que será usada no processamento."
                  : single
                    ? "Escolha uma estratégia para executar e ajuste seus parâmetros no processamento."
                    : "Escolha sinais, filtros, saídas ou combinações para compor suas regras."}
              </p>
            </div>
            <button
              type="button"
              className="picker-close"
              aria-label={
                savedOnly
                  ? "Fechar seletor de configurações"
                  : "Fechar seletor de estratégias"
              }
              onClick={onClose}
            >
              <Icon name="close" standalone />
            </button>
          </div>
          <label className="picker-search search-field">
            <Icon name="search" standalone />
            <span className="sr-only">
              {savedOnly
                ? "Buscar configurações e combinações"
                : "Buscar estratégias"}
            </span>
            <input
              ref={search}
              type="search"
              value={term}
              placeholder={
                savedOnly
                  ? "Buscar por nome, estratégia base ou identificador…"
                  : "Buscar por nome, indicador ou função…"
              }
              onChange={(event) => setTerm(event.target.value)}
            />
          </label>
          <div
            className="picker-categories"
            role="group"
            aria-label={
              savedOnly ? "Tipos de configurações" : "Categorias de estratégias"
            }
          >
            {displayCategories.map(([key, label]) => (
              <button
                type="button"
                key={key}
                aria-pressed={category === key}
                onClick={() => setCategory(key)}
              >
                <Icon name={categoryIcons[key]} />
                {label}
              </button>
            ))}
          </div>
          <p className="picker-results-count" role="status">
            {visible.length}{" "}
            {visible.length === 1 ? "opção encontrada" : "opções encontradas"} ·{" "}
            {single
              ? `${selected.length} selecionada`
              : `${selected.length} selecionada(s)`}
          </p>
        </div>
        <div className="strategy-picker-results">
          {visible.length === 0 && (
            <div className="picker-empty">
              <strong>
                {term
                  ? savedOnly
                    ? "Nenhuma configuração encontrada"
                    : "Nenhuma estratégia encontrada"
                  : "Nenhuma opção nesta categoria"}
              </strong>
              <p className="muted">
                {term
                  ? "Tente outro nome ou escolha uma categoria diferente."
                  : savedOnly
                    ? "Escolha outro tipo ou cadastre uma configuração na tela Estratégias."
                    : single
                      ? "Escolha outra categoria ou consulte as estratégias disponíveis no catálogo."
                      : "As combinações cadastradas aparecerão aqui depois de salvas, quando forem compatíveis."}
              </p>
              <button
                type="button"
                onClick={() => {
                  setTerm("");
                  setCategory("all");
                }}
              >
                <Icon name="reset" />
                Ver todas as opções
              </button>
            </div>
          )}
          {displayCategories
            .filter(([key]) => key !== "all")
            .map(([key, label]) => {
              const items = visible.filter((option) => option.category === key);
              if (!items.length) return null;
              return (
                <section key={key} className="picker-group" aria-label={label}>
                  <h3>
                    {label} <span>{items.length}</span>
                  </h3>
                  {items.map((option) => {
                    const added =
                      !single && current.has(memberKey(option.member));
                    const checked = selected.includes(option.key);
                    const blocked =
                      added ||
                      !!option.unavailable ||
                      (!single && !checked && selected.length >= slots);
                    const descriptionId = `${id}-${option.key}-description`;
                    return (
                      <div
                        className={`picker-option${checked ? " is-selected" : ""}${added || option.unavailable ? " is-unavailable" : ""}`}
                        key={option.key}
                      >
                        <label className="picker-option-label">
                          <input
                            type={single ? "radio" : "checkbox"}
                            name={single ? `${id}-strategy` : undefined}
                            aria-label={option.name}
                            aria-describedby={descriptionId}
                            checked={checked || added}
                            disabled={blocked}
                            onChange={() => {
                              setSelected((values) =>
                                single
                                  ? [option.key]
                                  : checked
                                    ? values.filter(
                                        (value) => value !== option.key,
                                      )
                                    : [...values, option.key],
                              );
                              setError(undefined);
                            }}
                          />
                          <span>{option.name}</span>
                          {added && (
                            <span className="picker-added">
                              <Icon name="check" />
                              Já adicionada
                            </span>
                          )}
                        </label>
                        <div className="picker-option-body">
                          <p id={descriptionId} className="muted">
                            {option.unavailable ?? option.description}
                          </p>
                          {savedOnly &&
                            option.saved?.kind !== "custom" &&
                            option.saved && (
                              <dl className="picker-parameter-preview">
                                {Object.entries(option.saved.parameters)
                                  .filter(([key]) => key !== "auxiliary_json")
                                  .slice(0, 3)
                                  .map(([key, value]) => (
                                    <div key={key}>
                                      <dt>
                                        {parameterLabel(key, option.strategy)}
                                      </dt>
                                      <dd>{String(value)}</dd>
                                    </div>
                                  ))}
                              </dl>
                            )}
                          <details
                            className="picker-option-details"
                            open={
                              savedOnly
                                ? openDetails.includes(option.key)
                                : undefined
                            }
                            onToggle={(event) => {
                              if (
                                !savedOnly ||
                                event.target !== event.currentTarget
                              )
                                return;
                              const open = event.currentTarget.open;
                              setOpenDetails((keys) =>
                                open
                                  ? keys.includes(option.key)
                                    ? keys
                                    : [...keys, option.key]
                                  : keys.filter((key) => key !== option.key),
                              );
                            }}
                          >
                            <summary aria-label={`Detalhes de ${option.name}`}>
                              <Icon name="details" />
                              Ver detalhes
                            </summary>
                            <p className="muted">
                              Identificador: <code>{option.identifier}</code>
                            </p>
                            {savedOnly &&
                              openDetails.includes(option.key) &&
                              option.saved && (
                                <CombinationSummary
                                  combination={option.saved}
                                  strategies={strategies}
                                />
                              )}
                            {!savedOnly &&
                            option.strategy?.components?.length ? (
                              <ul aria-label={`Componentes de ${option.name}`}>
                                {option.strategy.components.map((component) => (
                                  <li key={component.strategy_id}>
                                    {strategies.find(
                                      (item) =>
                                        item.id === component.strategy_id,
                                    )?.name ?? component.strategy_id}
                                    {" · "}
                                    {component.role === "filter"
                                      ? "Filtro de compra"
                                      : component.role === "exit"
                                        ? "Saída"
                                        : "Sinal"}
                                  </li>
                                ))}
                              </ul>
                            ) : null}
                            {!savedOnly &&
                              option.member.combination?.kind === "custom" && (
                                <p className="muted">
                                  Compra:{" "}
                                  {option.member.combination.buy_rule === "all"
                                    ? "Todas"
                                    : "Qualquer uma"}{" "}
                                  · Venda:{" "}
                                  {option.member.combination.sell_rule === "all"
                                    ? "Todas"
                                    : "Qualquer uma"}{" "}
                                  · {option.member.combination.members.length}{" "}
                                  membros
                                </p>
                              )}
                          </details>
                        </div>
                      </div>
                    );
                  })}
                </section>
              );
            })}
        </div>
        <footer className="strategy-picker-footer">
          <div>
            <strong>
              {single
                ? (options.find((option) => option.key === selected[0])?.name ??
                  (savedOnly
                    ? "Nenhuma configuração selecionada"
                    : "Nenhuma estratégia selecionada"))
                : `${selected.length} selecionada(s)`}
            </strong>
            <p className="muted">
              {savedOnly
                ? "O processamento usará uma cópia dos parâmetros salvos."
                : single
                  ? "Os parâmetros serão exibidos após confirmar."
                  : `${members.length} de 8 membros adicionados${
                      selected.length >= slots
                        ? " · Limite de seleção atingido"
                        : ` · Até ${slots} nesta seleção`
                    }`}
            </p>
            {error && (
              <p role="alert" className="error">
                {error}
              </p>
            )}
          </div>
          <div className="actions">
            <button type="button" onClick={onClose}>
              <Icon name="cancel" />
              Cancelar
            </button>
            <button
              type="button"
              className="primary"
              disabled={
                !selected.some((key) =>
                  options.some((option) => option.key === key),
                )
              }
              onClick={add}
            >
              <Icon name={single ? "check" : "add"} />
              {savedOnly
                ? "Usar configuração"
                : single
                  ? "Usar estratégia"
                  : `Adicionar selecionadas${selected.length ? ` (${selected.length})` : ""}`}
            </button>
          </div>
        </footer>
      </div>
    </div>,
    document.body,
  );
}

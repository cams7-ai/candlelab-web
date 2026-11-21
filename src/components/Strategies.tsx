import { Icon } from "./Icon";
import { useEffect, useState } from "react";
import {
  combinationPath,
  strategyPath,
  strategyRole,
  useStrategyCatalog,
  withStrategyReturn,
  type StrategyFilters,
  strategyWorkspacePath,
} from "../strategies";
import { useRefreshOnActivate } from "../hooks";
import { Empty, ErrorNotice, Loading } from "./common";
import { useCombinationDeletion } from "./CombinationDeletion";

export function Strategies({
  filters,
  onFiltersChange,
  embedded = false,
  active = true,
  processingReturnTo,
}: {
  embedded?: boolean;
  active?: boolean;
  processingReturnTo?: string | null;
  filters?: StrategyFilters;
  onFiltersChange?: (filters: StrategyFilters) => void;
} = {}) {
  const query = useStrategyCatalog();
  useRefreshOnActivate(active, query.retry);
  const [localFilters, setLocalFilters] = useState<StrategyFilters>({
    search: "",
    kind: "all",
  });
  const { search, kind } = filters ?? localFilters;
  const returnTo = strategyWorkspacePath({
    filters: { search, kind },
    returnTo: processingReturnTo,
  });
  function changeFilters(patch: Partial<StrategyFilters>) {
    const next = { search, kind, ...patch };
    setLocalFilters(next);
    onFiltersChange?.(next);
  }
  const [notice, setNotice] = useState("");
  const deletion = useCombinationDeletion((combination) => {
    setNotice(
      `${combination.kind === "strategy" ? "Configuração" : "Combinação"} “${combination.name}” excluída.`,
    );
    query.retry();
  });
  useEffect(() => {
    if (!active) deletion.close();
  }, [active]);
  const entries = [
    ...(query.data?.strategies ?? []).map((strategy) => ({
      key: `catalog:${strategy.id}`,
      name: strategy.name,
      id: strategy.id,
      kind:
        strategyRole(strategy) === "Combinação pronta"
          ? "recipe"
          : "individual",
      role: strategyRole(strategy),
      description: strategy.rules ?? "",
      path: strategyPath(strategy.id),
      combinable: strategy.combinable,
      combination: undefined,
    })),
    ...(query.data?.combinations ?? []).map((combination) => ({
      key: `saved:${combination.id}`,
      name: combination.name,
      id: combination.id,
      kind: combination.kind === "strategy" ? "configuration" : "saved",
      role:
        combination.kind === "strategy"
          ? "Configuração personalizada"
          : "Combinação cadastrada",
      description: "Configuração salva",
      path: combinationPath(combination.id),
      combinable: undefined,
      combination,
    })),
  ];
  const normalize = (value: string) =>
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLocaleLowerCase("pt-BR");
  const terms = normalize(search.trim()).split(/\s+/).filter(Boolean);
  const visible = entries.filter(
    (entry) =>
      (kind === "all" || kind === entry.kind) &&
      terms.every((term) =>
        normalize(
          `${entry.name} ${entry.id} ${entry.role} ${entry.description}`,
        ).includes(term),
      ),
  );
  const showActions = visible.some((entry) => !!entry.combination);
  return (
    <>
      {!embedded && (
        <header>
          <div>
            <h1>Estratégias</h1>
            <p className="muted">
              Explore o catálogo completo e suas combinações cadastradas.
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
        <section className="panel">
          <div className="catalog-toolbar">
            <label>
              Buscar estratégias
              <span className="search-field">
                <Icon name="search" standalone />
                <input
                  type="search"
                  value={search}
                  onChange={(event) =>
                    changeFilters({ search: event.target.value })
                  }
                  placeholder="Nome, indicador ou identificador"
                />
              </span>
            </label>
            <label>
              <span>
                <Icon name="filter" />
                Tipo de estratégia
              </span>
              <select
                value={kind}
                onChange={(event) =>
                  changeFilters({
                    kind: event.target.value as StrategyFilters["kind"],
                  })
                }
              >
                <option value="all">Todas</option>
                <option value="individual">Individuais</option>
                <option value="recipe">Combinações prontas</option>
                <option value="saved">Combinações cadastradas</option>
                <option value="configuration">
                  Configurações personalizadas
                </option>
              </select>
            </label>
          </div>
          <p className="muted" role="status">
            {visible.length} de {entries.length} estratégias
          </p>
          {!visible.length ? (
            <Empty>
              {entries.length
                ? "Nenhuma estratégia encontrada para estes filtros."
                : "Nenhuma estratégia disponível."}
            </Empty>
          ) : (
            <div className="table-wrap">
              <table className="strategy-catalog-table">
                <caption className="sr-only">
                  Lista de estratégias e combinações cadastradas
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Estratégia</th>
                    <th scope="col">Função</th>
                    <th scope="col">Uso</th>
                    {showActions && <th scope="col">Ações</th>}
                  </tr>
                </thead>
                <tbody>
                  {visible.map((entry) => (
                    <tr key={entry.key}>
                      <td>
                        <a
                          className="strategy-catalog-name"
                          href={`#${withStrategyReturn(entry.path, returnTo)}`}
                        >
                          {entry.name}
                        </a>
                        <small className="muted strategy-catalog-id">
                          {entry.id}
                        </small>
                      </td>
                      <td>
                        <span className="strategy-badge">{entry.role}</span>
                      </td>
                      <td>
                        {entry.combination
                          ? "Configuração salva"
                          : entry.combinable
                            ? "Composição livre"
                            : "Política própria"}
                      </td>
                      {showActions && (
                        <td>
                          <div className="actions table-row-actions">
                            {entry.combination && (
                              <button
                                type="button"
                                className="table-row-action danger-outline"
                                disabled={deletion.busy}
                                aria-label={`Excluir ${entry.combination.kind === "strategy" ? "configuração" : "combinação"} ${entry.name}`}
                                onClick={() =>
                                  deletion.choose(entry.combination!)
                                }
                              >
                                <Icon name="delete" />
                                Excluir
                              </button>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
      {deletion.dialog}
    </>
  );
}

import { Icon } from "./Icon";
import { useState } from "react";
import type {
  CombinationDefinition,
  ParameterSchema,
  Strategy,
} from "../types";
import { parameterLabel } from "../utils";
import { ruleLabel } from "../combinations";
import {
  strategyPath,
  strategyRole,
  useStrategyCatalog,
  strategyListReturn,
  withStrategyTrail,
  readStrategyTrail,
  type StrategyOrigin,
  combinationPath,
  strategyWorkspacePath,
} from "../strategies";
import { Empty, ErrorNotice, Loading } from "./common";
import { useCombinationDeletion } from "./CombinationDeletion";
import { StrategyConfigurationForm } from "./StrategyConfigurationForm";

function ParameterValues({
  values,
  strategy,
}: {
  values: Record<string, string | number>;
  strategy?: Strategy;
}) {
  return Object.keys(values).length ? (
    <dl className="strategy-parameter-values">
      {Object.entries(values).map(([key, value]) => (
        <div key={key}>
          <dt>{parameterLabel(key, strategy)}</dt>
          <dd className="combination-value">{String(value)}</dd>
        </div>
      ))}
    </dl>
  ) : (
    <p className="muted">Sem parâmetros adicionais.</p>
  );
}

function Composition({
  definition,
  strategies,
  detailPath,
}: {
  definition: CombinationDefinition;
  strategies: Strategy[];
  detailPath: (id: string) => string;
}) {
  if (definition.kind !== "custom") {
    const strategy = strategies.find(
      (item) => item.id === definition.strategy_id,
    );
    return (
      <>
        <p>
          {definition.kind === "strategy" ? "Estratégia base:" : "Receita:"}{" "}
          <a href={`#${detailPath(definition.strategy_id!)}`}>
            {strategy?.name ?? definition.strategy_id}
          </a>
        </p>
        <ParameterValues values={definition.parameters} strategy={strategy} />
      </>
    );
  }
  return (
    <>
      <dl className="strategy-facts">
        <div>
          <dt>Regra de compra</dt>
          <dd>{ruleLabel(definition.buy_rule)}</dd>
        </div>
        <div>
          <dt>Regra de venda</dt>
          <dd>{ruleLabel(definition.sell_rule)}</dd>
        </div>
        <div>
          <dt>Membros</dt>
          <dd>{definition.members.length}</dd>
        </div>
      </dl>
      <ol className="strategy-member-list">
        {definition.members.map((member, index) => {
          const strategy = strategies.find(
            (item) => item.id === member.strategy_id,
          );
          return (
            <li key={index}>
              {member.combination ? (
                <>
                  <strong>{member.combination.name}</strong>
                  <span className="strategy-badge">Grupo incorporado</span>
                  <details>
                    <summary>
                      <Icon name="combination" />
                      Ver grupo {member.combination.name}
                    </summary>
                    <Composition
                      definition={member.combination}
                      strategies={strategies}
                      detailPath={detailPath}
                    />
                  </details>
                </>
              ) : (
                <>
                  <a href={`#${detailPath(member.strategy_id)}`}>
                    {strategy?.name ?? member.strategy_id}
                  </a>
                  <span className="strategy-badge">
                    {strategyRole(strategy)}
                  </span>
                  <ParameterValues
                    values={member.parameters}
                    strategy={strategy}
                  />
                </>
              )}
            </li>
          );
        })}
      </ol>
    </>
  );
}

function parameterRange(schema: ParameterSchema) {
  const min = schema["x-min"] ?? schema["x-decimal-minimum"] ?? schema.minimum;
  const max = schema["x-max"] ?? schema["x-decimal-maximum"] ?? schema.maximum;
  const exclusiveMin =
    schema["x-decimal-exclusiveMinimum"] ?? schema.exclusiveMinimum;
  const exclusiveMax =
    schema["x-decimal-exclusiveMaximum"] ?? schema.exclusiveMaximum;
  const bounds = [
    min != null ? `≥ ${min}` : undefined,
    max != null ? `≤ ${max}` : undefined,
    exclusiveMin != null ? `> ${exclusiveMin}` : undefined,
    exclusiveMax != null ? `< ${exclusiveMax}` : undefined,
  ].filter(Boolean);
  return bounds.join(" · ") || "Não informado";
}

export function StrategyDetail({
  id,
  source,
  navigate,
  returnTo,
  trail,
}: {
  id: string;
  source: "catalog" | "saved";
  returnTo?: string | null;
  trail?: string | null;
  navigate: (path: string) => void;
}) {
  const query = useStrategyCatalog();
  const [configuring, setConfiguring] = useState(false);
  const strategy =
    source === "catalog"
      ? query.data?.strategies.find((item) => item.id === id)
      : undefined;
  const combination =
    source === "saved"
      ? query.data?.combinations.find((item) => item.id === id)
      : undefined;
  const configurableStrategy =
    strategy ??
    (combination?.kind !== "custom"
      ? query.data?.strategies.find(
          (item) => item.id === combination?.strategy_id,
        )
      : undefined);
  const backPath = strategyListReturn(returnTo);
  function originName(origin: StrategyOrigin) {
    return origin.source === "catalog"
      ? query.data?.strategies.find((item) => item.id === origin.id)?.name
      : query.data?.combinations.find((item) => item.id === origin.id)?.name;
  }
  const origins = readStrategyTrail(trail).filter(
    (origin) => !query.data || originName(origin),
  );
  const previous = origins[origins.length - 1];
  const previousPath = previous
    ? withStrategyTrail(
        previous.source === "catalog"
          ? strategyPath(previous.id)
          : combinationPath(previous.id),
        backPath,
        origins.slice(0, -1),
      )
    : backPath;
  const childOrigins = [...origins, { id, source }];
  const detailPath = (strategyId: string) =>
    withStrategyTrail(strategyPath(strategyId), backPath, childOrigins);
  const deletion = useCombinationDeletion(() => navigate(previousPath));
  const name = strategy?.name ?? combination?.name;
  return (
    <>
      <a className="strategy-back" href={`#${previousPath}`}>
        <Icon name="back" />
        {previous
          ? originName(previous)
            ? `Voltar aos detalhes de ${originName(previous)}`
            : "Voltar aos detalhes da estratégia"
          : new URL(backPath, "http://local").searchParams.get("tab") ===
              "combinations"
            ? "Voltar às combinações"
            : "Voltar à lista de estratégias"}
      </a>
      {query.loading ? (
        <Loading />
      ) : query.error ? (
        <ErrorNotice error={query.error} retry={query.retry} />
      ) : !name ? (
        <section className="panel">
          <h1>Estratégia não encontrada</h1>
          <Empty>
            Esta estratégia ou combinação não está disponível. Volte à lista
            para consultar as opções atuais.
          </Empty>
        </section>
      ) : (
        <>
          <header className="strategy-detail-header">
            <div>
              <span className="strategy-badge">
                {combination
                  ? combination.kind === "strategy"
                    ? "Configuração personalizada"
                    : "Combinação cadastrada"
                  : strategyRole(strategy)}
              </span>
              <h1>{name}</h1>
              <p className="muted strategy-catalog-id">{id}</p>
            </div>
            {strategy && (
              <button
                type="button"
                className="primary"
                disabled={configuring}
                onClick={() => setConfiguring(true)}
              >
                <Icon name="add" />
                Criar configuração personalizada
              </button>
            )}
            {combination && (
              <div className="actions">
                {combination.kind !== "strategy" && (
                  <a
                    className="button-link"
                    href={`#${strategyWorkspacePath({ tab: "combinations", editId: combination.id })}`}
                  >
                    <Icon name="edit" />
                    Editar combinação
                  </a>
                )}
                {configurableStrategy && (
                  <button
                    type="button"
                    disabled={configuring || deletion.busy}
                    onClick={() => setConfiguring(true)}
                  >
                    <Icon name="parameters" />
                    Editar parâmetros
                  </button>
                )}
                <button
                  type="button"
                  className="danger-outline"
                  disabled={deletion.busy}
                  onClick={() => deletion.choose(combination)}
                >
                  <Icon name="delete" />
                  {combination.kind === "strategy"
                    ? "Excluir configuração"
                    : "Excluir combinação"}
                </button>
              </div>
            )}
          </header>
          {configuring && configurableStrategy && (
            <StrategyConfigurationForm
              key={combination?.id ?? configurableStrategy.id}
              strategy={configurableStrategy}
              existing={combination}
              onCancel={() => setConfiguring(false)}
              onSaved={(saved) => {
                setConfiguring(false);
                if (combination?.id === saved.id) query.retry();
                else
                  navigate(
                    withStrategyTrail(
                      combinationPath(saved.id),
                      backPath,
                      childOrigins,
                    ),
                  );
              }}
            />
          )}
          {strategy && (
            <>
              <section className="panel" aria-labelledby="strategy-rules-title">
                <h2 id="strategy-rules-title">Regras e funcionamento</h2>
                <p>{strategy.rules || "Regras não informadas no catálogo."}</p>
                <dl className="strategy-facts">
                  <div>
                    <dt>Categoria</dt>
                    <dd>
                      {strategy.category === "legacy" || !strategy.category
                        ? "Estratégia clássica"
                        : strategy.category === "combination"
                          ? "Combinação publicada"
                          : "Estratégia individual"}
                    </dd>
                  </div>
                  <div>
                    <dt>Composição livre</dt>
                    <dd>
                      {strategy.combinable
                        ? "Disponível"
                        : "Indisponível: exige uma política de execução própria"}
                    </dd>
                  </div>
                </dl>
                {strategy.limitations && (
                  <div className="strategy-limitations">
                    <h3>Limitações</h3>
                    <p>{strategy.limitations}</p>
                  </div>
                )}
              </section>
              {!!strategy.components?.length && (
                <section
                  className="panel"
                  aria-labelledby="strategy-components-title"
                >
                  <h2 id="strategy-components-title">Componentes da receita</h2>
                  <ul className="strategy-recipe-list">
                    {strategy.components.map((component) => (
                      <li key={component.strategy_id}>
                        <a href={`#${detailPath(component.strategy_id)}`}>
                          {query.data?.strategies.find(
                            (item) => item.id === component.strategy_id,
                          )?.name ?? component.strategy_id}
                        </a>
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
                </section>
              )}
              <section
                className="panel"
                aria-labelledby="strategy-parameters-title"
              >
                <h2 id="strategy-parameters-title">Parâmetros padrão</h2>
                {Object.keys(strategy.parameters_schema.properties).length ? (
                  <div className="table-wrap">
                    <table className="strategy-parameters-table">
                      <caption className="sr-only">
                        Parâmetros padrão de {strategy.name}
                      </caption>
                      <thead>
                        <tr>
                          <th scope="col">Parâmetro</th>
                          <th scope="col">Padrão</th>
                          <th scope="col">Tipo</th>
                          <th scope="col">Limites</th>
                        </tr>
                      </thead>
                      <tbody>
                        {Object.entries(
                          strategy.parameters_schema.properties,
                        ).map(([key, schema]) => (
                          <tr key={key}>
                            <td>
                              <strong>{parameterLabel(key, strategy)}</strong>
                              <small className="muted strategy-catalog-id">
                                {key}
                              </small>
                              {schema.description && (
                                <p className="muted">{schema.description}</p>
                              )}
                            </td>
                            <td>
                              <div className="combination-value">
                                {String(
                                  strategy.defaults[key] ??
                                    schema.default ??
                                    "Não informado",
                                )}
                              </div>
                            </td>
                            <td>
                              {schema.contentMediaType === "application/json"
                                ? "JSON"
                                : schema.type === "integer"
                                  ? "Inteiro"
                                  : schema.type === "number" ||
                                      schema["x-min"] != null ||
                                      schema["x-max"] != null ||
                                      schema["x-decimal-minimum"] != null ||
                                      schema["x-decimal-maximum"] != null ||
                                      schema["x-decimal-exclusiveMinimum"] !=
                                        null ||
                                      schema["x-decimal-exclusiveMaximum"] !=
                                        null ||
                                      schema.minimum != null ||
                                      schema.maximum != null
                                    ? "Decimal"
                                    : "Texto"}
                            </td>
                            <td>{parameterRange(schema)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="muted">
                    Esta estratégia não possui parâmetros configuráveis.
                  </p>
                )}
              </section>
              <section className="panel" aria-labelledby="strategy-data-title">
                <h2 id="strategy-data-title">Dados necessários</h2>
                {strategy.required_data?.length ? (
                  <>
                    <p>
                      Além dos candles da sessão, esta estratégia exige
                      observações auxiliares com os campos:
                    </p>
                    <ul className="strategy-data-fields">
                      {strategy.required_data.map((field) => (
                        <li key={field}>
                          <code>{field}</code>
                        </li>
                      ))}
                    </ul>
                  </>
                ) : (
                  <p>
                    Utiliza os candles da sessão, sem dados auxiliares externos.
                  </p>
                )}
              </section>
            </>
          )}
          {combination && (
            <>
              <section
                className="panel"
                aria-labelledby="saved-composition-title"
              >
                <h2 id="saved-composition-title">Composição e parâmetros</h2>
                <p className="muted">
                  {combination.kind === "custom"
                    ? "Combinação livre com regras próprias de compra e venda."
                    : combination.kind === "strategy"
                      ? "Configuração personalizada de uma estratégia do catálogo."
                      : "Configuração salva de uma receita publicada."}
                </p>
                <Composition
                  definition={combination}
                  strategies={query.data?.strategies ?? []}
                  detailPath={detailPath}
                />
              </section>
              <section className="panel">
                <h2>Histórico e reutilização</h2>
                <p>
                  Editar ou excluir este cadastro não altera os processamentos
                  anteriores nem as cópias incorporadas em outras combinações.
                </p>
              </section>
            </>
          )}
        </>
      )}
      {deletion.dialog}
    </>
  );
}

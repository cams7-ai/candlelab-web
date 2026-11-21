import { useMemo, useState } from "react";
import {
  combinationParameterLabel,
  combinationParameters,
} from "../combinations";
import type { CombinationDefinition, Strategy } from "../types";
import { Icon } from "./Icon";

function AuxiliaryData({ value }: { value: string | number }) {
  const [expanded, setExpanded] = useState(false);
  const count = useMemo(() => {
    try {
      const parsed: unknown = JSON.parse(String(value));
      return Array.isArray(parsed) ? parsed.length : undefined;
    } catch {
      return undefined;
    }
  }, [value]);
  return (
    <div className="auxiliary-data-summary">
      <span>
        {count == null
          ? "Dados auxiliares JSON"
          : count === 1
            ? "1 observação importada"
            : `${count} observações importadas`}
      </span>
      <details onToggle={(event) => setExpanded(event.currentTarget.open)}>
        <summary>
          <Icon name="json" />
          Ver dados auxiliares
        </summary>
        {expanded && <pre className="auxiliary-data-json">{String(value)}</pre>}
      </details>
    </div>
  );
}

export function CombinationSummary({
  combination,
  strategies = [],
}: {
  combination: CombinationDefinition;
  strategies?: Strategy[];
}) {
  return (
    <section
      aria-label="Configuração da combinação"
      className="combination-summary"
    >
      <h3>{combination.name}</h3>
      <p className="muted">
        {combination.kind === "custom"
          ? "Combinação livre"
          : `Configuração de ${combination.strategy_id}`}
      </p>
      <dl>
        {combinationParameters(combination).map(([key, value]) => {
          const auxiliary = key.split(" · ").at(-1) === "auxiliary_json";
          return (
            <div key={key}>
              <dt>{combinationParameterLabel(combination, key, strategies)}</dt>
              <dd
                className={
                  auxiliary ? "combination-auxiliary" : "combination-value"
                }
              >
                {auxiliary ? <AuxiliaryData value={value} /> : String(value)}
              </dd>
            </div>
          );
        })}
      </dl>
    </section>
  );
}

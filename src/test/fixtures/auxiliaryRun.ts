import { runs } from "../../mocks/fixtures";
import type { CombinationDefinition, Run } from "../../types";

export const auxiliaryMarker = "conteudo-auxiliar-nao-exibir";
export function auxiliaryRun(mode: "individual" | "direct" | "nested"): Run {
  const parameters = {
    auxiliary_json: JSON.stringify([{ private_data: auxiliaryMarker }]),
    min_roc: "-1",
    top_n: 3,
  };
  const definition: CombinationDefinition = {
    name: "Momentum com ranking",
    kind: "custom",
    strategy_id: null,
    parameters: {},
    buy_rule: "all",
    sell_rule: "any",
    members: [
      { strategy_id: "MOMENTUM@1", parameters: { roc_period: 5 } },
      {
        strategy_id: "RANKING_CONFIRMATION@1",
        parameters,
        auxiliary_filename: "ranking-importado.json",
      },
    ],
  };
  const nested: CombinationDefinition = {
    ...definition,
    name: "Combinação com grupo de ranking",
    members: [
      definition.members[0],
      { strategy_id: "", parameters: {}, combination: definition },
    ],
  };
  const snapshot = mode === "nested" ? nested : definition;
  return {
    ...runs[0],
    auxiliary_filename: mode === "individual" ? "ranking-importado.json" : null,
    strategy_id:
      mode === "individual" ? "RANKING_CONFIRMATION@1" : "CUSTOM_COMBINATION@1",
    parameters:
      mode === "individual"
        ? parameters
        : { definition_json: JSON.stringify(snapshot) },
    combination_snapshot:
      mode === "individual" ? null : { ...snapshot, id: "ranking-preservado" },
  };
}

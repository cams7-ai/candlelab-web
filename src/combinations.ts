import { parameterLabel, strategyParameters } from "./utils";
import type {
  CombinationDefinition,
  CombinationMember,
  Run,
  Strategy,
  StrategyCombination,
} from "./types";

// The API also accepts a complete custom definition for a single execution.
export function normalizeCombination(
  definition: CombinationDefinition,
  strategies: Strategy[],
): CombinationDefinition {
  const normalize = (
    id: string | null,
    values: Record<string, string | number>,
  ) => {
    const strategy = strategies.find((item) => item.id === id);
    if (!strategy)
      throw new Error(`Estratégia indisponível: ${id ?? "sem identificador"}.`);
    return strategyParameters(strategy, values);
  };
  return {
    name: definition.name,
    kind: definition.kind,
    strategy_id: definition.strategy_id,
    buy_rule: definition.buy_rule,
    sell_rule: definition.sell_rule,
    parameters:
      definition.kind === "custom"
        ? {}
        : normalize(definition.strategy_id, definition.parameters),
    members:
      definition.kind === "custom"
        ? definition.members.map((member) =>
            member.combination
              ? {
                  ...member,
                  parameters: {},
                  combination: normalizeCombination(
                    member.combination,
                    strategies,
                  ),
                }
              : {
                  ...member,
                  parameters: normalize(member.strategy_id, member.parameters),
                },
          )
        : [],
  };
}

export function runCombination(run: Run): CombinationDefinition | null {
  if (run.strategy_id === "CUSTOM_COMBINATION@1") {
    try {
      const definition = JSON.parse(String(run.parameters.definition_json));
      if (
        definition?.kind === "custom" &&
        typeof definition.name === "string" &&
        Array.isArray(definition.members)
      )
        return definition;
    } catch {
      /* Historical runs may not contain a valid custom definition. */
    }
  }
  const snapshot = run.combination_snapshot;
  if (!snapshot) return null;
  if (
    snapshot.kind !== "custom" &&
    snapshot.strategy_id === run.strategy_id &&
    Object.keys(run.parameters).length
  ) {
    return { ...snapshot, parameters: run.parameters };
  }
  return snapshot;
}

export const ruleLabel = (rule: "all" | "any") =>
  rule === "all" ? "Todas" : "Qualquer uma";
export function runStrategyName(run: Run, strategies: Strategy[] = []) {
  return (
    runCombination(run)?.name ??
    strategies.find((s) => s.id === run.strategy_id)?.name ??
    run.strategy_id
  );
}
export function combinationParameters(
  combination: CombinationDefinition,
): [string, string | number][] {
  if (combination.kind !== "custom")
    return Object.entries(combination.parameters);
  return [
    ["Regra de compra", ruleLabel(combination.buy_rule)],
    ["Regra de venda", ruleLabel(combination.sell_rule)],
    ...combination.members.flatMap(
      (member, index): [string, string | number][] =>
        member.combination
          ? [
              [`Combinação ${index + 1}`, member.combination.name],
              ...combinationParameters(member.combination).map(
                ([key, value]): [string, string | number] => [
                  `${index + 1} · ${key}`,
                  value,
                ],
              ),
            ]
          : [
              [`Estratégia ${index + 1}`, member.strategy_id],
              ...Object.entries(member.parameters).map(
                ([key, value]): [string, string | number] => [
                  `${index + 1} · ${key}`,
                  value,
                ],
              ),
            ],
    ),
  ];
}
export function runParameters(run: Run): [string, string | number][] {
  const definition = runCombination(run);
  return definition
    ? combinationParameters(definition)
    : Object.entries(run.parameters);
}

export function combinationParameterLabel(
  combination: CombinationDefinition,
  key: string,
  strategies: Strategy[],
): string {
  const parts = key.split(" · ");
  const prefix: string[] = [];
  let definition: CombinationDefinition | undefined = combination;
  let strategyId = definition.strategy_id;
  while (parts.length > 1 && /^\d+$/.test(parts[0])) {
    const index = parts.shift()!;
    prefix.push(index);
    const member: CombinationMember | undefined =
      definition?.members[Number(index) - 1];
    definition = member?.combination ?? undefined;
    strategyId = definition?.strategy_id ?? member?.strategy_id ?? null;
  }
  return [
    ...prefix,
    parameterLabel(
      parts.join(" · "),
      strategies.find((item) => item.id === strategyId),
    ),
  ].join(" · ");
}

export function runParameterLabel(
  run: Run,
  key: string,
  strategies: Strategy[],
): string {
  const definition = runCombination(run);
  return definition
    ? combinationParameterLabel(definition, key, strategies)
    : parameterLabel(
        key,
        strategies.find((item) => item.id === run.strategy_id),
      );
}

export function memberKey(member: CombinationMember): string {
  return member.combination
    ? JSON.stringify(member.combination)
    : member.strategy_id;
}

export function compositionCompatible(
  definition: CombinationDefinition,
  strategies: Strategy[],
  depth = 1,
): boolean {
  if (depth > 4) return false;
  if (definition.kind !== "custom")
    return strategies.some(
      (s) => s.id === definition.strategy_id && s.combinable,
    );
  return (
    definition.members.length >= 2 &&
    definition.members.every((member) =>
      member.combination
        ? compositionCompatible(member.combination, strategies, depth + 1)
        : strategies.some((s) => s.id === member.strategy_id && s.combinable),
    )
  );
}

export function indicatorContext(run: Run | undefined, key: string) {
  let indicatorKey = key;
  let definition: CombinationDefinition | undefined | null = run
    ? runCombination(run)
    : null;
  let parameters = run?.parameters ?? {};
  let match: RegExpMatchArray | null;
  while ((match = indicatorKey.match(/^member_(\d+)__/))) {
    const member: CombinationMember | undefined =
      definition?.members[Number(match[1]) - 1];
    parameters = member?.combination?.parameters ?? member?.parameters ?? {};
    definition = member?.combination;
    indicatorKey = indicatorKey.slice(match[0].length);
  }
  return {
    indicatorKey,
    prefix: key.slice(0, key.length - indicatorKey.length),
    parameters,
  };
}

import { parameterLabel } from "./utils";
import type {
  CombinationDefinition,
  CombinationMember,
  Run,
  Strategy,
  StrategyCombination,
} from "./types";

export const ruleLabel = (rule: "all" | "any") =>
  rule === "all" ? "Todas" : "Qualquer uma";
export function runStrategyName(run: Run, strategies: Strategy[] = []) {
  return (
    run.combination_snapshot?.name ??
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
  return run.combination_snapshot
    ? combinationParameters(run.combination_snapshot)
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
  return run.combination_snapshot
    ? combinationParameterLabel(run.combination_snapshot, key, strategies)
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
  let definition: CombinationDefinition | undefined | null =
    run?.combination_snapshot;
  let parameters = run?.parameters ?? {};
  let match: RegExpMatchArray | null;
  while ((match = indicatorKey.match(/^member_(\d+)__/))) {
    const member = definition?.members[Number(match[1]) - 1];
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

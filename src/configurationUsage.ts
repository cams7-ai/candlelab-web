import type { CombinationDefinition, Run, StrategyCombination } from "./types";

export interface ConfigurationUsage {
  runs: string[];
  combinations: string[];
  uncertainCopies: string[];
}

// Nested snapshots carry no source ID. A changed copy of the same base
// strategy or composition cannot be ruled out; keep deletion blocked.
function baseStrategies(definition: CombinationDefinition): string {
  const ids = new Set<string>();
  function collect(value: CombinationDefinition) {
    if (value.strategy_id) ids.add(value.strategy_id);
    for (const member of value.members) {
      if (member.combination) collect(member.combination);
      else if (member.strategy_id) ids.add(member.strategy_id);
    }
  }
  collect(definition);
  return JSON.stringify([...ids].sort());
}

function embeddedUsage(
  definition: CombinationDefinition,
  target: StrategyCombination,
): "linked" | "uncertain" | undefined {
  let result: "linked" | "uncertain" | undefined;
  for (const member of definition.members) {
    const copy = member.combination;
    if (!copy) continue;
    const sameBase =
      copy.kind === target.kind &&
      (copy.kind === "custom"
        ? copy.name === target.name ||
          baseStrategies(copy) === baseStrategies(target)
        : copy.strategy_id === target.strategy_id);
    if (sameBase) {
      if (copy.name === target.name) return "linked";
      result = "uncertain";
    }
    const nested = embeddedUsage(copy, target);
    if (nested === "linked") return nested;
    if (nested) result = nested;
  }
  return result;
}

export function findConfigurationUsage(
  target: StrategyCombination,
  combinations: StrategyCombination[],
  runs: Run[],
): ConfigurationUsage {
  const usage: ConfigurationUsage = {
    runs: [],
    combinations: [],
    uncertainCopies: [],
  };
  for (const combination of combinations) {
    if (combination.id === target.id) continue;
    const relation = embeddedUsage(combination, target);
    if (relation === "linked") usage.combinations.push(combination.name);
    else if (relation)
      usage.uncertainCopies.push(`Combinação: ${combination.name}`);
  }
  for (const run of runs) {
    const snapshot = run.combination_snapshot;
    if (!snapshot) continue;
    if (snapshot.id === target.id) {
      usage.runs.push(run.id);
      continue;
    }
    const relation = embeddedUsage(snapshot, target);
    if (relation === "linked") usage.runs.push(run.id);
    else if (relation) usage.uncertainCopies.push(`Processamento: ${run.id}`);
  }
  return usage;
}

export function configurationDeletionBlocked(
  usage: ConfigurationUsage,
): boolean {
  return !!(
    usage.runs.length ||
    usage.combinations.length ||
    usage.uncertainCopies.length
  );
}

import type { CombinationDefinition, Run, StrategyCombination } from "./types";

export interface ConfigurationUsage {
  runs: string[];
  combinations: string[];
  uncertainCopies: string[];
}

// Nested snapshots carry no source ID. A changed copy of the
// same base strategy cannot be ruled out; keep deletion blocked in that case.
function embeddedUsage(
  definition: CombinationDefinition,
  target: StrategyCombination,
): "linked" | "uncertain" | undefined {
  let result: "linked" | "uncertain" | undefined;
  for (const member of definition.members) {
    const copy = member.combination;
    if (!copy) continue;
    if (copy.kind === "strategy" && copy.strategy_id === target.strategy_id) {
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

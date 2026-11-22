import type { CombinationDefinition, Strategy } from "../types";
import { CombinationParameters } from "./CombinationParameters";

export function RunCombinationParameters({
  definition,
  strategies,
  onChange,
  path = "run",
}: {
  definition: CombinationDefinition;
  strategies: Strategy[];
  onChange: (definition: CombinationDefinition) => void;
  path?: string;
}) {
  const members =
    definition.kind === "custom"
      ? definition.members
      : [
          {
            strategy_id: definition.strategy_id ?? "",
            parameters: definition.parameters,
          },
        ];
  return (
    <>
      <CombinationParameters
        idPrefix={path}
        members={members}
        strategies={strategies}
        onChange={(updated) =>
          onChange(
            definition.kind === "custom"
              ? { ...definition, members: updated }
              : { ...definition, parameters: updated[0].parameters },
          )
        }
      />
      {members.map(
        (member, index) =>
          member.combination && (
            <section
              className="combination-member"
              key={index}
              aria-label={`Parâmetros do grupo ${member.combination.name}`}
            >
              <h3>{member.combination.name}</h3>
              <RunCombinationParameters
                definition={member.combination}
                strategies={strategies}
                path={`${path}-${index}`}
                onChange={(combination) =>
                  onChange({
                    ...definition,
                    members: definition.members.map((item, i) =>
                      i === index ? { ...item, combination } : item,
                    ),
                  })
                }
              />
            </section>
          ),
      )}
    </>
  );
}

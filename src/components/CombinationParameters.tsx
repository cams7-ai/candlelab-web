import type { CombinationMember, ParameterSchema, Strategy } from "../types";
import { ParameterSelect } from "./ParameterSelect";
import { parameterLabel } from "../utils";

type ParameterTarget = {
  index: number;
  strategy: Strategy;
  key: string;
  value: string;
};

type ParameterField = {
  id: string;
  label: string;
  schema: ParameterSchema;
  targets: ParameterTarget[];
};

function fieldsFor(members: CombinationMember[], strategies: Strategy[]) {
  const fields = new Map<string, ParameterField>();
  members.forEach((member, index) => {
    if (member.combination) return;
    const strategy = strategies.find((item) => item.id === member.strategy_id);
    if (!strategy) return;
    Object.entries(strategy.parameters_schema.properties).forEach(
      ([key, schema]) => {
        const label = parameterLabel(key, strategy);
        // Generic names do not identify which indicator the parameter controls.
        const scope = label === "Período" ? strategy.id : "";
        const id = JSON.stringify([
          key,
          label,
          schema.type,
          schema.contentMediaType,
          schema.enum,
          schema["x-enum-labels"],
          scope,
        ]);
        let field = fields.get(id);
        if (!field) {
          field = { id, label, schema, targets: [] };
          fields.set(id, field);
        }
        field.targets.push({
          index,
          strategy,
          key,
          value: String(
            member.parameters[key] ??
              strategy.defaults[key] ??
              schema.default ??
              (schema.contentMediaType === "application/json" ? "[]" : ""),
          ),
        });
      },
    );
  });
  return [...fields.values()];
}

function sameValue(left: string, right: string, schema: ParameterSchema) {
  if (left === right) return true;
  if (schema.contentMediaType || !left.trim() || !right.trim()) return false;
  const a = Number(left.replace(",", "."));
  const b = Number(right.replace(",", "."));
  return Number.isFinite(a) && Number.isFinite(b) && a === b;
}

// New components inherit an existing shared value; imported and saved values
// remain untouched so disagreements can be resolved explicitly in the form.
export function appendCombinationMembers(
  members: CombinationMember[],
  additions: CombinationMember[],
  strategies: Strategy[],
) {
  const combined = [...members, ...structuredClone(additions)];
  for (const field of fieldsFor(combined, strategies)) {
    const existing = field.targets.filter(
      (target) => target.index < members.length,
    );
    if (
      !existing.length ||
      existing.some(
        (target) => !sameValue(target.value, existing[0].value, field.schema),
      )
    )
      continue;
    for (const target of field.targets) {
      if (target.index >= members.length) {
        combined[target.index].parameters[target.key] = existing[0].value;
      }
    }
  }
  return combined;
}

export function CombinationParameters({
  members,
  strategies,
  onChange,
  idPrefix = "combination",
}: {
  idPrefix?: string;
  members: CombinationMember[];
  strategies: Strategy[];
  onChange: (members: CombinationMember[]) => void;
}) {
  const fields = fieldsFor(members, strategies);
  if (!fields.length) return null;
  return (
    <section
      className="combination-member"
      aria-labelledby={`${idPrefix}-parameters-title`}
    >
      <h3 id={`${idPrefix}-parameters-title`}>Parâmetros da combinação</h3>
      <p className="muted">
        Preencha cada parâmetro uma única vez. Os campos compartilhados são
        aplicados a todas as estratégias indicadas.
      </p>
      <div className="field-grid">
        {fields.map((field, index) => {
          const { schema, targets } = field;
          const conflict = targets.some(
            (target) => !sameValue(target.value, targets[0].value, schema),
          );
          const helpId = `${idPrefix}-parameter-${index}-help`;
          const value = conflict ? "" : targets[0].value;
          const change = (value: string) => {
            onChange(
              members.map((member, memberIndex) => {
                const target = targets.find(
                  (item) => item.index === memberIndex,
                );
                return target
                  ? {
                      ...member,
                      parameters: { ...member.parameters, [target.key]: value },
                    }
                  : member;
              }),
            );
          };
          return (
            <div key={field.id}>
              <label>
                {field.label}
                {schema.enum ? (
                  <ParameterSelect
                    label={field.label}
                    schema={schema}
                    value={value}
                    onChange={change}
                    describedBy={helpId}
                  />
                ) : schema.contentMediaType === "application/json" ? (
                  <textarea
                    required
                    rows={5}
                    value={value}
                    aria-describedby={helpId}
                    onChange={(event) => change(event.target.value)}
                  />
                ) : (
                  <input
                    required
                    value={value}
                    inputMode={
                      schema.type === "integer" ? "numeric" : "decimal"
                    }
                    aria-describedby={helpId}
                    placeholder={conflict ? "Defina um valor comum" : undefined}
                    onChange={(event) => change(event.target.value)}
                  />
                )}
              </label>
              <div id={helpId} className="muted">
                <small>
                  {schema.description ??
                    (schema.type === "integer"
                      ? "Inteiro"
                      : schema.contentMediaType
                        ? "Dados auxiliares JSON específicos do dataset"
                        : "Decimal")}
                  {" · Usado em: "}
                  {targets.map((target) => target.strategy.name).join(", ")}
                </small>
                {conflict && (
                  <p>
                    Valores diferentes:{" "}
                    {targets
                      .map(
                        (target) => `${target.strategy.name}: ${target.value}`,
                      )
                      .join("; ")}
                    . Informe o valor que será aplicado a todas essas
                    estratégias.
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

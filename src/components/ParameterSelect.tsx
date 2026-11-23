import type { ParameterSchema } from "../types";
import { parameterDisplayValue } from "../utils";

export function ParameterSelect({
  schema,
  label,
  value,
  onChange,
  describedBy,
}: {
  schema: ParameterSchema;
  label: string;
  value: string;
  onChange: (value: string) => void;
  describedBy?: string;
}) {
  return (
    <select
      required
      aria-label={label}
      value={value}
      aria-describedby={describedBy}
      onChange={(event) => onChange(event.target.value)}
    >
      {!schema.enum?.includes(value) && (
        <option value="">Selecione uma opção</option>
      )}
      {schema.enum?.map((option) => (
        <option key={option} value={option}>
          {parameterDisplayValue(option, schema)}
        </option>
      ))}
    </select>
  );
}

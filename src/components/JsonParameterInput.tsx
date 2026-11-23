import { useEffect, useId, useRef, useState } from "react";
import type { ParameterSchema } from "../types";
import { parameterValue } from "../utils";

export function JsonParameterInput({
  label,
  filename,
  schema,
  value,
  onChange,
  describedBy,
  inputId,
}: {
  label: string;
  filename?: string | null;
  schema: ParameterSchema;
  value: string;
  onChange: (value: string, filename?: string) => void;
  describedBy?: string;
  inputId?: string;
}) {
  const generatedId = useId();
  const fieldId = inputId ?? generatedId;
  const revision = useRef(0);
  const change = useRef(onChange);
  change.current = onChange;
  const [reading, setReading] = useState(false);
  const [error, setError] = useState<string>();
  const [loaded, setLoaded] = useState<{ name: string; raw: string }>();

  useEffect(() => {
    revision.current++;
    setReading(false);
  }, [value]);
  useEffect(
    () => () => {
      revision.current++;
    },
    [],
  );

  const loadedName =
    filename ?? (loaded?.raw === value ? loaded.name : undefined);
  return (
    <>
      <label htmlFor={fieldId}>{label}</label>
      <input
        type="file"
        accept=".json,application/json"
        aria-label={`Importar ${label.charAt(0).toLocaleLowerCase("pt-BR") + label.slice(1)}`}
        aria-describedby={describedBy}
        onChange={async (event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (!file) return;
          const current = ++revision.current;
          setReading(true);
          setError(undefined);
          try {
            if (file.size > 8 * 1024 * 1024)
              throw new Error("Arquivo auxiliar excede 8 MiB.");
            const raw = await file.text();
            if (current !== revision.current) return;
            parameterValue(raw, schema);
            change.current(raw, file.name);
            setLoaded({ name: file.name, raw });
          } catch (error) {
            if (current === revision.current)
              setError(
                error instanceof Error
                  ? error.message
                  : "Não foi possível ler o arquivo JSON.",
              );
          } finally {
            if (current === revision.current) setReading(false);
          }
        }}
      />
      {reading && (
        <small className="muted" role="status">
          Lendo arquivo…
        </small>
      )}
      {loadedName && (
        <small className="muted auxiliary-filename">
          Arquivo carregado: {loadedName}
        </small>
      )}
      <textarea
        id={fieldId}
        required
        rows={5}
        aria-label={label}
        aria-describedby={describedBy}
        aria-busy={reading}
        value={value}
        onChange={(event) => {
          revision.current++;
          setReading(false);
          setError(undefined);
          setLoaded(undefined);
          onChange(event.target.value);
        }}
      />
      {error && <small role="alert">{error}</small>}
    </>
  );
}

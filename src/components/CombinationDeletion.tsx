import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import {
  configurationDeletionBlocked,
  type ConfigurationUsage,
} from "../configurationUsage";
import type { StrategyCombination } from "../types";
import { DeleteConfirmationDialog } from "./DeleteConfirmationDialog";
import { ErrorNotice } from "./common";
import { Icon } from "./Icon";

type Validation = { id: string; usage?: ConfigurationUsage; error?: unknown };

export function useCombinationDeletion(
  onDeleted: (combination: StrategyCombination) => void,
) {
  const [target, setTarget] = useState<StrategyCombination>();
  const [busy, setBusy] = useState(false);
  const [checkingBeforeDelete, setCheckingBeforeDelete] = useState(false);
  const [error, setError] = useState<unknown>();
  const [validation, setValidation] = useState<Validation>();
  const [revision, setRevision] = useState(0);
  const active = useRef<AbortController>();
  useEffect(() => () => active.current?.abort(), []);
  useEffect(() => {
    if (target?.kind !== "strategy") return;
    const controller = new AbortController();
    setValidation(undefined);
    api.configurationUsage(target, controller.signal).then(
      (usage) => {
        if (!controller.signal.aborted) setValidation({ id: target.id, usage });
      },
      (error) => {
        if (!controller.signal.aborted) setValidation({ id: target.id, error });
      },
    );
    return () => controller.abort();
  }, [target?.id, revision]);
  const usage = validation?.id === target?.id ? validation?.usage : undefined;
  const protectedTarget = target?.kind === "strategy";
  const blocked =
    protectedTarget && (!usage || configurationDeletionBlocked(usage));
  async function confirm() {
    if (!target || busy || blocked) return;
    const controller = new AbortController();
    active.current = controller;
    setBusy(true);
    setCheckingBeforeDelete(protectedTarget);
    setError(undefined);
    let checking = protectedTarget;
    try {
      // Refresh immediately before deletion: links may have changed while the
      // confirmation dialog was open.
      if (protectedTarget) {
        const latest = await api.configurationUsage(target, controller.signal);
        if (controller.signal.aborted) return;
        setValidation({ id: target.id, usage: latest });
        if (configurationDeletionBlocked(latest)) return;
      }
      checking = false;
      setCheckingBeforeDelete(false);
      await api.deleteCombination(target.id, controller.signal);
      if (controller.signal.aborted) return;
      setTarget(undefined);
      onDeleted(target);
    } catch (error) {
      if (!controller.signal.aborted) {
        if (checking) setValidation({ id: target.id, error });
        else setError(error);
      }
    } finally {
      if (!controller.signal.aborted) {
        setBusy(false);
        setCheckingBeforeDelete(false);
      }
    }
  }
  const retry = () => {
    setError(undefined);
    setValidation(undefined);
    setRevision((value) => value + 1);
  };
  return {
    busy,
    close: () => setTarget(undefined),
    choose: (combination: StrategyCombination) => {
      setError(undefined);
      setValidation(undefined);
      setTarget(combination);
    },
    dialog: target && (
      <DeleteConfirmationDialog
        targetId={target.id}
        targetName={target.name}
        title={
          protectedTarget ? "Excluir configuração?" : "Excluir combinação?"
        }
        description={
          protectedTarget
            ? "A configuração só pode ser excluída quando não estiver vinculada a processamentos ou incorporada em combinações."
            : "A combinação deixará de estar disponível para novos processamentos. Processamentos anteriores e cópias incorporadas em outras combinações mantêm a configuração original."
        }
        confirmLabel={
          protectedTarget ? "Excluir configuração" : "Excluir combinação"
        }
        busy={busy}
        busyLabel={checkingBeforeDelete ? "Verificando vínculos…" : undefined}
        confirmDisabled={blocked}
        validation={
          protectedTarget &&
          (!validation || validation.id !== target.id ? (
            <p role="status">
              <Icon name="loading" spin />
              Verificando vínculos da configuração…
            </p>
          ) : validation.error ? (
            <div>
              <p>
                A exclusão permanece desabilitada porque não foi possível
                verificar os vínculos.
              </p>
              <ErrorNotice error={validation.error} retry={retry} />
            </div>
          ) : usage && configurationDeletionBlocked(usage) ? (
            <div className="deletion-warning" role="alert">
              <p>
                <Icon name="warning" />
                Esta configuração não pode ser excluída.
              </p>
              {!!usage.runs.length && (
                <p>
                  Processamentos vinculados: {usage.runs.length}.{" "}
                  {usage.runs.slice(0, 3).join(", ")}
                </p>
              )}
              {!!usage.combinations.length && (
                <p>
                  Combinações que incorporam esta configuração:{" "}
                  {usage.combinations.slice(0, 3).join(", ")}
                  {usage.combinations.length > 3
                    ? ` e mais ${usage.combinations.length - 3}`
                    : ""}
                  .
                </p>
              )}
              {!!usage.uncertainCopies.length && (
                <p>
                  Há cópias da mesma estratégia base sem identificador de
                  origem. Não é possível descartar um vínculo com esta
                  configuração. Revise essas cópias antes de excluir:{" "}
                  {usage.uncertainCopies.slice(0, 3).join("; ")}.
                </p>
              )}
              <button type="button" onClick={retry}>
                <Icon name="refresh" />
                Verificar vínculos novamente
              </button>
            </div>
          ) : null)
        }
        error={error}
        onCancel={() => setTarget(undefined)}
        onConfirm={confirm}
      />
    ),
  };
}

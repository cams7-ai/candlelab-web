import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { ErrorNotice } from "./common";

export function DeleteRunDialog({
  runId,
  strategyName,
  busy,
  error,
  onCancel,
  onConfirm,
}: {
  runId: string;
  strategyName: string;
  busy: boolean;
  error: unknown;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const dialog = useRef<HTMLDivElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    const app = document.querySelector<HTMLElement>(".app");
    const previousInert = app?.inert ?? false;
    if (app) app.inert = true;
    document.body.style.overflow = "hidden";
    cancel.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      if (app) app.inert = previousInert;
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, []);
  useEffect(() => {
    if (busy) dialog.current?.focus();
    else cancel.current?.focus();
  }, [busy]);

  return createPortal(
    <div
      className="modal-backdrop"
      onClick={(event) => {
        if (event.target === event.currentTarget && !busy) onCancel();
      }}
    >
      <div
        ref={dialog}
        className="delete-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="delete-run-title"
        aria-describedby="delete-run-description"
        aria-busy={busy}
        tabIndex={-1}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            if (!busy) onCancel();
          }
          if (event.key === "Tab") {
            const buttons = dialog.current?.querySelectorAll<HTMLButtonElement>(
              "button:not(:disabled)",
            );
            if (!buttons?.length) {
              event.preventDefault();
              dialog.current?.focus();
              return;
            }
            const first = buttons[0];
            const last = buttons[buttons.length - 1];
            if (event.shiftKey && document.activeElement === first) {
              event.preventDefault();
              last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
              event.preventDefault();
              first.focus();
            }
          }
        }}
      >
        <div className="delete-dialog-content">
          <h2 id="delete-run-title">Excluir processamento?</h2>
          <p id="delete-run-description">
            Os resultados e o relatório deste processamento serão removidos
            permanentemente. Esta ação não pode ser desfeita.
          </p>
          <div className="delete-dialog-target">
            <strong>{strategyName}</strong>
            <span>{runId}</span>
          </div>
          {error != null && <ErrorNotice error={error} />}
        </div>
        <footer className="delete-dialog-actions">
          <button ref={cancel} type="button" disabled={busy} onClick={onCancel}>
            Cancelar
          </button>
          <button
            type="button"
            className="danger-button"
            disabled={busy}
            onClick={onConfirm}
          >
            {busy ? "Excluindo…" : "Excluir processamento"}
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}

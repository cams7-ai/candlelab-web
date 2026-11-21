import { Icon } from "./Icon";
import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ErrorNotice } from "./common";

export function DeleteConfirmationDialog({
  targetId,
  targetName,
  title,
  description,
  confirmLabel,
  busy,
  error,
  onCancel,
  onConfirm,
  validation,
  confirmDisabled = false,
  busyLabel = "Excluindo…",
}: {
  targetId: string;
  targetName: string;
  title: string;
  description: string;
  confirmLabel: string;
  busy: boolean;
  error: unknown;
  onCancel: () => void;
  onConfirm: () => void;
  validation?: ReactNode;
  confirmDisabled?: boolean;
  busyLabel?: string;
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
        aria-labelledby="delete-confirmation-title"
        aria-describedby="delete-confirmation-description"
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
          <h2 id="delete-confirmation-title">
            <Icon name="warning" />
            {title}
          </h2>
          <p id="delete-confirmation-description">{description}</p>
          <div className="delete-dialog-target">
            <strong>{targetName}</strong>
            <span>{targetId}</span>
          </div>
          {validation}
          {error != null && <ErrorNotice error={error} />}
        </div>
        <footer className="delete-dialog-actions">
          <button ref={cancel} type="button" disabled={busy} onClick={onCancel}>
            <Icon name="cancel" />
            Cancelar
          </button>
          <button
            type="button"
            className="danger-button"
            disabled={busy || confirmDisabled}
            onClick={onConfirm}
          >
            <Icon name={busy ? "loading" : "delete"} spin={busy} />
            {busy ? busyLabel : confirmLabel}
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}

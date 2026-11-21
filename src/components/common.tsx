import { Icon } from "./Icon";
import type { ReactNode, Ref } from "react";
import { ApiError } from "../api";
import type { Dataset } from "../types";
import { datasetName, utc } from "../utils";
export function ErrorNotice({
  error,
  retry,
}: {
  error: unknown;
  retry?: () => void;
}) {
  return (
    <div role="alert" className="error">
      <strong>
        <Icon name="warning" />
        {error instanceof Error ? error.message : "Ocorreu uma falha."}
      </strong>
      {error instanceof ApiError && error.body.error.details != null && (
        <pre>{JSON.stringify(error.body.error.details, null, 2)}</pre>
      )}
      {retry && (
        <button onClick={retry}>
          <Icon name="refresh" />
          Tentar novamente
        </button>
      )}
    </div>
  );
}
export function Loading() {
  return (
    <p role="status" className="muted loading">
      <Icon name="loading" spin />
      Carregando…
    </p>
  );
}
export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}
export function DatasetCard({
  dataset,
  children,
  elementRef,
}: {
  dataset?: Dataset;
  children?: ReactNode;
  elementRef?: Ref<HTMLElement>;
}) {
  return (
    <aside ref={elementRef} className="panel dataset-card">
      <h2>
        <Icon name="database" />
        Conjunto selecionado
      </h2>
      {dataset ? (
        <>
          <h3>
            {dataset.base_asset}/{dataset.quote_asset} · {dataset.interval}
          </h3>
          <p className="big accent">{dataset.candle_count} candles</p>
          <dl>
            <dt>Nome</dt>
            <dd>{datasetName(dataset)}</dd>
            <dt>Origem</dt>
            <dd>{dataset.source}</dd>
            <dt>Primeira abertura</dt>
            <dd>{utc(dataset.first_open_time_ms)}</dd>
            <dt>Última abertura</dt>
            <dd>{utc(dataset.last_open_time_ms)}</dd>
          </dl>
          {children}
        </>
      ) : (
        <Empty>
          Escolha um conjunto existente ou adicione candles para continuar.
        </Empty>
      )}
    </aside>
  );
}

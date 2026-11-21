import { Icon } from "./Icon";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { allPages, api, ApiError } from "../api";
import { useQuery } from "../hooks";
import type { Dataset, Session, Run } from "../types";
import {
  datasetName,
  decimal,
  format,
  percentToRate,
  rateToPercent,
} from "../utils";
import { DatasetCard, Empty, ErrorNotice, Loading } from "./common";
import { DeleteConfirmationDialog } from "./DeleteConfirmationDialog";
export function Sessions({ navigate }: { navigate: (path: string) => void }) {
  const [search, setSearch] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Session>();
  const [deleting, setDeleting] = useState(false);
  const [checkingBeforeDelete, setCheckingBeforeDelete] = useState(false);
  const [validation, setValidation] = useState<{
    id: string;
    runs?: Run[];
    error?: unknown;
  }>();
  const [revision, setRevision] = useState(0);
  const [deleteError, setDeleteError] = useState<unknown>();
  const [deletedIds, setDeletedIds] = useState<string[]>([]);
  const activeDelete = useRef<AbortController>();
  useEffect(() => () => activeDelete.current?.abort(), []);
  const query = useQuery(async (signal) => {
    const [sessions, datasets] = await Promise.all([
      allPages<Session>("/sessions", signal, (s) => s.id),
      allPages<Dataset>("/datasets", signal, (d) => d.id),
    ]);
    const counts = await Promise.all(
      sessions.map((s) =>
        api.sessionRuns(s.id, signal).then((r) => [s.id, r.length] as const),
      ),
    );
    return { sessions, datasets, counts: new Map(counts) };
  }, []);
  const sessions =
    query.data?.sessions.filter(
      (s) =>
        !deletedIds.includes(s.id) &&
        s.name.toLowerCase().includes(search.toLowerCase()),
    ) ?? [];
  useEffect(() => {
    if (!deleteTarget) return;
    const controller = new AbortController();
    setValidation(undefined);
    api.sessionRuns(deleteTarget.id, controller.signal).then(
      (runs) => {
        if (!controller.signal.aborted)
          setValidation({ id: deleteTarget.id, runs });
      },
      (error) => {
        if (!controller.signal.aborted)
          setValidation({ id: deleteTarget.id, error });
      },
    );
    return () => controller.abort();
  }, [deleteTarget?.id, revision]);
  const linkedRuns =
    validation?.id === deleteTarget?.id ? validation?.runs : undefined;
  const blocked = !linkedRuns || linkedRuns.length > 0;
  const retryValidation = () => {
    setDeleteError(undefined);
    setValidation(undefined);
    setRevision((value) => value + 1);
  };
  async function deleteSession() {
    if (!deleteTarget || deleting || blocked) return;
    const controller = new AbortController();
    activeDelete.current = controller;
    setDeleting(true);
    setCheckingBeforeDelete(true);
    setDeleteError(undefined);
    let checking = true;
    try {
      const runs = await api.sessionRuns(deleteTarget.id, controller.signal);
      if (controller.signal.aborted) return;
      setValidation({ id: deleteTarget.id, runs });
      if (runs.length) return;
      checking = false;
      setCheckingBeforeDelete(false);
      await api.deleteSession(deleteTarget.id, controller.signal);
      if (controller.signal.aborted) return;
      setDeletedIds((previous) => [...previous, deleteTarget.id]);
      setDeleteTarget(undefined);
    } catch (error) {
      if (!controller.signal.aborted) {
        if (
          checking ||
          (error instanceof ApiError &&
            error.body.error.code === "SESSION_IN_USE")
        )
          setValidation({ id: deleteTarget.id, error });
        else setDeleteError(error);
      }
    } finally {
      if (!controller.signal.aborted) {
        setDeleting(false);
        setCheckingBeforeDelete(false);
      }
    }
  }
  return (
    <>
      {deleteTarget && (
        <DeleteConfirmationDialog
          targetId={deleteTarget.id}
          targetName={deleteTarget.name}
          title="Excluir sessão?"
          description="A sessão só pode ser excluída quando não houver processamentos vinculados. A exclusão não pode ser desfeita."
          confirmLabel="Excluir sessão"
          busy={deleting}
          busyLabel={checkingBeforeDelete ? "Verificando vínculos…" : undefined}
          confirmDisabled={blocked}
          validation={
            !validation || validation.id !== deleteTarget.id ? (
              <p role="status">
                <Icon name="loading" spin />
                Verificando processamentos vinculados…
              </p>
            ) : validation.error ? (
              <div>
                <p>
                  A exclusão permanece desabilitada porque não foi possível
                  confirmar a ausência de processamentos.
                </p>
                <ErrorNotice error={validation.error} retry={retryValidation} />
              </div>
            ) : linkedRuns?.length ? (
              <div className="deletion-warning" role="alert">
                <p>
                  <Icon name="warning" />
                  Esta sessão não pode ser excluída.
                </p>
                <p>
                  Processamentos vinculados: {linkedRuns.length}.{" "}
                  {linkedRuns
                    .slice(0, 3)
                    .map((run) => run.id)
                    .join(", ")}
                  {linkedRuns.length > 3
                    ? ` e mais ${linkedRuns.length - 3}`
                    : ""}
                  .
                </p>
                <p>Remova os processamentos antes de excluir a sessão.</p>
                <button type="button" onClick={retryValidation}>
                  <Icon name="refresh" />
                  Verificar vínculos novamente
                </button>
              </div>
            ) : null
          }
          error={deleteError}
          onCancel={() => setDeleteTarget(undefined)}
          onConfirm={() => void deleteSession()}
        />
      )}
      <header>
        <div>
          <p className="eyebrow">LABORATÓRIO DE BACKTEST</p>
          <h1>Sessões</h1>
        </div>
        <div className="actions">
          <span className="search-field">
            <Icon name="search" standalone />
            <input
              aria-label="Buscar sessão"
              placeholder="Buscar sessão"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </span>
          <button className="primary" onClick={() => navigate("/sessions/new")}>
            <Icon name="add" />
            Nova sessão
          </button>
        </div>
      </header>
      {query.loading ? (
        <Loading />
      ) : query.error ? (
        <ErrorNotice error={query.error} retry={query.retry} />
      ) : (
        query.data && (
          <div className="panel table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Sessão</th>
                  <th>Par</th>
                  <th>Intervalo</th>
                  <th>Caixa inicial</th>
                  <th>Taxa</th>
                  <th>Processamentos</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((s) => {
                  const d = query.data!.datasets.find(
                    (d) => d.id === s.dataset_id,
                  );
                  return (
                    <tr key={s.id}>
                      <td>
                        <a href={"#/sessions/" + encodeURIComponent(s.id)}>
                          {s.name}
                        </a>
                      </td>
                      <td>
                        {d
                          ? `${d.base_asset}/${d.quote_asset}`
                          : "Indisponível"}
                      </td>
                      <td>{d?.interval ?? "—"}</td>
                      <td>{format(s.initial_cash)} USDT</td>
                      <td>{format(rateToPercent(s.fee_rate))}%</td>
                      <td>{query.data!.counts.get(s.id)}</td>
                      <td>
                        <button
                          type="button"
                          className="negative"
                          disabled={deleting}
                          onClick={() => {
                            setDeleteError(undefined);
                            setValidation(undefined);
                            setDeleteTarget(s);
                          }}
                        >
                          <Icon name="delete" />
                          Excluir
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {!sessions.length && (
              <Empty>
                Nenhuma sessão encontrada. Crie uma sessão para começar.
              </Empty>
            )}
          </div>
        )
      )}
    </>
  );
}
export function NewSession({
  navigate,
  datasetId,
}: {
  navigate: (path: string) => void;
  datasetId: string | null;
}) {
  const query = useQuery(
    (signal) => allPages<Dataset>("/datasets", signal, (d) => d.id),
    [],
  );
  const [selected, setSelected] = useState(datasetId ?? "");
  const [name, setName] = useState("");
  const [cash, setCash] = useState("1000");
  const [fee, setFee] = useState("0,1");
  const [error, setError] = useState<unknown>();
  const [busy, setBusy] = useState(false);
  const active = useRef<AbortController>();
  useEffect(() => () => active.current?.abort(), []);
  const dataset = query.data?.find((d) => d.id === selected) ?? query.data?.[0];
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!dataset) return;
    const controller = new AbortController();
    active.current = controller;
    setBusy(true);
    setError(undefined);
    try {
      const initial_cash = decimal(cash);
      if (!/[1-9]/.test(initial_cash))
        throw new Error("O caixa inicial deve ser maior que zero.");
      if (!name.trim()) throw new Error("Informe o nome da sessão.");
      const s = await api.createSession(
        {
          name: name.trim(),
          dataset_id: dataset.id,
          initial_cash,
          fee_rate: percentToRate(fee),
        },
        controller.signal,
      );
      if (!controller.signal.aborted)
        navigate("/sessions/" + encodeURIComponent(s.id));
    } catch (err) {
      if (!controller.signal.aborted) setError(err);
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }
  return (
    <>
      <header>
        <div>
          <h1>Nova sessão</h1>
          <p className="muted">
            Crie uma nova sessão de backtest com um conjunto de candles.
          </p>
        </div>
      </header>
      {query.loading ? (
        <Loading />
      ) : query.error ? (
        <ErrorNotice error={query.error} retry={query.retry} />
      ) : (
        <div className="two-columns">
          <form className="panel form" onSubmit={submit}>
            <h2>Dados da sessão</h2>
            <label>
              Nome da sessão
              <input
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="BTC · Agosto 2026"
              />
            </label>
            <label>
              Conjunto de candles
              <select
                required
                value={dataset?.id ?? ""}
                onChange={(e) => setSelected(e.target.value)}
              >
                {query.data?.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.base_asset}/{d.quote_asset} · {d.interval} ·{" "}
                    {d.candle_count} candles · {datasetName(d)}
                  </option>
                ))}
              </select>
            </label>
            {!dataset && <a href="#/candles">Adicionar candles</a>}
            <div className="field-grid">
              <label>
                Caixa inicial (USDT)
                <input
                  inputMode="decimal"
                  required
                  value={cash}
                  onChange={(e) => setCash(e.target.value)}
                />
              </label>
              <label>
                Taxa por preenchimento (%)
                <input
                  inputMode="decimal"
                  required
                  value={fee}
                  onChange={(e) => setFee(e.target.value)}
                />
              </label>
            </div>
            {error != null && <ErrorNotice error={error} />}
            <footer className="actions">
              <button type="button" onClick={() => navigate("/sessions")}>
                <Icon name="cancel" />
                Cancelar
              </button>
              <button className="primary" disabled={busy || !dataset}>
                <Icon name={busy ? "loading" : "add"} spin={busy} />
                {busy ? "Criando…" : "Criar sessão"}
              </button>
            </footer>
          </form>
          <DatasetCard dataset={dataset} />
        </div>
      )}
    </>
  );
}

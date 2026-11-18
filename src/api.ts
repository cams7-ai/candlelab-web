import type {
  ApiErrorBody,
  BinanceInput,
  Dataset,
  Page,
  Run,
  Session,
} from "./types";
export class ApiError extends Error {
  constructor(
    public status: number,
    public body: ApiErrorBody,
  ) {
    super(body.error.message);
  }
}
export const apiBase =
  (import.meta.env.VITE_API_BASE_URL || "http://localhost:8000").replace(
    /\/$/,
    "",
  ) + "/api/v1";
export async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(apiBase + path, {
    ...options,
    headers: {
      ...(options.body instanceof FormData
        ? {}
        : options.body
          ? { "Content-Type": "application/json" }
          : {}),
      ...options.headers,
    },
  });
  if (!response.ok) {
    let body: ApiErrorBody;
    try {
      const payload = await response.json();
      if (!payload?.error?.message)
        throw new Error("Resposta de erro sem contrato HTTP.");
      body = payload;
    } catch {
      body = {
        error: {
          code: String(response.status),
          message: "Não foi possível concluir a requisição.",
          details: null,
        },
      };
    }
    throw new ApiError(response.status, body);
  }
  return response.status === 204 ? undefined : response.json();
}
export async function allPages<T>(
  path: string,
  signal?: AbortSignal,
  key?: (item: T) => string,
): Promise<T[]> {
  const items: T[] = [];
  let cursor: string | null = null;
  const cursors = new Set<string>();
  do {
    const query = new URLSearchParams();
    if (cursor) query.set("cursor", cursor);
    const page: Page<T> = await request(
      path + (path.includes("?") ? "&" : "?") + query,
      { signal },
    );
    items.push(...page.items);
    cursor = page.next_cursor;
    if (cursor && cursors.has(cursor))
      throw new Error("A API repetiu o cursor de paginação.");
    if (cursor) cursors.add(cursor);
  } while (cursor);
  return key
    ? Array.from(new Map(items.map((item) => [key(item), item])).values())
    : items;
}
export const api = {
  deleteDataset: (id: string, signal?: AbortSignal) =>
    request<void>(`/datasets/${encodeURIComponent(id)}`, {
      method: "DELETE",
      signal,
    }),
  deleteSession: (id: string, signal?: AbortSignal) =>
    request<void>(`/sessions/${encodeURIComponent(id)}`, {
      method: "DELETE",
      signal,
    }),
  deleteRun: (id: string, signal?: AbortSignal) =>
    request<void>(`/runs/${encodeURIComponent(id)}`, {
      method: "DELETE",
      signal,
    }),
  binance: (body: BinanceInput, signal?: AbortSignal) =>
    request<Dataset>("/datasets/binance", {
      method: "POST",
      body: JSON.stringify(body),
      signal,
    }),
  upload: (
    file: File,
    symbol: string,
    interval: string,
    signal?: AbortSignal,
  ) => {
    const body = new FormData();
    body.set("file", file);
    body.set("symbol", symbol);
    body.set("interval", interval);
    return request<Dataset>("/datasets", { method: "POST", body, signal });
  },
  createSession: (body: Omit<Session, "id">, signal?: AbortSignal) =>
    request<Session>("/sessions", {
      method: "POST",
      body: JSON.stringify(body),
      signal,
    }),
  createRun: (
    id: string,
    body: Pick<Run, "strategy_id" | "parameters" | "auxiliary_filename">,
    signal?: AbortSignal,
  ) =>
    request<Run>(`/sessions/${encodeURIComponent(id)}/runs`, {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "Idempotency-Key": crypto.randomUUID() },
      signal,
    }),
};
export const resource = (id: string) => encodeURIComponent(id);

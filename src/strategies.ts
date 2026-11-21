import { api, request } from "./api";
import { useQuery } from "./hooks";
import type { Strategy } from "./types";

export const strategyPath = (id: string) =>
  `/strategies/${encodeURIComponent(id)}`;
export const combinationPath = (id: string) =>
  `/strategies/combinations/${encodeURIComponent(id)}`;
export function strategyRole(strategy: Strategy | undefined) {
  if (strategy?.category === "combination" || strategy?.components?.length)
    return "Combinação pronta";
  return strategy?.composition_role === "filter"
    ? "Filtro de compra"
    : strategy?.composition_role === "exit"
      ? "Saída"
      : "Sinal";
}
export function useStrategyCatalog() {
  return useQuery(async (signal) => {
    const [catalog, combinations] = await Promise.all([
      request<{ items: Strategy[] }>("/strategies", { signal }),
      api.combinations(signal),
    ]);
    return { strategies: catalog.items, combinations };
  }, []);
}

export type StrategyFilters = {
  search: string;
  kind: "all" | "individual" | "recipe" | "saved" | "configuration";
};
export function readStrategyFilters(params: URLSearchParams): StrategyFilters {
  const kind = params.get("type");
  return {
    search: params.get("q") ?? "",
    kind:
      kind === "individual" ||
      kind === "recipe" ||
      kind === "saved" ||
      kind === "configuration"
        ? kind
        : "all",
  };
}
export function strategyListPath(filters: StrategyFilters): string {
  const params = new URLSearchParams();
  if (filters.search) params.set("q", filters.search);
  if (filters.kind !== "all") params.set("type", filters.kind);
  return "/strategies" + (params.size ? `?${params}` : "");
}
export function strategyListReturn(value?: string | null): string {
  if (!value) return "/strategies";
  try {
    const url = new URL(value, "http://local");
    return url.origin === "http://local" && url.pathname === "/strategies"
      ? strategyWorkspacePath({
          filters: readStrategyFilters(url.searchParams),
          tab:
            url.searchParams.get("tab") === "combinations"
              ? "combinations"
              : "catalog",
          returnTo: url.searchParams.get("returnTo"),
        })
      : "/strategies";
  } catch {
    return "/strategies";
  }
}
export function withStrategyReturn(path: string, returnTo: string): string {
  const target = strategyListReturn(returnTo);
  return target === "/strategies"
    ? path
    : `${path}?${new URLSearchParams({ returnTo: target })}`;
}

export type StrategyOrigin = { id: string; source: "catalog" | "saved" };
export function readStrategyTrail(value?: string | null): StrategyOrigin[] {
  if (!value) return [];
  try {
    const entries: unknown = JSON.parse(value);
    if (
      !Array.isArray(entries) ||
      !entries.every(
        (entry) =>
          entry &&
          typeof entry.id === "string" &&
          entry.id.length > 0 &&
          entry.id.length <= 100 &&
          (entry.source === "catalog" || entry.source === "saved"),
      )
    )
      return [];
    return entries.slice(-32).map(({ id, source }) => ({ id, source }));
  } catch {
    return [];
  }
}
export function withStrategyTrail(
  path: string,
  returnTo: string,
  trail: StrategyOrigin[],
): string {
  const target = new URL(withStrategyReturn(path, returnTo), "http://local");
  if (trail.length)
    target.searchParams.set("trail", JSON.stringify(trail.slice(-32)));
  return target.pathname + target.search;
}

export type StrategiesTab = "catalog" | "combinations";
export function strategyWorkspacePath({
  filters = { search: "", kind: "all" },
  tab = "catalog",
  editId,
  returnTo,
}: {
  filters?: StrategyFilters;
  tab?: StrategiesTab;
  editId?: string | null;
  returnTo?: string | null;
} = {}): string {
  const url = new URL(strategyListPath(filters), "http://local");
  if (tab === "combinations") url.searchParams.set("tab", "combinations");
  if (tab === "combinations" && editId) url.searchParams.set("edit", editId);
  if (returnTo && /^\/sessions\/[^/]+\/runs\/new$/.test(returnTo))
    url.searchParams.set("returnTo", returnTo);
  return url.pathname + url.search;
}

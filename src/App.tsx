import { Icon } from "./components/Icon";
import { useEffect, useState } from "react";
import { Acquisition } from "./components/Acquisition";
import { NewSession, Sessions } from "./components/Sessions";
import { NewRun } from "./components/NewRun";
import { SessionDetail } from "./components/SessionDetail";
import { StrategiesWorkspace } from "./components/StrategiesWorkspace";
import { StrategyDetail } from "./components/StrategyDetail";
import { readStrategyFilters, strategyWorkspacePath } from "./strategies";
export default function App() {
  const [route, setRoute] = useState(
    () => location.hash.slice(1) || "/sessions",
  );
  useEffect(() => {
    const listener = () => setRoute(location.hash.slice(1) || "/sessions");
    addEventListener("hashchange", listener);
    return () => removeEventListener("hashchange", listener);
  }, []);
  const navigate = (path: string) => {
    location.hash = path;
  };
  const url = new URL(route, "http://local");
  const legacyCombinations = url.pathname === "/combinations";
  if (legacyCombinations) {
    url.pathname = "/strategies";
    url.searchParams.set("tab", "combinations");
  }
  useEffect(() => {
    if (!legacyCombinations) return;
    const path = url.pathname + url.search;
    history.replaceState(history.state, "", `#${path}`);
    setRoute(path);
  }, [route]);
  const strategiesTab =
    url.searchParams.get("tab") === "combinations" ? "combinations" : "catalog";
  const match = url.pathname.match(/^\/sessions\/([^/]+)(\/runs\/new)?$/);
  const id = match && decodeURIComponent(match[1]);
  const savedStrategyMatch = url.pathname.match(
    /^\/strategies\/combinations\/([^/]+)$/,
  );
  const strategyMatch = url.pathname.match(/^\/strategies\/([^/]+)$/);
  const strategyIdentifier = savedStrategyMatch?.[1] ?? strategyMatch?.[1];
  function decodeIdentifier(value: string) {
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }
  let content;
  if (url.pathname === "/strategies")
    content = (
      <StrategiesWorkspace
        tab={strategiesTab}
        filters={readStrategyFilters(url.searchParams)}
        navigate={navigate}
        editId={url.searchParams.get("edit")}
        returnTo={url.searchParams.get("returnTo")}
        onTabChange={(tab) =>
          navigate(
            strategyWorkspacePath({
              filters: readStrategyFilters(url.searchParams),
              tab,
              returnTo: url.searchParams.get("returnTo"),
            }),
          )
        }
        onFiltersChange={(filters) => {
          const path = strategyWorkspacePath({
            filters,
            tab: strategiesTab,
            returnTo: url.searchParams.get("returnTo"),
          });
          history.replaceState(history.state, "", `#${path}`);
          setRoute(path);
        }}
      />
    );
  else if (strategyIdentifier)
    content = (
      <StrategyDetail
        key={`${savedStrategyMatch ? "saved" : "catalog"}:${strategyIdentifier}`}
        id={decodeIdentifier(strategyIdentifier)}
        source={savedStrategyMatch ? "saved" : "catalog"}
        returnTo={url.searchParams.get("returnTo")}
        trail={url.searchParams.get("trail")}
        navigate={navigate}
      />
    );
  else if (url.pathname === "/candles")
    content = <Acquisition navigate={navigate} />;
  else if (url.pathname === "/sessions/new")
    content = (
      <NewSession
        navigate={navigate}
        datasetId={url.searchParams.get("dataset")}
      />
    );
  else if (id && match?.[2])
    content = (
      <NewRun
        key={id + url.search}
        id={id}
        navigate={navigate}
        combinationId={url.searchParams.get("combination")}
      />
    );
  else if (id)
    content = (
      <SessionDetail
        key={id}
        id={id}
        runId={url.searchParams.get("run")}
        navigate={navigate}
      />
    );
  else content = <Sessions navigate={navigate} />;
  return (
    <div className="app">
      <aside className="sidebar">
        <a className="brand" href="#/sessions">
          <span className="brand-mark" aria-hidden="true">
            <Icon name="candles" standalone />
          </span>
          <span className="brand-text">CandleLab Web · 0.3.0</span>
        </a>
        <nav aria-label="Navegação principal">
          <a
            className={url.pathname.startsWith("/sessions") ? "active" : ""}
            href="#/sessions"
          >
            <Icon name="sessions" standalone />
            Sessões
          </a>
          <a
            className={url.pathname === "/candles" ? "active" : ""}
            href="#/candles"
          >
            <Icon name="candles" standalone />
            Candles
          </a>
          <a
            className={
              url.pathname === "/strategies" ||
              url.pathname.startsWith("/strategies/")
                ? "active"
                : ""
            }
            href="#/strategies"
          >
            <Icon name="strategies" standalone />
            Estratégias
          </a>
        </nav>
        <div className="sidebar-footer">
          <span className="live-dot" /> Binance Spot
          <p>Laboratório de backtest histórico</p>
        </div>
      </aside>
      <main>
        {import.meta.env.VITE_DEMO_MODE === "true" && (
          <div className="demo-banner" role="status">
            <Icon name="details" />
            DEMONSTRAÇÃO · Dados e resultados sintéticos · Alterações salvas
            somente neste navegador
          </div>
        )}
        {content}
      </main>
    </div>
  );
}

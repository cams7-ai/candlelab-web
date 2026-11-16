import { useEffect, useState } from "react";
import { Acquisition } from "./components/Acquisition";
import { NewSession, Sessions } from "./components/Sessions";
import { NewRun } from "./components/NewRun";
import { SessionDetail } from "./components/SessionDetail";
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
  const match = url.pathname.match(/^\/sessions\/([^/]+)(\/runs\/new)?$/);
  const id = match && decodeURIComponent(match[1]);
  let content;
  if (url.pathname === "/candles")
    content = <Acquisition navigate={navigate} />;
  else if (url.pathname === "/sessions/new")
    content = (
      <NewSession
        navigate={navigate}
        datasetId={url.searchParams.get("dataset")}
      />
    );
  else if (id && match?.[2])
    content = <NewRun key={id} id={id} navigate={navigate} />;
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
            ╽╿╽
          </span>
          CandleLab Web · 0.2.0
        </a>
        <nav aria-label="Navegação principal">
          <a
            className={url.pathname !== "/candles" ? "active" : ""}
            href="#/sessions"
          >
            <span aria-hidden="true">▤</span>Sessões
          </a>
          <a
            className={url.pathname === "/candles" ? "active" : ""}
            href="#/candles"
          >
            <span aria-hidden="true">♮</span>Candles
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
            DEMONSTRAÇÃO · Dados e resultados sintéticos · Alterações salvas
            somente neste navegador
          </div>
        )}
        {content}
      </main>
    </div>
  );
}

import { Icon } from "./Icon";
import { useEffect, useRef, useState } from "react";
import { Strategies } from "./Strategies";
import { Combinations } from "./Combinations";
import {
  strategyWorkspacePath,
  type StrategiesTab,
  type StrategyFilters,
} from "../strategies";

export function StrategiesWorkspace({
  tab,
  filters,
  onTabChange,
  onFiltersChange,
  navigate,
  editId,
  returnTo,
}: {
  tab: StrategiesTab;
  filters: StrategyFilters;
  onTabChange: (tab: StrategiesTab) => void;
  onFiltersChange: (filters: StrategyFilters) => void;
  navigate: (path: string) => void;
  editId?: string | null;
  returnTo?: string | null;
}) {
  const [visitedCombinations, setVisitedCombinations] = useState(
    tab === "combinations",
  );
  const catalogTab = useRef<HTMLButtonElement>(null);
  const combinationsTab = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (tab === "combinations") setVisitedCombinations(true);
  }, [tab]);
  const processingReturnTo =
    returnTo && /^\/sessions\/[^/]+\/runs\/new$/.test(returnTo)
      ? returnTo
      : undefined;
  const combinationsPath = strategyWorkspacePath({
    filters,
    tab: "combinations",
    returnTo,
  });
  return (
    <>
      {processingReturnTo && (
        <a className="strategy-back" href={`#${processingReturnTo}`}>
          <Icon name="back" />
          Voltar ao processamento
        </a>
      )}
      <header>
        <div>
          <h1>Estratégias</h1>
          <p className="muted">
            Consulte o catálogo, personalize parâmetros e gerencie suas
            combinações.
          </p>
        </div>
      </header>
      <div
        className="tabs strategy-workspace-tabs"
        role="tablist"
        aria-label="Estratégias"
        onKeyDown={(event) => {
          const keys = ["ArrowLeft", "ArrowRight", "Home", "End"];
          if (!keys.includes(event.key)) return;
          event.preventDefault();
          const next: StrategiesTab =
            event.key === "Home"
              ? "catalog"
              : event.key === "End"
                ? "combinations"
                : tab === "catalog"
                  ? "combinations"
                  : "catalog";
          onTabChange(next);
          (next === "catalog" ? catalogTab : combinationsTab).current?.focus();
        }}
      >
        <button
          ref={catalogTab}
          id="strategies-catalog-tab"
          type="button"
          role="tab"
          aria-selected={tab === "catalog"}
          aria-controls="strategies-catalog-panel"
          tabIndex={tab === "catalog" ? 0 : -1}
          onClick={() => onTabChange("catalog")}
        >
          <Icon name="catalog" />
          Catálogo
        </button>
        <button
          ref={combinationsTab}
          id="strategies-combinations-tab"
          type="button"
          role="tab"
          aria-selected={tab === "combinations"}
          aria-controls="strategies-combinations-panel"
          tabIndex={tab === "combinations" ? 0 : -1}
          onClick={() => onTabChange("combinations")}
        >
          <Icon name="combination" />
          Combinações
        </button>
      </div>
      <section
        id="strategies-catalog-panel"
        role="tabpanel"
        aria-labelledby="strategies-catalog-tab"
        hidden={tab !== "catalog"}
      >
        <Strategies
          active={tab === "catalog"}
          embedded
          filters={filters}
          onFiltersChange={onFiltersChange}
          processingReturnTo={returnTo}
        />
      </section>
      <section
        id="strategies-combinations-panel"
        role="tabpanel"
        aria-labelledby="strategies-combinations-tab"
        hidden={tab !== "combinations"}
      >
        {(visitedCombinations || tab === "combinations") && (
          <Combinations
            active={tab === "combinations"}
            embedded
            navigate={navigate}
            editId={editId}
            returnTo={returnTo}
            detailsReturnTo={combinationsPath}
          />
        )}
      </section>
    </>
  );
}

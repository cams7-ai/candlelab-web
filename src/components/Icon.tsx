import "bootstrap-icons/font/bootstrap-icons.css";

// Semantic names keep the same action recognizable across the application.
const glyphs = {
  sessions: "collection",
  candles: "bar-chart-line",
  strategies: "diagram-3",
  catalog: "grid",
  combination: "layers",
  add: "plus-lg",
  run: "play-fill",
  cancel: "x-lg",
  close: "x-lg",
  delete: "trash3",
  edit: "pencil-square",
  save: "floppy",
  reset: "arrow-counterclockwise",
  clear: "eraser",
  search: "search",
  filter: "funnel",
  upload: "cloud-arrow-up",
  download: "download",
  import: "box-arrow-in-down",
  pdf: "file-earmark-pdf",
  refresh: "arrow-clockwise",
  loading: "arrow-repeat",
  parameters: "sliders",
  settings: "gear",
  details: "info-circle",
  back: "arrow-left",
  check: "check2",
  zoomIn: "zoom-in",
  zoomOut: "zoom-out",
  fit: "arrows-fullscreen",
  database: "database",
  json: "filetype-json",
  external: "box-arrow-up-right",
  warning: "exclamation-triangle",
  signal: "activity",
  exit: "box-arrow-right",
  saved: "archive",
  history: "clock-history",
  money: "wallet2",
  compare: "bar-chart",
  pending: "hourglass-split",
  success: "check-circle",
  failure: "exclamation-circle",
} as const;
export type IconName = keyof typeof glyphs;

export function Icon({
  name,
  spin = false,
  standalone = false,
  className = "",
}: {
  name: IconName;
  spin?: boolean;
  standalone?: boolean;
  className?: string;
}) {
  return (
    <i
      aria-hidden="true"
      className={`bi bi-${glyphs[name]} icon${spin ? " icon-spin" : ""}${standalone ? " icon-standalone" : ""}${className ? ` ${className}` : ""}`}
    />
  );
}

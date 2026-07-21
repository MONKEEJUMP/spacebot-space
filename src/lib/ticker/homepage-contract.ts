import tickerSourceCatalogModule from "@/lib/ticker/source-catalog";

interface WorkerSourceConfig {
  name: string;
}

const { TICKER_SOURCE_CATALOG } = tickerSourceCatalogModule as {
  TICKER_SOURCE_CATALOG: Record<string, WorkerSourceConfig>;
};

const WORKER_SOURCE_NAMES = Object.values(TICKER_SOURCE_CATALOG)
  .map((source) => source.name)
  .sort((left, right) =>
    left.localeCompare(right, undefined, { sensitivity: "base" }),
  );

export const HOMEPAGE_TICKER_SOURCE_TARGET = Math.ceil(
  WORKER_SOURCE_NAMES.length / 2,
);

export const TOP_TICKER_SOURCES = WORKER_SOURCE_NAMES.slice(
  0,
  HOMEPAGE_TICKER_SOURCE_TARGET,
);
export const BOTTOM_TICKER_SOURCES = WORKER_SOURCE_NAMES.slice(
  HOMEPAGE_TICKER_SOURCE_TARGET,
);
export const ALL_HOMEPAGE_TICKER_SOURCES = [
  ...TOP_TICKER_SOURCES,
  ...BOTTOM_TICKER_SOURCES,
];

export type TickerCategory =
  | "breaking"
  | "model_release"
  | "funding"
  | "research"
  | "policy"
  | "product"
  | "open_source"
  | "tutorial"
  | "industry";

export interface TickerHeadline {
  id: string;
  title: string;
  sourceName: string;
  sourceId: string;
  articleUrl: string;
  category: TickerCategory;
  publishedAt: string;
  isBreaking: boolean;
  compositeScore: number;
}

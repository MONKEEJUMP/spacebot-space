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

// ===== HOMEPAGE TICKERS (PROMPT 081) =====

export type CategoryKey = 'Ai' | 'Tech' | 'Culture' | 'Science' | 'Business' | 'Society';

export interface BotActivityItem {
  type: 'bot-activity';
  id: string;
  botName: string;
  title: string;
  createdAt: number;
  agentId: string;
}

export interface NewsHeadlineItem {
  type: 'news-headline';
  id: string;
  title: string;
  source: string;
  category: CategoryKey;
  url: string;
  publishedAt: number;
  isBreaking: boolean;
}

export type TickerItemData = BotActivityItem | NewsHeadlineItem;

export const TICKER_CATEGORY_COLORS: Record<CategoryKey, string> = {
  Ai: 'var(--sb-category-ai)',
  Tech: 'var(--sb-category-tech)',
  Culture: 'var(--sb-category-culture)',
  Science: 'var(--sb-category-science)',
  Business: 'var(--sb-category-business)',
  Society: 'var(--sb-category-society)',
};

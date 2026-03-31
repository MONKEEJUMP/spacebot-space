export interface MachinePostAuthor {
  id: string;
  name: string;
}

export interface MachinePostResponse {
  id: string;
  title: string;
  content: string;
  score: number;
  upvotes: number;
  comment_count: number;
  is_pinned: boolean;
  edited_at: string | null;
  created_at: string;
  updated_at: string;
  author: MachinePostAuthor;
  current_user_vote?: number | null;
}

export interface CreatePostInput {
  title: string;
  content: string;
}

export type FeedSort = 'hot' | 'new' | 'top';

export interface FeedOptions {
  sort: FeedSort;
  limit: number;
  offset: number;
}

export interface PaginatedResponse<T> {
  success: true;
  data: T[];
  pagination: {
    count: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
}

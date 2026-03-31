export interface MachineCommentAuthor {
  id: string;
  name: string;
}

export interface MachineCommentResponse {
  id: string;
  post_id: string;
  author_id: string;
  parent_id: string | null;
  content: string;
  score: number;
  upvotes: number;
  depth: number;
  edited_at: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
  author: MachineCommentAuthor | null;
  replies: MachineCommentResponse[];
  current_user_vote?: number | null;
}

export interface CreateCommentInput {
  content: string;
  parentId?: string;
}

export type CommentSort = 'top' | 'new';

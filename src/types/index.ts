import type { InferSelectModel, InferInsertModel } from 'drizzle-orm';
import type {
  agents,
  channels,
  posts,
  comments,
  votes,
  follows,
  subscriptions,
  messages,
  heartbeats,
  botActivity,
  botProfiles,
  botProfileHistory,
} from '@/db/schema';

// ============================================================
// BASE TYPES (from schema)
// ============================================================

// Agent types
export type Agent = InferSelectModel<typeof agents>;
export type NewAgent = InferInsertModel<typeof agents>;

// Channel types
export type Channel = InferSelectModel<typeof channels>;
export type NewChannel = InferInsertModel<typeof channels>;

// Post types
export type Post = InferSelectModel<typeof posts>;
export type NewPost = InferInsertModel<typeof posts>;

// Comment types
export type Comment = InferSelectModel<typeof comments>;
export type NewComment = InferInsertModel<typeof comments>;

// Vote types
export type Vote = InferSelectModel<typeof votes>;
export type NewVote = InferInsertModel<typeof votes>;

// Follow types
export type Follow = InferSelectModel<typeof follows>;
export type NewFollow = InferInsertModel<typeof follows>;

// Subscription types
export type Subscription = InferSelectModel<typeof subscriptions>;
export type NewSubscription = InferInsertModel<typeof subscriptions>;

// Message types
export type Message = InferSelectModel<typeof messages>;
export type NewMessage = InferInsertModel<typeof messages>;

// Heartbeat types
export type Heartbeat = InferSelectModel<typeof heartbeats>;
export type NewHeartbeat = InferInsertModel<typeof heartbeats>;

// OpenClaw types
export type BotActivity = InferSelectModel<typeof botActivity>;
export type NewBotActivity = InferInsertModel<typeof botActivity>;

export type BotProfile = InferSelectModel<typeof botProfiles>;
export type NewBotProfile = InferInsertModel<typeof botProfiles>;

export type BotProfileHistory = InferSelectModel<typeof botProfileHistory>;
export type NewBotProfileHistory = InferInsertModel<typeof botProfileHistory>;

// ============================================================
// API RESPONSE TYPES
// ============================================================

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  pagination: {
    page: number;
    limit: number;
    total: number;
    hasMore: boolean;
  };
}

// ============================================================
// EXTENDED TYPES (with relations)
// ============================================================

// Agent with minimal info (for embedding in other objects)
export type AgentPreview = Pick<Agent, 'id' | 'name' | 'avatarUrl' | 'isVerified'>;

// Post with author info
export interface PostWithAgent extends Post {
  agent: AgentPreview;
}

// Post with full details
export interface PostWithDetails extends PostWithAgent {
  channel?: Pick<Channel, 'id' | 'name' | 'displayName'>;
  comments?: CommentWithAgent[];
  userVote?: 'up' | 'down' | null;
}

// Comment with author info
export interface CommentWithAgent extends Comment {
  agent: AgentPreview;
}

// Comment with replies (threaded)
export interface CommentWithReplies extends CommentWithAgent {
  replies: CommentWithReplies[];
  userVote?: 'up' | 'down' | null;
}

// Agent profile with stats
export interface AgentProfile extends Omit<Agent, 'apiKey' | 'apiKeyHash' | 'claimCode'> {
  postCount: number;
  followerCount: number;
  followingCount: number;
  isFollowing?: boolean;
}

// Channel with stats
export interface ChannelWithDetails extends Channel {
  owner?: AgentPreview;
  isSubscribed?: boolean;
  recentPosts?: PostWithAgent[];
}

// Message with sender/recipient info
export interface MessageWithAgents extends Message {
  sender: AgentPreview;
  recipient: AgentPreview;
}

// Conversation (grouped messages)
export interface Conversation {
  agent: AgentPreview;
  lastMessage: Message;
  unreadCount: number;
}

// ============================================================
// REQUEST TYPES
// ============================================================

export interface RegisterRequest {
  name: string;
  description?: string;
}

export interface CreatePostRequest {
  channel?: string;
  title: string;
  content: string;
  url?: string;
}

export interface CreateCommentRequest {
  content: string;
  parentId?: string;
}

export interface CreateChannelRequest {
  name: string;
  displayName?: string;
  description?: string;
}

export interface SendMessageRequest {
  to: string;
  content: string;
}

export interface HeartbeatRequest {
  status?: string;
  metadata?: Record<string, unknown>;
}

export interface SearchRequest {
  q: string;
  type?: 'posts' | 'comments' | 'all';
  channel?: string;
  limit?: number;
  offset?: number;
}

// ============================================================
// FEED TYPES
// ============================================================

export type FeedSort = 'hot' | 'new' | 'top' | 'rising';

export interface FeedParams {
  sort?: FeedSort;
  channel?: string;
  limit?: number;
  offset?: number;
}

// ============================================================
// AUTH TYPES
// ============================================================

export interface AuthenticatedAgent {
  id: string;
  name: string;
  isVerified: boolean;
}

// ============================================================
// VOTE TYPES
// ============================================================

export type VoteType = 'up' | 'down';

export interface VoteResult {
  upvotes: number;
  userVote: VoteType | null;
}

// ============================================================
// HUMAN PORTAL TYPES
// ============================================================

export * from './human';
export * from './lab';

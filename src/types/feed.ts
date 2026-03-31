export interface FeedPost {
  id: string;
  author: string;
  title: string;
  excerpt: string;
  createdAt: string;
  type: 'post' | 'comment' | 'upvote';
}

export interface FeedRealtimeResponse {
  posts: FeedPost[];
  lastUpdated: string;
}

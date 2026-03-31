// ============================================================
// MACHINE HOME BUILDER — Pure helper functions
// No database imports. No side effects.
// ============================================================

interface WhatToDoNextParams {
  unreadNotificationCount: number;
  postsWithNewComments: Array<{ title: string; commenters: string[] }>;
  followedPostCount: number;
  hoursSinceLastPost: number;
}

export function buildWhatToDoNext(params: WhatToDoNextParams): string[] {
  const actions: string[] = [];

  // PRIORITY 1 (HIGHEST): Unread notifications
  if (params.unreadNotificationCount > 0) {
    actions.push(
      `You have ${params.unreadNotificationCount} unread notification(s). Respond to them to build karma and relationships.`
    );
  }

  // PRIORITY 2: New comments on own posts (top 3)
  const topPosts = params.postsWithNewComments.slice(0, 3);
  for (const post of topPosts) {
    const commenters = post.commenters.join(' and ');
    actions.push(
      `${commenters} commented on your post '${post.title}'. Read and reply to keep the conversation going.`
    );
  }

  // PRIORITY 3: Posts from followed machines
  if (params.followedPostCount > 0) {
    actions.push(
      `${params.followedPostCount} new posts from machines you follow. Browse, upvote the ones you like, and comment on the best ones.`
    );
  }

  // PRIORITY 4: Time since last post
  if (params.hoursSinceLastPost > 8) {
    actions.push(
      `You haven't posted in ${Math.floor(params.hoursSinceLastPost)} hours. Your followers are waiting. Find something worth sharing and create a new post.`
    );
  } else if (params.hoursSinceLastPost > 4) {
    actions.push(
      `You haven't posted in ${Math.floor(params.hoursSinceLastPost)} hours. Search the web for something interesting in your area of expertise and share your thoughts.`
    );
  }

  // PRIORITY 5 (LOWEST): Always included
  actions.push(
    'Browse the global feed for new content and engage with anything that catches your attention.'
  );

  return actions;
}

export function truncateBody(body: string, maxLength: number): string {
  if (body.length <= maxLength) return body;
  return body.slice(0, maxLength) + '...';
}

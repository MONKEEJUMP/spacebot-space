import { agents, db } from '@/db';
import {
  machinePosts,
  machineComments,
  machineFollows,
  machineNotifications,
} from '@/db/machine-social';
import { eq, and, desc, sql, count, isNull, gt } from 'drizzle-orm';
import { buildWhatToDoNext, truncateBody } from './machine-home-builder';

// ============================================================
// TYPES
// ============================================================

interface AccountInfo {
  id: string;
  name: string;
  karma: number;
  follower_count: number;
  following_count: number;
  unread_notification_count: number;
}

interface NotificationItem {
  id: string;
  type: string;
  title: string;
  body: string;
  link: string;
  created_at: string;
}

interface PostActivity {
  post_id: string;
  post_title: string;
  new_comment_count: number;
  latest_commenters: string[];
}

interface FollowedPost {
  id: string;
  title: string;
  author_name: string;
  score: number;
  comment_count: number;
  created_at: string;
}

export interface HomeDashboard {
  your_account: AccountInfo;
  unread_notifications: NotificationItem[];
  activity_on_your_posts: PostActivity[];
  posts_from_followed_machines: {
    count: number;
    posts: FollowedPost[];
  };
  what_to_do_next: string[];
}

// ============================================================
// PUBLIC API
// ============================================================

export async function getHomeDashboard(
  agentId: string,
  botName: string
): Promise<HomeDashboard> {
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const followJoinCondition = and(
    eq(machinePosts.authorId, machineFollows.followedId),
    eq(machineFollows.followerId, agentId)
  );

  // Execute all 7 queries in parallel for sub-500ms response time
  const [
    botConfigResult,
    unreadCountResult,
    notificationRows,
    recentCommentRows,
    followedCountResult,
    followedPostRows,
    lastPostRows,
  ] = await Promise.all([
    // QUERY A1: Bot config (karma, follower_count, following_count)
    db.execute(
      sql`
        SELECT config.karma, config.follower_count, config.following_count
        FROM bot_configs AS config
        INNER JOIN agents AS agent ON agent.id = config.agent_id
        WHERE agent.id = ${agentId}
        LIMIT 1
      `
    ),

    // QUERY A2: Unread notification count
    db
      .select({ count: count() })
      .from(machineNotifications)
      .where(
        and(
          eq(machineNotifications.recipientId, agentId),
          eq(machineNotifications.isRead, false)
        )
      ),

    // QUERY B: Unread notifications (5 most recent)
    db
      .select({
        id: machineNotifications.id,
        type: machineNotifications.type,
        title: machineNotifications.title,
        body: machineNotifications.body,
        link: machineNotifications.link,
        createdAt: machineNotifications.createdAt,
      })
      .from(machineNotifications)
      .where(
        and(
          eq(machineNotifications.recipientId, agentId),
          eq(machineNotifications.isRead, false)
        )
      )
      .orderBy(desc(machineNotifications.createdAt))
      .limit(5),

    // QUERY C: Comments on own posts in last 24 hours
    db
      .select({
        postId: machineComments.postId,
        postTitle: machinePosts.title,
        commenterName: agents.name,
      })
      .from(machineComments)
      .innerJoin(machinePosts, eq(machineComments.postId, machinePosts.id))
      .leftJoin(agents, eq(agents.id, machineComments.authorId))
      .where(
        and(
          eq(machinePosts.authorId, agentId),
          isNull(machinePosts.deletedAt),
          isNull(machineComments.deletedAt),
          gt(machineComments.createdAt, twentyFourHoursAgo)
        )
      )
      .orderBy(desc(machineComments.createdAt)),

    // QUERY D1: Count of followed posts in last 24 hours
    db
      .select({ count: count() })
      .from(machinePosts)
      .innerJoin(machineFollows, followJoinCondition)
      .where(
        and(
          isNull(machinePosts.deletedAt),
          gt(machinePosts.createdAt, twentyFourHoursAgo)
        )
      ),

    // QUERY D2: Top 10 followed posts in last 24 hours
    db
      .select({
        id: machinePosts.id,
        title: machinePosts.title,
        authorName: agents.name,
        score: machinePosts.score,
        commentCount: machinePosts.commentCount,
        createdAt: machinePosts.createdAt,
      })
      .from(machinePosts)
      .innerJoin(machineFollows, followJoinCondition)
      .leftJoin(agents, eq(agents.id, machinePosts.authorId))
      .where(
        and(
          isNull(machinePosts.deletedAt),
          gt(machinePosts.createdAt, twentyFourHoursAgo)
        )
      )
      .orderBy(desc(machinePosts.createdAt))
      .limit(10),

    // QUERY E: Last post timestamp
    db
      .select({ createdAt: machinePosts.createdAt })
      .from(machinePosts)
      .where(
        and(
          eq(machinePosts.authorId, agentId),
          isNull(machinePosts.deletedAt)
        )
      )
      .orderBy(desc(machinePosts.createdAt))
      .limit(1),
  ]);

  // Process bot config (raw SQL result)
  const botConfig = (botConfigResult as unknown as Array<{
    karma: number;
    follower_count: number;
    following_count: number;
  }>)[0];

  const unreadNotificationCount = unreadCountResult[0].count;

  // Process notifications
  const unreadNotifications: NotificationItem[] = notificationRows.map((row) => ({
    id: row.id,
    type: row.type,
    title: row.title,
    body: truncateBody(row.body || '', 100),
    link: row.link || '',
    created_at: row.createdAt.toISOString(),
  }));

  // Process activity on own posts — aggregate comments by post
  const postActivityMap = new Map<
    string,
    { postId: string; postTitle: string; commenters: Set<string>; commentCount: number }
  >();

  for (const row of recentCommentRows) {
    const existing = postActivityMap.get(row.postId);
    if (existing) {
      existing.commentCount++;
      if (row.commenterName) existing.commenters.add(row.commenterName);
    } else {
      postActivityMap.set(row.postId, {
        postId: row.postId,
        postTitle: row.postTitle,
        commenters: new Set(row.commenterName ? [row.commenterName] : []),
        commentCount: 1,
      });
    }
  }

  const activityOnPosts: PostActivity[] = Array.from(postActivityMap.values())
    .sort((a, b) => b.commentCount - a.commentCount)
    .slice(0, 5)
    .map((item) => ({
      post_id: item.postId,
      post_title: item.postTitle,
      new_comment_count: item.commentCount,
      latest_commenters: Array.from(item.commenters).slice(0, 3),
    }));

  // Process followed posts
  const followedPostCount = followedCountResult[0].count;

  const followedPosts: FollowedPost[] = followedPostRows.map((row) => ({
    id: row.id,
    title: row.title,
    author_name: row.authorName || 'Unknown',
    score: row.score,
    comment_count: row.commentCount,
    created_at: row.createdAt.toISOString(),
  }));

  // Calculate hours since last post
  const hoursSinceLastPost = lastPostRows[0]
    ? (Date.now() - lastPostRows[0].createdAt.getTime()) / (1000 * 60 * 60)
    : 999;

  // Build what_to_do_next
  const whatToDoNext = buildWhatToDoNext({
    unreadNotificationCount,
    postsWithNewComments: activityOnPosts.map((p) => ({
      title: p.post_title,
      commenters: p.latest_commenters,
    })),
    followedPostCount,
    hoursSinceLastPost,
  });

  return {
    your_account: {
      id: agentId,
      name: botName,
      karma: botConfig?.karma ?? 0,
      follower_count: botConfig?.follower_count ?? 0,
      following_count: botConfig?.following_count ?? 0,
      unread_notification_count: unreadNotificationCount,
    },
    unread_notifications: unreadNotifications,
    activity_on_your_posts: activityOnPosts,
    posts_from_followed_machines: {
      count: followedPostCount,
      posts: followedPosts,
    },
    what_to_do_next: whatToDoNext,
  };
}

/**
 * Comment likes mutations (LUCY audit Item 42).
 *
 * Exposes like/unlike mutations used by useLikeUnlikeComments.
 * Created to resolve TS2307 — the hook imported this module but the file
 * did not exist. The mutationFn bodies are wired to /api/v1/comments/:id/like.
 */
import { useMutation, useQueryClient, type QueryKey } from '@tanstack/react-query';

interface CommentLikeVariables {
  commentId: number;
}

async function postLike({ commentId }: CommentLikeVariables): Promise<{ success: boolean }> {
  const res = await fetch(`/api/v1/comments/${commentId}/like`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) {
    throw new Error(`Failed to like comment ${commentId}`);
  }
  return res.json() as Promise<{ success: boolean }>;
}

async function deleteLike({ commentId }: CommentLikeVariables): Promise<{ success: boolean }> {
  const res = await fetch(`/api/v1/comments/${commentId}/like`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) {
    throw new Error(`Failed to unlike comment ${commentId}`);
  }
  return res.json() as Promise<{ success: boolean }>;
}

export function useCommentLikesMutations({ queryKey }: { queryKey: QueryKey }) {
  const queryClient = useQueryClient();

  const likeCommentMutation = useMutation({
    mutationFn: postLike,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
    },
  });

  const unLikeCommentMutation = useMutation({
    mutationFn: deleteLike,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
    },
  });

  return { likeCommentMutation, unLikeCommentMutation };
}

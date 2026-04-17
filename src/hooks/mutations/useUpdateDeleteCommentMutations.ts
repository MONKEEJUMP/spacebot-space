/**
 * Comment update/delete mutations (LUCY audit Item 42).
 *
 * Exposes update/delete mutations used by useUpdateDeleteComments.
 * Created to resolve TS2307 — the hook imported this module but the file
 * did not exist. The mutationFn bodies are wired to /api/v1/comments/:id.
 */
import { useMutation, useQueryClient, type QueryKey } from '@tanstack/react-query';

interface UpdateCommentVariables {
  commentId: number;
  content: string;
}

interface DeleteCommentVariables {
  commentId: number;
}

async function putComment({ commentId, content }: UpdateCommentVariables): Promise<{ success: boolean }> {
  const res = await fetch(`/api/v1/comments/${commentId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  });
  if (!res.ok) {
    throw new Error(`Failed to update comment ${commentId}`);
  }
  return res.json() as Promise<{ success: boolean }>;
}

async function deleteComment({ commentId }: DeleteCommentVariables): Promise<{ success: boolean }> {
  const res = await fetch(`/api/v1/comments/${commentId}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) {
    throw new Error(`Failed to delete comment ${commentId}`);
  }
  return res.json() as Promise<{ success: boolean }>;
}

export function useUpdateDeleteCommentMutations({ queryKey }: { queryKey: QueryKey }) {
  const queryClient = useQueryClient();

  const updateCommentMutation = useMutation({
    mutationFn: putComment,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
    },
  });

  const deleteCommentMutation = useMutation({
    mutationFn: deleteComment,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
    },
  });

  return { updateCommentMutation, deleteCommentMutation };
}

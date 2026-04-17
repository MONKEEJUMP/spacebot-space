/**
 * Shared type for Top8 entries — used by Top8Grid and Top8EditModal.
 * LUCY Engine — Space Bot Engineering.
 *
 * Consolidates the previously divergent local Top8Entry interfaces
 * in Top8Grid and Top8EditModal into a single source of truth.
 * The shape matches the API contract returned by
 * `/api/v1/humans/:username/top8`.
 */

/**
 * A single Top8 entry — one of up to 8 favorites on a profile.
 *
 * `avatarConfig` is intentionally typed as `unknown` at the shared
 * boundary because it is stored as opaque JSON in the database.
 * Consumers narrow it locally (for example, Top8Grid.tsx maps it to
 * `CustomAvatarConfig` via `mapToCustomConfig`).
 *
 * `imageUrl` is optional because Top8EditModal does not carry that
 * field when building new selections; Top8Grid supplies it from the
 * API fetch for display.
 */
export interface Top8Entry {
  displayOrder: number;
  friendType: 'human' | 'bot';
  friendId: string;
  name: string;
  username: string | null;
  avatarConfig: unknown;
  accentColor: string | null;
  imageUrl?: string | null;
}

export const HUMHUB_API_URL = process.env.HUMHUB_API_URL || 'http://localhost/api/v1';
export const HUMHUB_BEARER_TOKEN = process.env.HUMHUB_BEARER_TOKEN || '';

export const UPLOADS_BASE = process.env.UPLOADS_BASE || '/var/www/spacebot.space/uploads';
export const GALLERY_BASE = process.env.GALLERY_BASE || '/var/www/spacebot.space/uploads/bot_gallery';
export const PROFILE_IMAGE_BASE = process.env.PROFILE_IMAGE_BASE || '/var/www/spacebot.space/uploads/profile_image';
export const GALLERY_LIMIT = 20;

export async function resolveUser(username: string): Promise<{ id: number; guid: string } | null> {
  const res = await fetch(`${HUMHUB_API_URL}/user?per-page=100`, {
    headers: { 'Authorization': `Bearer ${HUMHUB_BEARER_TOKEN}` },
  });

  if (!res.ok) {
    console.error(`[AVATAR] Failed to fetch HumHub users: ${res.status}`);
    return null;
  }

  const data = await res.json();
  const users = data.results || data || [];

  const match = users.find((u: any) => {
    const uname = u.account?.username || u.username || '';
    return uname.toLowerCase() === username.toLowerCase();
  });

  if (!match) return null;

  return { id: match.id, guid: match.guid };
}

export async function pushToHumHub(userId: number, base64DataUri: string): Promise<boolean> {
  const res = await fetch(`${HUMHUB_API_URL}/user/${userId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${HUMHUB_BEARER_TOKEN}`,
    },
    body: JSON.stringify({
      account: {},
      profile: {
        image: base64DataUri,
      },
    }),
  });

  if (res.ok) {
    console.log(`[AVATAR] Pushed avatar to HumHub user ${userId}`);
    return true;
  }

  const errText = await res.text();
  console.error(`[AVATAR] HumHub push failed for user ${userId}:`, res.status, errText);
  return false;
}

export function getGalleryPath(guid: string): string {
  const l1 = guid.substring(0, 2);
  const l2 = guid.substring(2, 4);
  return `${l1}/${l2}/${guid}`;
}

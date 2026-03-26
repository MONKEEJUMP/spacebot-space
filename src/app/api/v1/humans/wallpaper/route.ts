import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { humans, humanProfiles } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { supabaseAdmin } from '@/lib/supabase';

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const MAX_SIZE = 5 * 1024 * 1024;

const EXT_MAP: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
};

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.userId) {
    return NextResponse.json(
      { success: false, error: 'Authentication required.' },
      { status: 401 }
    );
  }

  const [human] = await db
    .select({ id: humans.id })
    .from(humans)
    .where(eq(humans.clerkId, session.userId))
    .limit(1);

  if (!human) {
    return NextResponse.json(
      { success: false, error: 'No linked profile found.' },
      { status: 404 }
    );
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      { success: false, error: 'Invalid form data.' },
      { status: 400 }
    );
  }

  const file = formData.get('file') as File | null;
  if (!file) {
    return NextResponse.json(
      { success: false, error: 'No file provided.' },
      { status: 400 }
    );
  }

  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json(
      { success: false, error: 'Invalid file type. Use JPEG, PNG, GIF, or WebP.' },
      { status: 400 }
    );
  }

  if (file.size > MAX_SIZE) {
    return NextResponse.json(
      { success: false, error: 'File too large. Maximum 5MB.' },
      { status: 400 }
    );
  }

  const [currentProfile] = await db
    .select({ wallpaperUrl: humanProfiles.wallpaperUrl })
    .from(humanProfiles)
    .where(eq(humanProfiles.humanId, human.id))
    .limit(1);

  if (currentProfile?.wallpaperUrl) {
    const match = currentProfile.wallpaperUrl.match(/\/wallpapers\/(.+)$/);
    if (match) {
      await supabaseAdmin.storage.from('wallpapers').remove([match[1]]);
    }
  }

  const ext = EXT_MAP[file.type] || 'jpg';
  const filename = `${session.userId}-${Date.now()}.${ext}`;

  const buffer = Buffer.from(await file.arrayBuffer());
  const { error: uploadError } = await supabaseAdmin.storage
    .from('wallpapers')
    .upload(filename, buffer, {
      contentType: file.type,
      upsert: false,
    });

  if (uploadError) {
    console.error('[WALLPAPER] Upload error:', uploadError);
    return NextResponse.json(
      { success: false, error: 'Upload failed. Please try again.' },
      { status: 500 }
    );
  }

  const { data: urlData } = supabaseAdmin.storage
    .from('wallpapers')
    .getPublicUrl(filename);

  const publicUrl = urlData.publicUrl;

  const existingProfile = await db
    .select({ id: humanProfiles.id })
    .from(humanProfiles)
    .where(eq(humanProfiles.humanId, human.id))
    .limit(1);

  if (existingProfile.length) {
    await db
      .update(humanProfiles)
      .set({ wallpaperUrl: publicUrl, updatedAt: new Date() })
      .where(eq(humanProfiles.humanId, human.id));
  } else {
    await db.insert(humanProfiles).values({
      humanId: human.id,
      wallpaperUrl: publicUrl,
    });
  }

  return NextResponse.json({ success: true, url: publicUrl });
}

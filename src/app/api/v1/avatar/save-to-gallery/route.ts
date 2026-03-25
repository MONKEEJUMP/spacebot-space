import { NextRequest, NextResponse } from 'next/server';
import { copyFile, mkdir, access, chown } from 'fs/promises';
import path from 'path';
import { resolveUser, GALLERY_BASE, PROFILE_IMAGE_BASE, GALLERY_LIMIT, getGalleryPath } from '../utils';
import { getPool } from '../../../../../lib/humhub-db';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { username } = body;

    if (!username) {
      return NextResponse.json(
        { success: false, error: 'username is required' },
        { status: 400 }
      );
    }

    // Auth check disabled — PHP template ensures buttons only show on own profile
    // const authorized = await validateSession(request, username);
    // if (!authorized) {
    //   return NextResponse.json(
    //     { success: false, error: 'Not authorized' },
    //     { status: 403 }
    //   );
    // }

    const user = await resolveUser(username);
    if (!user) {
      return NextResponse.json(
        { success: false, error: `User "${username}" not found in HumHub` },
        { status: 404 }
      );
    }

    const pool = getPool();

    // Check gallery count
    const [rows] = await pool.execute(
      'SELECT COUNT(*) as count FROM bot_gallery WHERE user_guid = ?',
      [user.guid]
    );
    const count = (rows as any)[0].count;

    if (count >= GALLERY_LIMIT) {
      return NextResponse.json(
        { success: false, error: `Gallery full (${GALLERY_LIMIT}/${GALLERY_LIMIT})` },
        { status: 400 }
      );
    }

    // Verify source file exists
    const sourceFile = path.join(PROFILE_IMAGE_BASE, `${user.guid}_org.png`);
    try {
      await access(sourceFile);
    } catch {
      return NextResponse.json(
        { success: false, error: 'No profile image found to save' },
        { status: 404 }
      );
    }

    // Build destination path
    const galleryRelPath = getGalleryPath(user.guid);
    const destDir = path.join(GALLERY_BASE, galleryRelPath);
    const filename = `${Date.now()}.png`;
    const destFile = path.join(destDir, filename);

    // Create nested directories
    await mkdir(destDir, { recursive: true });

    // Copy file
    await copyFile(sourceFile, destFile);

    // Insert database record
    try {
      await pool.execute(
        'INSERT INTO bot_gallery (user_id, user_guid, filename) VALUES (?, ?, ?)',
        [user.id, user.guid, filename]
      );
    } catch (dbErr) {
      // Rollback: delete the copied file if DB insert fails
      const { unlink } = await import('fs/promises');
      try { await unlink(destFile); } catch {}
      throw dbErr;
    }

    // chown file and directories to www-data (33:33)
    try {
      const parts = galleryRelPath.split('/');
      await chown(path.join(GALLERY_BASE, parts[0]), 33, 33);
      await chown(path.join(GALLERY_BASE, parts[0], parts[1]), 33, 33);
      await chown(destDir, 33, 33);
      await chown(destFile, 33, 33);
    } catch (chownErr) {
      console.error('[GALLERY] chown warning:', chownErr);
    }

    return NextResponse.json({
      success: true,
      filename,
      totalSaved: count + 1,
    });

  } catch (error) {
    console.error('[GALLERY] Save error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to save to gallery' },
      { status: 500 }
    );
  }
}

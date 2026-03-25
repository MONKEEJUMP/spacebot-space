import { NextRequest, NextResponse } from 'next/server';
import { stat, unlink } from 'fs/promises';
import path from 'path';
import { resolveUser, GALLERY_BASE, getGalleryPath } from '../utils';
import { getPool } from '../../../../../lib/humhub-db';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { username, filename } = body;

    if (!username || !filename) {
      return NextResponse.json(
        { success: false, error: 'username and filename are required' },
        { status: 400 }
      );
    }

    // Sanitize filename: must be digits + .png only
    if (!/^\d+\.png$/.test(filename)) {
      return NextResponse.json(
        { success: false, error: 'Invalid filename' },
        { status: 400 }
      );
    }

    const user = await resolveUser(username);
    if (!user) {
      return NextResponse.json(
        { success: false, error: `User "${username}" not found in HumHub` },
        { status: 404 }
      );
    }

    // Build full path to gallery file
    const galleryRelPath = getGalleryPath(user.guid);
    const filePath = path.join(GALLERY_BASE, galleryRelPath, filename);

    // Verify file exists
    try {
      await stat(filePath);
    } catch {
      return NextResponse.json(
        { success: false, error: 'File not found in gallery' },
        { status: 404 }
      );
    }

    // Delete from database
    const pool = getPool();
    await pool.execute(
      'DELETE FROM bot_gallery WHERE user_guid = ? AND filename = ?',
      [user.guid, filename]
    );

    // Delete file from disk
    await unlink(filePath);

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('[GALLERY] Delete error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete from gallery' },
      { status: 500 }
    );
  }
}

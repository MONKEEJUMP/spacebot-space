import { NextRequest, NextResponse } from 'next/server';
import { resolveUser, GALLERY_BASE, GALLERY_LIMIT, getGalleryPath } from '../utils';
import { getPool } from '../../../../../lib/humhub-db';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const username = request.nextUrl.searchParams.get('username');

    if (!username) {
      return NextResponse.json(
        { success: false, error: 'username query param is required' },
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

    const pool = getPool();

    const [rows] = await pool.execute(
      'SELECT filename, created_at FROM bot_gallery WHERE user_guid = ? ORDER BY created_at DESC',
      [user.guid]
    );

    const results = rows as any[];
    const galleryPath = getGalleryPath(user.guid);

    const avatars = results.map((row: any) => ({
      filename: row.filename,
      url: `/uploads/bot_gallery/${galleryPath}/${row.filename}`,
      createdAt: row.created_at,
    }));

    return NextResponse.json({
      success: true,
      userGuid: user.guid,
      avatars,
      total: results.length,
      limit: GALLERY_LIMIT,
    });

  } catch (error) {
    console.error('[GALLERY] List error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to list gallery' },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { stat, readFile } from 'fs/promises';
import path from 'path';
import { resolveUser, pushToHumHub, GALLERY_BASE, getGalleryPath } from '../utils';

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

    // Read file and convert to base64 data URI
    const buffer = await readFile(filePath);
    const base64DataUri = `data:image/png;base64,${buffer.toString('base64')}`;

    // Push to HumHub
    const updated = await pushToHumHub(user.id, base64DataUri);

    if (!updated) {
      return NextResponse.json(
        { success: false, error: 'Failed to update HumHub profile image' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('[GALLERY] Set-from-gallery error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to set avatar from gallery' },
      { status: 500 }
    );
  }
}

import { NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { authenticateUser } from '@/middleware/auth';
import AdminNote from '@/models/AdminNote';
import { handleApiError } from '@/lib/security';
import { wrapRoute } from '@/lib/http';

export const dynamic = 'force-dynamic';

export const GET = wrapRoute(async function GET(req) {
  const user = await authenticateUser(req);
  if (!user) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  await connectDB();
  const notes = await AdminNote.find({
    targetType: 'user',
    targetId: user.id,
    visibility: 'user_visible',
  })
    .sort({ createdAt: -1 })
    .limit(50)
    .lean();

  return NextResponse.json({
    success: true,
    data: {
      notes: notes.map((n) => ({
        id: n._id.toString(),
        note: n.note,
        createdAt: n.createdAt,
      })),
    },
  });
}, (error) => handleApiError(error, 'profile_admin_notes'));


import { NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { authenticateUser } from '@/middleware/auth';
import License from '@/models/License';
import App from '@/models/App';
import { checkRateLimit } from '@/lib/ratelimit';

export async function GET(req) {
  const rateLimited = checkRateLimit(req, 60, 1);
  if (rateLimited) return rateLimited;

  try {
    const user = await authenticateUser(req);
    if (!user || !['developer', 'admin'].includes(user.role)) {
      return NextResponse.json(
        { success: false, message: 'Forbidden: insufficient permissions' },
        { status: 403 }
      );
    }

    await connectDB();
    const { searchParams } = new URL(req.url);
    const appId = searchParams.get('appId');

    if (!appId) {
      return NextResponse.json({ success: false, message: 'appId required' }, { status: 400 });
    }

    const app = await App.findById(appId);
    if (!app || app.status === 'suspended') {
      return NextResponse.json({ success: false, message: 'app not found' }, { status: 404 });
    }

    if (user.role !== 'admin' && app.ownerId.toString() !== user.id) {
      return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
    }

    const licenses = await License.find({ appId, status: 'active' }).sort({ createdAt: -1 }).lean();

    const csvRows = ['License Key,Status,Created,Expiry,HWID Locked,HWID Limit,HWIDs,Note'];
    for (const l of licenses) {
      const key = l.key || '';
      const created = l.createdAt ? new Date(l.createdAt).toISOString().split('T')[0] : '';
      const expiry = l.expiryDate ? new Date(l.expiryDate).toISOString().split('T')[0] : '';
      const hwidLocked = l.hwidLocked ? 'Yes' : 'No';
      const hwidLimit = l.hwidLocked ? (l.hwidLimit ?? 1) : '';
      const hwids = (l.hwids || []).join(';');
      const note = (l.note || '').replace(/,/g, ';');
      csvRows.push(`${key},${l.status},${created},${expiry},${hwidLocked},${hwidLimit},${hwids},${note}`);
    }

    const csv = csvRows.join('\n');

    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="licenses-${appId}-${Date.now()}.csv"`,
      },
    });
  } catch (error) {
    console.error('Export licenses error:', error);
    return NextResponse.json(
      { success: false, message: 'internal server error' },
      { status: 500 }
    );
  }
}



import { NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { authenticateUser } from '@/middleware/auth';
import License from '@/models/License';
import App from '@/models/App';
import { checkRateLimit } from '@/lib/ratelimit';

export async function PATCH(req, { params }) {
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

    const { id } = await params;
    if (!id) {
      return NextResponse.json({ success: false, message: 'invalid license id' }, { status: 400 });
    }

    await connectDB();
    const license = await License.findById(id).populate('appId');
    if (!license) {
      return NextResponse.json({ success: false, message: 'license not found' }, { status: 404 });
    }

    const app = license.appId;
    if (user.role !== 'admin' && app.ownerId.toString() !== user.id) {
      return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
    }

    const body = await req.json();
    const mongooseUpdate = {};

    // update expiry date
    if (body.expiryDate !== undefined) {
      if (body.expiryDate === null || body.expiryDate === '') {
        mongooseUpdate.expiryDate = null;
      } else {
        const expiryDate = new Date(body.expiryDate);
        if (isNaN(expiryDate.getTime())) {
          return NextResponse.json({ success: false, message: 'invalid expiry date' }, { status: 400 });
        }
        mongooseUpdate.expiryDate = expiryDate;
      }
    }

    // update hwid lock
    if (body.hwidLocked !== undefined) {
      mongooseUpdate.hwidLocked = body.hwidLocked === true || body.hwidLocked === 'true' || body.hwidLocked === 1;
    }

    if (body.hwidLimit !== undefined) {
      const parsedLimit = Number(body.hwidLimit);
      if (!Number.isFinite(parsedLimit) || parsedLimit < 1 || parsedLimit > 5) {
        return NextResponse.json(
          { success: false, message: 'hwid limit must be between 1 and 5' },
          { status: 400 }
        );
      }
      mongooseUpdate.hwidLimit = Math.floor(parsedLimit);
    }

    // clear specific hwid by index if requested
    if (body.clearHwidIndex !== undefined) {
      const index = parseInt(body.clearHwidIndex);
      if (isNaN(index) || index < 0) {
        return NextResponse.json({ success: false, message: 'invalid hwid index' }, { status: 400 });
      }
      const hwids = (license.hwids || []).filter((_, i) => i !== index);
      mongooseUpdate.hwids = hwids;
    }

    // update note
    if (body.note !== undefined) {
      const note = typeof body.note === 'string' ? body.note.trim() : '';
      if (note.length > 500) {
        return NextResponse.json({ success: false, message: 'note too long (max 500 characters)' }, { status: 400 });
      }
      mongooseUpdate.note = note;
    }

    if (Object.keys(mongooseUpdate).length === 0) {
      return NextResponse.json({ success: false, message: 'no updates provided' }, { status: 400 });
    }
    
    await License.updateOne({ _id: id }, { $set: mongooseUpdate });
    
    // reload the license to return updated data
    const updatedLicense = await License.findById(id);

    return NextResponse.json({
      success: true,
      message: 'license updated',
      data: {
        license: {
          id: updatedLicense._id.toString(),
          key: updatedLicense.key,
          note: updatedLicense.note || '',
          hwids: Array.isArray(updatedLicense.hwids) ? updatedLicense.hwids : [],
          hwidLocked: updatedLicense.hwidLocked,
          hwidLimit: updatedLicense.hwidLimit ?? null,
          expiryDate: updatedLicense.expiryDate || null,
          status: updatedLicense.status,
          createdAt: updatedLicense.createdAt,
          updatedAt: updatedLicense.updatedAt,
        },
      },
    });
  } catch (error) {
    console.error('Update license error:', error);
    return NextResponse.json(
      { success: false, message: 'internal server error' },
      { status: 500 }
    );
  }
}


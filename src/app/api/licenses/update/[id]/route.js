import { NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { authenticateUser } from '@/middleware/auth';
import License from '@/models/License';
import App from '@/models/App';
import { checkRateLimit } from '@/lib/ratelimit';
import { getLicenseRateLimit } from '@/lib/ratelimit';
import { hasAppAccess } from '@/lib/authz';
import { sanitizeObjectId, sanitizeForDb } from '@/lib/security';
import { handleApiError } from '@/lib/security';
import { fail, wrapRoute } from '@/lib/http';

export const PATCH = wrapRoute(async function PATCH(req, { params }) {
  const rateLimited = checkRateLimit(req, getLicenseRateLimit('update'));
  if (rateLimited) return rateLimited;
  const user = await authenticateUser(req);
  if (!user || !['developer', 'admin'].includes(user.role)) {
    return fail('Forbidden: insufficient permissions', 403);
  }

    const { id } = await params;
    const licenseId = id ? sanitizeObjectId(id) : null;
    if (!licenseId) {
      return fail('invalid license id', 400);
    }

    await connectDB();
    const license = await License.findById(licenseId).populate('appId');
    if (!license) {
      return fail('license not found', 404);
    }

    const app = license.appId;
    const hasAccess = hasAppAccess(app, user);
    if (!hasAccess) {
      return fail('Forbidden', 403);
    }

    const isAdmin = user.role === 'admin';
    const isOwner = app.ownerId?.toString() === user.id;
    const isCollaborator = Array.isArray(user.developerApps)
      ? user.developerApps.some((appRef) => appRef?.toString() === app._id.toString())
      : false;

    if (!isAdmin && !isOwner && !isCollaborator) {
      return fail('Forbidden', 403);
    }

    const body = await req.json();
    const mongooseUpdate = {};

    if (body.status !== undefined) {
      const s = String(body.status).toLowerCase();
      if (s === 'suspended' || s === 'active') {
        mongooseUpdate.status = s;
      } else {
        return fail('invalid status', 400);
      }
    }

    // update expiry date
    if (body.expiryDate !== undefined) {
      if (body.expiryDate === null || body.expiryDate === '') {
        mongooseUpdate.expiryDate = null;
      } else {
        const expiryDate = new Date(body.expiryDate);
        if (isNaN(expiryDate.getTime())) {
          return fail('invalid expiry date', 400);
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
        return fail('hwid limit must be between 1 and 5', 400);
      }
      mongooseUpdate.hwidLimit = Math.floor(parsedLimit);
    }

    // clear specific hwid by index if requested
    if (body.clearHwidIndex !== undefined) {
      const index = parseInt(body.clearHwidIndex);
      if (isNaN(index) || index < 0) {
        return fail('invalid hwid index', 400);
      }
      const hwids = (license.hwids || []).filter((_, i) => i !== index);
      mongooseUpdate.hwids = hwids;
    }

    // update note
    if (body.note !== undefined) {
      const rawNote = typeof body.note === 'string' ? body.note.trim() : '';
      const note = sanitizeForDb(rawNote, 500);
      mongooseUpdate.note = note ?? '';
    }

    if (Object.keys(mongooseUpdate).length === 0) {
      return fail('no updates provided', 400);
    }
    
    await License.updateOne({ _id: licenseId }, { $set: mongooseUpdate });
    
    // reload the license to return updated data
    const updatedLicense = await License.findById(licenseId);

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
}, (error) => handleApiError(error, 'licenses_update'));


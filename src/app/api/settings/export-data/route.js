import { NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { authenticateUser } from '@/middleware/auth';
import { checkRateLimit } from '@/lib/ratelimit';
import { getAuthRateLimit } from '@/config/ratelimits';
import User from '@/models/User';
import App from '@/models/App';
import License from '@/models/License';
import AppInvite from '@/models/AppInvite';
import SecurityLog from '@/models/SecurityLog';
import { logSecurityEvent, getClientIp, getUserAgent } from '@/lib/security-logger';
import { handleApiError } from '@/lib/errors';

export async function GET(req) {
  const rateLimitResponse = checkRateLimit(req, { limit: 3, windowMinutes: 60 });
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const user = await authenticateUser(req);
    if (!user) {
      return NextResponse.json(
        { success: false, message: 'Unauthorized' },
        { status: 401 }
      );
    }

    await connectDB();

    // fetch all user data
    const userDoc = await User.findById(user.id).lean();
    const apps = await App.find({ ownerId: user.id }).lean();
    const licenses = await License.find({ createdBy: user.id }).lean();
    const invitesCreated = await AppInvite.find({ createdBy: user.id }).lean();
    const invitesRedeemed = await AppInvite.find({ redeemedBy: user.id }).lean();
    const securityLogs = await SecurityLog.find({ userId: user.id }).sort({ createdAt: -1 }).limit(100).lean();

    // prepare export data (exclude sensitive fields)
    const exportData = {
      exportDate: new Date().toISOString(),
      user: {
        id: userDoc._id.toString(),
        username: userDoc.username,
        email: userDoc.email,
        role: userDoc.role,
        plan: userDoc.plan,
        createdAt: userDoc.createdAt,
        preferences: userDoc.preferences || {},
      },
      apps: apps.map((app) => ({
        id: app._id.toString(),
        name: app.name,
        description: app.description,
        status: app.status,
        createdAt: app.createdAt,
      })),
      licenses: licenses.map((license) => ({
        id: license._id.toString(),
        key: license.key,
        note: license.note,
        status: license.status,
        expiresAt: license.expiresAt,
        hwidLocked: license.hwidLocked,
        hwidLimit: license.hwidLimit,
        createdAt: license.createdAt,
      })),
      invitesCreated: invitesCreated.map((invite) => ({
        id: invite._id.toString(),
        code: invite.code,
        targetRole: invite.targetRole,
        status: invite.status,
        expiresAt: invite.expiresAt,
        createdAt: invite.createdAt,
      })),
      invitesRedeemed: invitesRedeemed.map((invite) => ({
        id: invite._id.toString(),
        code: invite.code,
        targetRole: invite.targetRole,
        status: invite.status,
        redeemedAt: invite.redeemedAt,
      })),
      securityLogs: securityLogs.map((log) => ({
        event: log.event,
        ip: log.ip,
        userAgent: log.userAgent,
        timestamp: log.createdAt,
      })),
    };

    // log export event
    await SecurityLog.create({
      userId: user.id,
      event: 'data_export',
      ip: getClientIp(req),
      userAgent: getUserAgent(req),
      details: { timestamp: new Date().toISOString() },
    });

    logSecurityEvent('data_export', {
      userId: user.id,
      ip: getClientIp(req),
    }).catch(() => {});

    return NextResponse.json({
      success: true,
      data: exportData,
    });
  } catch (error) {
    return handleApiError(error, 'export_data');
  }
}


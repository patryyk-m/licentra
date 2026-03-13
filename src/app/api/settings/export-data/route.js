import { connectDB } from '@/lib/db';
import { checkRateLimit, getAuthRateLimit } from '@/lib/ratelimit';
import User from '@/models/User';
import App from '@/models/App';
import License from '@/models/License';
import AppInvite from '@/models/AppInvite';
import SecurityLog from '@/models/SecurityLog';
import { logSecurityEvent, SECURITY_EVENTS, getClientIp, getUserAgent } from '@/lib/security';
import { handleApiError } from '@/lib/security';
import { ok, withAuth, withStepUp, wrapRoute } from '@/lib/http';

const getHandler = withAuth(
  withStepUp(async (req, user) => {
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

    logSecurityEvent(SECURITY_EVENTS.DATA_EXPORT, {
      userId: user.id,
      ip: getClientIp(req),
      userAgent: getUserAgent(req),
    }).catch(() => {});

    return ok({
      success: true,
      data: exportData,
    });
  }, { stepUpMessage: 'step-up required', stepUpStatus: 403 }),
  { unauthorizedMessage: 'Unauthorized' }
);

const isExportRateLimitBypassed = () =>
  ['true', '1', 'yes'].includes(String(process.env.RATE_LIMIT_DISABLED || '').toLowerCase());

export const GET = wrapRoute(async function GET(req) {
  if (!isExportRateLimitBypassed()) {
    const rateLimitResponse = checkRateLimit(req, getAuthRateLimit('exportData'));
    if (rateLimitResponse) return rateLimitResponse;
  }

  return await getHandler(req);
}, (error) => handleApiError(error, 'export_data'));


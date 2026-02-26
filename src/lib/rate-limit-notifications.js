import RateLimitEvent from '../models/RateLimitEvent';
import RateLimitAggregate from '../models/RateLimitAggregate';
import Notification from '../models/Notification';
import App from '../models/App';
import License from '../models/License';

const WINDOW_MS = 10 * 60 * 1000;
const COOLDOWN_MS = 30 * 60 * 1000;

const MASK_IP = (ip) => {
  if (!ip || ip === 'unknown') return '***';
  const parts = ip.split('.');
  if (parts.length === 4) return `${parts[0]}.***.***.${parts[3]}`;
  return ip.slice(0, 4) + '***';
};

export async function recordRateLimitEvent(appId, licenseId, ip) {
  try {
    await RateLimitEvent.create({ appId, licenseId, ip });
  } catch (e) {
    console.error('recordRateLimitEvent failed:', e);
  }
}

export async function checkAndCreateNotification(appId, licenseId) {
  try {
    const windowStart = new Date(Date.now() - WINDOW_MS);
    const events = await RateLimitEvent.find({
      appId,
      licenseId,
      createdAt: { $gte: windowStart },
    })
      .sort({ createdAt: 1 })
      .lean();

    const rateLimitedCount = events.length;
    const ips = events.map((e) => e.ip);
    const uniqueIpCount = new Set(ips).size;

    const ipCounts = {};
    ips.forEach((ip) => {
      ipCounts[ip] = (ipCounts[ip] || 0) + 1;
    });
    const topIps = Object.entries(ipCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([ip, count]) => ({ ip: MASK_IP(ip), count }));

    const firstSeenAt = events.length ? events[0].createdAt : new Date();
    const lastSeenAt = events.length ? events[events.length - 1].createdAt : new Date();

    const thresholdA = rateLimitedCount >= 50;
    const thresholdB = uniqueIpCount >= 10;
    const thresholdC = rateLimitedCount >= 20 && uniqueIpCount >= 5;

    if (!thresholdA && !thresholdB && !thresholdC) return;

    const app = await App.findById(appId).select('ownerId name autoSuspendOnRateLimitAbuse').lean();
    if (!app?.ownerId) return;

    if (app.autoSuspendOnRateLimitAbuse) {
      await License.updateOne({ _id: licenseId, status: 'active' }, { $set: { status: 'suspended' } });
    }

    const license = await License.findById(licenseId).select('key').lean();
    const licenseKey = license?.key ? `${license.key.slice(0, 8)}...` : 'unknown';

    const agg = await RateLimitAggregate.findOne({ appId, licenseId }).lean();
    const lastNotified = agg?.lastNotifiedAt ? new Date(agg.lastNotifiedAt).getTime() : 0;
    const now = Date.now();
    if (now - lastNotified < COOLDOWN_MS) {
      const existing = await Notification.findOne({
        appId,
        licenseId,
        type: 'rate_limit',
        isRead: false,
      })
        .sort({ updatedAt: -1 })
        .lean();
      if (existing) {
        await Notification.findByIdAndUpdate(existing._id, {
          $set: {
            message: `${rateLimitedCount} rate-limited requests from ${uniqueIpCount} IPs in last 10 min`,
            severity: thresholdA || thresholdB ? 'critical' : 'warning',
            metadata: {
              ...existing.metadata,
              rateLimitedCount,
              uniqueIpCount,
              topIps,
              firstSeenAt,
              lastSeenAt,
              timeWindow: 'last 10 minutes',
            },
          },
        });
      }
      return;
    }

    let severity = 'warning';
    if (thresholdA || thresholdB) severity = 'critical';
    else if (thresholdC) severity = 'warning';

    const title = `Rate limit abuse: ${app.name} / ${licenseKey}`;
    const message = `${rateLimitedCount} rate-limited requests from ${uniqueIpCount} IPs in last 10 min`;

    await Notification.create({
      userId: app.ownerId,
      type: 'rate_limit',
      title,
      message,
      severity,
      appId,
      licenseId,
      metadata: {
        rateLimitedCount,
        uniqueIpCount,
        topIps,
        firstSeenAt,
        lastSeenAt,
        timeWindow: 'last 10 minutes',
        actions: {
          viewLicense: true,
          lockLicense: true,
          reduceLimit: true,
        },
      },
    });

    await RateLimitAggregate.findOneAndUpdate(
      { appId, licenseId },
      { $set: { lastNotifiedAt: new Date() } },
      { upsert: true }
    );
  } catch (e) {
    console.error('checkAndCreateNotification failed:', e);
  }
}

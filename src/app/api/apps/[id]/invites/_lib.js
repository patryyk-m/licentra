import AppInvite from '@/models/AppInvite';

const INVITE_RETENTION_DAYS = Number(process.env.INVITE_RETENTION_DAYS || 45);

export async function cleanupAppInvites(appId) {
  const now = new Date();
  const expireFilter = {
    status: 'active',
    expiresAt: { $ne: null, $lt: now },
  };

  if (appId) {
    expireFilter.appId = appId;
  }

  await AppInvite.updateMany(expireFilter, { status: 'expired' });

  if (!Number.isFinite(INVITE_RETENTION_DAYS) || INVITE_RETENTION_DAYS <= 0) {
    return;
  }

  const retentionCutoff = new Date(now.getTime() - INVITE_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const pruneFilter = {
    status: 'expired',
    updatedAt: { $lt: retentionCutoff },
  };

  if (appId) {
    pruneFilter.appId = appId;
  }

  await AppInvite.deleteMany(pruneFilter);
}

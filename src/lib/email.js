import { Resend } from 'resend';
import { getSafeAppBaseUrl } from '@/lib/security';
import RateLimitEvent from '../models/RateLimitEvent';
import RateLimitAggregate from '../models/RateLimitAggregate';
import Notification from '../models/Notification';
import App from '../models/App';
import License from '../models/License';

// initialize resend client
const resend = new Resend(process.env.RESEND_API_KEY);

// email sender address
const FROM_EMAIL = process.env.MAIL_FROM || 'no-reply@system.licentra.dev';

// base url for links
const APP_URL = getSafeAppBaseUrl();
const WINDOW_MS = 10 * 60 * 1000;

const MASK_IP = (ip) => {
  if (!ip || ip === 'unknown') return '***';
  const parts = ip.split('.');
  if (parts.length === 4) return `${parts[0]}.***.***.${parts[3]}`;
  return ip.slice(0, 4) + '***';
};

/**
 * send email using resend
 * @param {Object} params - email parameters
 * @param {string} params.to - recipient email address
 * @param {string} params.subject - email subject
 * @param {string} params.html - html email content
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function sendEmail({ to, subject, html }) {
  // validate required fields
  if (!to || !subject || !html) {
    console.error('[email] missing required fields:', { to, subject, hasHtml: !!html });
    return { success: false, error: 'missing required fields' };
  }

  // validate api key
  if (!process.env.RESEND_API_KEY) {
    console.error('[email] RESEND_API_KEY not configured');
    return { success: false, error: 'email service not configured' };
  }

  try {
    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to,
      subject,
      html,
    });

    if (error) {
      console.error('[email] resend error:', error);
      return { success: false, error: error.message || 'failed to send email' };
    }

    if (process.env.NODE_ENV !== 'production') {
      console.log('[email] sent successfully:', { subject, id: data?.id });
    }
    return { success: true, id: data?.id };
  } catch (error) {
    console.error('[email] unexpected error:', error);
    return { success: false, error: error.message || 'unexpected email error' };
  }
}

/**
 * send welcome email after registration
 * @param {string} email - user email
 * @param {string} username - username
 * @returns {Promise<{success: boolean}>}
 */
export async function sendWelcomeEmail(email, username) {
  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Welcome to Licentra</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td style="padding: 40px 20px; text-align: center;">
        <table role="presentation" style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
          <tr>
            <td style="padding: 40px 30px;">
              <h1 style="margin: 0 0 20px 0; color: #1a1a1a; font-size: 24px; font-weight: 600;">Welcome to Licentra</h1>
              <p style="margin: 0 0 20px 0; color: #666666; font-size: 16px; line-height: 1.5;">Hi ${username},</p>
              <p style="margin: 0 0 20px 0; color: #666666; font-size: 16px; line-height: 1.5;">Thank you for signing up! Your account has been created successfully.</p>
              <p style="margin: 0 0 30px 0; color: #666666; font-size: 16px; line-height: 1.5;">You can now start managing your license keys and applications.</p>
              <table role="presentation" style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="text-align: center;">
                    <a href="${APP_URL}/dashboard" style="display: inline-block; padding: 12px 24px; background-color: #2563eb; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 500; font-size: 16px;">Go to Dashboard</a>
                  </td>
                </tr>
              </table>
              <p style="margin: 30px 0 0 0; color: #999999; font-size: 14px; line-height: 1.5;">If you have any questions, feel free to reach out to our support team.</p>
            </td>
          </tr>
        </table>
        <p style="margin: 20px 0 0 0; color: #999999; font-size: 12px; text-align: center;">© ${new Date().getFullYear()} Licentra. All rights reserved.</p>
      </td>
    </tr>
  </table>
</body>
</html>
  `;

  return await sendEmail({
    to: email,
    subject: 'Welcome to Licentra',
    html,
  });
}

/**
 * notify plan owner when monthly validation usage reaches warning threshold
 */
export async function sendPlanQuotaWarningEmail({
  to,
  username,
  appName,
  appId,
  currentMonthUsage,
  monthlyQuota,
}) {
  const pct = monthlyQuota > 0 ? Math.round((currentMonthUsage / monthlyQuota) * 100) : 0;
  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /></head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f5f5f5;">
  <table role="presentation" style="width:100%;border-collapse:collapse;">
    <tr><td style="padding:40px 20px;text-align:center;">
      <table role="presentation" style="max-width:600px;margin:0 auto;background:#fff;border-radius:8px;">
        <tr><td style="padding:40px 30px;">
          <h1 style="margin:0 0 16px;color:#1a1a1a;font-size:22px;">Plan quota warning</h1>
          <p style="margin:0 0 12px;color:#666;font-size:16px;line-height:1.5;">Hi ${String(username || 'there').replace(/</g, '&lt;')},</p>
          <p style="margin:0 0 12px;color:#666;font-size:16px;line-height:1.5;">
            Your app <strong>${String(appName || 'App').replace(/</g, '&lt;')}</strong> has used <strong>${currentMonthUsage}</strong> of <strong>${monthlyQuota}</strong> monthly validations this period (${pct}%).
          </p>
          <p style="margin:0 0 12px;color:#666;font-size:16px;line-height:1.5;">
            When the quota is reached, validation may be blocked until the next billing period. Consider upgrading your plan or reducing usage.
          </p>
          <p style="margin:16px 0 0;color:#999;font-size:13px;">App ID: <code>${String(appId || '').replace(/</g, '&lt;')}</code></p>
          <p style="margin:16px 0 0;"><a href="${APP_URL}/billing" style="display:inline-block;padding:12px 24px;background:#2563eb;color:#fff;text-decoration:none;border-radius:6px;font-weight:500;">View billing</a></p>
        </td></tr>
      </table>
      <p style="margin:20px 0 0;color:#999;font-size:12px;">© ${new Date().getFullYear()} Licentra</p>
    </td></tr>
  </table>
</body>
</html>`;

  return sendEmail({
    to,
    subject: 'Licentra: approaching monthly validation quota',
    html,
  });
}

/**
 * send forgot password email with reset link
 * @param {string} email - user email
 * @param {string} resetToken - password reset token
 * @returns {Promise<{success: boolean}>}
 */
export async function sendForgotPasswordEmail(email, resetToken) {
  const resetUrl = `${APP_URL}/reset-password?token=${resetToken}`;
  
  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reset Your Password</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td style="padding: 40px 20px; text-align: center;">
        <table role="presentation" style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
          <tr>
            <td style="padding: 40px 30px;">
              <h1 style="margin: 0 0 20px 0; color: #1a1a1a; font-size: 24px; font-weight: 600;">Reset Your Password</h1>
              <p style="margin: 0 0 20px 0; color: #666666; font-size: 16px; line-height: 1.5;">We received a request to reset your password for your Licentra account.</p>
              <p style="margin: 0 0 20px 0; color: #666666; font-size: 16px; line-height: 1.5;">Click the button below to reset your password. This link will expire in 1 hour.</p>
              <table role="presentation" style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="text-align: center;">
                    <a href="${resetUrl}" style="display: inline-block; padding: 12px 24px; background-color: #2563eb; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 500; font-size: 16px;">Reset Password</a>
                  </td>
                </tr>
              </table>
              <p style="margin: 30px 0 0 0; color: #999999; font-size: 14px; line-height: 1.5;">If you didn't request this, you can safely ignore this email. Your password will not be changed.</p>
              <p style="margin: 10px 0 0 0; color: #999999; font-size: 12px; line-height: 1.5;">Or copy and paste this link into your browser:</p>
              <p style="margin: 5px 0 0 0; color: #2563eb; font-size: 12px; word-break: break-all;">${resetUrl}</p>
            </td>
          </tr>
        </table>
        <p style="margin: 20px 0 0 0; color: #999999; font-size: 12px; text-align: center;">© ${new Date().getFullYear()} Licentra. All rights reserved.</p>
      </td>
    </tr>
  </table>
</body>
</html>
  `;

  return await sendEmail({
    to: email,
    subject: 'Reset Your Licentra Password',
    html,
  });
}

/**
 * send password reset confirmation email
 * @param {string} email - user email
 * @returns {Promise<{success: boolean}>}
 */
export async function sendPasswordResetConfirmationEmail(email) {
  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Password Reset Successful</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td style="padding: 40px 20px; text-align: center;">
        <table role="presentation" style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
          <tr>
            <td style="padding: 40px 30px;">
              <h1 style="margin: 0 0 20px 0; color: #1a1a1a; font-size: 24px; font-weight: 600;">Password Reset Successful</h1>
              <p style="margin: 0 0 20px 0; color: #666666; font-size: 16px; line-height: 1.5;">Your password has been successfully reset.</p>
              <p style="margin: 0 0 20px 0; color: #666666; font-size: 16px; line-height: 1.5;">If you did not make this change, please contact our support team immediately.</p>
              <table role="presentation" style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="text-align: center;">
                    <a href="${APP_URL}/login" style="display: inline-block; padding: 12px 24px; background-color: #2563eb; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 500; font-size: 16px;">Sign In</a>
                  </td>
                </tr>
              </table>
              <p style="margin: 30px 0 0 0; color: #999999; font-size: 14px; line-height: 1.5;">For security reasons, all active sessions have been invalidated. You'll need to sign in again.</p>
            </td>
          </tr>
        </table>
        <p style="margin: 20px 0 0 0; color: #999999; font-size: 12px; text-align: center;">© ${new Date().getFullYear()} Licentra. All rights reserved.</p>
      </td>
    </tr>
  </table>
</body>
</html>
  `;

  return await sendEmail({
    to: email,
    subject: 'Password Reset Successful',
    html,
  });
}

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
    if (rateLimitedCount === 0) return;

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

    const firstSeenAt = events[0].createdAt;
    const lastSeenAt = events[events.length - 1].createdAt;
    const shouldSuspend = rateLimitedCount >= 50;

    const app = await App.findById(appId).select('ownerId name autoSuspendOnRateLimitAbuse').lean();
    if (!app?.ownerId) return;

    if (shouldSuspend && app.autoSuspendOnRateLimitAbuse) {
      await License.updateOne({ _id: licenseId, status: 'active' }, { $set: { status: 'suspended' } });
    }

    const license = await License.findById(licenseId).select('key').lean();
    const licenseKey = license?.key ? `${license.key.slice(0, 8)}...` : 'unknown';

    let severity = 'warning';
    if (rateLimitedCount >= 50) severity = 'critical';

    const title = `Rate limit abuse: ${app.name} / ${licenseKey}`;
    const message = `${rateLimitedCount} blocked (429) requests from ${uniqueIpCount} IP${uniqueIpCount > 1 ? 's' : ''} in last 10 min${shouldSuspend ? ' — license auto-suspended' : ''}`;

    const existing = await Notification.findOne({
      appId,
      licenseId,
      type: 'rate_limit',
      isRead: false,
    })
      .sort({ updatedAt: -1 })
      .lean();

    const metadata = {
      rateLimitedCount,
      uniqueIpCount,
      topIps,
      firstSeenAt,
      lastSeenAt,
      timeWindow: 'last 10 minutes',
      actions: { viewLicense: true, lockLicense: true, reduceLimit: true },
    };

    if (existing) {
      await Notification.findByIdAndUpdate(existing._id, {
        $set: { message, severity, metadata },
      });
    } else {
      await Notification.create({
        userId: app.ownerId,
        type: 'rate_limit',
        title,
        message,
        severity,
        appId,
        licenseId,
        metadata,
      });
    }

    if (shouldSuspend) {
      await RateLimitAggregate.findOneAndUpdate(
        { appId, licenseId },
        { $set: { lastNotifiedAt: new Date() } },
        { upsert: true }
      );
    }
  } catch (e) {
    console.error('checkAndCreateNotification failed:', e);
  }
}


const nodemailer = require('nodemailer');
const { query } = require('../config/database');
const logger = require('../utils/logger');

let transporter = null;

/**
 * Initialize the email transporter
 */
function getTransporter() {
  if (transporter) return transporter;

  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    logger.warn('Email credentials not configured - email alerts disabled');
    return null;
  }

  transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.EMAIL_PORT || '587', 10),
    secure: false,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
    tls: {
      rejectUnauthorized: process.env.NODE_ENV === 'production',
    },
  });

  return transporter;
}

/**
 * Generate HTML email content for a signal alert
 */
function generateSignalEmailHtml(signal, dashboardUrl) {
  const sectorColors = {
    defense: '#1e3a5f',
    healthcare: '#1a5276',
    energy: '#1e8449',
  };

  const scoreBar = (score) => {
    const filled = Math.round(score);
    return '█'.repeat(filled) + '░'.repeat(10 - filled);
  };

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Monument Markets Signal Alert</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f8f9fa; margin: 0; padding: 0;">
  <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
    <!-- Header -->
    <div style="background: #0f172a; padding: 24px 32px; border-radius: 8px 8px 0 0;">
      <h1 style="color: #fff; margin: 0; font-size: 20px; font-weight: 700; letter-spacing: -0.5px;">
        Monument Markets
      </h1>
      <p style="color: #94a3b8; margin: 4px 0 0; font-size: 13px;">Policy Intelligence Platform</p>
    </div>

    <!-- Signal Card -->
    <div style="background: #fff; padding: 32px; border-left: 4px solid ${sectorColors[signal.sector] || '#64748b'}; border-radius: 0 0 8px 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
      <div style="display: flex; align-items: center; margin-bottom: 16px;">
        <span style="background: ${sectorColors[signal.sector] || '#64748b'}; color: #fff; padding: 3px 10px; border-radius: 20px; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">
          ${signal.sector.toUpperCase()}
        </span>
        <span style="color: #94a3b8; font-size: 12px; margin-left: 12px;">
          ${new Date(signal.created_at).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}
        </span>
      </div>

      <h2 style="color: #0f172a; margin: 0 0 12px; font-size: 18px; font-weight: 600; line-height: 1.4;">
        ${signal.title}
      </h2>

      <p style="color: #475569; margin: 0 0 20px; font-size: 14px; line-height: 1.6;">
        ${signal.description.substring(0, 300)}${signal.description.length > 300 ? '...' : ''}
      </p>

      <!-- Scores -->
      <div style="background: #f8fafc; border-radius: 6px; padding: 16px; margin-bottom: 20px;">
        <h3 style="color: #374151; margin: 0 0 12px; font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">Signal Scores</h3>
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="padding: 4px 0; color: #64748b; font-size: 13px; width: 120px;">Confidence</td>
            <td style="padding: 4px 0; font-family: monospace; color: #0f172a; font-size: 12px;">${scoreBar(signal.confidence)}</td>
            <td style="padding: 4px 0; color: #0f172a; font-size: 13px; font-weight: 600; text-align: right; width: 40px;">${signal.confidence}/10</td>
          </tr>
          <tr>
            <td style="padding: 4px 0; color: #64748b; font-size: 13px;">Materiality</td>
            <td style="padding: 4px 0; font-family: monospace; color: #0f172a; font-size: 12px;">${scoreBar(signal.materiality)}</td>
            <td style="padding: 4px 0; color: #0f172a; font-size: 13px; font-weight: 600; text-align: right;">${signal.materiality}/10</td>
          </tr>
          <tr>
            <td style="padding: 4px 0; color: #64748b; font-size: 13px;">Urgency</td>
            <td style="padding: 4px 0; font-family: monospace; color: #0f172a; font-size: 12px;">${scoreBar(signal.urgency)}</td>
            <td style="padding: 4px 0; color: #0f172a; font-size: 13px; font-weight: 600; text-align: right;">${signal.urgency}/10</td>
          </tr>
        </table>
      </div>

      <!-- Affected Companies -->
      <div style="margin-bottom: 20px;">
        <h3 style="color: #374151; margin: 0 0 8px; font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">Affected Companies</h3>
        <div>
          ${signal.affected_companies.map((c) => `<span style="background: #e2e8f0; color: #334155; padding: 3px 8px; border-radius: 4px; font-size: 12px; margin: 2px; display: inline-block;">${c}</span>`).join('')}
        </div>
      </div>

      <!-- Source & CTA -->
      <div style="border-top: 1px solid #e2e8f0; padding-top: 16px; display: flex; justify-content: space-between; align-items: center;">
        <span style="color: #94a3b8; font-size: 12px;">Source: ${signal.source.toUpperCase()}</span>
        <a href="${dashboardUrl || 'https://monumentmarkets.com'}" style="background: #0f172a; color: #fff; padding: 8px 16px; border-radius: 6px; text-decoration: none; font-size: 13px; font-weight: 500;">
          View Full Signal →
        </a>
      </div>
    </div>

    <!-- Footer -->
    <p style="text-align: center; color: #94a3b8; font-size: 11px; margin-top: 16px;">
      Monument Markets · Policy Intelligence for Institutional Investors<br>
      <a href="${dashboardUrl}/unsubscribe" style="color: #94a3b8;">Manage Alert Preferences</a>
    </p>
  </div>
</body>
</html>
  `.trim();
}

/**
 * Send a signal alert email to a subscriber
 */
async function sendSignalAlert(recipientEmail, signal) {
  const transport = getTransporter();
  if (!transport) return false;

  const dashboardUrl = process.env.FRONTEND_URL || 'http://localhost:5173';

  try {
    const info = await transport.sendMail({
      from: process.env.EMAIL_FROM || `Monument Markets <${process.env.EMAIL_USER}>`,
      to: recipientEmail,
      subject: `[${signal.sector.toUpperCase()}] New Policy Signal: ${signal.title.substring(0, 60)}`,
      html: generateSignalEmailHtml(signal, dashboardUrl),
      text: `New ${signal.sector} signal: ${signal.title}\n\n${signal.description}\n\nAffected companies: ${signal.affected_companies.join(', ')}\n\nConfidence: ${signal.confidence}/10 | Materiality: ${signal.materiality}/10 | Urgency: ${signal.urgency}/10\n\nView at: ${dashboardUrl}`,
    });

    logger.info('Signal alert email sent', {
      to: recipientEmail,
      signal: signal.id,
      messageId: info.messageId,
    });
    return true;
  } catch (err) {
    logger.error('Failed to send signal alert email', {
      to: recipientEmail,
      signal: signal.id,
      error: err.message,
    });
    return false;
  }
}

/**
 * Find subscribers who should receive alerts for a given signal and send emails
 */
async function notifySubscribersForSignal(signal) {
  try {
    // Find all active alert subscriptions that match this signal's sector or companies
    const { rows: subscriptions } = await query(
      `SELECT ea.*, u.email
       FROM email_alerts ea
       JOIN users u ON ea.user_id = u.id
       WHERE ea.is_active = TRUE
         AND (
           ea.sectors @> $1::jsonb
           OR EXISTS (
             SELECT 1 FROM jsonb_array_elements_text(ea.companies) AS c
             WHERE c = ANY($2::text[])
           )
           OR (jsonb_array_length(ea.sectors) = 0 AND jsonb_array_length(ea.companies) = 0)
         )`,
      [JSON.stringify([signal.sector]), signal.affected_companies]
    );

    if (subscriptions.length === 0) {
      logger.debug('No subscribers for signal', { signalId: signal.id, sector: signal.sector });
      return 0;
    }

    let sent = 0;
    for (const sub of subscriptions) {
      const success = await sendSignalAlert(sub.email, signal);
      if (success) sent++;
    }

    logger.info(`Notified ${sent}/${subscriptions.length} subscribers for signal`, {
      signalId: signal.id,
      sector: signal.sector,
    });

    return sent;
  } catch (err) {
    logger.error('Error notifying subscribers', {
      signalId: signal.id,
      error: err.message,
    });
    return 0;
  }
}

module.exports = { sendSignalAlert, notifySubscribersForSignal };

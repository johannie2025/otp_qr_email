// ============================================================
// node_services/email/server.js — Email Service
// Port 3002 | Express + Nodemailer
// ============================================================

require('dotenv').config({ path: '../../.env' });
const express    = require('express');
const nodemailer = require('nodemailer');
const fs         = require('fs');
const path       = require('path');

const app  = express();
const PORT = process.env.EMAIL_SERVICE_PORT || 3002;
const API_KEY = process.env.NODE_API_KEY || 'CHANGE_NODE_API_KEY';

app.use(express.json());

// ── Auth Middleware ──────────────────────────────────────────
app.use((req, res, next) => {
  if (req.path === '/health') return next();
  const key = req.headers['x-api-key'];
  if (key !== API_KEY) return res.status(401).json({ error: 'Unauthorized' });
  next();
});

// ── Default transporter (env-based) ─────────────────────────
function createTransporter(config = null) {
  const cfg = config || {
    host:   process.env.SMTP_HOST || 'smtp.gmail.com',
    port:   parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  };
  return nodemailer.createTransport(cfg);
}

// ── OTP Email Template ────────────────────────────────────────
function otpEmailHtml({ to_name, otp_code, event_title, expires_min, brand_color = '#0066FF', brand_name = 'QR-CTRL', logo_url = '' }) {
  return `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Code OTP — ${brand_name}</title></head>
<body style="margin:0;padding:0;background:#f5f7fa;font-family:'Segoe UI',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f7fa;padding:40px 20px;">
  <tr><td align="center">
    <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
      <!-- Header -->
      <tr><td style="background:${brand_color};padding:32px 40px;text-align:center;">
        ${logo_url ? `<img src="${logo_url}" alt="${brand_name}" style="height:48px;margin-bottom:12px;display:block;margin:0 auto 12px;">` : ''}
        <h1 style="color:#fff;margin:0;font-size:24px;font-weight:700;letter-spacing:-0.5px;">${brand_name}</h1>
        <p style="color:rgba(255,255,255,0.8);margin:6px 0 0;font-size:14px;">Contrôle d'accès intelligent</p>
      </td></tr>
      <!-- Body -->
      <tr><td style="padding:40px;">
        <p style="color:#374151;font-size:16px;margin:0 0 8px;">Bonjour <strong>${to_name}</strong>,</p>
        <p style="color:#6b7280;font-size:15px;margin:0 0 32px;">Votre code de vérification pour <strong>${event_title}</strong> :</p>
        
        <!-- OTP Box -->
        <div style="text-align:center;margin:0 0 32px;">
          <div style="display:inline-block;background:#f8faff;border:2px solid ${brand_color};border-radius:12px;padding:20px 48px;">
            <span style="font-size:42px;font-weight:900;color:${brand_color};letter-spacing:12px;font-family:'Courier New',monospace;">${otp_code}</span>
          </div>
          <p style="color:#9ca3af;font-size:13px;margin:12px 0 0;">⏱ Expire dans <strong>${expires_min} minutes</strong></p>
        </div>

        <!-- Warning -->
        <div style="background:#fff7ed;border-left:4px solid #f97316;border-radius:8px;padding:16px;margin:0 0 24px;">
          <p style="margin:0;color:#92400e;font-size:13px;">
            <strong>⚠️ Important :</strong> Ne partagez jamais ce code. Il est strictement personnel et à usage unique.
            Toute tentative de réutilisation sera signalée comme fraude.
          </p>
        </div>

        <p style="color:#9ca3af;font-size:12px;text-align:center;margin:0;">
          Si vous n'avez pas demandé ce code, ignorez cet email.
        </p>
      </td></tr>
      <!-- Footer -->
      <tr><td style="background:#f9fafb;padding:20px 40px;text-align:center;border-top:1px solid #e5e7eb;">
        <p style="color:#9ca3af;font-size:12px;margin:0;">
          Propulsé par <strong style="color:${brand_color};">${brand_name}</strong> — Sécurité & Contrôle d'accès
        </p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
}

// ── QR Ticket Email Template ─────────────────────────────────
function qrTicketEmailHtml({ to_name, event_title, ticket_number, ticket_type, qr_url, event_date, brand_color = '#0066FF', brand_name = 'QR-CTRL' }) {
  return `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"><title>Votre Billet — ${brand_name}</title></head>
<body style="margin:0;padding:0;background:#f5f7fa;font-family:'Segoe UI',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f7fa;padding:40px 20px;">
  <tr><td align="center">
    <table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
      <tr><td style="background:${brand_color};padding:32px 40px;text-align:center;">
        <h1 style="color:#fff;margin:0;font-size:22px;">🎫 Votre Billet</h1>
        <p style="color:rgba(255,255,255,0.85);margin:8px 0 0;font-size:14px;">${event_title}</p>
      </td></tr>
      <tr><td style="padding:40px;">
        <p style="color:#374151;font-size:16px;margin:0 0 24px;">Bonjour <strong>${to_name}</strong>, votre inscription est confirmée !</p>
        
        <table width="100%" style="background:#f8faff;border-radius:12px;padding:24px;margin:0 0 24px;" cellpadding="0" cellspacing="0">
          <tr>
            <td width="60%" style="padding:8px 0;color:#6b7280;font-size:14px;">N° de billet</td>
            <td style="padding:8px 0;color:#111827;font-weight:700;font-family:monospace;font-size:14px;">${ticket_number}</td>
          </tr>
          <tr>
            <td style="padding:8px 0;color:#6b7280;font-size:14px;">Type</td>
            <td style="padding:8px 0;color:#111827;font-size:14px;">${ticket_type || 'Standard'}</td>
          </tr>
          ${event_date ? `<tr><td style="padding:8px 0;color:#6b7280;font-size:14px;">Date</td><td style="padding:8px 0;color:#111827;font-size:14px;">${event_date}</td></tr>` : ''}
        </table>

        ${qr_url ? `<div style="text-align:center;margin:0 0 24px;">
          <p style="color:#6b7280;font-size:14px;margin:0 0 16px;">Présentez ce QR code à l'entrée :</p>
          <img src="${qr_url}" alt="QR Code" style="width:200px;height:200px;border-radius:12px;border:2px solid #e5e7eb;">
        </div>` : ''}

        <div style="background:#ecfdf5;border-left:4px solid #10b981;border-radius:8px;padding:16px;">
          <p style="margin:0;color:#065f46;font-size:13px;">
            <strong>✅ Instructions :</strong> Présentez ce QR code + votre code OTP (envoyé à l'entrée) à l'agent pour accéder à l'événement.
          </p>
        </div>
      </td></tr>
      <tr><td style="background:#f9fafb;padding:20px 40px;text-align:center;border-top:1px solid #e5e7eb;">
        <p style="color:#9ca3af;font-size:12px;margin:0;">Propulsé par <strong style="color:${brand_color};">${brand_name}</strong></p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
}

// ── POST /send-otp ────────────────────────────────────────────
app.post('/send-otp', async (req, res) => {
  try {
    const { to_email, to_name, otp_code, event_title, expires_min, smtp_config, brand_color, brand_name, logo_url } = req.body;
    if (!to_email || !otp_code) return res.status(400).json({ error: 'to_email and otp_code required' });

    const transporter = createTransporter(smtp_config);
    const fromName    = brand_name || process.env.SMTP_FROM_NAME || 'QR-CTRL';
    const fromEmail   = process.env.SMTP_FROM_EMAIL;

    await transporter.sendMail({
      from:    `"${fromName}" <${fromEmail}>`,
      to:      `"${to_name}" <${to_email}>`,
      subject: `🔐 Code OTP — ${event_title}`,
      html:    otpEmailHtml({ to_name, otp_code, event_title, expires_min: expires_min || 10, brand_color, brand_name, logo_url }),
      text:    `Bonjour ${to_name},\n\nVotre code OTP pour ${event_title} : ${otp_code}\nExpire dans ${expires_min || 10} minutes.\n\nNe partagez pas ce code.`,
    });

    console.log(`[Email] OTP sent to ${to_email} for ${event_title}`);
    res.json({ success: true });

  } catch (err) {
    console.error('[Email] OTP send error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /send-ticket ─────────────────────────────────────────
app.post('/send-ticket', async (req, res) => {
  try {
    const payload = req.body;
    if (!payload.to_email) return res.status(400).json({ error: 'to_email required' });

    const transporter = createTransporter(payload.smtp_config);
    const fromName = payload.brand_name || process.env.SMTP_FROM_NAME || 'QR-CTRL';

    await transporter.sendMail({
      from:    `"${fromName}" <${process.env.SMTP_FROM_EMAIL}>`,
      to:      `"${payload.to_name}" <${payload.to_email}>`,
      subject: `🎫 Votre billet — ${payload.event_title}`,
      html:    qrTicketEmailHtml(payload),
    });

    console.log(`[Email] Ticket sent to ${payload.to_email}`);
    res.json({ success: true });

  } catch (err) {
    console.error('[Email] Ticket send error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /send-generic ────────────────────────────────────────
app.post('/send-generic', async (req, res) => {
  try {
    const { to_email, to_name, subject, body_html, body_text, smtp_config } = req.body;
    if (!to_email || !subject || !body_html) return res.status(400).json({ error: 'Missing required fields' });

    const transporter = createTransporter(smtp_config);
    await transporter.sendMail({
      from:    `"${process.env.SMTP_FROM_NAME}" <${process.env.SMTP_FROM_EMAIL}>`,
      to:      to_name ? `"${to_name}" <${to_email}>` : to_email,
      subject,
      html:    body_html,
      text:    body_text || '',
    });

    res.json({ success: true });
  } catch (err) {
    console.error('[Email] Generic send error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /health ───────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'email-sender', port: PORT });
});

app.listen(PORT, '127.0.0.1', () => {
  console.log(`[Email Service] Running on port ${PORT}`);
});

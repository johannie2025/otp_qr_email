// ============================================================
// VERIF Platform — Service unifié Node.js (port 3001)
// QR Code (qrcode) + Email (nodemailer)
// ============================================================

'use strict';

const http       = require('http');
const fs         = require('fs');
const path       = require('path');
const QRCode     = require('qrcode');
const nodemailer = require('nodemailer');

const PORT            = process.env.NODE_PORT    || 3001;
const INTERNAL_SECRET = process.env.NODE_SECRET  || 'internal_node_secret_change_me';
const OUTPUT_DIR      = process.env.QR_OUTPUT_DIR|| path.join(__dirname, '../../public/uploads/qr');
const QR_URL_BASE     = process.env.QR_URL_BASE  || 'http://localhost/uploads/qr';

const SMTP = {
  host:   process.env.SMTP_HOST   || 'smtp.gmail.com',
  port:   parseInt(process.env.SMTP_PORT || '587'),
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
  },
};

fs.mkdirSync(OUTPUT_DIR, { recursive: true });

// ── Helpers ──────────────────────────────────────────────────
const parseBody = req => new Promise((res, rej) => {
  let raw = '';
  req.on('data', c => { raw += c; if (raw.length > 128 * 1024) req.destroy(); });
  req.on('end',  () => { try { res(JSON.parse(raw || '{}')); } catch { rej(new Error('JSON invalide')); } });
  req.on('error', rej);
});

const json = (res, code, data) => {
  const body = JSON.stringify(data);
  res.writeHead(code, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) });
  res.end(body);
};

const ok  = (res, data)        => json(res, 200, { success: true,  ...data });
const err = (res, msg, code=400) => json(res, code, { success: false, error: msg });

const auth = req => req.headers['x-internal-secret'] === INTERNAL_SECRET;

// ── QR Generator ─────────────────────────────────────────────
async function generateQr(payload, token, size = 300) {
  const filename = `qr_${token.substring(0, 20)}_${Date.now()}.png`;
  const filepath  = path.join(OUTPUT_DIR, filename);
  await QRCode.toFile(filepath, payload, {
    errorCorrectionLevel: 'H',
    type: 'png',
    width: size,
    margin: 2,
    color: { dark: '#000000', light: '#FFFFFF' },
  });
  return { url: `${QR_URL_BASE}/${filename}`, filename };
}

// ── Email Templates ───────────────────────────────────────────
const brand = t => ({
  name:  (t?.name)          || 'VERIF Platform',
  color: (t?.primary_color) || '#00e5ff',
  logo:  (t?.logo_url)      || '',
  from:  (t?.email_from)    || SMTP.auth.user || 'noreply@verif.app',
});

function layout(t, content) {
  const b = brand(t);
  return `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>${b.name}</title></head>
<body style="margin:0;padding:0;background:#0a0a0f;font-family:'Segoe UI',Arial,sans-serif;">
<div style="max-width:560px;margin:0 auto;padding:32px 16px;">
  <div style="background:#0d0d14;border:1px solid rgba(255,255,255,.07);border-radius:16px 16px 0 0;padding:24px 32px;text-align:center;border-bottom:2px solid ${b.color};">
    ${b.logo
      ? `<img src="${b.logo}" alt="${b.name}" style="height:44px;margin-bottom:8px;"><br>`
      : `<div style="display:inline-block;background:linear-gradient(135deg,${b.color},#7c3aed);width:44px;height:44px;border-radius:12px;line-height:44px;font-size:1.4rem;margin-bottom:8px;">🔐</div><br>`}
    <span style="font-size:1.2rem;font-weight:800;color:#f0f0f8;">${b.name}</span>
  </div>
  <div style="background:#0d0d14;border:1px solid rgba(255,255,255,.07);border-top:none;border-bottom:none;padding:32px;">
    ${content}
  </div>
  <div style="background:#050508;border:1px solid rgba(255,255,255,.07);border-top:none;border-radius:0 0 16px 16px;padding:16px 32px;text-align:center;">
    <p style="color:rgba(240,240,248,.35);font-size:.75rem;margin:0;">Email automatique · © ${new Date().getFullYear()} ${b.name}</p>
  </div>
</div></body></html>`;
}

const templates = {
  ticket: d => ({
    subject: `🎫 Votre billet — ${d.event_name || brand(d.tenant).name}`,
    html: layout(d.tenant, `
      <h2 style="color:#f0f0f8;margin:0 0 8px;">🎫 Votre billet est prêt !</h2>
      <p style="color:rgba(240,240,248,.6);margin:0 0 24px;">Bonjour <strong style="color:#f0f0f8">${d.name}</strong>, voici votre accès pour <strong style="color:${brand(d.tenant).color}">${d.event_name}</strong>.</p>
      ${d.qr_url ? `<div style="text-align:center;background:#fff;border-radius:12px;padding:16px;margin-bottom:24px;">
        <img src="${d.qr_url}" alt="QR" style="width:200px;height:200px;">
        <p style="color:#333;font-size:.8rem;margin:8px 0 0;">Présentez ce QR Code à l'entrée</p></div>` : ''}
      ${d.otp ? `<div style="background:rgba(0,229,255,.08);border:1px solid rgba(0,229,255,.2);border-radius:12px;padding:20px;text-align:center;margin-bottom:24px;">
        <p style="color:rgba(240,240,248,.6);font-size:.85rem;margin:0 0 8px;">Code OTP (10 minutes)</p>
        <div style="font-family:monospace;font-size:2.5rem;font-weight:900;color:${brand(d.tenant).color};letter-spacing:.3em;">${d.otp}</div></div>` : ''}
      <div style="background:#050508;border:1px solid rgba(255,255,255,.05);border-radius:10px;padding:16px;margin-bottom:20px;">
        <p style="color:rgba(240,240,248,.5);font-size:.78rem;margin:0 0 4px;">Référence</p>
        <p style="color:#f0f0f8;font-family:monospace;font-size:.85rem;margin:0;word-break:break-all;">${d.token}</p>
      </div>
      <div style="background:rgba(245,158,11,.08);border:1px solid rgba(245,158,11,.2);border-radius:10px;padding:14px;">
        <p style="color:#f59e0b;font-size:.82rem;margin:0;">⚠️ Billet personnel non-transférable. Tout partage entraîne un blocage automatique.</p>
      </div>`),
  }),

  verify_email: d => ({
    subject: `✉️ Vérifiez votre email — ${brand(d.tenant).name}`,
    html: layout(d.tenant, `
      <h2 style="color:#f0f0f8;margin:0 0 8px;">✉️ Vérifiez votre email</h2>
      <p style="color:rgba(240,240,248,.6);margin:0 0 24px;">Bonjour <strong style="color:#f0f0f8">${d.name}</strong>, activez votre compte en un clic.</p>
      <div style="text-align:center;margin:32px 0;">
        <a href="${d.link}" style="display:inline-block;background:${brand(d.tenant).color};color:#000;font-weight:800;font-size:1rem;padding:14px 36px;border-radius:10px;text-decoration:none;">✅ Vérifier mon email</a>
      </div>
      <p style="color:rgba(240,240,248,.4);font-size:.8rem;text-align:center;">Lien valable 24h.</p>`),
  }),

  reset_password: d => ({
    subject: `🔑 Réinitialisation mot de passe — ${brand(d.tenant).name}`,
    html: layout(d.tenant, `
      <h2 style="color:#f0f0f8;margin:0 0 8px;">🔑 Réinitialisation</h2>
      <p style="color:rgba(240,240,248,.6);margin:0 0 24px;">Bonjour <strong style="color:#f0f0f8">${d.name}</strong>.</p>
      <div style="text-align:center;margin:32px 0;">
        <a href="${d.link}" style="display:inline-block;background:${brand(d.tenant).color};color:#000;font-weight:800;padding:14px 36px;border-radius:10px;text-decoration:none;">🔑 Réinitialiser</a>
      </div>
      <p style="color:rgba(240,240,248,.4);font-size:.8rem;text-align:center;">Lien valable 1h. Si vous n'êtes pas à l'origine de cette demande, ignorez cet email.</p>`),
  }),

  welcome: d => ({
    subject: `🎉 Bienvenue sur ${brand(d.tenant).name}`,
    html: layout(d.tenant, `
      <h2 style="color:#f0f0f8;margin:0 0 8px;">🎉 Bienvenue !</h2>
      <p style="color:rgba(240,240,248,.6);margin:0 0 24px;">Bonjour <strong style="color:#f0f0f8">${d.name}</strong>, votre compte a été créé.</p>
      <div style="background:#050508;border:1px solid rgba(255,255,255,.05);border-radius:10px;padding:20px;margin-bottom:24px;">
        <p style="color:rgba(240,240,248,.5);font-size:.8rem;margin:0 0 4px;">Mot de passe temporaire</p>
        <p style="font-family:monospace;font-size:1.3rem;font-weight:900;color:${brand(d.tenant).color};margin:0;">${d.password}</p>
        <p style="color:rgba(240,240,248,.4);font-size:.75rem;margin:8px 0 0;">⚠️ Changez-le dès la première connexion.</p>
      </div>
      <div style="text-align:center;">
        <a href="${d.login}" style="display:inline-block;background:${brand(d.tenant).color};color:#000;font-weight:800;padding:12px 32px;border-radius:10px;text-decoration:none;">Se connecter →</a>
      </div>`),
  }),

  official_doc: d => ({
    subject: `📄 Document sécurisé — ${d.doc_title || brand(d.tenant).name}`,
    html: layout(d.tenant, `
      <h2 style="color:#f0f0f8;margin:0 0 8px;">📄 Document officiel sécurisé</h2>
      <p style="color:rgba(240,240,248,.6);margin:0 0 24px;">Bonjour <strong style="color:#f0f0f8">${d.name}</strong>, votre <strong style="color:${brand(d.tenant).color}">${d.doc_type||'document'}</strong> est prêt.</p>
      <div style="background:rgba(16,185,129,.08);border:1px solid rgba(16,185,129,.2);border-radius:12px;padding:16px;margin-bottom:24px;">
        <p style="color:#10b981;font-size:.85rem;margin:0;">✅ Authentifié par signature QR — toute falsification est détectable.</p>
      </div>
      <div style="text-align:center;">
        <a href="${d.verify_url}" style="display:inline-block;background:${brand(d.tenant).color};color:#000;font-weight:800;padding:12px 32px;border-radius:10px;text-decoration:none;">🔍 Vérifier l'authenticité</a>
      </div>`),
  }),
};

// ── Transporter factory (par tenant ou défaut) ────────────────
const getTransport = t => nodemailer.createTransport(
  (t?.smtp_host) ? { host: t.smtp_host, port: t.smtp_port||587, secure: false, auth: { user: t.smtp_user, pass: t.smtp_pass_enc } }
                 : SMTP
);

// ── HTTP Server ───────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '127.0.0.1');
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
  if (!auth(req))               return err(res, 'Unauthorized', 401);

  const url = req.url.split('?')[0];

  try {
    const body = req.method === 'POST' ? await parseBody(req) : {};

    // ── POST /qr/generate ─────────────────────────────────────
    if (req.method === 'POST' && url === '/qr/generate') {
      const { payload, token, size } = body;
      if (!payload || !token) return err(res, 'payload + token requis');
      const result = await generateQr(payload, token, size || 300);
      console.log(`[QR] ${result.filename}`);
      return ok(res, result);
    }

    // ── POST /qr/batch ────────────────────────────────────────
    if (req.method === 'POST' && url === '/qr/batch') {
      const { tickets } = body;
      if (!Array.isArray(tickets) || !tickets.length) return err(res, 'tickets[] requis');
      const items = await Promise.all(tickets.map(t => generateQr(t.payload, t.token, t.size || 300)));
      return ok(res, { count: items.length, items: items.map((r, i) => ({ token: tickets[i].token, url: r.url })) });
    }

    // ── POST /mail/send ───────────────────────────────────────
    if (req.method === 'POST' && url === '/mail/send') {
      const { to, type, tenant } = body;
      if (!to || !type) return err(res, 'to + type requis');
      const tpl = templates[type];
      if (!tpl) return err(res, `Type inconnu: ${type}`);
      const { subject, html } = tpl(body);
      const b = brand(tenant);
      const info = await getTransport(tenant).sendMail({
        from: `"${b.name}" <${b.from}>`,
        to, subject, html,
      });
      console.log(`[Mail] [${type}] → ${to} (${info.messageId})`);
      return ok(res, { messageId: info.messageId });
    }

    // ── POST /qr-and-mail (combo atomique) ───────────────────
    // Génère QR + envoie email en une seule requête depuis PHP
    if (req.method === 'POST' && url === '/qr-and-mail') {
      const { payload, token, size, to, type, tenant } = body;
      if (!payload || !token) return err(res, 'payload + token requis');

      // 1. QR
      const qrResult = await generateQr(payload, token, size || 300);
      console.log(`[QR] ${qrResult.filename}`);

      // 2. Email (si adresse fournie)
      let mailResult = null;
      if (to && type && templates[type]) {
        const enriched = { ...body, qr_url: qrResult.url };
        const { subject, html } = templates[type](enriched);
        const b = brand(tenant);
        const info = await getTransport(tenant).sendMail({
          from: `"${b.name}" <${b.from}>`,
          to, subject, html,
        });
        mailResult = info.messageId;
        console.log(`[Mail] [${type}] → ${to}`);
      }

      return ok(res, { qr_url: qrResult.url, filename: qrResult.filename, mail_sent: !!mailResult });
    }

    // ── GET /health ───────────────────────────────────────────
    if (req.method === 'GET' && url === '/health') {
      return ok(res, { service: 'verif-node', uptime: process.uptime(), qr: true, mail: true });
    }

    err(res, 'Route introuvable', 404);

  } catch (e) {
    console.error('[Service]', e.message);
    err(res, e.message, 500);
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`✅ VERIF Node Service → http://127.0.0.1:${PORT}`);
  console.log(`   QR output : ${OUTPUT_DIR}`);
  console.log(`   SMTP host : ${SMTP.host}`);
});

process.on('uncaughtException',  e => console.error('[FATAL]', e));
process.on('unhandledRejection', e => console.error('[FATAL]', e));

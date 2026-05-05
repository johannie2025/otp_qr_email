// ============================================================
// node_services/qr/server.js — QR Generation Service
// Port 3001 | Express + qrcode + sharp
// ============================================================

require('dotenv').config({ path: '../../.env' });
const express = require('express');
const QRCode  = require('qrcode');
const path    = require('path');
const fs      = require('fs');
const crypto  = require('crypto');

const app  = express();
const PORT = process.env.QR_SERVICE_PORT || 3001;
const API_KEY = process.env.NODE_API_KEY || 'CHANGE_NODE_API_KEY';
const QR_OUTPUT_PATH = process.env.QR_OUTPUT_PATH || path.join(__dirname, '../../uploads/qrcodes');

app.use(express.json());

// ── Auth Middleware ──────────────────────────────────────────
app.use((req, res, next) => {
  const key = req.headers['x-api-key'];
  if (key !== API_KEY) return res.status(401).json({ error: 'Unauthorized' });
  next();
});

// ── Ensure output dir ────────────────────────────────────────
if (!fs.existsSync(QR_OUTPUT_PATH)) {
  fs.mkdirSync(QR_OUTPUT_PATH, { recursive: true });
}

// ── POST /generate ───────────────────────────────────────────
app.post('/generate', async (req, res) => {
  try {
    const {
      token, participant_id, event_id, name,
      ticket_number, event_title, verify_url
    } = req.body;

    if (!token || !participant_id) {
      return res.status(400).json({ error: 'token and participant_id required' });
    }

    // QR data payload (URL for verification)
    const qrPayload = verify_url || `${process.env.APP_URL}/v/${token}`;

    // Filename: hash to avoid guessing
    const filename = `qr_${crypto.createHash('md5').update(token).digest('hex')}.png`;
    const filepath = path.join(QR_OUTPUT_PATH, filename);

    // Generate QR PNG with logo space
    await QRCode.toFile(filepath, qrPayload, {
      type:          'png',
      width:         400,
      margin:        2,
      color: {
        dark:  '#0A0A0A',
        light: '#FFFFFF',
      },
      errorCorrectionLevel: 'H', // High — allows logo overlay
    });

    console.log(`[QR] Generated: ${filename} for participant ${participant_id}`);

    res.json({
      success:    true,
      image_path: filepath,
      filename:   filename,
      qr_payload: qrPayload,
    });

  } catch (err) {
    console.error('[QR] Generate error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /generate-batch ─────────────────────────────────────
app.post('/generate-batch', async (req, res) => {
  const { participants } = req.body;
  if (!Array.isArray(participants) || participants.length === 0) {
    return res.status(400).json({ error: 'participants array required' });
  }

  const results = [];
  for (const p of participants) {
    try {
      const qrPayload = `${process.env.APP_URL}/v/${p.token}`;
      const filename  = `qr_${crypto.createHash('md5').update(p.token).digest('hex')}.png`;
      const filepath  = path.join(QR_OUTPUT_PATH, filename);

      await QRCode.toFile(filepath, qrPayload, {
        type: 'png', width: 400, margin: 2,
        errorCorrectionLevel: 'H',
      });

      results.push({ participant_id: p.id, filename, success: true });
    } catch (e) {
      results.push({ participant_id: p.id, error: e.message, success: false });
    }
  }

  res.json({ success: true, results });
});

// ── GET /health ───────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'qr-generator', port: PORT });
});

app.listen(PORT, '127.0.0.1', () => {
  console.log(`[QR Service] Running on port ${PORT}`);
});

const { makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
const axios = require('axios');

// URL Cloudflare Worker milikmu
const WORKER_URL = 'https://api-taklimda.abdul-hannan-210421.workers.dev';

async function connectToWhatsApp() {
  const { state, saveCreds } = await useMultiFileAuthState('auth_session');
  
  const sock = makeWASocket({
    auth: state,
    printQRInTerminal: true
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;
    
    if (qr) {
      console.log('=== SCAN QR CODE DI BAWAH INI DENGAN WA ADMIN ===\n');
      qrcode.generate(qr, { small: true });
    }

    if (connection === 'close') {
      const shouldReconnect = (lastDisconnect?.error)?.output?.statusCode !== DisconnectReason.loggedOut;
      console.log('Koneksi terputus. Menghubungkan ulang...', shouldReconnect);
      if (shouldReconnect) connectToWhatsApp();
    } else if (connection === 'open') {
      console.log('✅ WA Gateway Taklimda Berhasil Terhubung!');
    }
  });

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;

    for (const msg of messages) {
      if (msg.key.fromMe) continue;

      const senderJid = msg.key.remoteJid;
      const messageText = msg.message?.conversation || msg.message?.extendedTextMessage?.text;

      if (!messageText || !senderJid || senderJid.endsWith('@g.us')) continue;

      const cleanPhone = senderJid.replace('@s.whatsapp.net', '').split(':')[0];

      try {
        const res = await axios.post(WORKER_URL, {
          sender: cleanPhone,
          message: messageText
        });

        if (res.data && res.data.reply) {
          await sock.sendMessage(senderJid, { text: res.data.reply });
        }
      } catch (err) {
        console.error('Gagal memproses pesan via Worker:', err.message);
      }
    }
  });
}

connectToWhatsApp();

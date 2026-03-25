const fs = require('fs');
const os = require('os');
const path = require('path');

require('dotenv').config();

const DatabaseSchema = require('../src/database/schema');
const { DAO } = require('../src/database/dao');
const MessageHandler = require('../src/handlers/messageHandler');
const { TIMEOUTS } = require('../src/config/constants');

const USER_JID = '5511999999999@s.whatsapp.net';

class MockWhatsApp {
  constructor() {
    this.isConnected = true;
    this.replies = [];
    this.sentMessages = [];
    this.documents = [];
    this.presence = [];
  }

  async replyMessage(originalMessage, text) {
    this.replies.push({
      messageId: originalMessage.key.id,
      chatId: originalMessage.key.remoteJid,
      text: String(text || '')
    });
  }

  async sendMessage(jid, text) {
    this.sentMessages.push({ jid, text: String(text || '') });
  }

  async sendDocument(jid, filePath, fileName, caption = '') {
    this.documents.push({ jid, filePath, fileName, caption });
  }

  async markAsRead() {}

  async sendPresence(jid, type) {
    this.presence.push({ jid, type });
  }

  getSenderInfo(message) {
    const isGroup = message.key.remoteJid.endsWith('@g.us');
    const sender = isGroup ? message.key.participant : message.key.remoteJid;
    return {
      sender,
      chatId: message.key.remoteJid,
      isGroup,
      messageId: message.key.id
    };
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function hasAny(text, needles) {
  const normalized = normalizeText(text);
  for (let i = 0; i < needles.length; i++) {
    if (normalized.includes(normalizeText(needles[i]))) return true;
  }
  return false;
}

function normalizeAdminJid(rawValue) {
  const raw = String(rawValue || '').trim();
  if (!raw) return '';
  if (raw.includes('@')) return raw;
  const digits = raw.replace(/[^\d]/g, '');
  return digits ? `${digits}@s.whatsapp.net` : '';
}

function responseText(result) {
  const replies = result && result.replies ? result.replies : [];
  return replies.map((r) => r.text).join('\n---\n');
}

function makeMessage(text, id, sender = USER_JID, pushName = 'QA User') {
  return {
    key: {
      id,
      fromMe: false,
      remoteJid: sender
    },
    message: {
      conversation: text
    },
    pushName
  };
}

async function main() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'iaf-edge-sweep-'));
  const dbPath = path.join(tempRoot, 'finance.db');

  const schema = new DatabaseSchema(dbPath);
  await schema.init();
  schema.initialize();

  const dao = new DAO(dbPath);
  dao.setDatabase(schema.getDatabase());

  const whatsapp = new MockWhatsApp();
  const handler = new MessageHandler(dao, whatsapp);

  let msgSeq = 0;
  async function send(text, sender = USER_JID, pushName = 'QA User') {
    msgSeq += 1;
    const id = `m-${msgSeq}`;
    const msg = makeMessage(text, id, sender, pushName);
    const beforeReplies = whatsapp.replies.length;
    const beforeSent = whatsapp.sentMessages.length;
    const beforeDocs = whatsapp.documents.length;
    await handler.process(msg);
    return {
      text,
      sender,
      replies: whatsapp.replies.slice(beforeReplies),
      sentMessages: whatsapp.sentMessages.slice(beforeSent),
      documents: whatsapp.documents.slice(beforeDocs)
    };
  }

  const checks = [];
  const bugs = [];

  function record(name, ok, details) {
    checks.push({ name, ok, details });
    if (!ok) bugs.push({ name, details });
  }

  // Usuario base
  await send('/start');
  await send('/saldo 5000');

  // Cartao com ponto decimal no limite
  await send('/cartao criar');
  await send('Edge Card');
  const limitReply = await send('1000.50');
  record(
    'limite_decimal_ponto',
    hasAny(responseText(limitReply), ['1000,50', 'r$ 1000,50']),
    responseText(limitReply)
  );
  await send('10');

  // Compra no cartao + pagamento de fatura com ponto decimal
  await send('gastei 200 mercado edge');
  await send('edge card');
  await send('nao');
  await send('/pagar fatura edge card');
  const invoiceReply = await send('100.50');
  record(
    'fatura_decimal_ponto',
    hasAny(responseText(invoiceReply), ['fatura paga', '100,50']),
    responseText(invoiceReply)
  );

  // Admin via .env
  const adminJid = normalizeAdminJid(process.env.ADMIN_NUMBER);
  if (!adminJid) {
    record('admin_env_configurado', false, 'ADMIN_NUMBER ausente ou invalido no .env');
  } else {
    await send('/start', adminJid, 'Admin QA');
    const adminStats = await send('!stats', adminJid, 'Admin QA');
    record(
      'admin_env_stats',
      hasAny(responseText(adminStats), ['estatisticas do bot', 'total de usuarios']),
      responseText(adminStats)
    );
  }

  // Race condition de timeout em fluxo pendente de compra
  const originalPurchaseTimeout = TIMEOUTS.PENDING_PURCHASE;
  TIMEOUTS.PENDING_PURCHASE = 80;
  try {
    await send('gastei 90 corrida timeout');
    await sleep(40);
    await send('edge card');
    await sleep(60); // primeiro timeout ja deve ter disparado
    const replySim = await send('sim');
    await sleep(60);
    const replyInstallments = await send('3');

    record(
      'timeout_race_step2',
      hasAny(responseText(replySim), ['parcelamento', 'em quantas vezes']),
      responseText(replySim)
    );
    record(
      'timeout_race_step3',
      hasAny(responseText(replyInstallments), ['parcelamento no cartao registrado', '3x']),
      responseText(replyInstallments)
    );
  } finally {
    TIMEOUTS.PENDING_PURCHASE = originalPurchaseTimeout;
  }

  // Mensagem malformada nao deve derrubar o fluxo
  try {
    await handler.process({ key: { id: 'broken-1', fromMe: false, remoteJid: USER_JID } });
    record('mensagem_malformada', true, 'ok');
  } catch (err) {
    record('mensagem_malformada', false, err && err.message ? err.message : String(err));
  }

  const result = {
    pass: bugs.length === 0,
    totalChecks: checks.length,
    failedChecks: bugs.length,
    bugs,
    tempRoot
  };

  console.log(JSON.stringify(result, null, 2));
  process.exit(result.pass ? 0 : 1);
}

main().catch((error) => {
  console.error(JSON.stringify({
    pass: false,
    fatalError: error && error.stack ? error.stack : String(error)
  }, null, 2));
  process.exit(1);
});


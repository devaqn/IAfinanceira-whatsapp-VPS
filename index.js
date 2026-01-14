require('dotenv').config();
const path = require('path');
const fs = require('fs');
const DatabaseSchema = require('./src/database/schema');
const DAO = require('./src/database/dao');
const WhatsAppService = require('./src/services/whatsapp');
const MessageHandler = require('./src/handlers/messageHandler');

console.log('╔═══════════════════════════════════════════════════════════╗');
console.log('║                                                           ║');
console.log('║     🤖  BOT FINANCEIRO WHATSAPP - VERSÃO TERMUX  🤖      ║');
console.log('║                                                           ║');
console.log('║           Rodando 100% no Android via Termux             ║');
console.log('║             Sem Docker • Sem VPS • Sem Custos            ║');
console.log('║                                                           ║');
console.log('╚═══════════════════════════════════════════════════════════╝\n');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'database', 'finance.db');
const AUTH_PATH = process.env.AUTH_PATH || path.join(__dirname, 'auth_info');

async function initializeDatabase() {
  console.log('📊 Passo 1/3: Inicializando banco de dados\n');

  const dbDir = path.dirname(DB_PATH);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  const schema = new DatabaseSchema(DB_PATH);
  await schema.init();
  schema.initialize();

  console.log('');
  return schema.getDatabase();
}

async function main() {
  const db = await initializeDatabase();

  console.log('🔧 Passo 2/3: Configurando serviços\n');

  const dao = new DAO(DB_PATH);
  dao.setDatabase(db);

  const whatsapp = new WhatsAppService(AUTH_PATH);
  const messageHandler = new MessageHandler(dao, whatsapp);

  console.log('✅ DAO inicializado');
  console.log('✅ WhatsApp service inicializado');
  console.log('✅ Message handler inicializado\n');

  // ============ 🔔 SISTEMA DE LEMBRETES ============

  async function checkReminders() {
    try {
      const dueToday = dao.getDueTodayPayments();

      for (const payment of dueToday) {
        const message = messageHandler.reports.generateReminderMessage(payment);
        await whatsapp.sendMessage(payment.chat_id, message);
        dao.markAsReminded(payment.id);
        console.log('🔔 Lembrete enviado:', payment.description);
      }

      const overdue = dao.getOverduePayments();
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      for (const payment of overdue) {
        const lastReminded = payment.reminded_at ? new Date(payment.reminded_at) : null;
        if (!lastReminded || lastReminded < today) {
          const message = messageHandler.reports.generateReminderMessage(payment);
          await whatsapp.sendMessage(payment.chat_id, message);
          dao.markAsReminded(payment.id);
          console.log('❌ Lembrete vencido:', payment.description);
        }
      }
    } catch (error) {
      console.error('❌ Erro ao verificar lembretes:', error.message);
    }
  }

  setInterval(checkReminders, 60 * 60 * 1000);
  setTimeout(checkReminders, 60 * 1000);

  console.log('📱 Passo 3/3: Conectando ao WhatsApp\n');

  await whatsapp.connect(async (message) => {
    await messageHandler.process(message);
  });
}

// 🛡️ PROTEÇÃO TOTAL CONTRA LOGOUT / PM2
function keepAlive() {
  console.log('🛡️ PM2 signal recebido — WhatsApp NÃO será deslogado.');
}

process.on('SIGINT', keepAlive);
process.on('SIGTERM', keepAlive);

process.on('uncaughtException', (err) => {
  console.error('❌ Erro não capturado:', err);
});

process.on('unhandledRejection', (reason) => {
  console.error('❌ Promise rejeitada:', reason);
});

main();

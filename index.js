// ⭐ DEFINIR TIMEZONE ANTES DE QUALQUER COISA
process.env.TZ = 'America/Sao_Paulo';

require('dotenv').config();
const path = require('path');
const fs = require('fs');
const DatabaseSchema = require('./src/database/schema');
const { DAO } = require('./src/database/dao');
const WhatsAppService = require('./src/services/whatsapp');
const MessageHandler = require('./src/handlers/messageHandler');

console.log('╔═══════════════════════════════════════════════════════════╗');
console.log('║                                                           ║');
console.log('║     🤖  BOT FINANCEIRO WHATSAPP - VERSÃO VPS  🤖         ║');
console.log('║                                                           ║');
console.log('║           Rodando 100% na VPS ou no terminal              ║');
console.log('║                                                           ║');
console.log('╚═══════════════════════════════════════════════════════════╝\n');

// ==================== CONFIGS ====================
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'database', 'finance.db');
const AUTH_PATH = process.env.AUTH_PATH || path.join(__dirname, 'auth_info');
const LOCK_FILE = path.join(__dirname, '.bot.lock');

// ==================== 🔒 SISTEMA DE LOCK ====================
function checkLock() {
  if (fs.existsSync(LOCK_FILE)) {
    const pid = fs.readFileSync(LOCK_FILE, 'utf8').trim();
    try {
      process.kill(pid, 0);
      console.error('❌ Bot já está rodando! (PID:', pid, ')');
      console.error('💡 Execute: pkill -f "node index.js" && node index.js');
      process.exit(1);
    } catch (e) {
      console.log('🧹 Removendo lock antigo (PID:', pid, ')');
      fs.unlinkSync(LOCK_FILE);
    }
  }
  fs.writeFileSync(LOCK_FILE, process.pid.toString());
  console.log('🔒 Lock criado (PID:', process.pid, ')');
}

function removeLock() {
  try {
    if (fs.existsSync(LOCK_FILE)) {
      fs.unlinkSync(LOCK_FILE);
      console.log('🔓 Lock removido');
    }
  } catch (e) {}
}

// ==================== 📊 DATABASE ====================
async function initializeDatabase() {
  console.log('📊 Passo 1/3: Inicializando banco de dados\n');

  const dbDir = path.dirname(DB_PATH);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  const schema = new DatabaseSchema(DB_PATH);
  await schema.init();
  schema.initialize();

  console.log('✅ Banco de dados pronto\n');
  return schema.getDatabase();
}

// ==================== 🔔 LEMBRETES ====================
function startReminders(dao, whatsapp, messageHandler) {
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

  setTimeout(checkReminders, 60 * 1000);
  setInterval(checkReminders, 60 * 60 * 1000);
  console.log('🔔 Sistema de lembretes ativo');
}

// ==================== 🚀 MAIN ====================
async function main() {
  try {
    checkLock();

    const db = await initializeDatabase();

    console.log('🔧 Passo 2/3: Configurando serviços\n');

    const dao = new DAO(DB_PATH);
    dao.setDatabase(db);

    const whatsapp = new WhatsAppService(AUTH_PATH);
    const messageHandler = new MessageHandler(dao, whatsapp);

    console.log('✅ DAO inicializado');
    console.log('✅ WhatsApp service inicializado');
    console.log('✅ Message handler inicializado\n');

    // Lembretes
    startReminders(dao, whatsapp, messageHandler);

    // Conectar ao WhatsApp
    // A reconexão é gerenciada internamente pelo WhatsAppService
    console.log('📱 Passo 3/3: Conectando ao WhatsApp\n');

    await whatsapp.connect(async (message) => {
      await messageHandler.process(message);
    });

  } catch (error) {
    console.error('❌ Erro ao iniciar bot:', error);
    removeLock();
    process.exit(1);
  }
}

// ==================== 🛡️ HANDLERS DE SINAL ====================
let exiting = false;

function gracefulShutdown(signal) {
  if (exiting) return;
  exiting = true;
  console.log(`\n🛡️ Sinal ${signal} recebido — encerrando...`);
  removeLock();
  process.exit(0);
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('exit', removeLock);

process.on('uncaughtException', (err) => {
  console.error('💥 Erro não capturado:', err);
  removeLock();
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  console.error('💥 Promise rejeitada:', reason);
});

// ==================== INICIAR ====================
main().catch((error) => {
  console.error('❌ Erro fatal:', error);
  removeLock();
  process.exit(1);
});
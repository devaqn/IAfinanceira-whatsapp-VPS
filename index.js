require('dotenv').config();
const path = require('path');
const fs = require('fs');
const DatabaseSchema = require('./src/database/schema');
const { DAO } = require('./src/database/dao');
const WhatsAppService = require('./src/services/whatsapp');
const MessageHandler = require('./src/handlers/messageHandler');
// SISTEMA DE MEMÓRIA
let conversationMemory = {};
let userStates = {};
let messageHistory = {};

// MUDE PARA SEU NÚMERO (formato: 5581XXXXXXXXX@s.whatsapp.net, pra por de ADM pra limpar memoria)
const ADMIN_NUMBER = '558198191625@s.whatsapp.net';

function limparMemoriaGlobal() {
  const usuariosAntes = Object.keys(conversationMemory).length;
  conversationMemory = {};
  userStates = {};
  messageHistory = {};
  console.log('🧹 MEMÓRIA GLOBAL LIMPA!');
  return `✅ Memória global limpa!\n\n📊 ${usuariosAntes} usuários removidos.`;
}

function limparMemoriaUsuario(userId) {
  const existia = conversationMemory[userId] !== undefined;
  delete conversationMemory[userId];
  delete userStates[userId];
  delete messageHistory[userId];
  console.log(`🧹 Memória do usuário ${userId} limpa!`);
  return existia 
    ? '✅ Sua memória foi limpa!'
    : '⚠️ Você não tinha dados em memória.';
}

function verStatusMemoria() {
  const totalUsuarios = Object.keys(conversationMemory).length;
  const totalMensagens = Object.keys(messageHistory).length;
  const totalEstados = Object.keys(userStates).length;
  
  return `📊 *STATUS DA MEMÓRIA*\n\n` +
         `👥 Usuários: *${totalUsuarios}*\n` +
         `💬 Conversas: *${totalMensagens}*\n` +
         `🔄 Estados: *${totalEstados}*\n\n` +
         `*COMANDOS:*\n` +
         `!limpar - Limpa sua memória\n` +
         `!limpartudo - Limpa TUDO\n` +
         `!status - Este status\n` +
         `!ajuda - Ajuda`;
}

function mostrarAjuda() {
  return `🤖 *COMANDOS ADMIN*\n\n` +
         `!status - Ver memória\n` +
         `!limpar - Limpar sua conversa\n` +
         `!limpartudo - Limpar TUDO\n` +
         `!ajuda - Esta ajuda`;
}
// ==================== FIM DO SISTEMA DE MEMÓRIA ====================

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

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
const MAX_RECONNECT_ATTEMPTS = 5;

// ==================== 🔒 SISTEMA DE LOCK ====================
function checkLock() {
  if (fs.existsSync(LOCK_FILE)) {
    const pid = fs.readFileSync(LOCK_FILE, 'utf8').trim();
    try {
      process.kill(pid, 0); // Verifica se o PID ainda existe
      console.error('❌ Bot já está rodando! (PID:', pid, ')');
      console.error('💡 Execute: pkill -f "node index.js" && node index.js');
      process.exit(1);
    } catch (e) {
      // PID não existe mais — lock antigo, pode remover
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
  } catch (e) {
    // ignorar erros ao remover lock
  }
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
      // Pagamentos vencendo hoje
      const dueToday = dao.getDueTodayPayments();
      for (const payment of dueToday) {
        const message = messageHandler.reports.generateReminderMessage(payment);
        await whatsapp.sendMessage(payment.chat_id, message);
        dao.markAsReminded(payment.id);
        console.log('🔔 Lembrete enviado:', payment.description);
      }

      // Pagamentos já vencidos
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

  // Primeira verificação após 60s, depois a cada hora
  setTimeout(checkReminders, 60 * 1000);
  setInterval(checkReminders, 60 * 60 * 1000);
  console.log('🔔 Sistema de lembretes ativo');
}

// ==================== 🔄 RECONEXÃO ====================
function setupReconnection(whatsapp) {
  let reconnectAttempts = 0;
  let reconnectTimeout = null;

  whatsapp.sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log('\n📱 QR Code gerado! Escaneie para conectar.\n');
    }

    if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      console.log('\n🔌 Conexão fechada | Código:', statusCode, '| Mensagem:', lastDisconnect?.error?.message);

      // Limpar timeout anterior se existir
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
        reconnectTimeout = null;
      }

      // --- 440: Conflito (outro dispositivo conectou) ---
      if (statusCode === 440) {
        console.log('\n⚠️  CONFLITO DETECTADO (Erro 440)');
        console.log('📌 Causas comuns:');
        console.log('   • Outro bot rodando com este número');
        console.log('   • WhatsApp Web aberto no navegador');
        console.log('   • Múltiplas instâncias no PM2');
        console.log('🔧 Solução: pkill -f "node index.js" && node index.js\n');
        // NÃO reconecta — aguarda ação manual
        return;
      }

      // --- 401: Não autorizado (logout) ---
      if (statusCode === 401) {
        console.log('❌ Desconectado por logout. Remova a pasta auth_info e reinicie.');
        removeLock();
        process.exit(1);
      }

      // --- 515: Stream error ou outros erros reconectáveis ---
      reconnectAttempts++;

      if (reconnectAttempts > MAX_RECONNECT_ATTEMPTS) {
        console.log('❌ Muitas tentativas de reconexão. Encerrando...');
        removeLock();
        process.exit(1);
      }

      const delay = Math.min(reconnectAttempts * 5000, 30000);
      console.log(`🔄 Reconectando em ${delay / 1000}s... (tentativa ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`);

      reconnectTimeout = setTimeout(() => {
        main().catch((err) => {
          console.error('❌ Erro na reconexão:', err);
          removeLock();
          process.exit(1);
        });
      }, delay);
    }

    if (connection === 'open') {
      reconnectAttempts = 0;
      console.log('\n✅ Bot conectado com sucesso!\n');
    }
  });
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

    // Reconexão inteligente
    setupReconnection(whatsapp);

    console.log('📱 Passo 3/3: Conectando ao WhatsApp\n');

    // Conectar ao WhatsApp e processar mensagens
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
// Faz cleanup do lock ao encerrar, mas NÃO force-exits no SIGINT/SIGTERM
// para evitar deslogar do WhatsApp no PM2.
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
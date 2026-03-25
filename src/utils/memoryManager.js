// src/utils/memoryManager.js

let conversationMemory = {};
let userStates = {};
let messageHistory = {};

function normalizeAdminNumber(rawValue) {
  const raw = String(rawValue || '').trim();
  if (!raw) return '';

  if (raw.includes('@')) {
    return raw;
  }

  const digits = raw.replace(/[^\d]/g, '');
  if (!digits) return '';

  return `${digits}@s.whatsapp.net`;
}

const DEFAULT_ADMIN_NUMBER = '558187338645@s.whatsapp.net';
const ADMIN_NUMBER = normalizeAdminNumber(process.env.ADMIN_NUMBER) || DEFAULT_ADMIN_NUMBER;

function limparMemoriaGlobal() {
  const usuariosAntes = Object.keys(conversationMemory).length;
  const mensagensAntes = Object.keys(messageHistory).length;

  // Limpar propriedades sem reatribuir a referencia do objeto
  for (const key of Object.keys(conversationMemory)) delete conversationMemory[key];
  for (const key of Object.keys(userStates)) delete userStates[key];
  for (const key of Object.keys(messageHistory)) delete messageHistory[key];

  console.log('🧹 MEMÓRIA GLOBAL LIMPA!');
  console.log(`📊 Removidos: ${usuariosAntes} usuários, ${mensagensAntes} conversas`);

  return `✅ *MEMÓRIA GLOBAL LIMPA!*\n\n` +
         `📊 Estatísticas removidas:\n` +
         `👥 Usuários: ${usuariosAntes}\n` +
         `💬 Conversas: ${mensagensAntes}\n\n` +
         `🔄 Bot resetado com sucesso!`;
}

function limparMemoriaUsuario(userId) {
  const existia = conversationMemory[userId] !== undefined;
  
  delete conversationMemory[userId];
  delete userStates[userId];
  delete messageHistory[userId];
  
  console.log(`🧹 Memória do usuário ${userId} limpa!`);
  
  return existia 
    ? '✅ *Sua memória foi limpa!*\n\nEsqueci tudo sobre nossa conversa anterior.' 
    : '⚠️ Você não tinha dados armazenados em memória.';
}

function verStatusMemoria() {
  const totalUsuarios = Object.keys(conversationMemory).length;
  const totalMensagens = Object.keys(messageHistory).length;
  const totalEstados = Object.keys(userStates).length;

  const memoriaUsada = JSON.stringify({
    conversationMemory,
    userStates,
    messageHistory
  }).length;

  const memoriaKB = (memoriaUsada / 1024).toFixed(2);

  return `📊 *STATUS DA MEMÓRIA DO BOT*\n\n` +
         `👥 Usuários em memória: *${totalUsuarios}*\n` +
         `💬 Histórico de conversas: *${totalMensagens}*\n` +
         `🔄 Estados ativos: *${totalEstados}*\n` +
         `💾 Memória utilizada: *${memoriaKB} KB*\n\n` +
         `━━━━━━━━━━━━━━━━━━━\n\n` +
         `🧹 *COMANDOS DISPONÍVEIS:*\n\n` +
         `*!stats* - Estatísticas gerais do bot\n` +
         `*!broadcast [msg]* - Enviar mensagem para todos\n` +
         `*!limpar* - Limpa apenas SUA memória\n` +
         `*!limpartudo* - Limpa TODA a memória do bot\n` +
         `*!status* - Mostra este status\n` +
         `*!ajuda* - Mostra ajuda dos comandos`;
}

function mostrarAjuda() {
  return `🤖 *COMANDOS ADMINISTRATIVOS*\n\n` +
         `━━━━━━━━━━━━━━━━━━━\n\n` +
         `*📊 Estatísticas e Informações:*\n\n` +
         `*!stats*\n` +
         `└ Mostra estatísticas gerais do bot\n` +
         `└ Total de usuários, gastos, saldos, etc\n\n` +
         `*!status*\n` +
         `└ Ver quantos usuários estão na memória\n` +
         `└ Ver uso de memória do bot\n\n` +
         `*📢 Comunicação:*\n\n` +
         `*!broadcast [mensagem]*\n` +
         `└ Envia mensagem para TODOS os usuários\n` +
         `└ Exemplo: !broadcast Sistema em manutenção\n` +
         `└ ⚠️ Use com cuidado!\n\n` +
         `*🧹 Gerenciamento de Memória:*\n\n` +
         `*!limpar*\n` +
         `└ Apaga SUA conversa da memória\n` +
         `└ Não afeta outros usuários\n\n` +
         `*!limpartudo*\n` +
         `└ Apaga TODA a memória (todos os usuários)\n` +
         `└ ⚠️ Use com MUITO cuidado!\n\n` +
         `*!ajuda*\n` +
         `└ Mostra esta mensagem\n\n` +
         `━━━━━━━━━━━━━━━━━━━\n\n` +
         `⚠️ Apenas você (admin) pode usar estes comandos.\n` +
         `🔐 Comandos protegidos por número do admin.`;
}

// ⭐ MUDEI DE export PARA module.exports (CommonJS)
module.exports = {
  ADMIN_NUMBER,
  limparMemoriaGlobal,
  limparMemoriaUsuario,
  verStatusMemoria,
  mostrarAjuda,
  conversationMemory,
  userStates,
  messageHistory
};

const NLPProcessor = require('../services/nlp');
const ReportGenerator = require('../services/reports');
const ExportService = require('../services/exportService');
const ForecastService = require('../services/forecastService');
const ErrorMessages = require('../utils/ErrorMessages');
const Logger = require('../utils/logger'); // ⭐ NOVO
const { TIMEOUTS, PAYMENT_METHODS } = require('../config/constants'); // ⭐ NOVOO CONTANTS
const path = require('path');

const { 
  ADMIN_NUMBER, 
  limparMemoriaGlobal, 
  limparMemoriaUsuario, 
  verStatusMemoria, 
  mostrarAjuda 
} = require('../utils/memoryManager');

class MessageHandler {
constructor(dao, whatsappService) {
  this.dao = dao;
  this.whatsapp = whatsappService;
  this.nlp = new NLPProcessor();
  this.reports = new ReportGenerator(dao);
  this.exportService = new ExportService(dao, this.reports, path.join(__dirname, '../../exports'));
  this.forecastService = new ForecastService(dao, this.reports);
  
  // ✅ INICIALIZAR TODOS OS OBJETOS PENDENTES
  this.recentlyProcessed = {};
  this.pendingResets = {};
  this.pendingPurchases = {};
  this.pendingInstallments = {};
  this.pendingInvoicePayments = {};
  this.pendingCardCreation = {};  // ⭐ NOVO: Para fluxo de criação de cartão
  
  // ✅ BIND DAS FUNÇÕES PARA EVITAR PERDER CONTEXTO
  this.cleanupPendingOperation = this.cleanupPendingOperation.bind(this);
}

isCardPayment(text) {
  const textLower = text.toLowerCase().trim();
  return PAYMENT_METHODS.CARD.includes(textLower);
}

isBalancePayment(text) {
  const textLower = text.toLowerCase().trim();
  return PAYMENT_METHODS.BALANCE.includes(textLower);
}

cleanupPendingOperation(userId, operationType, timeout = TIMEOUTS.PENDING_PURCHASE) {
  const self = this;
  setTimeout(function() {
    const pendingMap = {
      'purchase': self.pendingPurchases,
      'installment': self.pendingInstallments,
      'invoice': self.pendingInvoicePayments,
      'reset': self.pendingResets,
      'card_creation': self.pendingCardCreation
    };

    const targetMap = pendingMap[operationType];
    if (targetMap && targetMap[userId]) {
      delete targetMap[userId];
      Logger.info(`Timeout: ${operationType} expirado para usuário ${userId}`);
    }
  }, timeout);
}

parseGoalCreateInput(rawText) {
  const raw = String(rawText || '').trim();
  if (!raw) return null;

  const amountMatch = raw.match(/(?:r\$|\brs\b)?\s*(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?)/i);
  if (!amountMatch) return null;

  const amount = this.nlp.parseAmountString(amountMatch[1]);
  if (!amount || amount <= 0) return null;

  let name = raw.replace(amountMatch[0], '').trim();
  name = name.replace(/^(?:para|de|da|do)\s+/i, '').trim();
  if (!name) name = 'Meta de economia';

  return { amount, name };
}

generateGoalsMessage(userId) {
  const timestamp = this.reports.getCurrentBrazilTimestamp();
  const goals = this.dao.getSavingsGoalsByUser(userId);

  if (!goals.length) {
    return '🎯 *METAS DE ECONOMIA*\n\n' +
      'Você ainda não tem metas cadastradas.\n\n' +
      'Use:\n' +
      '`/meta criar 5000 viagem`\n\n' +
      '🕑 ' + timestamp.formatted;
  }

  let msg = '🎯 *METAS DE ECONOMIA*\n\n';
  for (let i = 0; i < goals.length; i++) {
    const goal = goals[i];
    const bar = this.reports.buildProgressBar(goal.progress_percent || 0, 12);
    msg += `#${goal.id} *${goal.name}*\n`;
    msg += `   Alvo: ${this.reports.formatMoney(Number(goal.target_amount || 0))}\n`;
    msg += `   Progresso: ${this.reports.formatMoney(Number(goal.current_progress || 0))} (${goal.progress_percent || 0}%)\n`;
    msg += `   ${bar}\n`;
    msg += `   Falta: ${this.reports.formatMoney(Number(goal.remaining_amount || 0))}\n`;
    msg += `   Status: ${goal.status === 'completed' ? 'concluída' : 'ativa'}\n`;
    if (goal.target_date) {
      msg += `   Prazo: ${this.reports.formatDateShort(goal.target_date)}\n`;
    }
    msg += '\n';
  }

  msg += '💡 Comandos:\n';
  msg += '• `/meta criar 5000 viagem`\n';
  msg += '• `/meta remover [id]`\n';
  msg += '• `/meta concluir [id]`\n\n';
  msg += '🕑 ' + timestamp.formatted;
  return msg;
}

generateVisualChartMessage(userId, period) {
  const timestamp = this.reports.getCurrentBrazilTimestamp();
  const now = new Date();
  const start = new Date(now);
  const title = period === 'week' ? 'SEMANA' : 'MÊS';

  if (period === 'week') {
    start.setDate(start.getDate() - 7);
  } else {
    start.setDate(1);
  }

  const byCategory = this.dao.getExpensesByCategory(userId, start.toISOString(), now.toISOString());
  if (!byCategory.length) {
    return `📊 *GRÁFICO ${title}*\n\nSem gastos no período.\n\n🕑 ${timestamp.formatted}`;
  }

  const total = byCategory.reduce((sum, c) => sum + Number(c.total || 0), 0);
  let msg = `📊 *GRÁFICO ${title} (CATEGORIAS)*\n\n`;
  for (let i = 0; i < Math.min(byCategory.length, 8); i++) {
    const c = byCategory[i];
    const pct = total > 0 ? (Number(c.total || 0) / total) * 100 : 0;
    const bar = this.reports.buildProgressBar(pct, 14);
    msg += `${c.emoji || '•'} ${c.category}\n`;
    msg += `${bar} ${pct.toFixed(0)}% (${this.reports.formatMoney(Number(c.total || 0))})\n\n`;
  }
  msg += '🕑 ' + timestamp.formatted;
  return msg;
}

getDashboardUrl() {
  const base = process.env.DASHBOARD_BASE_URL;
  const port = process.env.DASHBOARD_PORT || '3030';
  const fallback = `http://localhost:${port}/dashboard`;
  return (base ? `${base.replace(/\/$/, '')}/dashboard` : fallback);
}

  async process(message) {
  try {
    // ✅ VALIDAÇÕES EXTRAS
    if (!message || !message.key) {
      console.log('⚠️ Mensagem inválida recebida');
      return;
    }

    // ✅ IGNORAR MENSAGENS ENVIADAS PELO BOT
    if (message.key.fromMe) {
      return;
    }

    const msg = message.message;
    const text = msg.conversation ||
      (msg.extendedTextMessage && msg.extendedTextMessage.text) ||
      (msg.imageMessage && msg.imageMessage.caption) ||
      (msg.videoMessage && msg.videoMessage.caption) ||
      '';
      
    if (!text || text.trim() === '') return;

    const isGroup = message.key.remoteJid.endsWith('@g.us');
    const sender = isGroup ? message.key.participant : message.key.remoteJid;
    const info = {
      sender: sender,
      chatId: message.key.remoteJid,
      isGroup: isGroup,
      messageId: message.key.id
    };

      // ==================== ⭐ COMANDOS ADMINISTRATIVOS ⭐ ====================
      // Comparar numeros ignorando sufixo :XX do Baileys
      const senderClean = sender.split(':')[0].split('@')[0];
      const adminClean = ADMIN_NUMBER.split(':')[0].split('@')[0];
      const isAdmin = senderClean === adminClean;

      if (isAdmin) {
        const comando = text.toLowerCase().trim();

        // !STATS - Estatísticas do bot
        if (comando === '!stats') {
          Logger.admin('!stats');
          const stats = this.dao.getSystemStats();

          const timestamp = this.reports.getCurrentBrazilTimestamp();
          const resposta = `📊 *ESTATÍSTICAS DO BOT*\n\n` +
            `👥 Total de usuários: *${stats.totalUsers}*\n` +
            `💸 Total de gastos: *${stats.totalExpenses}*\n` +
            `📦 Parcelamentos ativos: *${stats.totalInstallments}*\n` +
            `💳 Cartões cadastrados: *${stats.totalCards}*\n` +
            `🎯 Metas ativas: *${stats.totalGoals || 0}*\n\n` +
            `💰 *SALDOS TOTAIS:*\n` +
            `   Principal: ${this.reports.formatMoney(stats.totalBalance)}\n` +
            `   Poupança: ${this.reports.formatMoney(stats.totalSavings)}\n` +
            `   Emergência: ${this.reports.formatMoney(stats.totalEmergency)}\n` +
            `   Total: ${this.reports.formatMoney(stats.totalBalance + stats.totalSavings + stats.totalEmergency)}\n\n` +
            `🕐 ${timestamp.formatted}`;

          await this.whatsapp.replyMessage(message, resposta);
          await this.whatsapp.sendPresence(info.chatId, 'available');
          return;
        }

        // !BROADCAST - Enviar mensagem para todos
        if (comando.startsWith('!broadcast ')) {
          Logger.admin('!broadcast');
          const mensagem = text.substring('!broadcast '.length).trim();

          if (!mensagem) {
            await this.whatsapp.replyMessage(message,
              '❌ *Erro!*\n\nUso: !broadcast [mensagem]\n\nExemplo:\n!broadcast Manutenção agendada para hoje às 22h'
            );
            return;
          }

          const allUsers = this.dao.getAllUsers();
          const timestamp = this.reports.getCurrentBrazilTimestamp();
          let sucessos = 0;
          let falhas = 0;

          for (let i = 0; i < allUsers.length; i++) {
            try {
              const userJid = allUsers[i].whatsapp_id;
              const broadcastMsg = `📢 *MENSAGEM DO ADMINISTRADOR*\n\n${mensagem}\n\n🕐 ${timestamp.formatted}`;
              await this.whatsapp.sendMessage(userJid, broadcastMsg);
              sucessos++;
              await new Promise(resolve => setTimeout(resolve, 1000)); // Delay de 1s entre envios
            } catch (err) {
              falhas++;
              console.error(`❌ Erro ao enviar para ${allUsers[i].name}:`, err.message);
            }
          }

          const resposta = `✅ *BROADCAST CONCLUÍDO*\n\n` +
            `📤 Enviados: ${sucessos}\n` +
            `❌ Falhas: ${falhas}\n` +
            `👥 Total: ${allUsers.length}\n\n` +
            `🕐 ${timestamp.formatted}`;

          await this.whatsapp.replyMessage(message, resposta);
          await this.whatsapp.sendPresence(info.chatId, 'available');
          return;
        }

        if (comando === '!limpartudo') {
          Logger.admin('!limpartudo');
          const resposta = limparMemoriaGlobal();
          await this.whatsapp.replyMessage(message, resposta);
          await this.whatsapp.sendPresence(info.chatId, 'available');
          return;
        }

        if (comando === '!limpar') {
          console.log('🧹 Admin executou: !limpar');
          const resposta = limparMemoriaUsuario(sender);
          await this.whatsapp.replyMessage(message, resposta);
          await this.whatsapp.sendPresence(info.chatId, 'available');
          return;
        }

        if (comando === '!status') {
          console.log('📊 Admin executou: !status');
          const resposta = verStatusMemoria();
          await this.whatsapp.replyMessage(message, resposta);
          await this.whatsapp.sendPresence(info.chatId, 'available');
          return;
        }

        if (comando === '!ajuda' || comando === '!help') {
          console.log('❓ Admin executou: !ajuda');
          const resposta = mostrarAjuda();
          await this.whatsapp.replyMessage(message, resposta);
          await this.whatsapp.sendPresence(info.chatId, 'available');
          return;
        }
      }
      // ==================== FIM DOS COMANDOS ADMINISTRATIVOS ====================

const messageKey = sender + '-' + info.messageId;
if (this.recentlyProcessed[messageKey]) {
  return;
}
this.recentlyProcessed[messageKey] = true;

const self = this;
setTimeout(function() {
  delete self.recentlyProcessed[messageKey];
}, 30000);


await this.whatsapp.markAsRead(info.chatId, info.messageId); // ✅ CORRETO
await this.whatsapp.sendPresence(info.chatId, 'composing');
      let user = this.dao.getUserByWhatsAppId(sender);
if (!user) {
  const name = message.pushName || sender.split('@')[0];
  user = this.dao.upsertUser(sender, name);
  Logger.user('Novo usuário', name, sender);
  
  await this.whatsapp.replyMessage(message, this.reports.generateWelcomeMessage(name));
  await this.whatsapp.sendPresence(info.chatId, 'available'); // ✅ CORRIGIDO
  return;
}

if (info.isGroup) { // ✅ CORRIGIDO
  const groupName = info.chatId.split('@')[0]; // ✅ CORRIGIDO
  this.dao.upsertGroup(info.chatId, groupName); // ✅ CORRIGIDO
}
// 💳 VERIFICAR SE É RESPOSTA A PERGUNTA DE PAGAMENTO
if (this.pendingPurchases && this.pendingPurchases[user.id]) {
  const pending = this.pendingPurchases[user.id];
  const textLower = text.toLowerCase().trim();

  // ⭐ SUB-FLUXO: Aguardando resposta sobre parcelamento no cartão
  if (pending.awaitingInstallmentAnswer) {
    const timestamp = this.reports.getCurrentBrazilTimestamp();
    if (textLower === 'nao' || textLower === 'não' || textLower === 'n') {
      // Compra à vista no cartão
      delete this.pendingPurchases[user.id];
      await this.registerExpenseInCard(pending.expense, user, message, pending.messageInfo, info.chatId, pending.selectedCard);
      await this.whatsapp.sendPresence(info.chatId, 'available');
      return;
    } else if (textLower === 'sim' || textLower === 's') {
      // Quer parcelar - perguntar em quantas vezes
      this.pendingPurchases[user.id] = {
        ...pending,
        awaitingInstallmentAnswer: false,
        awaitingInstallmentCount: true
      };
      await this.whatsapp.replyMessage(message,
        '📊 *PARCELAMENTO*\n\n' +
        `💰 Valor: ${this.reports.formatMoney(pending.expense.amount)}\n` +
        `💳 Cartão: *${pending.selectedCard.card_name}*\n\n` +
        'Em quantas vezes deseja parcelar?\n' +
        '(Digite o número de parcelas, ex: 3, 6, 12)\n\n' +
        '⏱️ Você tem 2 minutos para responder\n\n' +
        '🕐 ' + timestamp.formatted
      );
      this.cleanupPendingOperation(user.id, 'purchase', TIMEOUTS.PENDING_PURCHASE);
      await this.whatsapp.sendPresence(info.chatId, 'available');
      return;
    } else {
      await this.whatsapp.replyMessage(message,
        '❌ Responda com *sim* ou *não*\n\n' +
        '🕐 ' + timestamp.formatted
      );
      return;
    }
  }

  // ⭐ SUB-FLUXO: Aguardando numero de parcelas
  if (pending.awaitingInstallmentCount) {
    const timestamp = this.reports.getCurrentBrazilTimestamp();
    const numParcelas = parseInt(textLower);
    if (isNaN(numParcelas) || numParcelas < 2 || numParcelas > 48) {
      await this.whatsapp.replyMessage(message,
        '❌ *Número inválido!*\n\n' +
        'Digite um número de parcelas entre 2 e 48.\n' +
        'Exemplo: 3, 6, 12\n\n' +
        '🕐 ' + timestamp.formatted
      );
      return;
    }

    delete this.pendingPurchases[user.id];

    // Registrar como parcelamento no cartão
    const installmentAmount = parseFloat((pending.expense.amount / numParcelas).toFixed(2));
    const installmentData = {
      description: pending.expense.description,
      totalAmount: pending.expense.amount,
      installments: numParcelas,
      installmentAmount: installmentAmount
    };
    await this.registerInstallmentInCard(installmentData, user, message, pending.messageInfo, info.chatId, pending.selectedCard);
    await this.whatsapp.sendPresence(info.chatId, 'available');
    return;
  }

  // Verificar se digitou "saldo" ou "dinheiro"
  if (this.isBalancePayment(text)) {
    delete this.pendingPurchases[user.id];

    const timestamp = this.reports.getCurrentBrazilTimestamp();
    await this.registerExpenseInBalance(pending.expense, user, message, pending.messageInfo, info.chatId, timestamp);
    await this.whatsapp.sendPresence(info.chatId, 'available');
    return;
  }

  // Caso contrário, tentar encontrar cartão pelo nome digitado
  const card = this.dao.findCardByPartialName(user.id, text);

  if (card) {
    // ⭐ Cartão encontrado - perguntar se vai parcelar
    const timestamp = this.reports.getCurrentBrazilTimestamp();
    this.pendingPurchases[user.id] = {
      ...pending,
      selectedCard: card,
      awaitingInstallmentAnswer: true
    };

    await this.whatsapp.replyMessage(message,
      '💳 *COMPRA NO CARTÃO*\n\n' +
      `💰 Valor: ${this.reports.formatMoney(pending.expense.amount)}\n` +
      `📝 Descrição: ${pending.expense.description}\n` +
      `💳 Cartão: *${card.card_name}*\n\n` +
      'Deseja parcelar esta compra?\n' +
      'Responda com *sim* ou *não*\n\n' +
      '⏱️ Você tem 2 minutos para responder\n\n' +
      '🕐 ' + timestamp.formatted
    );
    this.cleanupPendingOperation(user.id, 'purchase', TIMEOUTS.PENDING_PURCHASE);
    await this.whatsapp.sendPresence(info.chatId, 'available');
    return;
  } else {
    // Não encontrou cartão nem é saldo
    const timestamp = this.reports.getCurrentBrazilTimestamp();
    const cards = this.dao.getAllCardsByUserId(user.id);
    let cardList = '';
    for (let i = 0; i < cards.length; i++) {
      cardList += `• *${cards[i].card_name}*\n`;
    }
    await this.whatsapp.replyMessage(message,
      '❌ *Cartão não encontrado!*\n\n' +
      `Você digitou: "${text}"\n\n` +
      '💡 *Opções válidas:*\n' +
      cardList +
      '• Ou digite *saldo* para pagar no saldo\n\n' +
      'Use `/cartoes` para ver seus cartões\n\n' +
      '🕐 ' + timestamp.formatted
    );
    return;
  }
}
// 💳 VERIFICAR SE É RESPOSTA A PERGUNTA DE PARCELAMENTO
if (this.pendingInstallments && this.pendingInstallments[user.id]) {
  const pending = this.pendingInstallments[user.id];
  const textLower = text.toLowerCase().trim();

  // Verificar se digitou "saldo"
  if (this.isBalancePayment(text)) {
    delete this.pendingInstallments[user.id];

    const timestamp = this.reports.getCurrentBrazilTimestamp();
    await this.registerInstallmentNormal(pending.installment, user, message, pending.messageInfo, info.chatId, timestamp);
    await this.whatsapp.sendPresence(info.chatId, 'available');
    return;
  }

  // Tentar encontrar cartão
  const card = this.dao.findCardByPartialName(user.id, text);

  if (card) {
    delete this.pendingInstallments[user.id];

    await this.registerInstallmentInCard(pending.installment, user, message, pending.messageInfo, info.chatId, card);
    await this.whatsapp.sendPresence(info.chatId, 'available');
    return;
  } else {
    const timestamp = this.reports.getCurrentBrazilTimestamp();
    const allCards = this.dao.getAllCardsByUserId(user.id);
    let cardList = '';
    for (let i = 0; i < allCards.length; i++) {
      cardList += `• *${allCards[i].card_name}*\n`;
    }
    await this.whatsapp.replyMessage(message,
      '❌ *Cartão não encontrado!*\n\n' +
      `Você digitou: "${text}"\n\n` +
      '💡 *Opções válidas:*\n' +
      cardList +
      '• Ou digite *saldo* para parcelar manualmente\n\n' +
      'Use `/cartoes` para ver seus cartões\n\n' +
      '🕐 ' + timestamp.formatted
    );
    return;
  }
}
// 💳 VERIFICAR SE É VALOR PARA PAGAMENTO DE FATURA
if (this.pendingInvoicePayments && this.pendingInvoicePayments[user.id]) {
  const pending = this.pendingInvoicePayments[user.id];

  // Tentar extrair valor do texto - aceitar numero puro tambem
  let amount = this.nlp.extractAmount(text);
  if (!amount) {
    const cleanVal = text.replace(/[R$\s]/g, '').replace(/\./g, '').replace(',', '.');
    const parsed = parseFloat(cleanVal);
    if (!isNaN(parsed) && parsed > 0) {
      amount = parsed;
    }
  }

  if (amount && amount > 0) {
    const timestamp = this.reports.getCurrentBrazilTimestamp();
    const cardBeforePayment = this.dao.getCardById(pending.cardId);

    if (!cardBeforePayment) {
      delete this.pendingInvoicePayments[user.id];
      await this.whatsapp.replyMessage(message,
        '❌ *Cartão não encontrado!*\n\n' +
        'Use `/cartoes` para conferir seus cartões.\n\n' +
        '🕐 ' + timestamp.formatted
      );
      await this.whatsapp.sendPresence(info.chatId, 'available');
      return;
    }

    if (amount > cardBeforePayment.invoice_amount) {
      await this.whatsapp.replyMessage(message,
        '❌ *Valor maior que a fatura atual!*\n\n' +
        `💳 Cartão: *${cardBeforePayment.card_name}*\n` +
        `📊 Fatura atual: ${this.reports.formatMoney(cardBeforePayment.invoice_amount)}\n` +
        `💰 Valor informado: ${this.reports.formatMoney(amount)}\n\n` +
        'Digite um valor menor ou igual à fatura.\n\n' +
        '🕐 ' + timestamp.formatted
      );
      return;
    }

    delete this.pendingInvoicePayments[user.id];
    const success = this.dao.payCardInvoice(user.id, pending.cardId, amount);

    if (success) {
      const updatedCard = this.dao.getCardById(pending.cardId);
      const updatedUser = this.dao.getUserByWhatsAppId(user.whatsapp_id);

      let resp = '✅ *FATURA PAGA!*\n\n' +
        `💳 Cartão: *${updatedCard.card_name}*\n` +
        `💰 Valor pago: ${this.reports.formatMoney(amount)}\n` +
        `🔓 Limite liberado: ${this.reports.formatMoney(amount)}\n\n` +
        '📊 *SITUAÇÃO ATUAL DO CARTÃO*\n' +
        `   Limite total: ${this.reports.formatMoney(updatedCard.card_limit)}\n` +
        `   Usado: ${this.reports.formatMoney(updatedCard.current_balance)}\n` +
        `   Disponível: ${this.reports.formatMoney(updatedCard.available_limit)}\n\n`;

      if (updatedCard.invoice_amount > 0) {
        resp += `📅 *Fatura próximo mês:* ${this.reports.formatMoney(updatedCard.invoice_amount)}\n\n`;
      } else {
        resp += '✅ *Fatura totalmente quitada!*\n\n';
      }

      resp += `💰 *Seu saldo atual:* ${this.reports.formatMoney(updatedUser.current_balance)}\n\n`;
      resp += '🕐 ' + timestamp.formatted;

      await this.whatsapp.replyMessage(message, resp);
      await this.whatsapp.sendPresence(info.chatId, 'available');
      Logger.info(`${user.name}: pagou fatura ${updatedCard.card_name} - R$ ${amount.toFixed(2)}`);
      return;
    } else {
      const timestamp = this.reports.getCurrentBrazilTimestamp();
      await this.whatsapp.replyMessage(message,
        ErrorMessages.INSUFFICIENT_BALANCE('Saldo') + '\n\n🕐 ' + timestamp.formatted
      );
      await this.whatsapp.sendPresence(info.chatId, 'available');
      return;
    }
  } else {
    // ⭐ Valor invalido - avisar o usuario (antes caia silenciosamente)
    const timestamp = this.reports.getCurrentBrazilTimestamp();
    await this.whatsapp.replyMessage(message,
      '❌ *Valor inválido!*\n\n' +
      'Digite apenas o valor numérico que você pagou.\n' +
      'Exemplo: 1300 ou 1.300,00\n\n' +
      `📊 Fatura atual: ${this.reports.formatMoney(pending.invoiceAmount)}\n\n` +
      '🕐 ' + timestamp.formatted
    );
    await this.whatsapp.sendPresence(info.chatId, 'available');
    return;
  }
}
// 💳 VERIFICAR SE ESTÁ NO FLUXO DE CRIAÇÃO DE CARTÃO (3 ETAPAS)
if (this.pendingCardCreation && this.pendingCardCreation[user.id]) {
  const pending = this.pendingCardCreation[user.id];
  const timestamp = this.reports.getCurrentBrazilTimestamp();
  
  // ETAPA 1: Aguardando nome do cartão
  if (pending.step === 'waiting_name') {
    const cardName = text.trim();
    
    // Validar tamanho do nome
    if (cardName.length < 2 || cardName.length > 50) {
      await this.whatsapp.replyMessage(message,
        '❌ *Nome inválido!*\n\n' +
        'O nome deve ter entre 2 e 50 caracteres.\n\n' +
        '💡 Exemplo: "Nubank" ou "Cartão Principal"\n\n' +
        '🕐 ' + timestamp.formatted
      );
      return;
    }
    
    // Verificar se já existe cartão com este nome
    const existing = this.dao.getCardByName(user.id, cardName);
    if (existing) {
      await this.whatsapp.replyMessage(message,
        '⚠️ *Você já tem um cartão com este nome!*\n\n' +
        `💳 Nome duplicado: *${cardName}*\n\n` +
        '💡 Escolha outro nome ou use `/cartoes` para ver seus cartões\n\n' +
        '🕐 ' + timestamp.formatted
      );
      return;
    }
    
    // Avançar para próxima etapa
    this.pendingCardCreation[user.id] = {
      step: 'waiting_limit',
      cardName: cardName,
      timestamp: Date.now()
    };
    
    await this.whatsapp.replyMessage(message,
      '💳 *CADASTRO DE CARTÃO*\n\n' +
      `✅ Nome: *${cardName}*\n\n` +
      '📊 *Agora digite o limite do cartão:*\n' +
      'Valor mínimo: R$ 100,00\n' +
      'Exemplo: 5000\n\n' +
      '⏱️ Você tem 3 minutos para responder\n\n' +
      '🕐 ' + timestamp.formatted
    );
    
    this.cleanupPendingOperation(user.id, 'card_creation', TIMEOUTS.PENDING_CARD_CREATION);
    await this.whatsapp.sendPresence(info.chatId, 'available');
    return;
  }
  
// 💳 AGUARDANDO LIMITE DO CARTÃO
if (pending.step === 'waiting_limit') {
  const timestamp = this.reports.getCurrentBrazilTimestamp();

  const cleanValue = text
    .replace(/[R$\s]/g, '')
    .replace(/\./g, '')
    .replace(',', '.');

  const limitValue = parseFloat(cleanValue);

  if (isNaN(limitValue) || limitValue < 100) {
    await this.whatsapp.replyMessage(message,
      '❌ *Limite inválido!*\n' +
      'O limite mínimo é R$ 100,00\n\n' +
      '💡 *Formatos aceitos:*\n' +
      '   • 5000\n' +
      '   • R$ 5000\n' +
      '   • 5.000\n' +
      '   • 5.000,00\n' +
      '   • R$ 5.000,00\n\n' +
      '🕐 ' + timestamp.formatted
    );
    return;
  }

  if (limitValue > 1000000) {
    await this.whatsapp.replyMessage(message,
      '❌ *Limite muito alto!*\n\n' +
      'O limite máximo é R$ 1.000.000,00\n\n' +
      '💡 Digite um valor menor\n\n' +
      '🕐 ' + timestamp.formatted
    );
    return;
  }

  // Avançar para vencimento
  this.pendingCardCreation[user.id] = {
    step: 'waiting_due_day',
    cardName: pending.cardName,
    cardLimit: limitValue,
    timestamp: Date.now()
  };

  await this.whatsapp.replyMessage(message,
    '💳 *CADASTRO DE CARTÃO*\n\n' +
    `✅ Nome: *${pending.cardName}*\n` +
    `✅ Limite: *${this.reports.formatMoney(limitValue)}*\n\n` +
    '📅 *Por último, digite o dia do vencimento da fatura:*\n' +
    'Número de 1 a 31\n' +
    'Exemplo: 10 (para todo dia 10)\n\n' +
    '⏱️ Você tem 3 minutos para responder\n\n' +
    '🕐 ' + timestamp.formatted
  );

  this.cleanupPendingOperation(user.id, 'card_creation', TIMEOUTS.PENDING_CARD_CREATION);
  await this.whatsapp.sendPresence(info.chatId, 'available');
  return;
}
  
  // ETAPA 3: Aguardando dia do vencimento
  if (pending.step === 'waiting_due_day') {
    const dueDay = parseInt(text.trim());
    
    if (isNaN(dueDay) || dueDay < 1 || dueDay > 31) {
      await this.whatsapp.replyMessage(message,
        '❌ *Dia inválido!*\n\n' +
        'Digite um número de 1 a 31\n\n' +
        '💡 Exemplo: 10 (para vencimento todo dia 10)\n\n' +
        '🕐 ' + timestamp.formatted
      );
      return;
    }
    
   // Criar o cartão
const result = this.dao.createCard(user.id, pending.cardName, pending.cardLimit, dueDay);
delete this.pendingCardCreation[user.id];

if (result.success) {
  await this.whatsapp.replyMessage(message,
    '✅ *CARTÃO CADASTRADO COM SUCESSO!*\n\n' +
    `💳 Nome: *${result.cardName}*\n` +
    `📊 Limite: ${this.reports.formatMoney(result.limit)}\n` +
    `📅 Vencimento: Todo dia ${result.dueDay}\n\n` +
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n' +
    '💡 *Como usar:*\n\n' +
    'Quando você registrar uma compra, o bot vai perguntar:\n' +
    '• Digite o nome do cartão para pagar nele\n' +
    '• Ou digitou "saldo" para pagar no saldo\n\n' +
    '📌 Use `/cartoes` para ver todos os seus cartões\n\n' +
    '🕐 ' + timestamp.formatted
  );
  
  Logger.card(user, 'criou cartão', result.cardName || pending.cardName);  // ✅ Só um ;
} else {
  await this.whatsapp.replyMessage(message, 
    (result.message || '❌ *Erro ao criar cartão*') + '\n\n🕐 ' + timestamp.formatted
  );
}

await this.whatsapp.sendPresence(info.chatId, 'available');
return;
  }
}


      const processed = this.nlp.processMessage(text);

      if (processed.type === 'command') {
        await this.handleCommand(processed, user, message, isAdmin);
      } else if (processed.type === 'expense') {
        await this.handleExpense(processed, user, message);
      } else if (processed.type === 'installment') {
        await this.handleInstallment(processed, user, message);
      } else if (processed.type === 'unknown' && text.trim().startsWith('/')) {
        const timestamp = this.reports.getCurrentBrazilTimestamp();
        await this.whatsapp.replyMessage(
          message,
          ErrorMessages.COMMAND_NOT_FOUND() + '\n\n🕑 ' + timestamp.formatted
        );
      }

      await this.whatsapp.sendPresence(info.chatId, 'available');

    } catch (error) {
      console.error('❌ Erro ao processar mensagem:', error);
      try {
        const timestamp = this.reports.getCurrentBrazilTimestamp();
        await this.whatsapp.replyMessage(message, 
          '❌ *Erro ao processar comando*\n\n' +
          '📌 Ocorreu um erro inesperado\n' +
          '💡 Tente novamente ou use `/ajuda`\n\n' +
          '🕑 ' + timestamp.formatted
        );
      } catch (e) {
        console.error('❌ Erro ao enviar mensagem de erro:', e);
      }
    }
  }

  async handleCommand(command, user, message, isAdmin) {
    let response = '';
    const timestamp = this.reports.getCurrentBrazilTimestamp();
    const info = this.whatsapp.getSenderInfo(message);
    const sender = info.sender;

    try {
      if (command.command === 'setBalance') {
        if (command.amount && command.amount > 0) {
          this.dao.setInitialBalance(user.whatsapp_id, command.amount);
          const updatedUser = this.dao.getUserByWhatsAppId(user.whatsapp_id);
          
          response = '✅ *SALDO DEFINIDO COM SUCESSO*\n\n' +
            `💰 *Valor:* ${this.reports.formatMoney(command.amount)}\n` +
            `🕑 *Data/Hora:* ${timestamp.formatted}\n\n` +
            'Agora você pode registrar seus gastos!\n' +
            'Use `/ajuda` para ver todos os comandos.';
          
          console.log('💰 ' + user.name + ': saldo inicial ' + command.amount);
        } else {
          response = ErrorMessages.INVALID_VALUE() + '\n\n🕑 ' + timestamp.formatted;
        }
        
        await this.whatsapp.replyMessage(message, response);
        return;
      }
      
      else if (command.command === 'addBalance') {
        if (command.amount && command.amount > 0) {
          const success = this.dao.addBalance(user.whatsapp_id, command.amount);
          
          if (success) {
            const updatedUser = this.dao.getUserByWhatsAppId(user.whatsapp_id);
            this.dao.setLowBalanceWarned(updatedUser.id, false);
            
            response = '✅ *SALDO ADICIONADO COM SUCESSO*\n\n' +
              `💵 *Valor adicionado:* ${this.reports.formatMoney(command.amount)}\n` +
              `🕑 *Data/Hora:* ${timestamp.formatted}\n\n` +
              '💰 *NOVO SALDO*\n' +
              `   Principal: *${this.reports.formatMoney(updatedUser.current_balance)}*\n`;
            
            if (updatedUser.savings_balance > 0) {
              response += `   Poupança: ${this.reports.formatMoney(updatedUser.savings_balance)}\n`;
            }
            if (updatedUser.emergency_fund > 0) {
              response += `   Emergência: ${this.reports.formatMoney(updatedUser.emergency_fund)}\n`;
            }
            
            const total = updatedUser.current_balance + updatedUser.savings_balance + updatedUser.emergency_fund;
            response += `   Total: ${this.reports.formatMoney(total)}`;
            
            console.log('💰 ' + user.name + ': adicionou ' + command.amount);
          } else {
            response = ErrorMessages.OPERATION_NOT_ALLOWED() + '\n\n🕑 ' + timestamp.formatted;
          }
        } else {
          response = ErrorMessages.INVALID_VALUE() + '\n\n🕑 ' + timestamp.formatted;
        }
        
        await this.whatsapp.replyMessage(message, response);
        return;
      }
      
      else if (command.command === 'getBalance') {
        const updatedUser = this.dao.getUserByWhatsAppId(user.whatsapp_id);
        response = this.reports.generateBalanceReport(updatedUser);
      }
      
      else if (command.command === 'getSavings') {
        const updatedUser = this.dao.getUserByWhatsAppId(user.whatsapp_id);
        response = '🐷 *POUPANÇA*\n\n' +
          `💵 Saldo guardado: *${this.reports.formatMoney(updatedUser.savings_balance)}*\n\n` +
          'Use `/guardar 100` para guardar dinheiro\n' +
          'Use `/retirar 50` para retirar\n\n' +
          '🕑 ' + timestamp.formatted;
      }
      
      else if (command.command === 'depositSavings') {
        if (command.amount && command.amount > 0) {
          const success = this.dao.addToSavings(user.id, command.amount);
          
          if (success) {
            const updatedUser = this.dao.getUserById(user.id);
            if (updatedUser) {
              response = this.reports.generateSavingsConfirmation('deposit', command.amount, updatedUser);
              console.log('🐷 ' + user.name + ': guardou ' + command.amount);
            } else {
              response = '❌ *Erro ao buscar dados atualizados*\n\n🕑 ' + timestamp.formatted;
            }
          } else {
            response = ErrorMessages.INSUFFICIENT_BALANCE('Saldo') + '\n\n🕑 ' + timestamp.formatted;
          }
        } else {
          response = ErrorMessages.INVALID_VALUE() + '\n\n🕑 ' + timestamp.formatted;
        }
        
        await this.whatsapp.replyMessage(message, response);
        return;
      }
      
      else if (command.command === 'withdrawSavings') {
        if (command.amount && command.amount > 0) {
          const success = this.dao.withdrawFromSavings(user.id, command.amount);
          
          if (success) {
            const updatedUser = this.dao.getUserById(user.id);
            if (updatedUser) {
              response = this.reports.generateSavingsConfirmation('withdraw', command.amount, updatedUser);
              console.log('🐷 ' + user.name + ': retirou ' + command.amount);
            } else {
              response = '❌ *Erro ao buscar dados atualizados*\n\n🕑 ' + timestamp.formatted;
            }
          } else {
            response = ErrorMessages.INSUFFICIENT_BALANCE('Poupança') + '\n\n🕑 ' + timestamp.formatted;
          }
        } else {
          response = ErrorMessages.INVALID_VALUE() + '\n\n🕑 ' + timestamp.formatted;
        }
        
        await this.whatsapp.replyMessage(message, response);
        return;
      }
      
      else if (command.command === 'getEmergency') {
        const updatedUser = this.dao.getUserByWhatsAppId(user.whatsapp_id);
        response = '🚨 *RESERVA DE EMERGÊNCIA*\n\n' +
          `💵 Saldo reservado: *${this.reports.formatMoney(updatedUser.emergency_fund)}*\n\n` +
          'Use `/reservar 200` para adicionar\n' +
          'Use `/usar 100` para utilizar\n\n' +
          '🕑 ' + timestamp.formatted;
      }
      
      else if (command.command === 'depositEmergency') {
        if (command.amount && command.amount > 0) {
          const success = this.dao.addToEmergencyFund(user.id, command.amount);
          
          if (success) {
            const updatedUser = this.dao.getUserById(user.id);
            if (updatedUser) {
              response = this.reports.generateEmergencyConfirmation('deposit', command.amount, updatedUser);
              console.log('🚨 ' + user.name + ': reservou ' + command.amount);
            } else {
              response = '❌ *Erro ao buscar dados atualizados*\n\n🕑 ' + timestamp.formatted;
            }
          } else {
            response = ErrorMessages.INSUFFICIENT_BALANCE('Saldo') + '\n\n🕑 ' + timestamp.formatted;
          }
        } else {
          response = ErrorMessages.INVALID_VALUE() + '\n\n🕑 ' + timestamp.formatted;
        }
        
        await this.whatsapp.replyMessage(message, response);
        return;
      }
      
      else if (command.command === 'withdrawEmergency') {
        if (command.amount && command.amount > 0) {
          const success = this.dao.withdrawFromEmergencyFund(user.id, command.amount);
          
          if (success) {
            const updatedUser = this.dao.getUserById(user.id);
            if (updatedUser) {
              response = this.reports.generateEmergencyConfirmation('withdraw', command.amount, updatedUser);
              console.log('🚨 ' + user.name + ': usou reserva ' + command.amount);
            } else {
              response = '❌ *Erro ao buscar dados atualizados*\n\n🕑 ' + timestamp.formatted;
            }
          } else {
            response = ErrorMessages.INSUFFICIENT_BALANCE('Reserva de emergência') + '\n\n🕑 ' + timestamp.formatted;
          }
        } else {
          response = ErrorMessages.INVALID_VALUE() + '\n\n🕑 ' + timestamp.formatted;
        }
        
        await this.whatsapp.replyMessage(message, response);
        return;
      }
      
      // ============ 💳 CRIAR NOVO CARTÃO (INICIAR FLUXO) ============
else if (command.command === 'createCard') {
  if (!this.pendingCardCreation) this.pendingCardCreation = {};
  
  this.pendingCardCreation[user.id] = {
    step: 'waiting_name',
    timestamp: Date.now()
  };
  
  response = '💳 *CRIAR NOVO CARTÃO*\n\n' +
    '📝 *Passo 1/3: Nome do cartão*\n\n' +
    'Digite um nome para identificar seu cartão:\n\n' +
    '💡 Exemplos:\n' +
    '• Nubank\n' +
    '• Inter\n' +
    '• C6 Bank\n' +
    '• Cartão Principal\n\n' +
    '⏱️ Você tem 3 minutos para responder\n\n' +
    '🕐 ' + timestamp.formatted;
  
  this.cleanupPendingOperation(user.id, 'card_creation', TIMEOUTS.PENDING_CARD_CREATION);
}

// ============ 💳 LISTAR TODOS OS CARTÕES ============
else if (command.command === 'listCards') {
  const cards = this.dao.getAllCardsByUserId(user.id);
  
  if (!cards || cards.length === 0) {
    response = '💳 *VOCÊ NÃO TEM CARTÕES CADASTRADOS*\n\n' +
      'Use `/cartao criar` para cadastrar seu primeiro cartão!\n\n' +
      '🕐 ' + timestamp.formatted;
  } else {
    response = '💳 *SEUS CARTÕES*\n\n';
    
    for (let i = 0; i < cards.length; i++) {
      const card = cards[i];
      const percentUsed = card.card_limit > 0 ? (card.current_balance / card.card_limit * 100).toFixed(1) : 0;
      
      response += `📇 *${card.card_name}*\n`;
      response += `   Limite: ${this.reports.formatMoney(card.card_limit)}\n`;
      response += `   Usado: ${this.reports.formatMoney(card.current_balance)} (${percentUsed}%)\n`;
      response += `   Disponível: ${this.reports.formatMoney(card.available_limit)}\n`;
      response += `   Fatura: ${this.reports.formatMoney(card.invoice_amount)}\n`;
      response += `   Vencimento: Dia ${card.invoice_due_day}\n\n`;
    }
    
    response += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n';
    response += '💡 Use `/cartao [nome]` para ver detalhes\n';
    response += '💡 Use `/pagar fatura [nome]` para pagar\n\n';
    response += '🕐 ' + timestamp.formatted;
  }
}

// ============ 💳 VER DETALHES DE UM CARTÃO ESPECÍFICO ============
else if (command.command === 'getCardByName') {
  if (!command.description) {
    response = '❌ Digite o nome do cartão!\n\n💡 Exemplo: `/cartao nubank`\n\n🕐 ' + timestamp.formatted;
  } else {
    const card = this.dao.findCardByPartialName(user.id, command.description);
    
    if (!card) {
      response = `❌ Cartão "${command.description}" não encontrado\n\n` +
        'Use `/cartoes` para ver todos os seus cartões\n\n' +
        '🕐 ' + timestamp.formatted;
    } else {
      const percentUsed = card.card_limit > 0 ? (card.current_balance / card.card_limit * 100).toFixed(1) : 0;
      
      response = `💳 *${card.card_name.toUpperCase()}*\n\n`;
      response += '📊 *LIMITES*\n';
      response += `   Total: ${this.reports.formatMoney(card.card_limit)}\n`;
      response += `   Usado: ${this.reports.formatMoney(card.current_balance)} (${percentUsed}%)\n`;
      response += `   Disponível: ${this.reports.formatMoney(card.available_limit)}\n\n`;
      response += '💰 *FATURA*\n';
      response += `   Valor atual: ${this.reports.formatMoney(card.invoice_amount)}\n`;
      response += `   Vencimento: Todo dia ${card.invoice_due_day}\n\n`;
      
      if (card.last_payment_date) {
        const lastPayment = new Date(card.last_payment_date);
        response += '📅 *ÚLTIMO PAGAMENTO*\n';
        response += `   Valor: ${this.reports.formatMoney(card.last_payment_amount)}\n`;
        response += `   Data: ${lastPayment.toLocaleDateString('pt-BR')}\n\n`;
      }
      
      response += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n';
      response += `💡 Use \`/pagar fatura ${card.card_name}\` para pagar\n\n`;
      response += '🕐 ' + timestamp.formatted;
    }
  }
}

// ============ 💳 PAGAR FATURA (MÚLTIPLOS CARTÕES) ============
else if (command.command === 'payInvoiceCard') {
  const cardName = (command.description || '').trim();
  const cards = this.dao.getAllCardsByUserId(user.id);

  if (!cards || cards.length === 0) {
    response = '[ERRO] *Voce nao tem cartoes cadastrados*\n\n' +
      'Use `/cartao criar` para cadastrar seu primeiro cartao!\n\n' +
      '🕐 ' + timestamp.formatted;
  } else {
    let card = null;

    if (cardName) {
      card = this.dao.findCardByPartialName(user.id, cardName);
    } else if (cards.length === 1) {
      card = cards[0];
    } else {
      let cardList = '';
      for (let i = 0; i < cards.length; i++) {
        cardList += '• *' + cards[i].card_name + '*\n';
      }
      response = '[INFO] Voce tem mais de um cartao.\n\n' +
        'Use `/pagar fatura [nome do cartao]`.\n\n' +
        '[INFO] *Seus cartoes:*\n' +
        cardList + '\n' +
        '🕐 ' + timestamp.formatted;
    }

    if (!response && !card) {
      response = '[ERRO] Cartao ' + cardName + ' nao encontrado\n\nUse `/cartoes` para ver seus cartoes\n\n🕐 ' + timestamp.formatted;
    } else if (!response && card.invoice_amount === 0) {
      response = '[OK] *FATURA ZERADA*\n\n[INFO] Cartao: *' + card.card_name + '*\n\nVoce nao tem fatura para pagar!\n\n🕐 ' + timestamp.formatted;
    } else if (!response) {
      if (!this.pendingInvoicePayments) this.pendingInvoicePayments = {};
      
      this.pendingInvoicePayments[user.id] = {
        cardId: card.id,
        cardName: card.card_name,
        invoiceAmount: card.invoice_amount,
        timestamp: Date.now()
      };

      response = '[CARTAO] *PAGAMENTO DE FATURA*\n\n' +
        '[INFO] Cartao: *' + card.card_name + '*\n' +
        '[INFO] Fatura atual: ' + this.reports.formatMoney(card.invoice_amount) + '\n' +
        '[INFO] Seu saldo: ' + this.reports.formatMoney(user.current_balance) + '\n\n' +
        '[INFO] *Digite o valor que voce pagou:*\n' +
        'Exemplo: 1300\n\n' +
        '[INFO] Voce tem 2 minutos para responder\n\n' +
        '🕐 ' + timestamp.formatted;

      this.cleanupPendingOperation(user.id, 'invoice', TIMEOUTS.PENDING_INVOICE);
    }
  }
}

// ============ 💳 DELETAR CARTÃO ============
else if (command.command === 'deleteCard') {
  if (!command.description) {
    response = '❌ Digite o nome do cartão!\n\n💡 Exemplo: `/deletar cartao nubank`\n\n🕐 ' + timestamp.formatted;
  } else {
    const card = this.dao.findCardByPartialName(user.id, command.description);
    
    if (!card) {
      response = `❌ Cartão "${command.description}" não encontrado\n\n` +
        'Use `/cartoes` para ver todos os seus cartões\n\n' +
        '🕐 ' + timestamp.formatted;
    } else {
      // ✅ ORDEM CORRETA: (cardId, userId)
      const success = this.dao.deleteCard(card.id, user.id);
      
      if (success) {
        response = '✅ *CARTÃO DELETADO*\n\n' +
          `💳 ${card.card_name} foi removido com sucesso!\n\n` +
          '🕐 ' + timestamp.formatted;
        
        Logger.card(user, 'deletou cartão', card.card_name);
      } else {
        response = '❌ Erro ao deletar cartão\n\n🕐 ' + timestamp.formatted;
      }
    }
  }
}


else if (command.command === 'resetCard') {
  if (!command.description) {
    response = '❌ Digite o nome do cartão!\n\n💡 Exemplo: `/zerar cartao nubank`\n\n🕐 ' + timestamp.formatted;
  } else {
    const card = this.dao.findCardByPartialName(user.id, command.description);
    
    if (!card) {
      response = `❌ Cartão "${command.description}" não encontrado\n\n` +
        'Use `/cartoes` para ver todos os seus cartões\n\n' +
        '🕐 ' + timestamp.formatted;
    } else {
      // ✅ ORDEM CORRETA: (cardId, userId)
      const success = this.dao.resetCard(card.id, user.id);
      
      if (success) {
        response = '✅ *CARTÃO ZERADO*\n\n' +
          `💳 ${card.card_name}\n\n` +
          '• Saldo usado: R$ 0,00\n' +
          '• Fatura: R$ 0,00\n' +
          `• Limite disponível: ${this.reports.formatMoney(card.card_limit)}\n\n` +
          '🕐 ' + timestamp.formatted;
        
        Logger.card(user, 'zerou cartão', card.card_name);
      } else {
        response = '❌ Erro ao zerar cartão\n\n🕐 ' + timestamp.formatted;
      }
    }
  }
}

// ============ 📅 VENCIMENTOS ============
else if (command.command === 'vencimentos') {
  const cards = this.dao.getAllCardsByUserId(user.id);
  
  if (!cards || cards.length === 0) {
    response = '💳 Você não tem cartões cadastrados\n\n🕐 ' + timestamp.formatted;
  } else {
    response = '📅 *VENCIMENTOS DOS CARTÕES*\n\n';
    
    // Ordenar por dia de vencimento
    cards.sort((a, b) => a.invoice_due_day - b.invoice_due_day);
    
    for (let i = 0; i < cards.length; i++) {
      const card = cards[i];
      response += `💳 *${card.card_name}*\n`;
      response += `   Vencimento: Todo dia ${card.invoice_due_day}\n`;
      response += `   Fatura atual: ${this.reports.formatMoney(card.invoice_amount)}\n\n`;
    }
    
    response += '🕐 ' + timestamp.formatted;
  }
}
      
      // 💳 ATUALIZAR LIMITE DE CARTÃO
else if (command.command === 'setCardLimit') {
  if (command.amount && command.amount > 0) {
    const cards = this.dao.getAllCardsByUserId(user.id);
    if (!cards || cards.length === 0) {
      response = '❌ *Você não tem cartões cadastrados*\n\n' +
        'Use `/cartao criar` para cadastrar seu primeiro cartão!\n\n' +
        '🕐 ' + timestamp.formatted;
    } else if (cards.length === 1) {
      const success = this.dao.updateCardLimit(cards[0].id, command.amount);
      if (success) {
        const updatedCard = this.dao.getCardById(cards[0].id);
        response = '✅ *LIMITE ATUALIZADO*\n\n' +
          `💳 Cartão: *${updatedCard.card_name}*\n` +
          `💰 Novo limite: ${this.reports.formatMoney(command.amount)}\n` +
          `💵 Usado: ${this.reports.formatMoney(updatedCard.current_balance)}\n` +
          `✅ Disponível: ${this.reports.formatMoney(updatedCard.available_limit)}\n\n` +
          '🕐 ' + timestamp.formatted;
        Logger.card(user, 'atualizou limite para', command.amount);
      } else {
        response = '❌ Erro ao atualizar limite\n\n🕐 ' + timestamp.formatted;
      }
    } else {
      response = '💳 Você tem mais de um cartão.\n\n' +
        'Use `/cartoes` para ver a lista e depois `/cartao [nome]` para ver detalhes.\n\n' +
        '🕐 ' + timestamp.formatted;
    }
  } else {
    response = ErrorMessages.INVALID_VALUE() + '\n\n🕐 ' + timestamp.formatted;
  }
}

else if (command.command === 'getCard') {
  const cards = this.dao.getAllCardsByUserId(user.id);
  if (!cards || cards.length === 0) {
    response = '💳 *VOCÊ NÃO TEM CARTÕES CADASTRADOS*\n\n' +
      'Use `/cartao criar` para cadastrar seu primeiro cartão!\n\n' +
      '🕐 ' + timestamp.formatted;
  } else if (cards.length === 1) {
    response = this.reports.generateCardReport(cards[0]);
  } else {
    response = '💳 Você tem mais de um cartão.\n\n' +
      'Use `/cartoes` para ver todos ou `/cartao [nome]` para detalhes de um específico.\n\n' +
      '🕐 ' + timestamp.formatted;
  }
}
      
      else if (command.command === 'reportWeekly') {
        response = this.reports.generateWeeklyReport(user.id);
      }
      
      else if (command.command === 'reportMonthly') {
        response = this.reports.generateMonthlyReport(user.id);
      }

      else if (command.command === 'reportChart') {
        const period = command.description === 'week' ? 'week' : 'month';
        response = this.generateVisualChartMessage(user.id, period);
      }

      else if (command.command === 'goalsList') {
        response = this.generateGoalsMessage(user.id);
      }

      else if (command.command === 'goalsCreate') {
        const parsed = this.parseGoalCreateInput(command.description);
        if (!parsed) {
          response = '❌ *Formato inválido*\n\n' +
            'Use: `/meta criar 5000 viagem`\n\n' +
            '🕑 ' + timestamp.formatted;
        } else {
          const created = this.dao.createSavingsGoal(user.id, parsed.name, parsed.amount);
          if (!created.success) {
            response = '❌ *Erro ao criar meta*\n\n' +
              `📌 ${created.error}\n\n` +
              '🕑 ' + timestamp.formatted;
          } else {
            response = '✅ *META CRIADA*\n\n' +
              `🎯 ${parsed.name}\n` +
              `💰 Alvo: ${this.reports.formatMoney(parsed.amount)}\n\n` +
              'Use `/meta` para acompanhar o progresso.\n\n' +
              '🕑 ' + timestamp.formatted;
          }
        }
      }

      else if (command.command === 'goalsDelete') {
        const goalId = parseInt(command.amount, 10);
        if (!goalId) {
          response = '❌ *ID inválido*\n\nUse `/meta remover [id]`\n\n🕑 ' + timestamp.formatted;
        } else {
          const removed = this.dao.deleteSavingsGoal(user.id, goalId);
          response = removed
            ? `✅ *META #${goalId} REMOVIDA*\n\n🕑 ${timestamp.formatted}`
            : `❌ *Meta #${goalId} não encontrada*\n\n🕑 ${timestamp.formatted}`;
        }
      }

      else if (command.command === 'goalsComplete') {
        const goalId = parseInt(command.amount, 10);
        if (!goalId) {
          response = '❌ *ID inválido*\n\nUse `/meta concluir [id]`\n\n🕑 ' + timestamp.formatted;
        } else {
          const completed = this.dao.completeSavingsGoal(user.id, goalId);
          response = completed
            ? `✅ *META #${goalId} CONCLUÍDA*\n\nParabéns pelo resultado.\n\n🕑 ${timestamp.formatted}`
            : `❌ *Meta #${goalId} não encontrada*\n\n🕑 ${timestamp.formatted}`;
        }
      }

      else if (command.command === 'exportExcel' || command.command === 'exportPdf' || command.command === 'exportAll') {
        const wantsExcel = command.command === 'exportExcel' || command.command === 'exportAll';
        const wantsPdf = command.command === 'exportPdf' || command.command === 'exportAll';
        const sentFiles = [];

        if (wantsExcel) {
          const excel = await this.exportService.exportExcel(user.id);
          if (excel.success && this.whatsapp.sendDocument) {
            await this.whatsapp.sendDocument(info.chatId, excel.filePath, excel.fileName, '📊 Exportação Excel');
            sentFiles.push('Excel');
          } else if (!excel.success) {
            response = '❌ *Falha ao gerar Excel*\n\n' + excel.error + '\n\n🕑 ' + timestamp.formatted;
          }
        }

        if (!response && wantsPdf) {
          const pdf = await this.exportService.exportPdf(user.id);
          if (pdf.success && this.whatsapp.sendDocument) {
            await this.whatsapp.sendDocument(info.chatId, pdf.filePath, pdf.fileName, '📄 Exportação PDF');
            sentFiles.push('PDF');
          } else if (!pdf.success) {
            response = '❌ *Falha ao gerar PDF*\n\n' + pdf.error + '\n\n🕑 ' + timestamp.formatted;
          }
        }

        if (!response) {
          response = '✅ *EXPORTAÇÃO CONCLUÍDA*\n\n' +
            `Arquivos enviados: ${sentFiles.join(', ') || 'nenhum'}\n\n` +
            '🕑 ' + timestamp.formatted;
        }
      }

      else if (command.command === 'dashboard') {
        const dashboardEnabled = String(process.env.DASHBOARD_ENABLED || '').toLowerCase() === 'true';
        const link = this.getDashboardUrl();
        if (!dashboardEnabled) {
          response = '⚠️ *DASHBOARD DESABILITADO*\n\n' +
            'Defina `DASHBOARD_ENABLED=true` no .env e reinicie o bot.\n\n' +
            '🕑 ' + timestamp.formatted;
        } else {
          const tokenHint = process.env.DASHBOARD_TOKEN ? '\n🔐 Token ativo: adicione `?token=SEU_TOKEN` no link.' : '';
          response = '📊 *DASHBOARD WEB*\n\n' +
            `Acesse: ${link}\n` +
            'Modo: leitura (read-only)\n' +
            tokenHint +
            '\n\n🕑 ' + timestamp.formatted;
        }
      }

      else if (command.command === 'forecast') {
        response = this.forecastService.generateForecastMessage(user.id);
      }

      else if (command.command === 'syncStatus') {
        if (!isAdmin) {
          response = ErrorMessages.OPERATION_NOT_ALLOWED() + '\n\n🕑 ' + timestamp.formatted;
        } else if (!this.dao.cloudSyncService) {
          response = 'ℹ️ *SYNC POSTGRESQL*\n\nSincronização não configurada.\n\n🕑 ' + timestamp.formatted;
        } else {
          const status = this.dao.cloudSyncService.getStatus();
          response = '☁️ *STATUS DO SYNC (POSTGRESQL)*\n\n' +
            `Ativo: ${status.enabled ? 'sim' : 'não'}\n` +
            `Em execução: ${status.inProgress ? 'sim' : 'não'}\n` +
            `Pendente: ${status.pending ? 'sim' : 'não'}\n` +
            `Último sync: ${status.lastSyncAt || 'nunca'}\n` +
            `Último status: ${status.lastStatus || 'n/a'}\n` +
            `Último erro: ${status.lastError || 'nenhum'}\n\n` +
            '🕑 ' + timestamp.formatted;
        }
      }

      else if (command.command === 'syncNow') {
        if (!isAdmin) {
          response = ErrorMessages.OPERATION_NOT_ALLOWED() + '\n\n🕑 ' + timestamp.formatted;
        } else if (!this.dao.cloudSyncService) {
          response = 'ℹ️ *SYNC POSTGRESQL*\n\nSincronização não configurada.\n\n🕑 ' + timestamp.formatted;
        } else {
          const syncResult = await this.dao.cloudSyncService.syncNow();
          response = syncResult.success
            ? `✅ *SYNC CONCLUÍDO*\n\n☁️ PostgreSQL atualizado em ${syncResult.syncedAt}\n\n🕑 ${timestamp.formatted}`
            : `❌ *Falha no sync*\n\n📌 ${syncResult.error}\n\n🕑 ${timestamp.formatted}`;
        }
      }
      
      else if (command.command === 'getInstallments') {
        response = this.reports.generateInstallmentsList(user.id);
      }
      
      else if (command.command === 'payInstallment') {
        if (!command.description) {
          response = ErrorMessages.INVALID_VALUE() + '\n\n💡 Use: `/pagar [nome do produto]`\n\n🕑 ' + timestamp.formatted;
        } else {
          const installment = this.dao.findInstallmentByDescription(user.id, command.description);
          
          if (!installment) {
            response = ErrorMessages.NO_DATA_FOUND('parcelamento com este nome') + '\n\n💡 Use `/parcelamentos` para ver a lista\n\n🕑 ' + timestamp.formatted;
          } else {
            const nextPayment = this.dao.getNextPendingPayment(installment.id);
            
            if (!nextPayment) {
              response = '✅ *PARCELAMENTO QUITADO*\n\n' +
                `📦 ${installment.description}\n\n` +
                'Este parcelamento já foi totalmente pago!\n\n' +
                '🕑 ' + timestamp.formatted;
            } else {
              const success = this.dao.payInstallment(nextPayment.id, user.id);
              
              if (success) {
                const updatedUser = this.dao.getUserById(user.id);
                const updatedPayment = this.dao.getInstallmentPayments(installment.id)
                  .find(p => p.id === nextPayment.id);
                
                response = this.reports.generatePaymentConfirmation(installment, updatedPayment, updatedUser);
                console.log('💳 ' + user.name + ': pagou parcela ' + nextPayment.installment_number + '/' + installment.total_installments);
              } else {
                response = ErrorMessages.INSUFFICIENT_BALANCE('Saldo') + '\n\n💡 Use `/saldo` para verificar\n\n🕑 ' + timestamp.formatted;
              }
            }
          }
        }
      }
      
      else if (command.command === 'getReminders' || command.command === 'getDuePayments') {
        response = this.reports.generateRemindersList(user.id);
      }
      
      else if (command.command === 'resetBalance') {
  const pending = this.pendingResets[user.id];
  const now = Date.now();
  
  if (pending && pending.type === 'balance' && (now - pending.timestamp) < 120000) {
    delete this.pendingResets[user.id];
    const success = this.dao.resetBalance(user.id);
    
    if (success) {
      response = this.reports.generateResetConfirmation('balance');
      console.log('☢️ ' + user.name + ': zerou saldo principal');
    } else {
      response = ErrorMessages.OPERATION_NOT_ALLOWED() + '\n\n🕐 ' + timestamp.formatted;
    }
  } else {
    this.pendingResets[user.id] = { type: 'balance', timestamp: now };
    response = this.reports.generateResetWarning('balance');
    
    const self = this;
    setTimeout(function() {
      if (self.pendingResets[user.id] && self.pendingResets[user.id].type === 'balance') {
        delete self.pendingResets[user.id];
      }
    }, 120000);
  }
}
      
      else if (command.command === 'resetSavings') {
  const pending = this.pendingResets[user.id];
  const now = Date.now();
  
  if (pending && pending.type === 'savings' && (now - pending.timestamp) < 120000) {
    delete this.pendingResets[user.id];
    const success = this.dao.resetSavings(user.id);
    
    if (success) {
      response = this.reports.generateResetConfirmation('savings');
      console.log('☢️ ' + user.name + ': zerou poupança');
    } else {
      response = ErrorMessages.NO_DATA_FOUND('poupança') + '\n\n🕐 ' + timestamp.formatted;
    }
  } else {
    this.pendingResets[user.id] = { type: 'savings', timestamp: now };
    response = this.reports.generateResetWarning('savings');
    
    const self = this;
    setTimeout(function() {
      if (self.pendingResets[user.id] && self.pendingResets[user.id].type === 'savings') {
        delete self.pendingResets[user.id];
      }
    }, 120000);
  }
}
      
      else if (command.command === 'resetEmergency') {
  const pending = this.pendingResets[user.id];
  const now = Date.now();
  
  if (pending && pending.type === 'emergency' && (now - pending.timestamp) < 120000) {
    delete this.pendingResets[user.id];
    const success = this.dao.resetEmergencyFund(user.id);
    
    if (success) {
      response = this.reports.generateResetConfirmation('emergency');
      console.log('☢️ ' + user.name + ': zerou reserva de emergência');
    } else {
      response = ErrorMessages.NO_DATA_FOUND('reserva de emergência') + '\n\n🕐 ' + timestamp.formatted;
    }
  } else {
    this.pendingResets[user.id] = { type: 'emergency', timestamp: now };
    response = this.reports.generateResetWarning('emergency');
    
    const self = this;
    setTimeout(function() {
      if (self.pendingResets[user.id] && self.pendingResets[user.id].type === 'emergency') {
        delete self.pendingResets[user.id];
      }
    }, 120000);
  }
}
      
      else if (command.command === 'resetInstallments') {
  const pending = this.pendingResets[user.id];
  const now = Date.now();
  
  if (pending && pending.type === 'installments' && (now - pending.timestamp) < 120000) {
    delete this.pendingResets[user.id];
    const success = this.dao.resetInstallments(user.id);
    
    if (success) {
      response = this.reports.generateResetConfirmation('installments');
      console.log('☢️ ' + user.name + ': zerou parcelamentos');
    } else {
      response = ErrorMessages.NO_DATA_FOUND('parcelamentos') + '\n\n🕐 ' + timestamp.formatted;
    }
  } else {
    this.pendingResets[user.id] = { type: 'installments', timestamp: now };
    response = this.reports.generateResetWarning('installments');
    
    const self = this;
    setTimeout(function() {
      if (self.pendingResets[user.id] && self.pendingResets[user.id].type === 'installments') {
        delete self.pendingResets[user.id];
      }
    }, 120000);
  }
}
      
      else if (command.command === 'resetEverything') {
  const pending = this.pendingResets[user.id];
  const now = Date.now();
  
  if (pending && pending.type === 'everything' && (now - pending.timestamp) < 120000) {
    delete this.pendingResets[user.id];
    const success = this.dao.resetEverything(user.id);
    
    if (success) {
      response = this.reports.generateResetConfirmation('everything');
      console.log('☢️☢️☢️ ' + user.name + ': ZEROU TODO O SISTEMA');
    } else {
      response = ErrorMessages.OPERATION_NOT_ALLOWED() + '\n\n🕐 ' + timestamp.formatted;
    }
  } else {
    this.pendingResets[user.id] = { type: 'everything', timestamp: now };
    response = this.reports.generateResetWarning('everything');
    
    const self = this;
    setTimeout(function() {
      if (self.pendingResets[user.id] && self.pendingResets[user.id].type === 'everything') {
        delete self.pendingResets[user.id];
      }
    }, 120000);
  }
}
      
      else if (command.command === 'help') {
  // ⭐ ADICIONAR COMANDOS ADMIN NO /AJUDA
  if (isAdmin) {
    response = this.reports.generateHelpMessage() + 
               '\n\n═══════════════════════════════════════\n\n' +
               '🔧 *COMANDOS ADMINISTRATIVOS*\n\n' +
               'Você tem acesso a comandos especiais:\n\n' +
               '*!status*\n' +
               '└ Ver status da memória do bot\n\n' +
               '*!limpar*\n' +
               '└ Limpar apenas sua memória\n\n' +
               '*!limpartudo*\n' +
               '└ Limpar TODA a memória do bot\n\n' +
               '*!ajuda*\n' +
               '└ Ver comandos administrativos\n\n' +
               '═══════════════════════════════════════\n\n' +
               '⚠️ Apenas você (admin) pode usar estes comandos.';
  } else {
    response = this.reports.generateHelpMessage();
  }
}
      
      else if (command.command === 'start') {
        response = this.reports.generateWelcomeMessage(user.name);
        
        // ⭐ SE FOR ADMIN, MOSTRAR INFO SOBRE COMANDOS ESPECIAIS
        if (isAdmin) {
          response += '\n\n━━━━━━━━━━━━━━━━━━━\n\n' +
                      '🔧 *PAINEL ADMINISTRATIVO ATIVO*\n\n' +
                      'Você tem acesso a comandos especiais de gerenciamento.\n' +
                      'Digite *!ajuda* para ver os comandos admin.\n\n' +
                      '━━━━━━━━━━━━━━━━━━━';
        }
      }
      
      else {
        response = ErrorMessages.COMMAND_NOT_FOUND() + '\n\n🕑 ' + timestamp.formatted;
      }

    } catch (error) {
      console.error('❌ Erro no comando:', error);
      response = '❌ *Erro ao executar comando*\n\n' +
        `📌 ${error.message}\n` +
        '💡 Tente novamente ou use `/ajuda`\n\n' +
        '🕑 ' + timestamp.formatted;
    }

    if (!response || response.trim() === '') {
      response = '⚠️ *Comando processado sem confirmação*\n\n' +
        `📌 Comando: ${command.command}\n` +
        '💡 Use `/ajuda` para ver comandos disponíveis\n\n' +
        '🕑 ' + timestamp.formatted;
      console.error('⚠️ AVISO: Comando sem resposta - ' + command.command);
    }

    await this.whatsapp.replyMessage(message, response);
  }

  async handleExpense(expense, user, message) {
  const timestamp = this.reports.getCurrentBrazilTimestamp();
  const info = this.whatsapp.getSenderInfo(message);
  const chatId = info.chatId;

  try {
    if (!this.nlp.isValidAmount(expense.amount)) {
      await this.whatsapp.replyMessage(message, ErrorMessages.INVALID_VALUE() + '\n\n🕐 ' + timestamp.formatted);
      return;
    }

    if (user.initial_balance === 0) {
      await this.whatsapp.replyMessage(message, ErrorMessages.INITIAL_BALANCE_REQUIRED() + '\n\n🕐 ' + timestamp.formatted);
      return;
    }

    // 💳 VERIFICAR SE USUÁRIO TEM CARTÃO CADASTRADO
    const cards = this.dao.getAllCardsByUserId(user.id);

    if (cards && cards.length > 0) {
      // TEM CARTÃO - PERGUNTAR ONDE FOI A COMPRA
      if (!this.pendingPurchases) this.pendingPurchases = {};

      this.pendingPurchases[user.id] = {
        expense: expense,
        timestamp: Date.now(),
        messageInfo: info
      };

      // Listar nomes dos cartoes disponiveis
      let cardList = '';
      for (let i = 0; i < cards.length; i++) {
        cardList += `• *${cards[i].card_name}*\n`;
      }

      await this.whatsapp.replyMessage(message,
        '💳 *FORMA DE PAGAMENTO*\n\n' +
        `💰 Valor: ${this.reports.formatMoney(expense.amount)}\n` +
        `📝 Descrição: ${expense.description}\n\n` +
        'Responda com o *nome do cartão* para pagar no cartão, ou *saldo* para pagar com o saldo.\n\n' +
        '💳 *Seus cartões:*\n' +
        cardList + '\n' +
        '⏱️ Você tem 2 minutos para responder\n\n' +
        '🕐 ' + timestamp.formatted
      );

      // Limpar após 2 minutos
      this.cleanupPendingOperation(user.id, 'purchase', TIMEOUTS.PENDING_PURCHASE);
      return;
    }
    
    // NÃO TEM CARTÃO - REGISTRAR NO SALDO DIRETO
    await this.registerExpenseInBalance(expense, user, message, info, chatId, timestamp);

  } catch (error) {
    console.error('❌ Erro ao registrar gasto:', error);
    await this.whatsapp.replyMessage(message, 
      '❌ *Erro ao registrar gasto*\n\n' +
      `📌 ${error.message}\n` +
      '💡 Tente novamente ou use `/ajuda`\n\n' +
      '🕐 ' + timestamp.formatted
    );
  }
}

// 💳 REGISTRAR GASTO NO CARTÃO (função auxiliar)
async registerExpenseInCard(expense, user, message, info, chatId, card) {
  const timestamp = this.reports.getCurrentBrazilTimestamp();
  const categoryId = this.dao.identifyCategory(expense.description);
  const category = this.dao.getCategoryById(categoryId);

  if (!card) {
    await this.whatsapp.replyMessage(message, '❌ Erro: Cartão não encontrado\n\n🕐 ' + timestamp.formatted);
    return;
  }

  const success = this.dao.addCardPurchase(user.id, card.id, expense.amount, expense.description, categoryId, chatId, info.messageId);

  if (success) {
    const updatedCard = this.dao.getCardById(card.id);
    const confirmation = this.reports.generateCardPurchaseConfirmation(expense, updatedCard, category);
    await this.whatsapp.replyMessage(message, confirmation);

    console.log('💳 ' + user.name + ': ' + this.reports.formatMoney(expense.amount) + ' no cartão ' + card.card_name + ' - ' + expense.description);

    // Avisar se limite estourou
    if (updatedCard.available_limit < 0) {
      await this.whatsapp.sendMessage(chatId,
        '🚨 *ATENÇÃO! LIMITE ESTOURADO!*\n\n' +
        `Você ultrapassou o limite do cartão em ${this.reports.formatMoney(Math.abs(updatedCard.available_limit))}!\n\n` +
        '🕐 ' + timestamp.formatted
      );
    }
  } else {
    await this.whatsapp.replyMessage(message,
      '❌ *Erro ao registrar compra no cartão*\n\n' +
      '💡 Verifique se o cartão existe e tente novamente.\n\n' +
      '🕐 ' + timestamp.formatted
    );
  }
}
// 💰 REGISTRAR GASTO NO SALDO (função auxiliar)
async registerExpenseInBalance(expense, user, message, info, chatId, timestamp) {
  const categoryId = this.dao.identifyCategory(expense.description);
  const category = this.dao.getCategoryById(categoryId);

  const savedExpense = this.dao.createExpense({
    userId: user.id,
    amount: expense.amount,
    description: expense.description,
    categoryId: categoryId,
    chatId: chatId,
    messageId: info.messageId
    
  });
  
  

  const updatedUser = this.dao.getUserByWhatsAppId(user.whatsapp_id);
  const confirmation = this.reports.generateExpenseConfirmation(savedExpense, updatedUser, category);
  await this.whatsapp.replyMessage(message, confirmation);

  Logger.expense(user, expense.amount, expense.description, category.name);

  const totalMoney = updatedUser.current_balance + updatedUser.savings_balance + updatedUser.emergency_fund;
  const percentageRemaining = updatedUser.initial_balance > 0 
    ? (totalMoney / updatedUser.initial_balance) * 100 
    : 100;

  if (updatedUser.current_balance < 0) {
    await this.whatsapp.sendMessage(chatId, 
      '🚨 *ATENÇÃO!*\n\n' +
      'Seu saldo está negativo!\n' +
      'Você está gastando mais do que tem.\n\n' +
      '🕐 ' + timestamp.formatted
    );
  } 
  else if (percentageRemaining <= 30 && !updatedUser.low_balance_warned) {
    this.dao.setLowBalanceWarned(updatedUser.id, true);
    await this.whatsapp.sendMessage(chatId, 
      '⚠️ *AVISO DE SALDO BAIXO*\n\n' +
      'Você já gastou 70% do seu dinheiro!\n' +
      `Restam apenas ${percentageRemaining.toFixed(0)}% do total.\n\n` +
      '💡 *Dica:* Considere reduzir gastos ou adicionar mais saldo.\n\n' +
      '🕐 ' + timestamp.formatted
    );
  }
}

  async handleInstallment(installment, user, message) {
  const timestamp = this.reports.getCurrentBrazilTimestamp();
  const info = this.whatsapp.getSenderInfo(message);
  const chatId = info.chatId;

  try {
    if (!this.nlp.isValidAmount(installment.totalAmount)) {
      await this.whatsapp.replyMessage(message, ErrorMessages.INVALID_VALUE() + '\n\n🕐 ' + timestamp.formatted);
      return;
    }

    if (user.initial_balance === 0) {
      await this.whatsapp.replyMessage(message, ErrorMessages.INITIAL_BALANCE_REQUIRED() + '\n\n🕐 ' + timestamp.formatted);
      return;
    }

    // 💳 VERIFICAR SE TEM CARTÃO
    const cards = this.dao.getAllCardsByUserId(user.id);

    if (cards && cards.length > 0) {
      // TEM CARTÃO - PERGUNTAR
      if (!this.pendingInstallments) this.pendingInstallments = {};

      this.pendingInstallments[user.id] = {
        installment: installment,
        timestamp: Date.now(),
        messageInfo: info
      };

      // Listar nomes dos cartoes
      let cardList = '';
      for (let i = 0; i < cards.length; i++) {
        cardList += `• *${cards[i].card_name}*\n`;
      }

      await this.whatsapp.replyMessage(message,
        '💳 *PARCELAMENTO - FORMA DE PAGAMENTO*\n\n' +
        `📦 Produto: ${installment.description}\n` +
        `💰 Total: ${this.reports.formatMoney(installment.totalAmount)}\n` +
        `📊 Parcelas: ${installment.installments}x de ${this.reports.formatMoney(installment.installmentAmount)}\n\n` +
        'Responda com o *nome do cartão* para parcelar no cartão, ou *saldo* para parcelar no saldo.\n\n' +
        '💳 *Seus cartões:*\n' +
        cardList + '\n' +
        '⏱️ Você tem 2 minutos para responder\n\n' +
        '🕐 ' + timestamp.formatted
      );

      // Limpar após 2 minutos usando a função centralizada
      this.cleanupPendingOperation(user.id, 'installment', TIMEOUTS.PENDING_INSTALLMENT);
      return;
    }
    
    // NÃO TEM CARTÃO - REGISTRAR NORMALMENTE
    await this.registerInstallmentNormal(installment, user, message, info, chatId, timestamp);

  } catch (error) {
    console.error('❌ Erro ao registrar parcelamento:', error);
    await this.whatsapp.replyMessage(message, 
      '❌ *Erro ao registrar parcelamento*\n\n' +
      `📌 ${error.message}\n` +
      '💡 Tente novamente ou use `/ajuda`\n\n' +
      '🕐 ' + timestamp.formatted
    );
  }
}

// 📦 REGISTRAR PARCELAMENTO NORMAL (função auxiliar)
async registerInstallmentNormal(installment, user, message, info, chatId, timestamp) {
  const categoryId = this.dao.identifyCategory(installment.description);
  const category = this.dao.getCategoryById(categoryId);

  const firstDueDate = new Date();
  firstDueDate.setMonth(firstDueDate.getMonth() + 1);
  firstDueDate.setDate(5);

  const savedInstallment = this.dao.createInstallment({
    userId: user.id,
    description: installment.description,
    totalAmount: installment.totalAmount,
    installmentAmount: installment.installmentAmount,
    totalInstallments: installment.installments,
    categoryId: categoryId,
    chatId: chatId,
    firstDueDate: firstDueDate
  });

  const confirmation = this.reports.generateInstallmentConfirmation(savedInstallment, category);
  await this.whatsapp.replyMessage(message, confirmation);

  console.log('📦 ' + user.name + ': parcelou ' + this.reports.formatMoney(installment.totalAmount) + ' em ' + installment.installments + 'x - ' + installment.description);
}

// 💳 REGISTRAR PARCELAMENTO NO CARTÃO (função auxiliar)
async registerInstallmentInCard(installment, user, message, info, chatId, card) {
  const timestamp = this.reports.getCurrentBrazilTimestamp();
  const categoryId = this.dao.identifyCategory(installment.description);
  const category = this.dao.getCategoryById(categoryId);

  const firstDueDate = new Date();
  firstDueDate.setMonth(firstDueDate.getMonth() + 1);
  firstDueDate.setDate(5);

  const savedInstallment = this.dao.createInstallment({
    userId: user.id,
    description: installment.description,
    totalAmount: installment.totalAmount,
    installmentAmount: installment.installmentAmount,
    totalInstallments: installment.installments,
    categoryId: categoryId,
    chatId: chatId,
    firstDueDate: firstDueDate
  });

  // 💳 ADICIONAR AO CARTÃO
  const success = this.dao.addCardInstallment(user.id, card.id, savedInstallment.id, installment.totalAmount);

  if (success) {
    const updatedCard = this.dao.getCardById(card.id);
    const confirmation = this.reports.generateCardInstallmentConfirmation(savedInstallment, updatedCard, category);
    await this.whatsapp.replyMessage(message, confirmation);

    console.log('💳📦 ' + user.name + ': parcelou no cartão ' + card.card_name + ' ' + this.reports.formatMoney(installment.totalAmount) + ' em ' + installment.installments + 'x');

    if (updatedCard.available_limit < 0) {
      await this.whatsapp.sendMessage(chatId,
        '🚨 *ATENÇÃO! LIMITE ESTOURADO!*\n\n' +
        `Você ultrapassou o limite do cartão!\n\n` +
        '🕐 ' + timestamp.formatted
      );
    }
  } else {
    await this.whatsapp.replyMessage(message,
      '❌ *Erro ao registrar parcelamento no cartão*\n\n' +
      '💡 Verifique o limite disponível do cartão.\n\n' +
      '🕐 ' + timestamp.formatted
    );
  }
}
}

module.exports = MessageHandler;

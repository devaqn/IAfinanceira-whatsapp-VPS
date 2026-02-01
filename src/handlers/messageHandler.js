const NLPProcessor = require('../services/nlp');
const ReportGenerator = require('../services/reports');
const ErrorMessages = require('../utils/ErrorMessages');
const Logger = require('../utils/logger'); // ⭐ NOVO
const { TIMEOUTS, PAYMENT_METHODS } = require('../config/constants'); // ⭐ NOVOO CONTANTS

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
      'reset': self.pendingResets
    };
    
    const targetMap = pendingMap[operationType];
    if (targetMap && targetMap[userId]) {
      delete targetMap[userId];
      Logger.info(`Timeout: ${operationType} expirado para usuário ${userId}`);
    }
  }, timeout);
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
      if (sender === ADMIN_NUMBER) {
        const comando = text.toLowerCase().trim();
        
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
    delete this.pendingPurchases[user.id];
    
    await this.registerExpenseInCard(pending.expense, user, message, pending.messageInfo, info.chatId, card);
    await this.whatsapp.sendPresence(info.chatId, 'available');
    return;
  } else {
    // Não encontrou cartão nem é saldo
    const timestamp = this.reports.getCurrentBrazilTimestamp();
    await this.whatsapp.replyMessage(message,
      '❌ *Cartão não encontrado!*\n\n' +
      `Você digitou: "${text}"\n\n` +
      '💡 *Opções válidas:*\n' +
      '• Digite o nome de um dos seus cartões\n' +
      '• Ou digite "saldo" para pagar no saldo\n\n' +
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
    await this.whatsapp.replyMessage(message,
      '❌ *Cartão não encontrado!*\n\n' +
      `Você digitou: "${text}"\n\n` +
      '💡 *Opções válidas:*\n' +
      '• Digite o nome de um dos seus cartões\n' +
      '• Ou digite "saldo" para parcelar manualmente\n\n' +
      'Use `/cartoes` para ver seus cartões\n\n' +
      '🕐 ' + timestamp.formatted
    );
    return;
  }
}
// 💳 VERIFICAR SE É VALOR PARA PAGAMENTO DE FATURA
if (this.pendingInvoicePayments && this.pendingInvoicePayments[user.id]) {
  const pending = this.pendingInvoicePayments[user.id];
  const amount = this.nlp.extractAmount(text);
  
  if (amount && amount > 0) {
    delete this.pendingInvoicePayments[user.id];
    
    const timestamp = this.reports.getCurrentBrazilTimestamp();
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
      Logger.invoice(user, 'pagou fatura', updatedCard.card_name);
      return;
    } else {
      await this.whatsapp.replyMessage(message, 
        ErrorMessages.INSUFFICIENT_BALANCE('Saldo') + '\n\n🕐 ' + timestamp.formatted
      );
      await this.whatsapp.sendPresence(info.chatId, 'available');
      return;
    }
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
  
  // ETAPA 2: Aguardando limite do cartão
  if (pending.step === 'waiting_limit') {
    const limit = this.nlp.extractAmount(text);
    
    if (!limit || limit < 100) {
      await this.whatsapp.replyMessage(message,
        '❌ *Limite inválido!*\n\n' +
        'O limite mínimo é R$ 100,00\n\n' +
        '💡 Digite apenas o valor (exemplo: 5000)\n\n' +
        '🕐 ' + timestamp.formatted
      );
      return;
    }
    
    if (limit > 1000000) {
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
      cardLimit: limit,
      timestamp: Date.now()
    };
    
    await this.whatsapp.replyMessage(message,
      '💳 *CADASTRO DE CARTÃO*\n\n' +
      `✅ Nome: *${pending.cardName}*\n` +
      `✅ Limite: *${this.reports.formatMoney(limit)}*\n\n` +
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
      
      Logger.card(user, 'criou cartão', pending.cardName);
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
        await this.handleCommand(processed, user, message);
      } else if (processed.type === 'expense') {
        await this.handleExpense(processed, user, message);
      } else if (processed.type === 'installment') {
        await this.handleInstallment(processed, user, message);
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

  async handleCommand(command, user, message) {
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
  const cardName = command.description;
  const card = this.dao.findCardByPartialName(user.id, cardName);
  
  if (!card) {
    response = `❌ Cartão "${cardName}" não encontrado\n\nUse \`/cartoes\` para ver seus cartões\n\n🕐 ` + timestamp.formatted;
  } else if (card.invoice_amount === 0) {
    response = `✅ *FATURA ZERADA*\n\n💳 Cartão: *${card.card_name}*\n\nVocê não tem fatura para pagar!\n\n🕐 ` + timestamp.formatted;
  } else {
    if (!this.pendingInvoicePayments) this.pendingInvoicePayments = {};
    
    this.pendingInvoicePayments[user.id] = {
      cardId: card.id,
      cardName: card.card_name,
      invoiceAmount: card.invoice_amount,
      timestamp: Date.now()
    };

    response = '💳 *PAGAMENTO DE FATURA*\n\n' +
      `📇 Cartão: *${card.card_name}*\n` +
      `📊 Fatura atual: ${this.reports.formatMoney(card.invoice_amount)}\n` +
      `💰 Seu saldo: ${this.reports.formatMoney(user.current_balance)}\n\n` +
      '💡 *Digite o valor que você pagou:*\n' +
      'Exemplo: 1300\n\n' +
      '⏱️ Você tem 2 minutos para responder\n\n' +
      '🕐 ' + timestamp.formatted;

    this.cleanupPendingOperation(user.id, 'invoice', TIMEOUTS.PENDING_INVOICE);
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
  if (sender === ADMIN_NUMBER) {
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
        if (sender === ADMIN_NUMBER) {
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
    const card = this.dao.getCreditCardByUserId(user.id);
    
    if (card) {
      // TEM CARTÃO - PERGUNTAR ONDE FOI A COMPRA
      if (!this.pendingPurchases) this.pendingPurchases = {};
      
      this.pendingPurchases[user.id] = {
        expense: expense,
        timestamp: Date.now(),
        messageInfo: info
      };
      
      await this.whatsapp.replyMessage(message,
        '💳 *FORMA DE PAGAMENTO*\n\n' +
        `💰 Valor: ${this.reports.formatMoney(expense.amount)}\n` +
        `📝 Descrição: ${expense.description}\n\n` +
        'Responda com:\n' +
        '• *cartao* ou *cartão* - Para pagar no cartão\n' +
        '• *saldo* ou *dinheiro* - Para pagar no saldo\n\n' +
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
    const card = this.dao.getCreditCardByUserId(user.id);
    
    if (card) {
      // TEM CARTÃO - PERGUNTAR
      if (!this.pendingInstallments) this.pendingInstallments = {};
      
      this.pendingInstallments[user.id] = {
        installment: installment,
        timestamp: Date.now(),
        messageInfo: info
      };
      
      await this.whatsapp.replyMessage(message,
        '💳 *PARCELAMENTO - FORMA DE PAGAMENTO*\n\n' +
        `📦 Produto: ${installment.description}\n` +
        `💰 Total: ${this.reports.formatMoney(installment.totalAmount)}\n` +
        `📊 Parcelas: ${installment.installments}x de ${this.reports.formatMoney(installment.installmentAmount)}\n\n` +
        'Responda com:\n' +
        '• *cartao* ou *cartão* - Parcelar no cartão\n' +
        '• *saldo* - Parcelar no saldo (paga manualmente)\n\n' +
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
  }
}
}

module.exports = MessageHandler;
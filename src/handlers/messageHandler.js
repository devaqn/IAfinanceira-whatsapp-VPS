const NLPProcessor = require('../services/nlp');
const ReportGenerator = require('../services/reports');
const ErrorMessages = require('../utils/ErrorMessages');

class MessageHandler {
  constructor(dao, whatsappService) {
    this.dao = dao;
    this.whatsapp = whatsappService;
    this.nlp = new NLPProcessor();
    this.reports = new ReportGenerator(dao);
    this.recentlyProcessed = {};
    this.pendingResets = {};
  }

  async process(message) {
    try {
      if (this.whatsapp.isFromMe(message)) {
        return;
      }

      const text = this.whatsapp.getMessageText(message);
      if (!text || text.trim() === '') return;

      const info = this.whatsapp.getSenderInfo(message);
      const sender = info.sender;
      const chatId = info.chatId;
      const isGroup = info.isGroup;
      const messageId = info.messageId;

      const messageKey = sender + '-' + messageId;
      if (this.recentlyProcessed[messageKey]) {
        return;
      }
      this.recentlyProcessed[messageKey] = true;
      
      const self = this;
      setTimeout(function() {
        delete self.recentlyProcessed[messageKey];
      }, 30000);

      await this.whatsapp.markAsRead(chatId, messageId);
      await this.whatsapp.sendPresence(chatId, 'composing');

      let user = this.dao.getUserByWhatsAppId(sender);
      if (!user) {
        const name = message.pushName || sender.split('@')[0];
        user = this.dao.upsertUser(sender, name);
        console.log('👤 Novo usuário: ' + name + ' (' + sender + ')');
        
        await this.whatsapp.replyMessage(message, this.reports.generateWelcomeMessage(name));
        await this.whatsapp.sendPresence(chatId, 'available');
        return; // 🔧 CORREÇÃO 4: Fluxo encerrado
      }

      if (isGroup) {
        const groupName = chatId.split('@')[0];
        this.dao.upsertGroup(chatId, groupName);
      }

      const processed = this.nlp.processMessage(text);

      if (processed.type === 'command') {
        await this.handleCommand(processed, user, message);
      } else if (processed.type === 'expense') {
        await this.handleExpense(processed, user, message);
      } else if (processed.type === 'installment') {
        await this.handleInstallment(processed, user, message);
      }

      await this.whatsapp.sendPresence(chatId, 'available');

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
        return; // 🔧 CORREÇÃO 4: Encerrar fluxo
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
        return; // 🔧 CORREÇÃO 4: Encerrar fluxo
      }
      
      else if (command.command === 'getBalance') {
        const updatedUser = this.dao.getUserByWhatsAppId(user.whatsapp_id);
        response = this.reports.generateBalanceReport(updatedUser);
      }
      
      else if (command.command === 'getSavings') {
        const updatedUser = this.dao.getUserByWhatsAppId(user.whatsapp_id);
        response = '🏷 *POUPANÇA*\n\n' +
          `💵 Saldo guardado: *${this.reports.formatMoney(updatedUser.savings_balance)}*\n\n` +
          'Use `/guardar 100` para guardar dinheiro\n' +
          'Use `/retirar 50` para retirar\n\n' +
          '🕑 ' + timestamp.formatted;
      }
      
      // 🔧 CORREÇÃO 2 E 4: Poupança com confirmação explícita + encerramento
      else if (command.command === 'depositSavings') {
        if (command.amount && command.amount > 0) {
          const success = this.dao.addToSavings(user.id, command.amount);
          
          if (success) {
            const updatedUser = this.dao.getUserById(user.id);
            response = this.reports.generateSavingsConfirmation('deposit', command.amount, updatedUser);
            console.log('🏷 ' + user.name + ': guardou ' + command.amount);
          } else {
            response = ErrorMessages.INSUFFICIENT_BALANCE('Saldo') + '\n\n🕑 ' + timestamp.formatted;
          }
        } else {
          response = ErrorMessages.INVALID_VALUE() + '\n\n🕑 ' + timestamp.formatted;
        }
        
        await this.whatsapp.replyMessage(message, response);
        return; // 🔧 CORREÇÃO 4: Encerrar fluxo após confirmação
      }
      
      else if (command.command === 'withdrawSavings') {
        if (command.amount && command.amount > 0) {
          const success = this.dao.withdrawFromSavings(user.id, command.amount);
          
          if (success) {
            const updatedUser = this.dao.getUserById(user.id);
            response = this.reports.generateSavingsConfirmation('withdraw', command.amount, updatedUser);
            console.log('🏷 ' + user.name + ': retirou ' + command.amount);
          } else {
            response = ErrorMessages.INSUFFICIENT_BALANCE('Poupança') + '\n\n🕑 ' + timestamp.formatted;
          }
        } else {
          response = ErrorMessages.INVALID_VALUE() + '\n\n🕑 ' + timestamp.formatted;
        }
        
        await this.whatsapp.replyMessage(message, response);
        return; // 🔧 CORREÇÃO 4: Encerrar fluxo após confirmação
      }
      
      else if (command.command === 'getEmergency') {
        const updatedUser = this.dao.getUserByWhatsAppId(user.whatsapp_id);
        response = '🚨 *RESERVA DE EMERGÊNCIA*\n\n' +
          `💵 Saldo reservado: *${this.reports.formatMoney(updatedUser.emergency_fund)}*\n\n` +
          'Use `/reservar 200` para adicionar\n' +
          'Use `/usar 100` para utilizar\n\n' +
          '🕑 ' + timestamp.formatted;
      }
      
      // 🔧 CORREÇÃO 2 E 4: Emergência com confirmação explícita + encerramento
      else if (command.command === 'depositEmergency') {
        if (command.amount && command.amount > 0) {
          const success = this.dao.addToEmergencyFund(user.id, command.amount);
          
          if (success) {
            const updatedUser = this.dao.getUserById(user.id);
            response = this.reports.generateEmergencyConfirmation('deposit', command.amount, updatedUser);
            console.log('🚨 ' + user.name + ': reservou ' + command.amount);
          } else {
            response = ErrorMessages.INSUFFICIENT_BALANCE('Saldo') + '\n\n🕑 ' + timestamp.formatted;
          }
        } else {
          response = ErrorMessages.INVALID_VALUE() + '\n\n🕑 ' + timestamp.formatted;
        }
        
        await this.whatsapp.replyMessage(message, response);
        return; // 🔧 CORREÇÃO 4: Encerrar fluxo após confirmação
      }
      
      else if (command.command === 'withdrawEmergency') {
        if (command.amount && command.amount > 0) {
          const success = this.dao.withdrawFromEmergencyFund(user.id, command.amount);
          
          if (success) {
            const updatedUser = this.dao.getUserById(user.id);
            response = this.reports.generateEmergencyConfirmation('withdraw', command.amount, updatedUser);
            console.log('🚨 ' + user.name + ': usou reserva ' + command.amount);
          } else {
            response = ErrorMessages.INSUFFICIENT_BALANCE('Reserva') + '\n\n🕑 ' + timestamp.formatted;
          }
        } else {
          response = ErrorMessages.INVALID_VALUE() + '\n\n🕑 ' + timestamp.formatted;
        }
        
        await this.whatsapp.replyMessage(message, response);
        return; // 🔧 CORREÇÃO 4: Encerrar fluxo após confirmação
      }
      
      else if (command.command === 'reportDaily') {
        response = this.reports.generateDailyReport(user.id);
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
        if (this.pendingResets[user.id] && this.pendingResets[user.id].type === 'balance') {
          delete this.pendingResets[user.id];
          const success = this.dao.resetBalance(user.id);
          
          if (success) {
            response = this.reports.generateResetConfirmation('balance');
            console.log('☢️ ' + user.name + ': zerou saldo principal');
          } else {
            response = ErrorMessages.OPERATION_NOT_ALLOWED() + '\n\n🕑 ' + timestamp.formatted;
          }
        } else {
          this.pendingResets[user.id] = { type: 'balance', timestamp: Date.now() };
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
        if (this.pendingResets[user.id] && this.pendingResets[user.id].type === 'savings') {
          delete this.pendingResets[user.id];
          const success = this.dao.resetSavings(user.id);
          
          if (success) {
            response = this.reports.generateResetConfirmation('savings');
            console.log('☢️ ' + user.name + ': zerou poupança');
          } else {
            response = ErrorMessages.NO_DATA_FOUND('poupança') + '\n\n🕑 ' + timestamp.formatted;
          }
        } else {
          this.pendingResets[user.id] = { type: 'savings', timestamp: Date.now() };
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
        if (this.pendingResets[user.id] && this.pendingResets[user.id].type === 'emergency') {
          delete this.pendingResets[user.id];
          const success = this.dao.resetEmergencyFund(user.id);
          
          if (success) {
            response = this.reports.generateResetConfirmation('emergency');
            console.log('☢️ ' + user.name + ': zerou reserva de emergência');
          } else {
            response = ErrorMessages.NO_DATA_FOUND('reserva de emergência') + '\n\n🕑 ' + timestamp.formatted;
          }
        } else {
          this.pendingResets[user.id] = { type: 'emergency', timestamp: Date.now() };
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
        if (this.pendingResets[user.id] && this.pendingResets[user.id].type === 'installments') {
          delete this.pendingResets[user.id];
          const success = this.dao.resetInstallments(user.id);
          
          if (success) {
            response = this.reports.generateResetConfirmation('installments');
            console.log('☢️ ' + user.name + ': zerou parcelamentos');
          } else {
            response = ErrorMessages.NO_DATA_FOUND('parcelamentos') + '\n\n🕑 ' + timestamp.formatted;
          }
        } else {
          this.pendingResets[user.id] = { type: 'installments', timestamp: Date.now() };
          response = this.reports.generateResetWarning('installments');
          
          const self = this;
          setTimeout(function() {
            if (self.pendingResets[user.id] && self.pendingResets[user.id].type === 'installments') {
              delete self.pendingResets[user.id];
            }
          }, 120000);
        }
      }
      
      else if (command.command === 'resetEverything' || command.command === 'confirmReset') {
        const textLower = this.whatsapp.getMessageText(message).toLowerCase().trim();
        
        if (textLower === 'confirmar zerar tudo' || command.command === 'confirmReset') {
          if (this.pendingResets[user.id] && this.pendingResets[user.id].type === 'everything') {
            delete this.pendingResets[user.id];
            const success = this.dao.resetEverything(user.id);
            
            if (success) {
              response = this.reports.generateResetConfirmation('everything');
              console.log('☢️☢️☢️ ' + user.name + ': ZEROU TODO O SISTEMA');
            } else {
              response = ErrorMessages.OPERATION_NOT_ALLOWED() + '\n\n🕑 ' + timestamp.formatted;
            }
          } else {
            response = '❌ *Nenhuma operação pendente*\n\n' +
              'Use `/zerar tudo` primeiro para iniciar o processo.\n\n' +
              '🕑 ' + timestamp.formatted;
          }
        } else {
          this.pendingResets[user.id] = { type: 'everything', timestamp: Date.now() };
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
        response = this.reports.generateHelpMessage();
      }
      
      else if (command.command === 'start') {
        response = this.reports.generateWelcomeMessage(user.name);
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
        await this.whatsapp.replyMessage(message, ErrorMessages.INVALID_VALUE() + '\n\n🕑 ' + timestamp.formatted);
        return;
      }

      if (user.initial_balance === 0) {
        await this.whatsapp.replyMessage(message, ErrorMessages.INITIAL_BALANCE_REQUIRED() + '\n\n🕑 ' + timestamp.formatted);
        return;
      }

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

      console.log('💸 ' + user.name + ': ' + this.reports.formatMoney(expense.amount) + ' - ' + expense.description + ' (' + category.name + ')');

      const totalMoney = updatedUser.current_balance + updatedUser.savings_balance + updatedUser.emergency_fund;
      const percentageRemaining = updatedUser.initial_balance > 0 
        ? (totalMoney / updatedUser.initial_balance) * 100 
        : 100;

      if (updatedUser.current_balance < 0) {
        await this.whatsapp.sendMessage(chatId, 
          '🚨 *ATENÇÃO!*\n\n' +
          'Seu saldo está negativo!\n' +
          'Você está gastando mais do que tem.\n\n' +
          '🕑 ' + timestamp.formatted
        );
      } 
      else if (percentageRemaining <= 30 && !updatedUser.low_balance_warned) {
        this.dao.setLowBalanceWarned(updatedUser.id, true);
        await this.whatsapp.sendMessage(chatId, 
          '⚠️ *AVISO DE SALDO BAIXO*\n\n' +
          'Você já gastou 70% do seu dinheiro!\n' +
          `Restam apenas ${percentageRemaining.toFixed(0)}% do total.\n\n` +
          '💡 *Dica:* Considere reduzir gastos ou adicionar mais saldo.\n\n' +
          '🕑 ' + timestamp.formatted
        );
      }

    } catch (error) {
      console.error('❌ Erro ao registrar gasto:', error);
      await this.whatsapp.replyMessage(message, 
        '❌ *Erro ao registrar gasto*\n\n' +
        `📌 ${error.message}\n` +
        '💡 Tente novamente ou use `/ajuda`\n\n' +
        '🕑 ' + timestamp.formatted
      );
    }
  }

  async handleInstallment(installment, user, message) {
    const timestamp = this.reports.getCurrentBrazilTimestamp();
    const info = this.whatsapp.getSenderInfo(message);
    const chatId = info.chatId;

    try {
      if (!this.nlp.isValidAmount(installment.totalAmount)) {
        await this.whatsapp.replyMessage(message, ErrorMessages.INVALID_VALUE() + '\n\n🕑 ' + timestamp.formatted);
        return;
      }

      if (user.initial_balance === 0) {
        await this.whatsapp.replyMessage(message, ErrorMessages.INITIAL_BALANCE_REQUIRED() + '\n\n🕑 ' + timestamp.formatted);
        return;
      }

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

    } catch (error) {
      console.error('❌ Erro ao registrar parcelamento:', error);
      await this.whatsapp.replyMessage(message, 
        '❌ *Erro ao registrar parcelamento*\n\n' +
        `📌 ${error.message}\n` +
        '💡 Tente novamente ou use `/ajuda`\n\n' +
        '🕑 ' + timestamp.formatted
      );
    }
  }
}

module.exports = MessageHandler;
//arumando
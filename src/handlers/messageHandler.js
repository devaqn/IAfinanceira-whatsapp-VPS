const NLPProcessor = require('../services/nlp');
const ReportGenerator = require('../services/reports');

class MessageHandler {
  constructor(dao, whatsappService) {
    this.dao = dao;
    this.whatsapp = whatsappService;
    this.nlp = new NLPProcessor();
    this.reports = new ReportGenerator(dao);
    this.recentlyProcessed = {};
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
        return;
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
      }

      await this.whatsapp.sendPresence(chatId, 'available');

    } catch (error) {
      console.error('❌ Erro ao processar mensagem:', error);
    }
  }

  async handleCommand(command, user, message) {
    let response = '';

    if (command.command === 'setBalance') {
      if (command.amount && command.amount > 0) {
        this.dao.setInitialBalance(user.whatsapp_id, command.amount);
        
        const updatedUser = this.dao.getUserByWhatsAppId(user.whatsapp_id);
        response = '✅ *Saldo inicial definido!*\n\n💰 Valor: ' + this.reports.formatMoney(command.amount) + '\n\nAgora você pode registrar seus gastos!';
        console.log('💰 ' + user.name + ': saldo ' + command.amount);
      } else {
        response = '❌ Valor inválido! Use: `/saldo 1000`';
      }
    } else if (command.command === 'getBalance') {
      const updatedUser = this.dao.getUserByWhatsAppId(user.whatsapp_id);
      response = this.reports.generateBalanceReport(updatedUser);
    } else if (command.command === 'reportDaily') {
      response = this.reports.generateDailyReport(user.id);
    } else if (command.command === 'reportWeekly') {
      response = this.reports.generateWeeklyReport(user.id);
    } else if (command.command === 'reportMonthly') {
      response = this.reports.generateMonthlyReport(user.id);
    } else if (command.command === 'help') {
      response = this.reports.generateHelpMessage();
    } else if (command.command === 'start') {
      response = this.reports.generateWelcomeMessage(user.name);
    } else {
      response = '❓ Comando não reconhecido. Use `/ajuda`';
    }

    if (response) {
      await this.whatsapp.replyMessage(message, response);
    }
  }

  async handleExpense(expense, user, message) {
    const info = this.whatsapp.getSenderInfo(message);
    const chatId = info.chatId;

    if (!this.nlp.isValidAmount(expense.amount)) {
      await this.whatsapp.replyMessage(message, '❌ Valor inválido! Deve ser entre R$ 0,01 e R$ 1.000.000,00');
      return;
    }

    if (user.initial_balance === 0) {
      await this.whatsapp.replyMessage(message, '⚠️ Defina seu saldo inicial primeiro!\n\nUse: `/saldo 1000`');
      return;
    }

    try {
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

      console.log('💸 ' + user.name + ': ' + this.reports.formatMoney(expense.amount) + ' - ' + expense.description);

      if (updatedUser.current_balance < 0) {
        await this.whatsapp.sendMessage(chatId, '🚨 *ATENÇÃO!* Você está no vermelho!');
      } else if (updatedUser.current_balance < updatedUser.initial_balance * 0.1) {
        await this.whatsapp.sendMessage(chatId, '⚠️ *AVISO:* Menos de 10% do saldo restante!');
      }

    } catch (error) {
      console.error('❌ Erro ao registrar gasto:', error);
      await this.whatsapp.replyMessage(message, '❌ Erro ao registrar gasto. Tente novamente.');
    }
  }
}

module.exports = MessageHandler;

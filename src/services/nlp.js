class NLPProcessor {
  constructor() {
    this.amountRegexSource = '(?:\\d{1,3}(?:[.,]\\d{3})+(?:[.,]\\d{1,2})?|\\d+(?:[.,]\\d{1,2})?)';
    const amountCapture = `(${this.amountRegexSource})`;

    this.moneyPatterns = [
      new RegExp(`(?:gastei|paguei|comprei|saiu|foi|custou|deu)\\s+(?:r\\$|rs)?\\s*${amountCapture}`, 'i'),
      new RegExp(`(?:r\\$|rs)\\s*${amountCapture}`, 'i'),
      new RegExp(`${amountCapture}\\s*(?:reais|real|conto|contos|pila|pilas|pau|mangos)`, 'i'),
      new RegExp(`${amountCapture}\\s*(?:R\\$|RS)`, 'i'),
      new RegExp(`^${amountCapture}\\s+`, 'i')
    ];

    this.installmentPattern = new RegExp(
      `(${this.amountRegexSource})\\s*(?:em|por|parcelado em|parcelada em|parcelado|parcelada)\\s*(\\d+)x?`,
      'i'
    );

    this.commandPatterns = {
      setBalance: new RegExp(`^\\/saldo\\s+${amountCapture}\\s*$`, 'i'),
      getBalance: /^\/saldo\s*$/i,
      addBalance: new RegExp(`^\\/adicionar\\s+${amountCapture}\\s*$`, 'i'),

      getSavings: /^\/poupan[c\u00E7]a\s*$/i,
      depositSavings: new RegExp(`^\\/guardar\\s+${amountCapture}\\s*$`, 'i'),
      withdrawSavings: new RegExp(`^\\/retirar\\s+${amountCapture}\\s*$`, 'i'),

      getEmergency: /^\/emerg[e\u00EA]ncia\s*$/i,
      depositEmergency: new RegExp(`^\\/reservar\\s+${amountCapture}\\s*$`, 'i'),
      withdrawEmergency: new RegExp(`^\\/usar\\s+(?:reserva\\s+)?${amountCapture}\\s*$`, 'i'),

      createCard: /^\/cart[a\u00E3]o\s+criar\s*$/i,
      listCards: /^\/cart[o\u00F5]es\s*$/i,
      setCardLimit: new RegExp(`^\\/cart[a\\u00E3]o\\s+limite\\s+${amountCapture}\\s*$`, 'i'),
      getCard: /^\/cart[a\u00E3]o\s*$/i,
      getCardByName: /^\/cart[a\u00E3]o\s+(.+)/i,
      payInvoiceCardDefault: /^\/pagar\s+fatura\s*$/i,
      payInvoiceCard: /^\/pagar\s+fatura\s+(.+)/i,
      deleteCard: /^\/deletar\s+cart[a\u00E3]o\s+(.+)/i,
      resetCard: /^\/zerar\s+cart[a\u00E3]o\s+(.+)/i,
      vencimentos: /^\/vencimentos?\s*$/i,

      getInstallments: /^\/parcelamentos?\s*$/i,
      payInstallment: /^\/pagar\s+(?:parcela\s+)?(.+)/i,

      getReminders: /^\/(?:lembretes?|lembrar|avisos?)/i,
      getDuePayments: /^\/(?:vencidas?|atrasadas?|pendentes?)/i,

      resetBalance: /^\/(?:zerar|resetar|limpar)\s+saldo\s*$/i,
      resetSavings: /^\/(?:zerar|resetar|limpar)\s+poupan[c\u00E7]a\s*$/i,
      resetEmergency: /^\/(?:zerar|resetar|limpar)\s+(?:reserva|reserva\s+emerg[e\u00EA]ncia|reserva\s+emergencia)\s*$/i,
      resetInstallments: /^\/(?:zerar|resetar|limpar|apagar)\s+(?:parcelas?|parcelamentos?)\s*$/i,
      resetEverything: /^\/(?:zerar|resetar|limpar)\s+(?:tudo|sistema)\s*$/i,

      confirmReset: /^SIM,?\s*ZERAR\s+TUDO\s*$/i,

      reportWeekly: /^\/relat[o\u00F3]rio\s+(?:semana|semanal|week|weekly)/i,
      reportMonthly: /^\/relat[o\u00F3]rio\s+(?:m[e\u00EA]s|mes|mensal|month|monthly)/i,

      reportWeeklyShort: /^\/(?:semana|semanal)\s*$/i,
      reportMonthlyShort: /^\/(?:m[e\u00EA]s|mes|mensal)\s*$/i,

      reportChartWeekly: /^\/grafico\s+(?:semana|semanal)\s*$/i,
      reportChartMonthly: /^\/grafico\s+(?:m[e\u00EA]s|mes|mensal)\s*$/i,

      goalsList: /^\/metas?\s*$/i,
      goalsCreate: /^\/metas?\s+criar\s+(.+)$/i,
      goalsDelete: /^\/metas?\s+(?:remover|apagar|deletar|excluir)\s+(?:id\s*)?#?(\d+)\s*$/i,
      goalsComplete: /^\/metas?\s+(?:concluir|finalizar)\s+(?:id\s*)?#?(\d+)\s*$/i,

      exportPdf: /^\/exportar\s*$/i,
      exportLegacyUnsupported: /^\/exportar\s+(?:excel|xlsx|ambos|tudo)\s*$/i,

      syncStatus: /^\/sync\s+status\s*$/i,
      syncNow: /^\/sync\s+agora\s*$/i,

      help: /^\/(?:ajuda|help|comandos)/i,
      start: /^\/(?:start|come[\u00E7c]ar|comecar)/i
    };
  }

  parseAmountString(rawValue) {
    if (rawValue === null || rawValue === undefined) return null;

    let value = String(rawValue).trim().replace(/[^\d.,-]/g, '');
    if (!value) return null;

    const hasComma = value.includes(',');
    const hasDot = value.includes('.');

    if (hasComma && hasDot) {
      if (value.lastIndexOf(',') > value.lastIndexOf('.')) {
        value = value.replace(/\./g, '').replace(',', '.');
      } else {
        value = value.replace(/,/g, '');
      }
    } else if (hasComma) {
      const commaCount = (value.match(/,/g) || []).length;
      if (commaCount > 1) {
        value = value.replace(/,/g, '');
      } else {
        const parts = value.split(',');
        if (parts[1] && parts[1].length === 3) {
          value = parts.join('');
        } else {
          value = value.replace(',', '.');
        }
      }
    } else if (hasDot) {
      const dotCount = (value.match(/\./g) || []).length;
      if (dotCount > 1) {
        value = value.replace(/\./g, '');
      } else {
        const parts = value.split('.');
        if (parts[1] && parts[1].length === 3) {
          value = parts.join('');
        }
      }
    }

    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  extractAmount(text) {
    for (let i = 0; i < this.moneyPatterns.length; i++) {
      const pattern = this.moneyPatterns[i];
      const match = text.match(pattern);
      if (match) {
        const amount = this.parseAmountString(match[1]);
        if (amount !== null) return amount;
      }
    }
    return null;
  }

  isInstallmentPurchase(text) {
    return this.installmentPattern.test(text);
  }

  extractInstallmentInfo(text) {
    const match = text.match(this.installmentPattern);
    if (!match) return null;

    const totalAmount = this.parseAmountString(match[1]);
    const installments = parseInt(match[2]);

    if (!totalAmount || totalAmount <= 0 || installments <= 0 || installments > 100) return null;

    const installmentAmount = parseFloat((totalAmount / installments).toFixed(2));

    return {
      totalAmount: totalAmount,
      installments: installments,
      installmentAmount: installmentAmount
    };
  }

  extractInstallmentDescription(text) {
    let description = text;

    description = description.replace(/^(?:gastei|paguei|comprei|saiu|foi|custou|deu)\s+/i, '');
    description = description.replace(
      new RegExp('(?:r\\$|rs)?\\s*' + this.amountRegexSource, 'i'),
      ''
    );
    description = description.replace(/\s*(?:em|por|parcelado em|parcelada em|parcelado|parcelada)\s*\d+x?/gi, '');

    description = description.replace(/(?:r\$|\brs\b)\s*/gi, '');
    description = description.replace(/^\s*(?:em|de|com|no|na|para|pro|pra)\s+/i, '');
    description = description.trim();

    return description || 'Compra parcelada';
  }

  extractDescription(text) {
    let description = text;

    description = description.replace(/^(?:gastei|paguei|comprei|saiu|foi|custou|deu)\s+/i, '');
    description = description.replace(
      new RegExp('(?:r\\$|rs)?\\s*' + this.amountRegexSource + '\\s*(?:reais?|contos?|pilas?|pau|mangos)?', 'i'),
      ''
    );

    description = description.replace(/(?:r\$|\brs\b)\s*/gi, '');
    description = description.replace(/^\s*(?:em|de|com|no|na|para|pro|pra)\s+/i, '');
    description = description.trim();

    return description || 'Gasto';
  }

  identifyCommand(text) {
    const trimmedText = text.trim();

    const keys = Object.keys(this.commandPatterns);
    for (let i = 0; i < keys.length; i++) {
      const command = keys[i];
      const pattern = this.commandPatterns[command];
      const match = trimmedText.match(pattern);

      if (match) {
        const result = { command: command };

        if (match[1]) {
          if (command === 'payInstallment' ||
              command === 'getCardByName' ||
              command === 'payInvoiceCard' ||
              command === 'deleteCard' ||
              command === 'resetCard' ||
              command === 'goalsCreate') {
            result.description = match[1].trim();
          } else {
            result.amount = this.parseAmountString(match[1]);
          }
        }

        if (command === 'reportWeeklyShort') result.command = 'reportWeekly';
        if (command === 'reportMonthlyShort') result.command = 'reportMonthly';
        if (command === 'reportChartWeekly') {
          result.command = 'reportChart';
          result.description = 'week';
        }
        if (command === 'reportChartMonthly') {
          result.command = 'reportChart';
          result.description = 'month';
        }
        if (command === 'payInvoiceCardDefault') {
          result.command = 'payInvoiceCard';
          result.description = '';
        }

        return result;
      }
    }

    return null;
  }

  looksLikeExpense(text) {
    const hasAmount = this.extractAmount(text) !== null;

    const expenseKeywords = [
      'gastei', 'paguei', 'comprei', 'saiu', 'foi', 'custou',
      'deu', 'comprando', 'no mercado', 'na farmacia', 'na farmácia', 'almocei',
      'jantei', 'lanchou', 'tomei'
    ];

    const textLower = text.toLowerCase();
    let hasKeyword = false;
    for (let i = 0; i < expenseKeywords.length; i++) {
      if (textLower.indexOf(expenseKeywords[i]) !== -1) {
        hasKeyword = true;
        break;
      }
    }

    return hasAmount || hasKeyword;
  }

  processMessage(text) {
    const command = this.identifyCommand(text);
    if (command) {
      return {
        type: 'command',
        command: command.command,
        amount: command.amount,
        description: command.description
      };
    }

    if (this.isInstallmentPurchase(text) && this.looksLikeExpense(text)) {
      const installmentInfo = this.extractInstallmentInfo(text);

      if (installmentInfo) {
        const description = this.extractInstallmentDescription(text);

        return {
          type: 'installment',
          totalAmount: installmentInfo.totalAmount,
          installments: installmentInfo.installments,
          installmentAmount: installmentInfo.installmentAmount,
          description: description,
          date: new Date(),
          rawText: text
        };
      }
    }

    if (this.looksLikeExpense(text)) {
      const amount = this.extractAmount(text);

      if (amount && amount > 0) {
        const description = this.extractDescription(text);

        return {
          type: 'expense',
          amount: amount,
          description: description,
          date: new Date(),
          rawText: text
        };
      }
    }

    return {
      type: 'unknown',
      text: text
    };
  }

  isValidAmount(amount) {
    return amount !== null && amount > 0 && amount < 1000000;
  }
}

module.exports = NLPProcessor;

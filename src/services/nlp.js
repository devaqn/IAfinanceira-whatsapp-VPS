class NLPProcessor {
  constructor() {
    this.moneyPatterns = [
      /(?:gastei|paguei|comprei|saiu|foi|custou|deu)\s+(?:r\$|rs)?\s*(\d+(?:[.,]\d{1,2})?)/i,
      /(?:r\$|rs)\s*(\d+(?:[.,]\d{1,2})?)/i,
      /(\d+(?:[.,]\d{1,2})?)\s*(?:reais|real|conto|contos|pila|pilas|pau|mangos)/i,
      /(\d+(?:[.,]\d{1,2})?)\s*(?:R\$|RS)/i,
      /^(\d+(?:[.,]\d{1,2})?)\s+/
    ];

    this.commandPatterns = {
      setBalance: /^\/saldo\s+(\d+(?:[.,]\d{1,2})?)/i,
      getBalance: /^\/saldo\s*$/i,
      reportDaily: /^\/relatorio\s+(?:hoje|diário|diario|day|daily)/i,
      reportWeekly: /^\/relatorio\s+(?:semana|semanal|week|weekly)/i,
      reportMonthly: /^\/relatorio\s+(?:mês|mes|mensal|month|monthly)/i,
      help: /^\/ajuda|^\/help|^\/comandos/i,
      start: /^\/start|^\/começar|^\/comecar/i
    };
  }

  extractAmount(text) {
    for (let i = 0; i < this.moneyPatterns.length; i++) {
      const pattern = this.moneyPatterns[i];
      const match = text.match(pattern);
      if (match) {
        const amount = match[1].replace(',', '.');
        return parseFloat(amount);
      }
    }
    return null;
  }

  extractDescription(text, amount) {
    let description = text;
    
    description = description.replace(/^(?:gastei|paguei|comprei|saiu|foi|custou|deu)\s+/i, '');
    
    const amountStr = amount.toString().replace('.', '[.,]');
    description = description.replace(new RegExp('(?:r\\$|rs)?\\s*' + amountStr + '\\s*(?:reais?|contos?|pilas?|pau|mangos)?', 'gi'), '');
    
    description = description.replace(/(?:r\$|rs)\s*/gi, '');
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
        
        if (command === 'setBalance' && match[1]) {
          result.amount = parseFloat(match[1].replace(',', '.'));
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
      'deu', 'comprando', 'no mercado', 'na farmácia'
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
        amount: command.amount
      };
    }

    if (this.looksLikeExpense(text)) {
      const amount = this.extractAmount(text);
      
      if (amount && amount > 0) {
        const description = this.extractDescription(text, amount);
        
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

class ReportGenerator {
  constructor(dao) {
    this.dao = dao;
  }

  formatMoney(value) {
    return 'R$ ' + value.toFixed(2).replace('.', ',');
  }

  formatDate(date) {
    const d = new Date(date);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    const hour = String(d.getHours()).padStart(2, '0');
    const minute = String(d.getMinutes()).padStart(2, '0');
    return day + '/' + month + '/' + year + ' ' + hour + ':' + minute;
  }

  generateBalanceReport(user) {
    const percentage = user.initial_balance > 0 
      ? ((user.current_balance / user.initial_balance) * 100).toFixed(1)
      : 0;

    const spent = user.initial_balance - user.current_balance;
    
    let emoji = '💰';
    if (percentage < 20) emoji = '🚨';
    else if (percentage < 50) emoji = '⚠️';

    return emoji + ' *SALDO ATUAL*\n\n' +
      '👤 *Usuário:* ' + user.name + '\n\n' +
      '💵 *Saldo Inicial:* ' + this.formatMoney(user.initial_balance) + '\n' +
      '💸 *Total Gasto:* ' + this.formatMoney(spent) + '\n' +
      emoji + ' *Saldo Restante:* ' + this.formatMoney(user.current_balance) + '\n\n' +
      '📊 *Percentual Restante:* ' + percentage + '%\n\n' +
      '_Atualizado em: ' + this.formatDate(new Date()) + '_';
  }

  generateDailyReport(userId) {
    const user = this.dao.getUserById(userId);
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const expenses = this.dao.getExpensesByUser(userId, {
      startDate: today.toISOString(),
      endDate: tomorrow.toISOString()
    });

    let total = 0;
    for (let i = 0; i < expenses.length; i++) {
      total += expenses[i].amount;
    }
    
    const byCategory = this.dao.getExpensesByCategory(userId, today.toISOString(), tomorrow.toISOString());

    let report = '📅 *RELATÓRIO DIÁRIO*\n\n' +
      '👤 *Usuário:* ' + user.name + '\n' +
      '📆 *Data:* ' + this.formatDate(today) + '\n\n' +
      '💸 *Total Gasto Hoje:* ' + this.formatMoney(total) + '\n' +
      '📝 *Número de Gastos:* ' + expenses.length + '\n\n';

    if (byCategory.length > 0) {
      report += '\n🏷️ *Por Categoria:*\n';
      for (let i = 0; i < byCategory.length; i++) {
        const cat = byCategory[i];
        report += cat.emoji + ' ' + cat.category + ': ' + this.formatMoney(cat.total) + ' (' + cat.count + 'x)\n';
      }
    }

    if (expenses.length > 0) {
      report += '\n\n📋 *Últimos Gastos:*\n';
      const limit = Math.min(expenses.length, 10);
      for (let i = 0; i < limit; i++) {
        const exp = expenses[i];
        const d = new Date(exp.date);
        const time = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
        report += '• ' + time + ' - ' + exp.description + ' - ' + this.formatMoney(exp.amount) + '\n';
      }
    } else {
      report += '\n✅ Nenhum gasto registrado hoje!';
    }

    return report;
  }

  generateWeeklyReport(userId) {
    const user = this.dao.getUserById(userId);
    
    const today = new Date();
    const weekAgo = new Date(today);
    weekAgo.setDate(weekAgo.getDate() - 7);

    const expenses = this.dao.getExpensesByUser(userId, {
      startDate: weekAgo.toISOString(),
      endDate: today.toISOString()
    });

    let total = 0;
    for (let i = 0; i < expenses.length; i++) {
      total += expenses[i].amount;
    }
    const average = expenses.length > 0 ? total / 7 : 0;
    
    const byCategory = this.dao.getExpensesByCategory(userId, weekAgo.toISOString(), today.toISOString());

    let report = '📊 *RELATÓRIO SEMANAL*\n\n' +
      '👤 *Usuário:* ' + user.name + '\n' +
      '📆 *Período:* ' + this.formatDate(weekAgo) + ' até ' + this.formatDate(today) + '\n\n' +
      '💸 *Total Gasto:* ' + this.formatMoney(total) + '\n' +
      '📝 *Número de Gastos:* ' + expenses.length + '\n' +
      '📉 *Média Diária:* ' + this.formatMoney(average) + '\n\n';

    if (byCategory.length > 0) {
      report += '\n🏷️ *Por Categoria:*\n';
      for (let i = 0; i < byCategory.length; i++) {
        const cat = byCategory[i];
        const percentage = ((cat.total / total) * 100).toFixed(1);
        report += cat.emoji + ' ' + cat.category + ': ' + this.formatMoney(cat.total) + ' (' + percentage + '%)\n';
      }
    }

    if (expenses.length > 0) {
      const sorted = expenses.slice().sort(function(a, b) { return b.amount - a.amount; });
      const topExpenses = sorted.slice(0, 5);
      report += '\n\n💰 *Maiores Gastos:*\n';
      for (let i = 0; i < topExpenses.length; i++) {
        const exp = topExpenses[i];
        report += (i + 1) + '. ' + exp.description + ' - ' + this.formatMoney(exp.amount) + '\n';
      }
    }

    return report;
  }

  generateMonthlyReport(userId) {
    const user = this.dao.getUserById(userId);
    
    const today = new Date();
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);

    const expenses = this.dao.getExpensesByUser(userId, {
      startDate: monthStart.toISOString(),
      endDate: monthEnd.toISOString()
    });

    let total = 0;
    for (let i = 0; i < expenses.length; i++) {
      total += expenses[i].amount;
    }
    const daysInMonth = monthEnd.getDate();
    const average = expenses.length > 0 ? total / daysInMonth : 0;
    
    const stats = this.dao.getUserStats(userId);
    const byCategory = this.dao.getExpensesByCategory(userId, monthStart.toISOString(), monthEnd.toISOString());

    const monthNames = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
    const monthName = monthNames[monthStart.getMonth()] + ' ' + monthStart.getFullYear();

    let report = '📈 *RELATÓRIO MENSAL*\n\n' +
      '👤 *Usuário:* ' + user.name + '\n' +
      '📆 *Mês:* ' + monthName + '\n\n' +
      '💸 *Total Gasto:* ' + this.formatMoney(total) + '\n' +
      '📝 *Número de Gastos:* ' + expenses.length + '\n' +
      '📉 *Média Diária:* ' + this.formatMoney(average) + '\n' +
      '💰 *Gasto Médio:* ' + this.formatMoney(stats.avg_expense || 0) + '\n\n';

    if (byCategory.length > 0) {
      report += '\n🏷️ *Gastos por Categoria:*\n';
      for (let i = 0; i < byCategory.length; i++) {
        const cat = byCategory[i];
        const percentage = ((cat.total / total) * 100).toFixed(1);
        report += cat.emoji + ' ' + cat.category + '\n';
        report += '   💵 ' + this.formatMoney(cat.total) + ' (' + percentage + '%) - ' + cat.count + ' gastos\n';
      }
    }

    const remaining = user.current_balance;
    const percentageUsed = user.initial_balance > 0 ? ((total / user.initial_balance) * 100).toFixed(1) : 0;

    report += '\n\n💰 *Situação Atual:*\n';
    report += '• Saldo Restante: ' + this.formatMoney(remaining) + '\n';
    report += '• Percentual Usado: ' + percentageUsed + '%\n';

    if (remaining < 0) {
      report += '\n⚠️ *ATENÇÃO:* Você está no vermelho!';
    } else if (remaining < user.initial_balance * 0.2) {
      report += '\n⚠️ *AVISO:* Menos de 20% do saldo restante!';
    }

    return report;
  }

  generateExpenseConfirmation(expense, user, category) {
    return '✅ *Gasto Registrado!*\n\n' +
      category.emoji + ' *Categoria:* ' + category.name + '\n' +
      '💵 *Valor:* ' + this.formatMoney(expense.amount) + '\n' +
      '📝 *Descrição:* ' + expense.description + '\n' +
      '📅 *Data:* ' + this.formatDate(expense.date) + '\n\n' +
      '💰 *Saldo Atualizado:* ' + this.formatMoney(user.current_balance);
  }

  generateHelpMessage() {
    return '🤖 *BOT FINANCEIRO - AJUDA*\n\n' +
      '📝 *Registrar Gasto:*\n' +
      'Envie uma mensagem como:\n' +
      '• "Gastei 50 reais no mercado"\n' +
      '• "Paguei 15 no uber"\n' +
      '• "Comprei um sorvete por 3 reais"\n\n' +
      '💰 *Comandos de Saldo:*\n' +
      '• `/saldo 1000` - Define saldo inicial\n' +
      '• `/saldo` - Consulta saldo atual\n\n' +
      '📊 *Relatórios:*\n' +
      '• `/relatorio diário` - Gastos de hoje\n' +
      '• `/relatorio semanal` - Últimos 7 dias\n' +
      '• `/relatorio mensal` - Mês atual\n\n' +
      'ℹ️ *Outros Comandos:*\n' +
      '• `/ajuda` - Mostra esta mensagem\n' +
      '• `/start` - Inicia o bot\n\n' +
      '🏷️ *Categorias Automáticas:*\n' +
      '🍔 Alimentação | 🚗 Transporte | 🛒 Mercado\n' +
      '🎮 Lazer | 💳 Contas | 💊 Saúde\n' +
      '📚 Educação | 👕 Vestuário | 📝 Outros\n\n' +
      '_O bot identifica a categoria automaticamente baseado na descrição!_';
  }

  generateWelcomeMessage(userName) {
    return '👋 *Olá, ' + userName + '!*\n\n' +
      'Bem-vindo ao *Bot Financeiro*! 🤖💰\n\n' +
      'Eu vou ajudar você a controlar seus gastos de forma simples e automática!\n\n' +
      '🚀 *Para começar:*\n' +
      '1️⃣ Defina seu saldo inicial: `/saldo 1000`\n' +
      '2️⃣ Registre seus gastos naturalmente: "gastei 50 no mercado"\n' +
      '3️⃣ Consulte relatórios: `/relatorio mensal`\n\n' +
      'Digite `/ajuda` para ver todos os comandos disponíveis!';
  }
}

module.exports = ReportGenerator;

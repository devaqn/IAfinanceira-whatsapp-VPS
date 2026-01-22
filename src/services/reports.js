class ReportGenerator {
  constructor(dao) {
    this.dao = dao;
  }

  getCurrentBrazilTimestamp() {
    process.env.TZ = 'America/Sao_Paulo';
    const now = new Date();
    
    const formatter = new Intl.DateTimeFormat('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
    
    const parts = formatter.formatToParts(now);
    const day = parts.find(p => p.type === 'day').value;
    const month = parts.find(p => p.type === 'month').value;
    const year = parts.find(p => p.type === 'year').value;
    const hour = parts.find(p => p.type === 'hour').value;
    const minute = parts.find(p => p.type === 'minute').value;
    
    return {
      formatted: `${day}/${month}/${year} às ${hour}:${minute}`,
      iso: now.toISOString(),
      date: now
    };
  }

  getBrazilDate(date) {
    process.env.TZ = 'America/Sao_Paulo';
    const d = date ? new Date(date) : new Date();
    
    const formatter = new Intl.DateTimeFormat('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });
    
    const parts = formatter.formatToParts(d);
    const year = parseInt(parts.find(p => p.type === 'year').value);
    const month = parseInt(parts.find(p => p.type === 'month').value) - 1;
    const day = parseInt(parts.find(p => p.type === 'day').value);
    const hour = parseInt(parts.find(p => p.type === 'hour').value);
    const minute = parseInt(parts.find(p => p.type === 'minute').value);
    const second = parseInt(parts.find(p => p.type === 'second').value);
    
    return new Date(year, month, day, hour, minute, second);
  }

  formatMoney(value) {
    return 'R$ ' + value.toFixed(2).replace('.', ',');
  }

  formatDate(date) {
    const d = this.getBrazilDate(date);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    const hour = String(d.getHours()).padStart(2, '0');
    const minute = String(d.getMinutes()).padStart(2, '0');
    return `${day}/${month}/${year} às ${hour}:${minute}`;
  }

  formatDateShort(date) {
    const d = this.getBrazilDate(date);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
  }

  generateBalanceReport(user) {
    const timestamp = this.getCurrentBrazilTimestamp();
    const totalMoney = user.current_balance + user.savings_balance + user.emergency_fund;
    const percentage = user.initial_balance > 0 
      ? ((user.current_balance / user.initial_balance) * 100).toFixed(1)
      : 0;

    const spent = user.initial_balance - user.current_balance;
    
    let emoji = '💰';
    if (percentage < 20) emoji = '🚨';
    else if (percentage < 50) emoji = '⚠️';

    let report = '╔═══════════════════════════════════════╗\n';
    report += `${emoji} *RESUMO FINANCEIRO*\n`;
    report += '╚═══════════════════════════════════════╝\n\n';
    
    report += `👤 *Usuário:* ${user.name}\n`;
    report += `📅 *Data:* ${timestamp.formatted}\n\n`;
    
    report += '💵 *SALDO PRINCIPAL*\n';
    report += `   Inicial: ${this.formatMoney(user.initial_balance)}\n`;
    report += `   Gasto: ${this.formatMoney(spent)}\n`;
    report += `   Disponível: *${this.formatMoney(user.current_balance)}*\n`;
    report += `   └─ ${percentage}% restante\n\n`;
    
    if (user.savings_balance > 0) {
      report += '🏷 *POUPANÇA*\n';
      report += `   Guardado: *${this.formatMoney(user.savings_balance)}*\n\n`;
    }
    
    if (user.emergency_fund > 0) {
      report += '🚨 *RESERVA DE EMERGÊNCIA*\n';
      report += `   Reservado: *${this.formatMoney(user.emergency_fund)}*\n\n`;
    }
    
    report += '💎 *PATRIMÔNIO TOTAL*\n';
    report += `   *${this.formatMoney(totalMoney)}*\n\n`;
    
    report += '═══════════════════════════════════════';

    return report;
  }

  generateWeeklyReport(userId) {
    const timestamp = this.getCurrentBrazilTimestamp();
    const user = this.dao.getUserById(userId);
    
    if (!user) {
      return '❌ *Erro ao gerar relatório*\n\n📌 Usuário não encontrado\n🕑 ' + timestamp.formatted;
    }
    
    const today = this.getBrazilDate(new Date());
    const weekAgo = new Date(today);
    weekAgo.setDate(weekAgo.getDate() - 7);

    const expenses = this.dao.getExpensesByUser(userId, {
      startDate: weekAgo.toISOString(),
      endDate: today.toISOString(),
      transactionType: 'expense'
    });

    let total = 0;
    for (let i = 0; i < expenses.length; i++) {
      total += expenses[i].amount;
    }
    const average = expenses.length > 0 ? total / 7 : 0;
    
    const byCategory = this.dao.getExpensesByCategory(userId, weekAgo.toISOString(), today.toISOString());
    const totalMoney = user.current_balance + user.savings_balance + user.emergency_fund;

    let report = '╔═══════════════════════════════════════╗\n';
    report += '📊 *RELATÓRIO SEMANAL*\n';
    report += '╚═══════════════════════════════════════╝\n\n';
    
    report += `👤 *Usuário:* ${user.name}\n`;
    report += `📆 *Período:* ${this.formatDateShort(weekAgo)} até ${this.formatDateShort(today)}\n`;
    report += `🕑 *Gerado em:* ${timestamp.formatted}\n\n`;
    
    report += '💸 *RESUMO DA SEMANA*\n';
    report += `   Total gasto: ${this.formatMoney(total)}\n`;
    report += `   Transações: ${expenses.length}\n`;
    report += `   Média/dia: ${this.formatMoney(average)}\n\n`;
    
    report += '💰 *SITUAÇÃO ATUAL*\n';
    report += `   Saldo: ${this.formatMoney(user.current_balance)}\n`;
    if (user.savings_balance > 0) {
      report += `   Poupança: ${this.formatMoney(user.savings_balance)}\n`;
    }
    if (user.emergency_fund > 0) {
      report += `   Emergência: ${this.formatMoney(user.emergency_fund)}\n`;
    }
    report += `   *Total: ${this.formatMoney(totalMoney)}*\n\n`;

    if (byCategory.length > 0) {
      report += '🏷️ *CATEGORIAS MAIS USADAS*\n';
      for (let i = 0; i < Math.min(byCategory.length, 5); i++) {
        const cat = byCategory[i];
        const percentage = ((cat.total / total) * 100).toFixed(0);
        report += `   ${cat.emoji} ${cat.category}\n`;
        report += `     ${this.formatMoney(cat.total)} (${percentage}%)\n`;
      }
      report += '\n';
    }

    if (expenses.length > 0) {
      const sorted = expenses.slice().sort(function(a, b) { return b.amount - a.amount; });
      const topExpenses = sorted.slice(0, 3);
      report += '💰 *MAIORES GASTOS*\n';
      for (let i = 0; i < topExpenses.length; i++) {
        const exp = topExpenses[i];
        report += `   ${i + 1}. ${exp.description}\n`;
        report += `      ${this.formatMoney(exp.amount)}\n`;
      }
    }
    
    report += '\n═══════════════════════════════════════';

    return report;
  }

  generateMonthlyReport(userId) {
    const timestamp = this.getCurrentBrazilTimestamp();
    const user = this.dao.getUserById(userId);
    
    if (!user) {
      return '❌ *Erro ao gerar relatório*\n\n📌 Usuário não encontrado\n🕑 ' + timestamp.formatted;
    }
    
    const today = this.getBrazilDate(new Date());
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);

    const expenses = this.dao.getExpensesByUser(userId, {
      startDate: monthStart.toISOString(),
      endDate: monthEnd.toISOString(),
      transactionType: 'expense'
    });

    let total = 0;
    for (let i = 0; i < expenses.length; i++) {
      total += expenses[i].amount;
    }
    const daysInMonth = monthEnd.getDate();
    const currentDay = today.getDate();
    const average = currentDay > 0 ? total / currentDay : 0;
    const projection = average * daysInMonth;
    
    const stats = this.dao.getUserStats(userId);
    const byCategory = this.dao.getExpensesByCategory(userId, monthStart.toISOString(), monthEnd.toISOString());
    const totalMoney = user.current_balance + user.savings_balance + user.emergency_fund;

    const monthNames = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
    const monthName = monthNames[monthStart.getMonth()] + '/' + monthStart.getFullYear();

    let report = '╔═══════════════════════════════════════╗\n';
    report += '📈 *RELATÓRIO MENSAL*\n';
    report += '╚═══════════════════════════════════════╝\n\n';
    
    report += `👤 *Usuário:* ${user.name}\n`;
    report += `📆 *Mês:* ${monthName}\n`;
    report += `🕑 *Gerado em:* ${timestamp.formatted}\n\n`;
    
    report += '💸 *RESUMO DO MÊS*\n';
    report += `   Total gasto: ${this.formatMoney(total)}\n`;
    report += `   Transações: ${expenses.length}\n`;
    report += `   Média/dia: ${this.formatMoney(average)}\n`;
    report += `   Projeção mensal: ${this.formatMoney(projection)}\n`;
    report += `   Ticket médio: ${this.formatMoney(stats.avg_expense || 0)}\n\n`;
    
    report += '💰 *SITUAÇÃO ATUAL*\n';
    report += `   Saldo: ${this.formatMoney(user.current_balance)}\n`;
    if (user.savings_balance > 0) {
      report += `   Poupança: ${this.formatMoney(user.savings_balance)}\n`;
    }
    if (user.emergency_fund > 0) {
      report += `   Emergência: ${this.formatMoney(user.emergency_fund)}\n`;
    }
    report += `   *Total: ${this.formatMoney(totalMoney)}*\n\n`;

    if (byCategory.length > 0) {
      report += '🏷️ *DISTRIBUIÇÃO POR CATEGORIA*\n';
      for (let i = 0; i < Math.min(byCategory.length, 8); i++) {
        const cat = byCategory[i];
        const percentage = ((cat.total / total) * 100).toFixed(0);
        report += `   ${cat.emoji} ${cat.category}\n`;
        report += `     ${this.formatMoney(cat.total)} (${percentage}%) • ${cat.count}x\n`;
      }
      report += '\n';
    }

    const percentageUsed = user.initial_balance > 0 ? ((total / user.initial_balance) * 100).toFixed(0) : 0;
    const percentageSaved = user.initial_balance > 0 ? ((totalMoney / user.initial_balance) * 100).toFixed(0) : 0;

    report += '📊 *ANÁLISE FINANCEIRA*\n';
    report += `   Percentual gasto: ${percentageUsed}%\n`;
    report += `   Patrimônio atual: ${percentageSaved}%\n`;

    if (user.current_balance < 0) {
      report += '\n🚨 *ATENÇÃO: Saldo negativo!*\n';
      report += 'Você está gastando mais do que tem.\n';
    } else if (user.current_balance < user.initial_balance * 0.3) {
      report += '\n⚠️ *AVISO: Saldo baixo!*\n';
      report += 'Considere reduzir gastos.\n';
    } else {
      report += '\n✅ *Parabéns! Você está no controle!*\n';
    }
    
    report += '\n═══════════════════════════════════════';

    return report;
  }

  generateExpenseConfirmation(expense, user, category) {
    const timestamp = this.getCurrentBrazilTimestamp();
    
    let report = '✅ *GASTO REGISTRADO*\n\n';
    
    report += `${category.emoji} *Categoria:* ${category.name}\n`;
    report += `💵 *Valor:* ${this.formatMoney(expense.amount)}\n`;
    report += `📝 *Descrição:* ${expense.description}\n`;
    report += `🕑 *Registrado em:* ${timestamp.formatted}\n\n`;
    
    report += '💰 *Saldo Atualizado*\n';
    report += `   Principal: *${this.formatMoney(user.current_balance)}*\n`;
    
    if (user.savings_balance > 0) {
      report += `   Poupança: ${this.formatMoney(user.savings_balance)}\n`;
    }
    if (user.emergency_fund > 0) {
      report += `   Emergência: ${this.formatMoney(user.emergency_fund)}\n`;
    }
    
    const totalMoney = user.current_balance + user.savings_balance + user.emergency_fund;
    report += `   Total: ${this.formatMoney(totalMoney)}`;
    
    return report;
  }

  generateSavingsConfirmation(action, amount, user) {
    if (!user) {
      return '❌ *Erro ao processar*\n\nUsuário não encontrado.';
    }
    
    const timestamp = this.getCurrentBrazilTimestamp();
    let msg = action === 'deposit' ? '✅ *DINHEIRO GUARDADO*\n\n' : '✅ *DINHEIRO RETIRADO*\n\n';
    
    msg += `💵 *Valor:* ${this.formatMoney(amount)}\n`;
    msg += `🕑 *Data/Hora:* ${timestamp.formatted}\n\n`;
    
    msg += '💰 *SALDOS ATUALIZADOS*\n';
    msg += `   Principal: ${this.formatMoney(user.current_balance)}\n`;
    msg += `   Poupança: *${this.formatMoney(user.savings_balance)}*\n`;
    
    if (user.emergency_fund > 0) {
      msg += `   Emergência: ${this.formatMoney(user.emergency_fund)}\n`;
    }
    
    const total = user.current_balance + user.savings_balance + user.emergency_fund;
    msg += `   Total: ${this.formatMoney(total)}`;
    
    return msg;
  }

  generateEmergencyConfirmation(action, amount, user) {
    if (!user) {
      return '❌ *Erro ao processar*\n\nUsuário não encontrado.';
    }
    
    const timestamp = this.getCurrentBrazilTimestamp();
    let msg = action === 'deposit' ? '✅ *RESERVA CRIADA*\n\n' : '✅ *RESERVA UTILIZADA*\n\n';
    
    msg += `💵 *Valor:* ${this.formatMoney(amount)}\n`;
    msg += `🕑 *Data/Hora:* ${timestamp.formatted}\n\n`;
    
    msg += '💰 *SALDOS ATUALIZADOS*\n';
    msg += `   Principal: ${this.formatMoney(user.current_balance)}\n`;
    
    if (user.savings_balance > 0) {
      msg += `   Poupança: ${this.formatMoney(user.savings_balance)}\n`;
    }
    
    msg += `   Emergência: *${this.formatMoney(user.emergency_fund)}*\n`;
    
    const total = user.current_balance + user.savings_balance + user.emergency_fund;
    msg += `   Total: ${this.formatMoney(total)}`;
    
    return msg;
  }

  generateInstallmentsList(userId) {
    const timestamp = this.getCurrentBrazilTimestamp();
    const installments = this.dao.getInstallmentsByUser(userId);
    
    if (installments.length === 0) {
      return '📦 *PARCELAMENTOS*\n\nVocê não tem compras parceladas.\n\nUse: "comprei celular por 1200 em 12x"\n\n🕑 ' + timestamp.formatted;
    }
    
    let report = '╔═══════════════════════════════════════╗\n';
    report += '📦 *SUAS COMPRAS PARCELADAS*\n';
    report += '╚═══════════════════════════════════════╝\n\n';
    
    for (let i = 0; i < installments.length; i++) {
      const inst = installments[i];
      const pending = inst.pending_count;
      const paid = inst.paid_count;
      const total = inst.total_installments;
      const remaining = parseFloat((pending * inst.installment_amount).toFixed(2));
      
      report += `${i + 1}. ${inst.category_emoji} *${inst.description}*\n`;
      report += `   💰 Total: ${this.formatMoney(inst.total_amount)}\n`;
      report += `   📊 Parcelas: ${paid}/${total} pagas\n`;
      report += `   💵 Parcela: ${this.formatMoney(inst.installment_amount)}\n`;
      report += `   ⏳ Restante: ${this.formatMoney(remaining)}\n`;
      report += `   📅 Criado: ${this.formatDate(inst.created_at)}\n\n`;
    }
    
    report += '💡 Use `/pagar celular` para pagar a próxima parcela\n\n';
    report += '🕑 ' + timestamp.formatted;
    
    return report;
  }

  generateInstallmentConfirmation(installment, category) {
    const timestamp = this.getCurrentBrazilTimestamp();
    
    let report = '✅ *COMPRA PARCELADA REGISTRADA*\n\n';
    
    report += `${category.emoji} *Produto:* ${installment.description}\n`;
    report += `💰 *Valor Total:* ${this.formatMoney(installment.total_amount)}\n`;
    report += `📊 *Parcelas:* ${installment.total_installments}x de ${this.formatMoney(installment.installment_amount)}\n`;
    report += `🕑 *Registrado em:* ${timestamp.formatted}\n\n`;
    
    report += '💡 *Como pagar parcelas:*\n';
    report += `   \`/pagar ${installment.description}\`\n`;
    report += '   ou `/parcelamentos` para ver todas';
    
    return report;
  }

  generatePaymentConfirmation(installment, payment, user) {
    const timestamp = this.getCurrentBrazilTimestamp();
    
    let report = '✅ *PARCELA PAGA*\n\n';
    
    report += `📦 *Produto:* ${installment.description}\n`;
    report += `📊 *Parcela:* ${payment.installment_number}/${installment.total_installments}\n`;
    report += `💵 *Valor:* ${this.formatMoney(payment.amount)}\n`;
    report += `🕑 *Pago em:* ${timestamp.formatted}\n\n`;
    
    const paid = payment.installment_number;
    const remaining = installment.total_installments - paid;
    
    if (remaining > 0) {
      report += `⏳ *Restam ${remaining} parcelas*\n`;
      report += `   ${remaining}x de ${this.formatMoney(installment.installment_amount)}\n\n`;
    } else {
      report += '🎉 *PARABÉNS! TOTALMENTE PAGO!*\n\n';
    }
    
    report += `💰 *Saldo Atualizado:* ${this.formatMoney(user.current_balance)}`;
    
    return report;
  }

  getBrazilDateOnly(date) {
    const d = this.getBrazilDate(date);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  generateRemindersList(userId) {
    const timestamp = this.getCurrentBrazilTimestamp();
    const pending = this.dao.getPendingPaymentsByUser(userId);
    
    if (pending.length === 0) {
      return '✅ *PARCELAS EM DIA*\n\nVocê não tem parcelas pendentes!\n\n🕑 ' + timestamp.formatted;
    }
    
    const today = this.getBrazilDateOnly(new Date());
    let overdue = [];
    let upcoming = [];
    
    for (const p of pending) {
      const dueDate = this.getBrazilDateOnly(p.due_date);
      if (dueDate < today) {
        overdue.push(p);
      } else {
        upcoming.push(p);
      }
    }
    
    let report = '╔═══════════════════════════════════════╗\n';
    report += '📅 *LEMBRETES DE PARCELAS*\n';
    report += '╚═══════════════════════════════════════╝\n\n';
    
    if (overdue.length > 0) {
      report += `❌ *VENCIDAS (${overdue.length})*\n\n`;
      for (const p of overdue) {
        const daysLate = Math.floor((today - this.getBrazilDateOnly(p.due_date)) / (1000 * 60 * 60 * 24));
        report += `   • ${p.emoji} *${p.description}*\n`;
        report += `     Parcela: ${p.installment_number}/${p.total_installments}\n`;
        report += `     Valor: ${this.formatMoney(p.amount)}\n`;
        report += `     Venceu: ${this.formatDateShort(p.due_date)}\n`;
        report += `     ⚠️ Atrasada há ${daysLate} dia(s)\n\n`;
      }
    }
    
    if (upcoming.length > 0) {
      report += `⏳ *PRÓXIMAS (${upcoming.length})*\n\n`;
      const limit = Math.min(upcoming.length, 5);
      for (let i = 0; i < limit; i++) {
        const p = upcoming[i];
        const daysUntil = Math.ceil((this.getBrazilDateOnly(p.due_date) - today) / (1000 * 60 * 60 * 24));
        report += `   • ${p.emoji} *${p.description}*\n`;
        report += `     Parcela: ${p.installment_number}/${p.total_installments}\n`;
        report += `     Valor: ${this.formatMoney(p.amount)}\n`;
        report += `     Vence: ${this.formatDateShort(p.due_date)}\n`;
        
        if (daysUntil === 0) {
          report += '     🔔 Vence HOJE!\n\n';
        } else if (daysUntil === 1) {
          report += '     ⏰ Vence AMANHÃ!\n\n';
        } else {
          report += `     📅 Faltam ${daysUntil} dias\n\n`;
        }
      }
    }
    
    report += '💡 Use `/pagar [nome]` para pagar uma parcela\n\n';
    report += '🕑 ' + timestamp.formatted;
    
    return report;
  }

  generateReminderMessage(payment) {
    const timestamp = this.getCurrentBrazilTimestamp();
    const today = this.getBrazilDateOnly(new Date());
    const dueDate = this.getBrazilDateOnly(payment.due_date);
    
    let msg = '';
    
    if (dueDate < today) {
      const daysLate = Math.floor((today - dueDate) / (1000 * 60 * 60 * 24));
      msg = '❌ *PARCELA VENCIDA*\n\n';
      msg += `⚠️ Atrasada há ${daysLate} dia(s)\n\n`;
    } else {
      msg = '🔔 *LEMBRETE DE PAGAMENTO*\n\n';
      msg += '📅 Vence HOJE\n\n';
    }
    
    msg += `${payment.emoji} *Compra:* ${payment.description}\n`;
    msg += `💳 *Parcela:* ${payment.installment_number}/${payment.total_installments}\n`;
    msg += `💰 *Valor:* ${this.formatMoney(payment.amount)}\n`;
    msg += `📅 *Vencimento:* ${this.formatDateShort(payment.due_date)}\n\n`;
    msg += `💡 Use \`/pagar ${payment.description}\` para pagar\n\n`;
    msg += '🕑 ' + timestamp.formatted;
    
    return msg;
  }

  generateResetConfirmation(type) {
    const timestamp = this.getCurrentBrazilTimestamp();
    let msg = '✅ *OPERAÇÃO CONCLUÍDA*\n\n';
    
  switch(type) {
  case 'balance':
    msg += '💰 *Saldo principal zerado*\n';
    break;
  case 'savings':
    msg += '🏷 *Poupança zerada*\n';
    break;
  case 'emergency':
    msg += '🚨 *Reserva de emergência zerada*\n';
    break;
  case 'card':  // ⭐ ADICIONAR ESTE CASO
    msg += '💳 *Cartão de crédito zerado*\n';
    msg += '\nTodos os dados do cartão foram removidos:\n';
    msg += '• Saldo usado zerado\n';
    msg += '• Fatura zerada\n';
    msg += '• Histórico de compras removido\n\n';
    break;
  case 'installments':
    msg += '📦 *Parcelamentos zerados*\n';
    break;
  case 'everything':
        msg += '☢️ *SISTEMA TOTALMENTE ZERADO*\n';
        msg += '\nTodos os dados foram removidos:\n';
        msg += '• Saldo principal\n';
        msg += '• Poupança\n';
        msg += '• Reserva de emergência\n';
        msg += '• Parcelamentos\n';
        msg += '• Histórico de gastos\n\n';
        break;
    }
    
    msg += `🕑 *Data/Hora:* ${timestamp.formatted}\n\n`;
    
    if (type === 'everything') {
      msg += '💡 Use `/saldo 1000` para redefinir seu saldo';
    } else {
      msg += '⚠️ *Esta ação é irreversível*';
    }
    
    return msg;
  }

  generateResetWarning(type) {
    const timestamp = this.getCurrentBrazilTimestamp();
    let msg = '⚠️ *ATENÇÃO - OPERAÇÃO IRREVERSÍVEL*\n\n';
    
    switch(type) {
      case 'balance':
        msg += 'Você está prestes a *zerar seu saldo principal*.\n\n';
        msg += 'Isso irá:\n';
        msg += '• Resetar saldo atual para R$ 0,00\n';
        msg += '• Resetar saldo inicial para R$ 0,00\n';
        break;
      case 'savings':
        msg += 'Você está prestes a *zerar sua poupança*.\n\n';
        msg += 'Todo o dinheiro guardado será removido.\n';
        break;
      case 'emergency':
        msg += 'Você está prestes a *zerar sua reserva de emergência*.\n\n';
        msg += 'Todo o valor reservado será removido.\n';
        break;
         case 'card':  
         msg += 'Você está prestes a *zerar seu cartão de crédito*.\n\n';
         msg += 'Isso irá:\n';
        msg += '• Zerar todo o saldo usado\n';
        msg += '• Zerar a fatura atual\n';
        msg += '• Remover histórico de compras\n';
        msg += '• Manter o limite do cartão\n';
    break;
      case 'installments':
        msg += 'Você está prestes a *zerar todos os parcelamentos*.\n\n';
        msg += 'Isso irá:\n';
        msg += '• Remover todas as compras parceladas\n';
        msg += '• Remover histórico de parcelas pagas\n';
        msg += '• Remover parcelas pendentes\n';
        break;
      case 'everything':
  msg += '☢️ *VOCÊ ESTÁ PRESTES A ZERAR TODO O SISTEMA!*\n\n';
  msg += '⚠️ Isso irá remover PERMANENTEMENTE:\n\n';
  msg += '• Saldo principal e inicial\n';
  msg += '• Poupança completa\n';
  msg += '• Reserva de emergência\n';
  msg += '• Todos os parcelamentos\n';
  msg += '• Todo o histórico de gastos\n\n';
  msg += '❌ *ESTA AÇÃO NÃO PODE SER DESFEITA!*\n\n';
  msg += '⏱️ **Você tem 2 minutos para confirmar**\n\n';
  msg += 'Para confirmar, digite novamente:\n\n';
  msg += '`/zerar tudo`\n\n';
  msg += 'Qualquer outro comando cancelará a operação.\n\n';
  msg += '🕒 ' + timestamp.formatted;
  return msg;
    }
    
    msg += '\n⚠️ *Esta ação NÃO pode ser desfeita!*\n\n';
    msg += 'Para confirmar, use o comando novamente:\n';
    msg += `\`/zerar ${type === 'balance' ? 'saldo' : type === 'savings' ? 'poupanca' : type === 'emergency' ? 'reserva' : 'parcelas'}\`\n\n`;
    msg += '🕑 ' + timestamp.formatted;
    
    return msg;
  }

  generateHelpMessage() {
  const timestamp = this.getCurrentBrazilTimestamp();
  
  let help = '╔═══════════════════════════════════════╗\n';
  help += '🤖 *BOT FINANCEIRO - AJUDA COMPLETA*\n';
  help += '╚═══════════════════════════════════════╝\n\n';
  
  help += '💸 *REGISTRAR GASTOS*\n';
  help += 'Escreva naturalmente:\n';
  help += '• "Gastei 50 no mercado"\n';
  help += '• "Paguei 15 no uber"\n';
  help += '• "Almocei por 25 reais"\n\n';
  
  help += '💰 *SALDO PRINCIPAL*\n';
  help += '• `/saldo` - Ver saldo\n';
  help += '• `/saldo 1000` - Definir inicial\n';
  help += '• `/adicionar 500` - Adicionar saldo\n';
  help += '• `/zerar saldo` - Zerar saldo ⚠️\n\n';
  
  help += '🏷 *POUPANÇA*\n';
  help += '• `/poupanca` - Ver poupança\n';
  help += '• `/guardar 100` - Guardar dinheiro\n';
  help += '• `/retirar 50` - Retirar da poupança\n';
  help += '• `/zerar poupanca` - Zerar poupança ⚠️\n\n';
  
  help += '🚨 *RESERVA DE EMERGÊNCIA*\n';
  help += '• `/emergencia` - Ver reserva\n';
  help += '• `/reservar 200` - Adicionar à reserva\n';
  help += '• `/usar 100` - Usar da reserva\n';
  help += '• `/zerar reserva` - Zerar reserva ⚠️\n\n';
  
  help += '💳 *CARTÃO DE CRÉDITO*\n';
  help += '• `/cartao` - Ver informações do cartão\n';
  help += '• `/cartao limite 5000` - Definir limite\n';
  help += '• `/pagar fatura` - Pagar fatura do cartão\n';
  help += '• `/zerar cartao` - Zerar cartão ⚠️\n';
  help += '_💡 Gastos perguntam se foram no cartão_\n\n';
  
  help += '📦 *PARCELAMENTOS*\n';
  help += '• "comprei celular por 1200 em 12x"\n';
  help += '• `/parcelamentos` - Ver todas parcelas\n';
  help += '• `/pagar celular` - Pagar próxima parcela\n';
  help += '• `/zerar parcelas` - Zerar parcelamentos ⚠️\n\n';
  
  help += '🔔 *LEMBRETES*\n';
  help += '• `/lembretes` - Ver lembretes\n';
  help += '• `/vencidas` - Ver parcelas atrasadas\n';
  help += '_⚠️ Lembretes só funcionam com bot ligado_\n\n';
  
  help += '📊 *RELATÓRIOS*\n';
  help += '• `/relatorio semanal` ou `/semana`\n';
  help += '• `/relatorio mensal` ou `/mes`\n\n';
  
  help += '☢️ *ZERAGEM COMPLETA*\n';
  help += '• `/zerar tudo` - Zerar TUDO ☢️\n';
  help += '_⚠️ Remove saldo, poupança, reserva, parcelas e histórico_\n';
  help += '_⚠️ Todos os comandos de zeragem exigem confirmação_\n\n';
  
  help += '🏷️ *CATEGORIAS AUTOMÁTICAS*\n';
  help += '🍔 Alimentação • 🚗 Transporte\n';
  help += '🛒 Mercado • 🎮 Lazer\n';
  help += '💳 Contas • 💊 Saúde\n';
  help += '📚 Educação • 👕 Vestuário\n\n';
  
  help += '═══════════════════════════════════════\n';
  help += '💡 O bot identifica categorias automaticamente!\n';
  help += '✅ TODOS os comandos retornam confirmação\n\n';
  help += 'Desenvolvido por : github.com/devaqn\n\n';
  help += '🕐 ' + timestamp.formatted;
  
  return help;
}

  generateWelcomeMessage(userName) {
    const timestamp = this.getCurrentBrazilTimestamp();
    
    let welcome = '╔═══════════════════════════════════════╗\n';
    welcome += '👋 *BEM-VINDO!*\n';
    welcome += '╚═══════════════════════════════════════╝\n\n';
    
    welcome += `Olá, *${userName}!* 😊\n\n`;
    welcome += 'Sou seu assistente financeiro pessoal! 🤖💰\n\n';
    
    welcome += '🚀 *PRIMEIROS PASSOS*\n\n';
    welcome += '1️⃣ Defina seu saldo inicial:\n';
    welcome += '   `/saldo 1000`\n\n';
    
    welcome += '2️⃣ Registre seus gastos naturalmente:\n';
    welcome += '   "Gastei 50 no mercado"\n\n';
    
    welcome += '3️⃣ Consulte relatórios:\n';
    welcome += '   `/relatorio mensal`\n\n';
    
    welcome += '💡 *DICA*\n';
    welcome += 'Use `/ajuda` para ver todos os comandos!\n\n';
    
    welcome += '═══════════════════════════════════════\n';
    welcome += 'Vamos começar a organizar suas finanças! 💪\n\n';
    welcome += '🕑 ' + timestamp.formatted;
    
    return welcome;
    
  }
  generateCardReport(card) {
  const timestamp = this.getCurrentBrazilTimestamp();
  const percentUsed = card.card_limit > 0 
    ? ((card.current_balance / card.card_limit) * 100).toFixed(1)
    : 0;
  
  let emoji = '💳';
  if (card.available_limit < 0) emoji = '🚨';
  else if (card.available_limit < card.card_limit * 0.2) emoji = '⚠️';
  
  let report = '╔══════════════════════════════════════════════╗\n';
  report += `${emoji} *CARTÃO DE CRÉDITO*\n`;
  report += '╚══════════════════════════════════════════════╝\n\n';
  
  report += `📊 *Limite Total:* ${this.formatMoney(card.card_limit)}\n`;
  report += `💰 *Usado:* ${this.formatMoney(card.current_balance)} (${percentUsed}%)\n`;
  report += `✅ *Disponível:* ${this.formatMoney(card.available_limit)}\n\n`;
  
  report += `📅 *Fatura Atual:* ${this.formatMoney(card.invoice_amount)}\n`;
  report += `🔔 *Vencimento:* Todo dia ${card.invoice_due_day}\n\n`;
  
  if (card.last_payment_date) {
    report += `💵 *Último Pagamento:*\n`;
    report += `   Valor: ${this.formatMoney(card.last_payment_amount)}\n`;
    report += `   Data: ${this.formatDate(card.last_payment_date)}\n\n`;
  }
  
  if (card.available_limit < 0) {
    report += '🚨 *ATENÇÃO: Limite estourado!*\n';
    report += `Você está ${this.formatMoney(Math.abs(card.available_limit))} acima do limite.\n\n`;
  } else if (card.available_limit < card.card_limit * 0.2) {
    report += '⚠️ *AVISO: Limite baixo!*\n';
    report += 'Menos de 20% disponível.\n\n';
  }
  
  report += '══════════════════════════════════════════════\n';
  report += '💡 Use `/pagar fatura` para pagar\n';
  report += '🕐 ' + timestamp.formatted;
  
  return report;
}

// 💳 CONFIRMAÇÃO DE COMPRA NO CARTÃO
generateCardPurchaseConfirmation(expense, card, category) {
  const timestamp = this.getCurrentBrazilTimestamp();
  
  let report = '✅ *COMPRA NO CARTÃO REGISTRADA*\n\n';
  
  report += `${category.emoji} *Categoria:* ${category.name}\n`;
  report += `💵 *Valor:* ${this.formatMoney(expense.amount)}\n`;
  report += `📝 *Descrição:* ${expense.description}\n`;
  report += `🕐 *Registrado em:* ${timestamp.formatted}\n\n`;
  
  report += '💳 *CARTÃO DE CRÉDITO*\n';
  report += `   Limite: ${this.formatMoney(card.card_limit)}\n`;
  report += `   Usado: ${this.formatMoney(card.current_balance)}\n`;
  report += `   Disponível: ${this.formatMoney(card.available_limit)}\n\n`;
  
  report += `📅 *Fatura próximo mês:* ${this.formatMoney(card.invoice_amount)}\n`;
  report += `🔔 *Vencimento:* Dia ${card.invoice_due_day}\n\n`;
  
  report += '══════════════════════════════════════════════';
  
  return report;
}

// 💳 CONFIRMAÇÃO DE PARCELAMENTO NO CARTÃO
generateCardInstallmentConfirmation(installment, card, category) {
  const timestamp = this.getCurrentBrazilTimestamp();
  
  let report = '✅ *PARCELAMENTO NO CARTÃO REGISTRADO*\n\n';
  
  report += `${category.emoji} *Categoria:* ${category.name}\n`;
  report += `📦 *Produto:* ${installment.description}\n`;
  report += `💰 *Total:* ${this.formatMoney(installment.total_amount)}\n`;
  report += `📊 *Parcelas:* ${installment.total_installments}x de ${this.formatMoney(installment.installment_amount)}\n`;
  report += `📅 *Primeira parcela:* ${this.formatDate(installment.first_due_date)}\n`;
  report += `🕐 *Registrado em:* ${timestamp.formatted}\n\n`;
  
  report += '💳 *SITUAÇÃO DO CARTÃO*\n';
  report += `   Limite: ${this.formatMoney(card.card_limit)}\n`;
  report += `   Usado: ${this.formatMoney(card.current_balance)}\n`;
  report += `   Disponível: ${this.formatMoney(card.available_limit)}\n\n`;
  
  report += `📅 *Fatura atual:* ${this.formatMoney(card.invoice_amount)}\n\n`;
  
  report += '💡 As parcelas serão cobradas mensalmente\n';
  report += '══════════════════════════════════════════════';
  
  return report;
}
}


module.exports = ReportGenerator;
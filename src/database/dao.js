const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

class DAO {
  constructor(dbPath) {
    this.dbPath = dbPath || path.join(__dirname, '../../database/finance.db');
    this.db = null;
    this.hasTransactionType = false;
  }

  async init() {
    const SQL = await initSqlJs();
    
    if (fs.existsSync(this.dbPath)) {
      const buffer = fs.readFileSync(this.dbPath);
      this.db = new SQL.Database(buffer);
    } else {
      this.db = new SQL.Database();
    }
    
    return this.db;
  }

  setDatabase(db) {
    this.db = db;
    
    // Verificar se coluna transaction_type existe
    try {
      const columns = this.db.exec("PRAGMA table_info(expenses)");
      if (columns[0]) {
        const columnNames = columns[0].values.map(row => row[1]);
        this.hasTransactionType = columnNames.includes('transaction_type');
      }
    } catch (e) {
      this.hasTransactionType = false;
    }
  }

  save() {
    const data = this.db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(this.dbPath, buffer);
  }

  // ============ USUÁRIOS ============
  
  upsertUser(whatsappId, name) {
    this.db.run(
      'INSERT INTO users (whatsapp_id, name) VALUES (?, ?) ON CONFLICT(whatsapp_id) DO UPDATE SET name = excluded.name, updated_at = CURRENT_TIMESTAMP',
      [whatsappId, name]
    );
    this.save();
    
    const result = this.db.exec('SELECT * FROM users WHERE whatsapp_id = ?', [whatsappId]);
    return result[0] ? this.rowToObject(result[0]) : null;
  }

  getUserByWhatsAppId(whatsappId) {
    const result = this.db.exec('SELECT * FROM users WHERE whatsapp_id = ?', [whatsappId]);
    return result[0] ? this.rowToObject(result[0]) : null;
  }

  getUserById(userId) {
    const result = this.db.exec('SELECT * FROM users WHERE id = ?', [userId]);
    return result[0] ? this.rowToObject(result[0]) : null;
  }

  // ============ SALDO PRINCIPAL ============
  
  setInitialBalance(whatsappId, amount) {
    this.db.run(
      'UPDATE users SET initial_balance = ?, current_balance = ?, updated_at = CURRENT_TIMESTAMP WHERE whatsapp_id = ?',
      [amount, amount, whatsappId]
    );
    this.save();
  }

  addBalance(whatsappId, amount) {
    const user = this.getUserByWhatsAppId(whatsappId);
    if (!user) return false;
    
    const newInitial = parseFloat((user.initial_balance + amount).toFixed(2));
    const newCurrent = parseFloat((user.current_balance + amount).toFixed(2));
    
    this.db.run(
      'UPDATE users SET initial_balance = ?, current_balance = ?, updated_at = CURRENT_TIMESTAMP WHERE whatsapp_id = ?',
      [newInitial, newCurrent, whatsappId]
    );
    this.save();
    return true;
  }

  updateBalance(userId, newBalance) {
    const balance = parseFloat(newBalance.toFixed(2));
    this.db.run(
      'UPDATE users SET current_balance = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [balance, userId]
    );
    this.save();
  }

  // ============ POUPANÇA ============
  
  addToSavings(userId, amount, description = 'Transferência para poupança') {
    const user = this.getUserById(userId);
    if (!user || user.current_balance < amount) return false;
    
    const newCurrent = parseFloat((user.current_balance - amount).toFixed(2));
    const newSavings = parseFloat(((user.savings_balance || 0) + amount).toFixed(2));
    
    this.db.run(
      'UPDATE users SET current_balance = ?, savings_balance = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [newCurrent, newSavings, userId]
    );
    
    // ✅ CORREÇÃO: Buscar categoria ou usar "Outros" (ID 11)
    let categoryId = 11; // Fallback para "Outros"
    try {
      const category = this.getCategoryByName('Poupança');
      if (category && category.id) {
        categoryId = category.id;
      }
    } catch (e) {
      console.log('⚠️ Categoria Poupança não encontrada, usando Outros');
    }
    
    this.createTransaction({
      userId: userId,
      amount: amount,
      description: description,
      categoryId: categoryId,
      transactionType: 'savings_deposit',
      chatId: user.whatsapp_id,
      messageId: null
    });
    
    this.save();
    return true;
  }

  withdrawFromSavings(userId, amount, description = 'Retirada da poupança') {
    const user = this.getUserById(userId);
    const savingsBalance = user.savings_balance || 0;
    if (!user || savingsBalance < amount) return false;
    
    const newSavings = parseFloat((savingsBalance - amount).toFixed(2));
    const newCurrent = parseFloat((user.current_balance + amount).toFixed(2));
    
    this.db.run(
      'UPDATE users SET savings_balance = ?, current_balance = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [newSavings, newCurrent, userId]
    );
    
    // ✅ CORREÇÃO: Buscar categoria ou usar "Outros" (ID 11)
    let categoryId = 11; // Fallback para "Outros"
    try {
      const category = this.getCategoryByName('Poupança');
      if (category && category.id) {
        categoryId = category.id;
      }
    } catch (e) {
      console.log('⚠️ Categoria Poupança não encontrada, usando Outros');
    }
    
    this.createTransaction({
      userId: userId,
      amount: amount,
      description: description,
      categoryId: categoryId,
      transactionType: 'savings_withdrawal',
      chatId: user.whatsapp_id,
      messageId: null
    });
    
    this.save();
    return true;
  }

  // ============ RESERVA DE EMERGÊNCIA ============
  
  addToEmergencyFund(userId, amount, description = 'Depósito na reserva de emergência') {
    const user = this.getUserById(userId);
    if (!user || user.current_balance < amount) return false;
    
    const newCurrent = parseFloat((user.current_balance - amount).toFixed(2));
    const newEmergency = parseFloat(((user.emergency_fund || 0) + amount).toFixed(2));
    
    this.db.run(
      'UPDATE users SET current_balance = ?, emergency_fund = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [newCurrent, newEmergency, userId]
    );
    
    // ✅ CORREÇÃO: Buscar categoria ou usar "Outros" (ID 11)
    let categoryId = 11; // Fallback para "Outros"
    try {
      const category = this.getCategoryByName('Emergência');
      if (category && category.id) {
        categoryId = category.id;
      }
    } catch (e) {
      console.log('⚠️ Categoria Emergência não encontrada, usando Outros');
    }
    
    this.createTransaction({
      userId: userId,
      amount: amount,
      description: description,
      categoryId: categoryId,
      transactionType: 'emergency_deposit',
      chatId: user.whatsapp_id,
      messageId: null
    });
    
    this.save();
    return true;
  }

  withdrawFromEmergencyFund(userId, amount, description = 'Retirada da reserva de emergência') {
    const user = this.getUserById(userId);
    const emergencyFund = user.emergency_fund || 0;
    if (!user || emergencyFund < amount) return false;
    
    const newEmergency = parseFloat((emergencyFund - amount).toFixed(2));
    const newCurrent = parseFloat((user.current_balance + amount).toFixed(2));
    
    this.db.run(
      'UPDATE users SET emergency_fund = ?, current_balance = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [newEmergency, newCurrent, userId]
    );
    
    // ✅ CORREÇÃO: Buscar categoria ou usar "Outros" (ID 11)
    let categoryId = 11; // Fallback para "Outros"
    try {
      const category = this.getCategoryByName('Emergência');
      if (category && category.id) {
        categoryId = category.id;
      }
    } catch (e) {
      console.log('⚠️ Categoria Emergência não encontrada, usando Outros');
    }
    
    this.createTransaction({
      userId: userId,
      amount: amount,
      description: description,
      categoryId: categoryId,
      transactionType: 'emergency_withdrawal',
      chatId: user.whatsapp_id,
      messageId: null
    });
    
    this.save();
    return true;
  }

  // ============ CATEGORIAS ============
  
  getCategories() {
    const result = this.db.exec('SELECT * FROM categories ORDER BY name');
    return result[0] ? this.rowsToObjects(result[0]) : [];
  }

  getCategoryById(id) {
    const result = this.db.exec('SELECT * FROM categories WHERE id = ?', [id]);
    return result[0] ? this.rowToObject(result[0]) : null;
  }

  getCategoryByName(name) {
    const result = this.db.exec('SELECT * FROM categories WHERE name = ?', [name]);
    return result[0] ? this.rowToObject(result[0]) : null;
  }

  identifyCategory(text) {
    const categories = this.getCategories();
    const textLower = text.toLowerCase().trim();
    
    const matches = [];
    
    for (const category of categories) {
      if (category.name === 'Outros' || category.name === 'Poupança' || category.name === 'Emergência') {
        continue;
      }
      
      const keywords = category.keywords.split(',');
      let score = 0;
      let matchedKeyword = '';
      
      for (const keyword of keywords) {
        const cleanKeyword = keyword.trim().toLowerCase();
        
        if (textLower === cleanKeyword) {
          score += 100;
          matchedKeyword = cleanKeyword;
          break;
        }
        
        const wordBoundaryRegex = new RegExp('\\b' + cleanKeyword + '\\b', 'i');
        if (wordBoundaryRegex.test(textLower)) {
          score += 50;
          matchedKeyword = cleanKeyword;
        }
        else if (textLower.includes(cleanKeyword)) {
          score += 10;
          matchedKeyword = cleanKeyword;
        }
      }
      
      if (score > 0) {
        matches.push({ category, score, matchedKeyword });
      }
    }
    
    if (matches.length > 0) {
      matches.sort((a, b) => b.score - a.score);
      return matches[0].category.id;
    }
    
    const othersCategory = categories.find(c => c.name === 'Outros');
    return othersCategory ? othersCategory.id : categories[categories.length - 1].id;
  }

  // ============ TRANSAÇÕES ============
  
  createTransaction(transaction) {
    const { userId, amount, description, categoryId, transactionType, chatId, messageId } = transaction;
    const type = transactionType || 'expense';
    
    if (!this.hasTransactionType) {
      this.db.run(
        'INSERT INTO expenses (user_id, amount, description, category_id, chat_id, message_id) VALUES (?, ?, ?, ?, ?, ?)',
        [userId, amount, description, categoryId, chatId, messageId]
      );
    } else {
      this.db.run(
        'INSERT INTO expenses (user_id, amount, description, category_id, transaction_type, chat_id, message_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [userId, amount, description, categoryId, type, chatId, messageId]
      );
    }
    
    const expenseResult = this.db.exec('SELECT * FROM expenses WHERE rowid = last_insert_rowid()');
    const savedExpense = expenseResult[0] ? this.rowToObject(expenseResult[0]) : null;
    
    this.save();
    return savedExpense;
  }

  createExpense(expense) {
    const { userId, amount, description, categoryId, chatId, messageId } = expense;
    
    if (!this.hasTransactionType) {
      this.db.run(
        'INSERT INTO expenses (user_id, amount, description, category_id, chat_id, message_id) VALUES (?, ?, ?, ?, ?, ?)',
        [userId, amount, description, categoryId, chatId, messageId]
      );
    } else {
      this.db.run(
        'INSERT INTO expenses (user_id, amount, description, category_id, transaction_type, chat_id, message_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [userId, amount, description, categoryId, 'expense', chatId, messageId]
      );
    }
    
    const expenseResult = this.db.exec('SELECT * FROM expenses WHERE rowid = last_insert_rowid()');
    const savedExpense = expenseResult[0] ? this.rowToObject(expenseResult[0]) : null;
    
    const userResult = this.db.exec('SELECT current_balance FROM users WHERE id = ?', [userId]);
    if (userResult[0]) {
      const user = this.rowToObject(userResult[0]);
      const newBalance = parseFloat((user.current_balance - amount).toFixed(2));
      this.updateBalance(userId, newBalance);
    }
    
    this.save();
    return savedExpense;
  }

  getExpensesByUser(userId, filters = {}) {
    let query = `
      SELECT 
        e.*,
        c.name as category_name,
        c.emoji as category_emoji
      FROM expenses e
      JOIN categories c ON e.category_id = c.id
      WHERE e.user_id = ?
    `;
    
    const params = [userId];
    
    if (filters.startDate) {
      query += ' AND e.date >= ?';
      params.push(filters.startDate);
    }
    
    if (filters.endDate) {
      query += ' AND e.date <= ?';
      params.push(filters.endDate);
    }
    
    if (filters.categoryId) {
      query += ' AND e.category_id = ?';
      params.push(filters.categoryId);
    }
    
    if (filters.transactionType && this.hasTransactionType) {
      query += ' AND e.transaction_type = ?';
      params.push(filters.transactionType);
    }
    
    query += ' ORDER BY e.date DESC';
    
    const result = this.db.exec(query, params);
    return result[0] ? this.rowsToObjects(result[0]) : [];
  }

  getExpensesByCategory(userId, startDate, endDate) {
    let query = `
      SELECT 
        c.name as category,
        c.emoji,
        COUNT(e.id) as count,
        SUM(e.amount) as total
      FROM expenses e
      JOIN categories c ON e.category_id = c.id
      WHERE e.user_id = ?
        AND e.date >= ?
        AND e.date <= ?
    `;
    
    if (this.hasTransactionType) {
      query += " AND e.transaction_type = 'expense'";
    }
    
    query += `
      GROUP BY c.id, c.name, c.emoji
      ORDER BY total DESC
    `;
    
    const result = this.db.exec(query, [userId, startDate, endDate]);
    return result[0] ? this.rowsToObjects(result[0]) : [];
  }

  getUserStats(userId) {
    let query = `
      SELECT 
        COUNT(*) as total_expenses,
        SUM(amount) as total_spent,
        AVG(amount) as avg_expense,
        MAX(amount) as max_expense,
        MIN(amount) as min_expense
      FROM expenses
      WHERE user_id = ?
    `;
    
    if (this.hasTransactionType) {
      query += " AND transaction_type = 'expense'";
    }
    
    const result = this.db.exec(query, [userId]);
    return result[0] ? this.rowToObject(result[0]) : { 
      total_expenses: 0, 
      total_spent: 0, 
      avg_expense: 0, 
      max_expense: 0, 
      min_expense: 0 
    };
  }

  // ============ 🆕 PARCELAMENTOS ============
  
  createInstallment(data) {
    const { userId, description, totalAmount, installmentAmount, totalInstallments, categoryId, chatId, firstDueDate } = data;
    
    // Criar registro principal de parcelamento
    this.db.run(
      'INSERT INTO installments (user_id, description, total_amount, installment_amount, total_installments, category_id, chat_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [userId, description, totalAmount, installmentAmount, totalInstallments, categoryId, chatId]
    );
    
    const result = this.db.exec('SELECT * FROM installments WHERE rowid = last_insert_rowid()');
    const installment = result[0] ? this.rowToObject(result[0]) : null;
    
    if (installment) {
      // 🆕 Calcular datas de vencimento
      const dueDate = firstDueDate ? new Date(firstDueDate) : new Date();
      
      // Criar todas as parcelas com data de vencimento
      for (let i = 1; i <= totalInstallments; i++) {
        const currentDueDate = new Date(dueDate);
        currentDueDate.setMonth(currentDueDate.getMonth() + (i - 1));
        
        this.db.run(
          'INSERT INTO installment_payments (installment_id, installment_number, amount, status, due_date) VALUES (?, ?, ?, ?, ?)',
          [installment.id, i, installmentAmount, 'pending', currentDueDate.toISOString()]
        );
      }
    }
    
    this.save();
    return installment;
  }

  getInstallmentsByUser(userId) {
    const query = `
      SELECT 
        i.*,
        c.name as category_name,
        c.emoji as category_emoji,
        (SELECT COUNT(*) FROM installment_payments WHERE installment_id = i.id AND status = 'paid') as paid_count,
        (SELECT COUNT(*) FROM installment_payments WHERE installment_id = i.id AND status = 'pending') as pending_count
      FROM installments i
      JOIN categories c ON i.category_id = c.id
      WHERE i.user_id = ?
      ORDER BY i.created_at DESC
    `;
    
    const result = this.db.exec(query, [userId]);
    return result[0] ? this.rowsToObjects(result[0]) : [];
  }

  getInstallmentById(installmentId) {
    const query = `
      SELECT 
        i.*,
        c.name as category_name,
        c.emoji as category_emoji
      FROM installments i
      JOIN categories c ON i.category_id = c.id
      WHERE i.id = ?
    `;
    
    const result = this.db.exec(query, [installmentId]);
    return result[0] ? this.rowToObject(result[0]) : null;
  }

  getInstallmentPayments(installmentId) {
    const result = this.db.exec(
      'SELECT * FROM installment_payments WHERE installment_id = ? ORDER BY installment_number',
      [installmentId]
    );
    return result[0] ? this.rowsToObjects(result[0]) : [];
  }

  getNextPendingPayment(installmentId) {
    const result = this.db.exec(
      'SELECT * FROM installment_payments WHERE installment_id = ? AND status = ? ORDER BY installment_number LIMIT 1',
      [installmentId, 'pending']
    );
    return result[0] ? this.rowToObject(result[0]) : null;
  }

  payInstallment(paymentId, userId) {
  const payment = this.db.exec('SELECT * FROM installment_payments WHERE id = ?', [paymentId]);
  if (!payment[0]) return false;
  
  const paymentData = this.rowToObject(payment[0]);
  const user = this.getUserById(userId);
  
  if (!user || user.current_balance < paymentData.amount) return false;
  
  // Marcar como paga
  this.db.run(
    'UPDATE installment_payments SET status = ?, paid_at = CURRENT_TIMESTAMP WHERE id = ?',
    ['paid', paymentId]
  );
  
  // Descontar do saldo
  const newBalance = parseFloat((user.current_balance - paymentData.amount).toFixed(2));
  this.updateBalance(userId, newBalance);
  
  // 🆕 SE FOR COMPRA NO CARTÃO, LIBERAR LIMITE
  this.releaseCardLimitOnPayment(userId, paymentData.installment_id, paymentData.amount);
  
  // Registrar como despesa
  const installment = this.db.exec('SELECT * FROM installments WHERE id = ?', [paymentData.installment_id]);
  if (installment[0]) {
    const inst = this.rowToObject(installment[0]);
    const description = inst.description + ' (parcela ' + paymentData.installment_number + '/' + inst.total_installments + ')';
    
    this.createExpense({
      userId: userId,
      amount: paymentData.amount,
      description: description,
      categoryId: inst.category_id,
      chatId: inst.chat_id,
      messageId: null
    });
  }
  
  this.save();
  return true;
}

  findInstallmentByDescription(userId, partialDescription) {
    const installments = this.getInstallmentsByUser(userId);
    const searchLower = partialDescription.toLowerCase().trim();
    
    for (const inst of installments) {
      if (inst.description.toLowerCase().includes(searchLower)) {
        return inst;
      }
    }
    
    return null;
  }

  // ============ GRUPOS ============
  
  upsertGroup(chatId, name) {
    this.db.run(
      'INSERT INTO groups (chat_id, name) VALUES (?, ?) ON CONFLICT(chat_id) DO UPDATE SET name = excluded.name, active = 1',
      [chatId, name]
    );
    this.save();
  }

  // ============ AVISO DE SALDO BAIXO ============
  
  setLowBalanceWarned(userId, warned) {
    try {
      this.db.run(
        'UPDATE users SET low_balance_warned = ? WHERE id = ?',
        [warned ? 1 : 0, userId]
      );
      this.save();
    } catch (e) {
      // Coluna não existe ainda
    }
  }

  // ============ UTILITÁRIOS ============
  
  rowToObject(result) {
    const obj = {};
    for (let i = 0; i < result.columns.length; i++) {
      obj[result.columns[i]] = result.values[0][i];
    }
    return obj;
  }

  rowsToObjects(result) {
    const objects = [];
    for (let i = 0; i < result.values.length; i++) {
      const obj = {};
      for (let j = 0; j < result.columns.length; j++) {
        obj[result.columns[j]] = result.values[i][j];
      }
      objects.push(obj);
    }
    return objects;
  }

  // ============ 🆕 LEMBRETES E VENCIMENTOS ============

  getDueTodayPayments() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    const query = `
      SELECT 
        ip.*,
        i.description,
        i.user_id,
        i.chat_id,
        i.total_installments,
        c.emoji
      FROM installment_payments ip
      JOIN installments i ON ip.installment_id = i.id
      JOIN categories c ON i.category_id = c.id
      WHERE ip.status = 'pending'
        AND ip.due_date >= ?
        AND ip.due_date < ?
        AND (ip.reminded_at IS NULL OR date(ip.reminded_at) < date(?))
      ORDER BY ip.due_date
    `;
    
    const result = this.db.exec(query, [today.toISOString(), tomorrow.toISOString(), today.toISOString()]);
    return result[0] ? this.rowsToObjects(result[0]) : [];
  }

  getOverduePayments() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const query = `
      SELECT 
        ip.*,
        i.description,
        i.user_id,
        i.chat_id,
        i.total_installments,
        c.emoji
      FROM installment_payments ip
      JOIN installments i ON ip.installment_id = i.id
      JOIN categories c ON i.category_id = c.id
      WHERE ip.status = 'pending'
        AND ip.due_date < ?
      ORDER BY ip.due_date
    `;
    
    const result = this.db.exec(query, [today.toISOString()]);
    return result[0] ? this.rowsToObjects(result[0]) : [];
  }

  getPendingPaymentsByUser(userId) {
    const query = `
      SELECT 
        ip.*,
        i.description,
        i.total_installments,
        c.emoji
      FROM installment_payments ip
      JOIN installments i ON ip.installment_id = i.id
      JOIN categories c ON i.category_id = c.id
      WHERE i.user_id = ?
        AND ip.status = 'pending'
      ORDER BY ip.due_date
    `;
    
    const result = this.db.exec(query, [userId]);
    return result[0] ? this.rowsToObjects(result[0]) : [];
  }

  markAsReminded(paymentId) {
    this.db.run(
      'UPDATE installment_payments SET reminded_at = CURRENT_TIMESTAMP WHERE id = ?',
      [paymentId]
    );
    this.save();
  }

  updateDueDate(paymentId, newDueDate) {
    this.db.run(
      'UPDATE installment_payments SET due_date = ? WHERE id = ?',
      [newDueDate.toISOString(), paymentId]
    );
    this.save();
  }

 // ============ 🆕 FUNÇÕES DE ZERAGEM ============

resetBalance(userId) {
  const user = this.getUserById(userId);
  if (!user) return false;
  
  this.db.run(
    'UPDATE users SET current_balance = 0, initial_balance = 0, low_balance_warned = 0 WHERE id = ?',
    [userId]
  );
  this.save(); // ✅ SALVAR IMEDIATAMENTE
  
  this.db.run(
    'INSERT INTO expenses (user_id, amount, description, category_id, date, transaction_type, chat_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [userId, 0, 'Saldo zerado', 1, new Date().toISOString(), 'reset', user.whatsapp_id]
  );
  this.save(); // ✅ SALVAR NOVAMENTE
  
  return true;
}

resetSavings(userId) {
  const user = this.getUserById(userId);
  if (!user || user.savings_balance === 0) return false;
  
  this.db.run(
    'UPDATE users SET savings_balance = 0 WHERE id = ?',
    [userId]
  );
  this.save(); // ✅ SALVAR IMEDIATAMENTE
  
  this.db.run(
    'INSERT INTO expenses (user_id, amount, description, category_id, date, transaction_type, chat_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [userId, 0, 'Poupança zerada', 1, new Date().toISOString(), 'reset', user.whatsapp_id]
  );
  this.save(); // ✅ SALVAR NOVAMENTE
  
  return true;
}

resetEmergencyFund(userId) {
  const user = this.getUserById(userId);
  if (!user || user.emergency_fund === 0) return false;
  
  this.db.run(
    'UPDATE users SET emergency_fund = 0 WHERE id = ?',
    [userId]
  );
  this.save(); // ✅ SALVAR IMEDIATAMENTE
  
  this.db.run(
    'INSERT INTO expenses (user_id, amount, description, category_id, date, transaction_type, chat_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [userId, 0, 'Reserva de emergência zerada', 1, new Date().toISOString(), 'reset', user.whatsapp_id]
  );
  this.save(); // ✅ SALVAR NOVAMENTE
  
  return true;
}

resetInstallments(userId) {
  const user = this.getUserById(userId);
  if (!user) return false;
  
  // Buscar todos os parcelamentos do usuário
  const installments = this.getInstallmentsByUser(userId);
  if (installments.length === 0) return false;
  
  // Deletar todos os pagamentos
  this.db.run('DELETE FROM installment_payments WHERE installment_id IN (SELECT id FROM installments WHERE user_id = ?)', [userId]);
  this.save(); // ✅ SALVAR IMEDIATAMENTE
  
  // Deletar todos os parcelamentos
  this.db.run('DELETE FROM installments WHERE user_id = ?', [userId]);
  this.save(); // ✅ SALVAR IMEDIATAMENTE
  
  // Registrar histórico (COM chat_id!)
  this.db.run(
    'INSERT INTO expenses (user_id, amount, description, category_id, date, transaction_type, chat_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [userId, 0, 'Parcelamentos zerados', 1, new Date().toISOString(), 'reset', user.whatsapp_id]
  );
  this.save(); // ✅ SALVAR NOVAMENTE
  
  return true;
}

resetEverything(userId) {
  const user = this.getUserById(userId);
  if (!user) return false;
  
  // Zerar tudo
  this.db.run(
    'UPDATE users SET current_balance = 0, initial_balance = 0, savings_balance = 0, emergency_fund = 0, low_balance_warned = 0 WHERE id = ?',
    [userId]
  );
  this.save(); // ✅ SALVAR IMEDIATAMENTE
  
  // Deletar parcelas
  this.db.run('DELETE FROM installment_payments WHERE installment_id IN (SELECT id FROM installments WHERE user_id = ?)', [userId]);
  this.save(); // ✅ SALVAR IMEDIATAMENTE
  
  this.db.run('DELETE FROM installments WHERE user_id = ?', [userId]);
  this.save(); // ✅ SALVAR IMEDIATAMENTE
  
  // Deletar gastos
  this.db.run('DELETE FROM expenses WHERE user_id = ?', [userId]);
  this.save(); // ✅ SALVAR IMEDIATAMENTE
  
  // Registrar histórico da zeragem completa (COM chat_id!)
  this.db.run(
    'INSERT INTO expenses (user_id, amount, description, category_id, date, transaction_type, chat_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [userId, 0, 'Sistema totalmente zerado', 1, new Date().toISOString(), 'reset', user.whatsapp_id]
  );
  this.save(); // ✅ SALVAR FINALMENTE
  
  return true;
}
// ============ 💳 GESTÃO DE CARTÕES DE CRÉDITO (MÚLTIPLOS CARTÕES) ============

// Criar novo cartão (com nome e vencimento)
createCreditCard(userId, cardName, cardLimit, invoiceDueDay) {
  const user = this.getUserById(userId);
  if (!user) return false;
  
  // Validar nome
  if (!cardName || cardName.trim() === '') return false;
  
  // Validar limite
  if (cardLimit < 100 || cardLimit > 1000000) return false;
  
  // Validar dia de vencimento (1-31)
  const dueDay = invoiceDueDay || 10;
  if (dueDay < 1 || dueDay > 31) return false;
  
  // Verificar se já existe cartão com este nome
  const existing = this.db.exec(
    'SELECT * FROM user_cards WHERE user_id = ? AND LOWER(card_name) = LOWER(?)',
    [userId, cardName.trim()]
  );
  
  if (existing[0]) {
    return false; // Já tem cartão com este nome
  }
  
  this.db.run(
    'INSERT INTO user_cards (user_id, card_name, card_limit, current_balance, available_limit, invoice_due_day) VALUES (?, ?, ?, ?, ?, ?)',
    [userId, cardName.trim(), cardLimit, 0, cardLimit, dueDay]
  );
  this.save();
  
  return true;
}

// Listar todos os cartões do usuário
getAllCardsByUserId(userId) {
  const result = this.db.exec('SELECT * FROM user_cards WHERE user_id = ? ORDER BY created_at DESC', [userId]);
  return result[0] ? this.rowsToObjects(result[0]) : [];
}

// Buscar cartão por ID
getCardById(cardId) {
  const result = this.db.exec('SELECT * FROM user_cards WHERE id = ?', [cardId]);
  return result[0] ? this.rowToObject(result[0]) : null;
}

// Buscar cartão por nome
getCardByName(userId, cardName) {
  const result = this.db.exec(
    'SELECT * FROM user_cards WHERE user_id = ? AND LOWER(card_name) = LOWER(?)', 
    [userId, cardName.trim()]
  );
  return result[0] ? this.rowToObject(result[0]) : null;
}

// Buscar cartão por nome parcial (para quando usuário digita parte do nome)
findCardByPartialName(userId, partialName) {
  const cards = this.getAllCardsByUserId(userId);
  const searchLower = partialName.toLowerCase().trim();
  
  // Busca exata primeiro
  for (const card of cards) {
    if (card.card_name.toLowerCase() === searchLower) {
      return card;
    }
  }
  
  // Busca parcial
  for (const card of cards) {
    if (card.card_name.toLowerCase().includes(searchLower)) {
      return card;
    }
  }
  
  return null;
}

// Atualizar limite do cartão
updateCardLimit(cardId, newLimit) {
  const card = this.getCardById(cardId);
  if (!card) return false;
  
  if (newLimit < 100 || newLimit > 1000000) return false;
  
  const usedAmount = card.current_balance;
  const newAvailable = newLimit - usedAmount;
  
  this.db.run(
    'UPDATE user_cards SET card_limit = ?, available_limit = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    [newLimit, newAvailable, cardId]
  );
  this.save();
  
  return true;
}

// Adicionar compra à vista no cartão
addCardPurchase(userId, cardId, amount, description, categoryId, chatId, messageId) {
  const card = this.getCardById(cardId);
  if (!card || card.user_id !== userId) return false;
  
  const newBalance = parseFloat((card.current_balance + amount).toFixed(2));
  const newAvailable = parseFloat((card.available_limit - amount).toFixed(2));
  const newInvoice = parseFloat((card.invoice_amount + amount).toFixed(2));
  
  // Atualizar cartão
  this.db.run(
    'UPDATE user_cards SET current_balance = ?, available_limit = ?, invoice_amount = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    [newBalance, newAvailable, newInvoice, cardId]
  );
  this.save();
  
  // Registrar transação
  this.db.run(
    'INSERT INTO card_transactions (user_id, card_id, amount, description, category_id, is_installment, chat_id, message_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [userId, cardId, amount, description, categoryId, 0, chatId, messageId]
  );
  this.save();
  
  return true;
}

// Adicionar parcelamento ao cartão
addCardInstallment(userId, cardId, installmentId, totalAmount) {
  const card = this.getCardById(cardId);
  if (!card || card.user_id !== userId) return false;
  
  const newBalance = parseFloat((card.current_balance + totalAmount).toFixed(2));
  const newAvailable = parseFloat((card.available_limit - totalAmount).toFixed(2));
  const newInvoice = parseFloat((card.invoice_amount + totalAmount).toFixed(2));
  
  // Atualizar cartão
  this.db.run(
    'UPDATE user_cards SET current_balance = ?, available_limit = ?, invoice_amount = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    [newBalance, newAvailable, newInvoice, cardId]
  );
  this.save();
  
  // Marcar parcelamento como sendo do cartão
  this.db.run(
    'UPDATE installments SET is_card_purchase = 1, card_id = ? WHERE id = ?',
    [cardId, installmentId]
  );
  this.save();
  
  return true;
}

// Pagar fatura do cartão
payCardInvoice(userId, cardId, paymentAmount) {
  const card = this.getCardById(cardId);
  const user = this.getUserById(userId);
  
  if (!card || !user || card.user_id !== userId) return false;
  if (user.current_balance < paymentAmount) return false;
  
  // Descontar do saldo do usuário
  const newUserBalance = parseFloat((user.current_balance - paymentAmount).toFixed(2));
  this.updateBalance(userId, newUserBalance);
  
  // Liberar limite do cartão
  const newCardBalance = parseFloat((card.current_balance - paymentAmount).toFixed(2));
  const newAvailable = parseFloat((card.available_limit + paymentAmount).toFixed(2));
  const newInvoice = parseFloat((card.invoice_amount - paymentAmount).toFixed(2));
  
  this.db.run(
    'UPDATE user_cards SET current_balance = ?, available_limit = ?, invoice_amount = ?, last_payment_date = CURRENT_TIMESTAMP, last_payment_amount = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    [newCardBalance, newAvailable, newInvoice, paymentAmount, cardId]
  );
  this.save();
  
  return true;
}

// Quando paga parcela de compra no cartão, libera o limite proporcional
releaseCardLimitOnPayment(userId, installmentId, amount) {
  const installment = this.getInstallmentById(installmentId);
  if (!installment || installment.is_card_purchase !== 1) return;
  
  const cardId = installment.card_id;
  if (!cardId) return;
  
  const card = this.getCardById(cardId);
  if (!card || card.user_id !== userId) return;
  
  // Liberar o limite proporcional da parcela
  const newCardBalance = parseFloat((card.current_balance - amount).toFixed(2));
  const newAvailable = parseFloat((card.available_limit + amount).toFixed(2));
  
  this.db.run(
    'UPDATE user_cards SET current_balance = ?, available_limit = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    [newCardBalance, newAvailable, cardId]
  );
  this.save();
}

// Registrar alerta de 30% de uso
setCard30PercentAlert(cardId) {
  this.db.run(
    'UPDATE user_cards SET last_alert_30_percent = CURRENT_TIMESTAMP WHERE id = ?',
    [cardId]
  );
  this.save();
}

// Verificar se precisa alertar sobre 30% de uso
shouldAlert30Percent(card) {
  if (!card || card.card_limit === 0) return false;
  
  const percentUsed = (card.current_balance / card.card_limit) * 100;
  if (percentUsed < 30) return false;
  
  // Se nunca alertou, alertar agora
  if (!card.last_alert_30_percent) return true;
  
  // Se já alertou, só alertar novamente após 24 horas
  const lastAlert = new Date(card.last_alert_30_percent);
  const now = new Date();
  const hoursSinceLastAlert = (now - lastAlert) / (1000 * 60 * 60);
  
  return hoursSinceLastAlert >= 24;
}

// Buscar cartões com vencimento próximo (próximos 5 dias)
getCardsWithUpcomingDueDate(userId, daysAhead = 5) {
  const cards = this.getAllCardsByUserId(userId);
  const today = new Date();
  const currentDay = today.getDate();
  
  const upcoming = [];
  
  for (const card of cards) {
    if (card.invoice_amount === 0) continue;
    
    let daysUntil = card.invoice_due_day - currentDay;
    if (daysUntil < 0) {
      daysUntil += 30; // Próximo mês
    }
    
    if (daysUntil <= daysAhead) {
      upcoming.push({
        ...card,
        daysUntilDue: daysUntil
      });
    }
  }
  
  return upcoming.sort((a, b) => a.daysUntilDue - b.daysUntilDue);
}

// Deletar cartão
deleteCard(cardId, userId) {
  const card = this.getCardById(cardId);
  if (!card || card.user_id !== userId) return false;
  
  // Deletar transações do cartão
  this.db.run('DELETE FROM card_transactions WHERE card_id = ?', [cardId]);
  this.save();
  
  // Resetar flag de parcelamentos que eram deste cartão
  this.db.run('UPDATE installments SET is_card_purchase = 0, card_id = NULL WHERE card_id = ?', [cardId]);
  this.save();
  
  // Deletar o cartão
  this.db.run('DELETE FROM user_cards WHERE id = ?', [cardId]);
  this.save();
  
  return true;
}

// Resetar cartão (zerar saldo mas manter cadastro)
resetCard(cardId, userId) {
  const card = this.getCardById(cardId);
  if (!card || card.user_id !== userId) return false;
  
  // Zerar saldo do cartão
  this.db.run(
    'UPDATE user_cards SET current_balance = 0, available_limit = card_limit, invoice_amount = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    [cardId]
  );
  this.save();
  
  // Deletar transações do cartão
  this.db.run('DELETE FROM card_transactions WHERE card_id = ?', [cardId]);
  this.save();
  
  // Resetar flag de parcelamentos que eram deste cartão
  this.db.run('UPDATE installments SET is_card_purchase = 0, card_id = NULL WHERE card_id = ?', [cardId]);
  this.save();
  
  return true;
}

// MANTER a função antiga para compatibilidade (busca o primeiro cartão ou retorna null)
getCreditCardByUserId(userId) {
  const cards = this.getAllCardsByUserId(userId);
  return cards.length > 0 ? cards[0] : null;
}
}

module.exports = { DAO };
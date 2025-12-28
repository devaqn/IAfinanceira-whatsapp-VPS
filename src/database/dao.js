const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

class DAO {
  constructor(dbPath) {
    this.dbPath = dbPath || path.join(__dirname, '../../database/finance.db');
    this.db = null;
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
  }

  save() {
    const data = this.db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(this.dbPath, buffer);
  }

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

  setInitialBalance(whatsappId, amount) {
    this.db.run(
      'UPDATE users SET initial_balance = ?, current_balance = ?, updated_at = CURRENT_TIMESTAMP WHERE whatsapp_id = ?',
      [amount, amount, whatsappId]
    );
    this.save();
  }

  updateBalance(userId, newBalance) {
    this.db.run(
      'UPDATE users SET current_balance = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [newBalance, userId]
    );
    this.save();
  }

  getCategories() {
    const result = this.db.exec('SELECT * FROM categories ORDER BY name');
    return result[0] ? this.rowsToObjects(result[0]) : [];
  }

  getCategoryById(id) {
    const result = this.db.exec('SELECT * FROM categories WHERE id = ?', [id]);
    return result[0] ? this.rowToObject(result[0]) : null;
  }

  identifyCategory(text) {
    const categories = this.getCategories();
    const textLower = text.toLowerCase();
    
    for (const category of categories) {
      const keywords = category.keywords.split(',');
      for (const keyword of keywords) {
        if (textLower.includes(keyword.trim())) {
          return category.id;
        }
      }
    }
    
    return categories[categories.length - 1].id;
  }

  createExpense(expense) {
    const { userId, amount, description, categoryId, chatId, messageId } = expense;
    
    this.db.run(
      'INSERT INTO expenses (user_id, amount, description, category_id, chat_id, message_id) VALUES (?, ?, ?, ?, ?, ?)',
      [userId, amount, description, categoryId, chatId, messageId]
    );
    
    const expenseResult = this.db.exec('SELECT * FROM expenses WHERE rowid = last_insert_rowid()');
    const savedExpense = expenseResult[0] ? this.rowToObject(expenseResult[0]) : null;
    
    const userResult = this.db.exec('SELECT current_balance FROM users WHERE id = ?', [userId]);
    if (userResult[0]) {
      const user = this.rowToObject(userResult[0]);
      const newBalance = user.current_balance - amount;
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
    
    query += ' ORDER BY e.date DESC';
    
    const result = this.db.exec(query, params);
    return result[0] ? this.rowsToObjects(result[0]) : [];
  }

  getExpensesByCategory(userId, startDate, endDate) {
    const query = `
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
      GROUP BY c.id, c.name, c.emoji
      ORDER BY total DESC
    `;
    
    const result = this.db.exec(query, [userId, startDate, endDate]);
    return result[0] ? this.rowsToObjects(result[0]) : [];
  }

  getUserStats(userId) {
    const query = `
      SELECT 
        COUNT(*) as total_expenses,
        SUM(amount) as total_spent,
        AVG(amount) as avg_expense,
        MAX(amount) as max_expense,
        MIN(amount) as min_expense
      FROM expenses
      WHERE user_id = ?
    `;
    
    const result = this.db.exec(query, [userId]);
    return result[0] ? this.rowToObject(result[0]) : { total_expenses: 0, total_spent: 0, avg_expense: 0, max_expense: 0, min_expense: 0 };
  }

  upsertGroup(chatId, name) {
    this.db.run(
      'INSERT INTO groups (chat_id, name) VALUES (?, ?) ON CONFLICT(chat_id) DO UPDATE SET name = excluded.name, active = 1',
      [chatId, name]
    );
    this.save();
  }

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

  close() {
    if (this.db) {
      this.save();
      this.db.close();
    }
  }
}

module.exports = DAO;

class Logger {
  static expense(user, amount, description, category) {
    console.log(`💸 [EXPENSE] ${user.name}: R$ ${amount.toFixed(2)} - ${description} (${category})`);
  }
  
  static card(user, action, amount) {
    console.log(`💳 [CARD] ${user.name}: ${action} - R$ ${amount.toFixed(2)}`);
  }
  
  static installment(user, amount, installments, description) {
    console.log(`📦 [INSTALLMENT] ${user.name}: R$ ${amount.toFixed(2)} em ${installments}x - ${description}`);
  }
  
  static admin(action) {
    console.log(`🔧 [ADMIN] Comando executado: ${action}`);
  }
  
  static user(action, name, id) {
    console.log(`👤 [USER] ${action}: ${name} (${id})`);
  }
  
  static payment(user, type, amount) {
    console.log(`💰 [PAYMENT] ${user.name}: ${type} - R$ ${amount.toFixed(2)}`);
  }
  
  static invoice(user, action, amount) {
    console.log(`💳📄 [INVOICE] ${user.name}: ${action} - R$ ${amount.toFixed(2)}`);
  }
  
  static error(context, error) {
    console.error(`❌ [ERROR] ${context}:`, error.message);
  }
  
  static warning(message) {
    console.warn(`⚠️ [WARNING] ${message}`);
  }
  
  static info(message) {
    console.log(`ℹ️ [INFO] ${message}`);
  }
  
  static success(message) {
    console.log(`✅ [SUCCESS] ${message}`);
  }
}

module.exports = Logger;
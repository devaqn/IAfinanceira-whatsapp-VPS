module.exports = {
  ADMIN_NUMBER: '558198191625@s.whatsapp.net',
  
  TIMEOUTS: {
    PENDING_PURCHASE: 120000,      // 2 minutos
    PENDING_INSTALLMENT: 120000,
    PENDING_INVOICE: 120000,
    PENDING_RESET: 120000,
    MESSAGE_DEDUPLICATION: 30000   // 30 segundos
  },
  
  INVOICE_DUE_DAY: 5,
  
  PAYMENT_METHODS: {
    CARD: ['cartao', 'cartão', 'card'],
    BALANCE: ['saldo', 'dinheiro', 'conta']
  },
  
  WARNING_THRESHOLDS: {
    LOW_BALANCE: 0.30,              // 30%
    LOW_CARD_LIMIT: 0.20            // 20%
  }
};
module.exports = {
  TIMEOUTS: {
    PENDING_PURCHASE: 120000,        // 2 minutos para responder compra
    PENDING_INSTALLMENT: 120000,     // 2 minutos para responder parcelamento
    PENDING_INVOICE: 120000,         // 2 minutos para informar valor de pagamento
    PENDING_RESET: 120000,           // 2 minutos para confirmar zeragem
    PENDING_CARD_CREATION: 180000,   // 3 minutos para cadastrar cartão
    MESSAGE_DEDUPLICATION: 30000     // 30 segundos de cache de mensagem
  },
  
  INVOICE_DUE_DAY: 10,               // Dia padrão de vencimento
  DAYS_BEFORE_DUE_ALERT: 5,          // Alertar 5 dias antes do vencimento
  
  PAYMENT_METHODS: {
    CARD: ['cartao', 'cartão', 'card', 'credito', 'crédito'],
    BALANCE: ['saldo', 'dinheiro', 'conta', 'debito', 'débito']
  },
  
  WARNING_THRESHOLDS: {
    LOW_BALANCE: 0.30,               // Alertar quando restar 30% do saldo
    LOW_CARD_LIMIT: 0.20,            // Alertar quando restar 20% do limite
    CARD_USAGE_ALERT: 0.30           // Alertar quando usar 30% do cartão
  },
  
  CARD_LIMITS: {
    MIN_LIMIT: 100,                  // Limite mínimo de R$ 100
    MAX_LIMIT: 1000000,              // Limite máximo de R$ 1.000.000
    MIN_DUE_DAY: 1,                  // Dia mínimo de vencimento
    MAX_DUE_DAY: 31,                 // Dia máximo de vencimento
    MIN_NAME_LENGTH: 2,              // Mínimo de 2 caracteres no nome
    MAX_NAME_LENGTH: 50              // Máximo de 50 caracteres no nome
  }
};
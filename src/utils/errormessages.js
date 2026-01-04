class ErrorMessages {
  static COMMAND_NOT_FOUND() {
    return '❌ *Comando não reconhecido*\n\nDigite `/ajuda` para ver os comandos disponíveis';
  }

  static INVALID_VALUE() {
    return '❌ *Valor inválido*\n\nInforme um valor numérico maior que zero';
  }

  static INSUFFICIENT_BALANCE(type) {
    if (!type) type = 'saldo';
    return '❌ *' + type.charAt(0).toUpperCase() + type.slice(1) + ' insuficiente para realizar esta operação*';
  }

  static CONFIRMATION_FAILED() {
    return '❌ *Operação cancelada*\n\nNenhuma alteração foi feita';
  }

  static NO_DATA_FOUND(context) {
    if (!context) context = 'este período';
    return 'ℹ️ *Nenhum registro encontrado para ' + context + '*';
  }

  static OPERATION_NOT_ALLOWED() {
    return '❌ *Operação não permitida ou inexistente*';
  }

  static INITIAL_BALANCE_REQUIRED() {
    return '⚠️ *Defina seu saldo inicial primeiro!*\n\nUse: `/saldo 1000`';
  }

  static CONFIRMATION_REQUIRED(action) {
    return '⚠️ *CONFIRMAÇÃO NECESSÁRIA*\n\n' +
      'Esta ação é irreversível!\n' +
      'Para confirmar, responda:\n\n' +
      '*' + action + '*';
  }
}

module.exports = ErrorMessages;

// POR ALGUM MOTIVO, ELE ESTA SUBINDO PRO GIT MINUSCULO, NAO SEI QUE PORRA É ESSA, SO SEI QUE PRA RODAR NO TERMUX, ELE PRECISA ESTAR EM MAISCULO
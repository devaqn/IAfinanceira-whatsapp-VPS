const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

const DatabaseSchema = require('../src/database/schema');
const { DAO } = require('../src/database/dao');
const MessageHandler = require('../src/handlers/messageHandler');
const DashboardServer = require('../src/services/dashboardServer');
const { ADMIN_NUMBER } = require('../src/utils/memoryManager');

const USER_JID = '5511999999999@s.whatsapp.net';

class MockWhatsApp {
  constructor() {
    this.isConnected = true;
    this.replies = [];
    this.sentMessages = [];
    this.documents = [];
    this.presence = [];
  }

  async replyMessage(originalMessage, text) {
    this.replies.push({
      messageId: originalMessage.key.id,
      chatId: originalMessage.key.remoteJid,
      text: String(text || '')
    });
  }

  async sendMessage(jid, text) {
    this.sentMessages.push({ jid, text: String(text || '') });
  }

  async sendDocument(jid, filePath, fileName, caption = '') {
    this.documents.push({
      jid,
      filePath,
      fileName,
      caption,
      exists: fs.existsSync(filePath),
      size: fs.existsSync(filePath) ? fs.statSync(filePath).size : 0
    });
  }

  async markAsRead(_jid, _messageId) {}

  async sendPresence(jid, type) {
    this.presence.push({ jid, type });
  }

  getSenderInfo(message) {
    const isGroup = message.key.remoteJid.endsWith('@g.us');
    const sender = isGroup ? message.key.participant : message.key.remoteJid;
    return {
      sender,
      chatId: message.key.remoteJid,
      isGroup,
      messageId: message.key.id
    };
  }
}

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function hasAny(text, needles) {
  const normalized = normalizeText(text);
  for (let i = 0; i < needles.length; i++) {
    if (normalized.includes(normalizeText(needles[i]))) return true;
  }
  return false;
}

function hasTimestamp(text) {
  return /\d{2}\/\d{2}\/\d{4}[\s\S]*\d{2}:\d{2}/.test(String(text || ''));
}

function makeMessage(text, id, sender = USER_JID, pushName = 'QA User') {
  return {
    key: {
      id,
      fromMe: false,
      remoteJid: sender
    },
    message: {
      conversation: text
    },
    pushName
  };
}

function responseText(result) {
  const replies = result && result.replies ? result.replies : [];
  return replies.map((r) => r.text).join('\n---\n');
}

function httpGetJson(url) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, (res) => {
      let body = '';
      res.on('data', (chunk) => {
        body += chunk;
      });
      res.on('end', () => {
        try {
          resolve({
            status: res.statusCode,
            body: JSON.parse(body)
          });
        } catch (_) {
          resolve({
            status: res.statusCode,
            body: body
          });
        }
      });
    });
    req.on('error', reject);
  });
}

async function main() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'iaf-prod-sim-'));
  const dbPath = path.join(tempRoot, 'finance.db');
  const exportDir = path.join(tempRoot, 'exports');
  fs.mkdirSync(exportDir, { recursive: true });

  const port = 33000 + Math.floor(Math.random() * 1000);
  process.env.DASHBOARD_ENABLED = 'true';
  process.env.DASHBOARD_PORT = String(port);
  process.env.DASHBOARD_TOKEN = 'token-prod-sim';
  process.env.DASHBOARD_BASE_URL = `http://127.0.0.1:${port}`;

  const schema = new DatabaseSchema(dbPath);
  await schema.init();
  schema.initialize();

  const dao = new DAO(dbPath);
  dao.setDatabase(schema.getDatabase());

  const mockSync = {
    enabled: true,
    inProgress: false,
    pending: false,
    lastSyncAt: null,
    lastStatus: 'never',
    lastError: null,
    getStatus() {
      return {
        enabled: this.enabled,
        inProgress: this.inProgress,
        pending: this.pending,
        lastSyncAt: this.lastSyncAt,
        lastStatus: this.lastStatus,
        lastError: this.lastError
      };
    },
    async syncNow() {
      this.inProgress = true;
      await new Promise((resolve) => setTimeout(resolve, 20));
      this.inProgress = false;
      this.lastSyncAt = new Date().toISOString();
      this.lastStatus = 'ok';
      return { success: true, syncedAt: this.lastSyncAt };
    },
    queueSync() {}
  };
  dao.setCloudSyncService(mockSync);

  const whatsapp = new MockWhatsApp();
  const handler = new MessageHandler(dao, whatsapp);
  handler.exportService.exportDir = exportDir;

  const dashboard = new DashboardServer(dao, handler.reports);
  const dashboardServer = dashboard.start();
  await new Promise((resolve) => setTimeout(resolve, 150));

  let msgSeq = 0;
  async function send(text, sender = USER_JID, pushName = 'QA User') {
    msgSeq += 1;
    const id = `m-${msgSeq}`;
    const msg = makeMessage(text, id, sender, pushName);
    const beforeReplies = whatsapp.replies.length;
    const beforeSent = whatsapp.sentMessages.length;
    const beforeDocs = whatsapp.documents.length;
    await handler.process(msg);
    return {
      text,
      sender,
      replies: whatsapp.replies.slice(beforeReplies),
      sentMessages: whatsapp.sentMessages.slice(beforeSent),
      documents: whatsapp.documents.slice(beforeDocs)
    };
  }

  const checks = [];
  const bugs = [];
  function record(name, ok, details) {
    checks.push({ name, ok, details });
    if (!ok) bugs.push({ name, details });
  }

  function expectContains(name, result, options) {
    const text = responseText(result);
    if (!text.trim()) {
      record(name, false, `Sem resposta para: ${result.text}`);
      return text;
    }

    const include = options.include || [];
    if (include.length > 0) {
      const okInclude = hasAny(text, include);
      record(name + '_conteudo', okInclude, okInclude ? 'ok' : `Resposta inesperada: ${text}`);
    }

    const notInclude = options.notInclude || [];
    if (notInclude.length > 0) {
      const okNot = !hasAny(text, notInclude);
      record(name + '_nao_erro', okNot, okNot ? 'ok' : `Mensagem de erro detectada: ${text}`);
    }

    if (options.checkTimestamp) {
      const okTs = hasTimestamp(text);
      record(name + '_timestamp', okTs, okTs ? 'ok' : `Resposta sem data/hora: ${text}`);
    }

    return text;
  }

  const onboarding = await send('/start');
  expectContains('onboarding', onboarding, {
    include: ['/saldo 1000', 'bem-vindo'],
    checkTimestamp: true
  });

  const setBalance = await send('/saldo 5000');
  expectContains('saldo_inicial', setBalance, {
    include: ['saldo inicial', 'sucesso'],
    checkTimestamp: true
  });

  const addBalance = await send('/adicionar 300');
  expectContains('adicionar_saldo', addBalance, {
    include: ['saldo adicionado', 'novo saldo'],
    checkTimestamp: true
  });

  const savings = await send('/guardar 250');
  expectContains('guardar', savings, {
    include: ['dinheiro guardado', 'poupanca'],
    checkTimestamp: true
  });

  const emergency = await send('/reservar 150');
  expectContains('reservar', emergency, {
    include: ['reserva', 'saldos atualizados'],
    checkTimestamp: true
  });

  const cardStart = await send('/cartao criar');
  expectContains('cartao_inicio', cardStart, {
    include: ['criar novo cartao', 'passo 1/3'],
    checkTimestamp: true
  });

  const cardName = await send('Nubank Black');
  expectContains('cartao_nome', cardName, {
    include: ['agora digite o limite', 'cadastro de cartao'],
    checkTimestamp: true
  });

  const cardLimit = await send('6000');
  expectContains('cartao_limite', cardLimit, {
    include: ['dia do vencimento', 'cadastro de cartao'],
    checkTimestamp: true
  });

  const cardDue = await send('10');
  expectContains('cartao_vencimento', cardDue, {
    include: ['cartao cadastrado', 'nubank black'],
    checkTimestamp: true
  });

  const secondCardStart = await send('/cartao criar');
  expectContains('segundo_cartao_inicio', secondCardStart, {
    include: ['passo 1/3']
  });
  await send('Inter');
  const invalidLimit = await send('50');
  expectContains('segundo_cartao_limite_invalido', invalidLimit, {
    include: ['limite invalido'],
    checkTimestamp: true
  });
  await send('3000');
  const invalidDue = await send('32');
  expectContains('segundo_cartao_dia_invalido', invalidDue, {
    include: ['dia invalido'],
    checkTimestamp: true
  });
  const secondCardDone = await send('8');
  expectContains('segundo_cartao_ok', secondCardDone, {
    include: ['cartao cadastrado', 'inter']
  });

  const listCards = await send('/cartoes');
  const cardsText = expectContains('listar_cartoes', listCards, {
    include: ['seus cartoes', 'nubank black', 'inter'],
    checkTimestamp: true
  });
  record(
    'listar_cartoes_sem_erro',
    !hasAny(cardsText, ['erro']),
    hasAny(cardsText, ['erro']) ? cardsText : 'ok'
  );

  const getCardAccent = await send('/cartão nubank');
  expectContains('cartao_com_acento', getCardAccent, {
    include: ['nubank', 'limites'],
    notInclude: ['comando nao reconhecido'],
    checkTimestamp: true
  });

  const listCardsAccent = await send('/cartões');
  expectContains('cartoes_com_acento', listCardsAccent, {
    include: ['seus cartoes'],
    notInclude: ['comando nao reconhecido']
  });

  const expenseBalanceAsk = await send('gastei 120 mercado');
  expectContains('gasto_pergunta_forma_pagamento', expenseBalanceAsk, {
    include: ['forma de pagamento', 'seus cartoes'],
    checkTimestamp: true
  });
  const expenseBalanceAnswer = await send('saldo');
  expectContains('gasto_no_saldo', expenseBalanceAnswer, {
    include: ['gasto registrado', 'saldo atualizado'],
    checkTimestamp: true
  });

  const expenseCardAsk = await send('gastei 250 restaurante');
  expectContains('gasto_cartao_pergunta', expenseCardAsk, {
    include: ['forma de pagamento']
  });
  const chooseCard = await send('Nubank');
  expectContains('gasto_cartao_escolha', chooseCard, {
    include: ['deseja parcelar', 'compra no cartao'],
    checkTimestamp: true
  });
  const noInstallment = await send('nao');
  expectContains('gasto_cartao_avista', noInstallment, {
    include: ['compra no cartao registrada', 'nubank'],
    checkTimestamp: true
  });

  const installmentAsk = await send('comprei celular 1200 em 4x');
  expectContains('parcelado_pergunta_pagamento', installmentAsk, {
    include: ['parcelamento - forma de pagamento', 'seus cartoes'],
    checkTimestamp: true
  });
  const installmentChooseCard = await send('Inter');
  expectContains('parcelado_cartao_ok', installmentChooseCard, {
    include: ['compra parcelada', 'inter', '4x'],
    checkTimestamp: true
  });

  const installmentsList = await send('/parcelamentos');
  expectContains('listar_parcelamentos', installmentsList, {
    include: ['compras parceladas', 'celular'],
    checkTimestamp: true
  });
  const payInstallment = await send('/pagar celular');
  expectContains('pagar_parcela', payInstallment, {
    include: ['parcela paga', 'celular'],
    checkTimestamp: true
  });

  const payInvoiceAsk = await send('/pagar fatura inter');
  expectContains('pagar_fatura_ask', payInvoiceAsk, {
    include: ['pagamento de fatura', 'digite o valor'],
    checkTimestamp: true
  });
  const payInvoiceConfirm = await send('300');
  expectContains('pagar_fatura_confirmar', payInvoiceConfirm, {
    include: ['fatura paga', 'inter'],
    checkTimestamp: true
  });

  const payInvoiceNoName = await send('/pagar fatura');
  const payInvoiceNoNameText = expectContains('pagar_fatura_sem_nome', payInvoiceNoName, {
    include: ['mais de um cartao', '/pagar fatura [nome do cartao]'],
    notInclude: ['comando nao reconhecido', 'parcelamento com este nome']
  });
  if (!hasAny(payInvoiceNoNameText, ['mais de um cartao', '/pagar fatura [nome do cartao]'])) {
    record(
      'bug_pagar_fatura_sem_nome',
      false,
      'Comando /pagar fatura (sem nome) nao trouxe orientacao correta para escolher cartao.'
    );
  }

  const dueDates = await send('/vencimentos');
  expectContains('vencimentos', dueDates, {
    include: ['vencimentos dos cartoes', 'nubank', 'inter'],
    checkTimestamp: true
  });

  const goalCreate = await send('/meta criar 2000 viagem europa');
  expectContains('meta_criar', goalCreate, {
    include: ['meta criada', 'viagem europa'],
    notInclude: ['erro ao criar meta'],
    checkTimestamp: true
  });
  const goalsList = await send('/meta');
  expectContains('meta_listar', goalsList, {
    include: ['metas de economia', 'viagem europa'],
    checkTimestamp: true
  });
  const goalComplete = await send('/meta concluir 1');
  expectContains('meta_concluir', goalComplete, {
    include: ['meta #1', 'concluida'],
    checkTimestamp: true
  });
  const goalRemove = await send('/meta remover 1');
  expectContains('meta_remover', goalRemove, {
    include: ['meta #1', 'removida'],
    checkTimestamp: true
  });

  const weekly = await send('/relatorio semanal');
  expectContains('relatorio_semanal', weekly, {
    include: ['relatorio semanal', 'resumo da semana'],
    checkTimestamp: true
  });
  const monthly = await send('/relatorio mensal');
  expectContains('relatorio_mensal', monthly, {
    include: ['relatorio mensal', 'resumo do mes'],
    checkTimestamp: true
  });
  const chartWeek = await send('/grafico semana');
  expectContains('grafico_semana', chartWeek, {
    include: ['grafico semana'],
    checkTimestamp: true
  });
  const chartMonth = await send('/grafico mes');
  expectContains('grafico_mes', chartMonth, {
    include: ['grafico mes'],
    checkTimestamp: true
  });

  const exportExcel = await send('/exportar excel');
  expectContains('exportar_excel', exportExcel, {
    include: ['exportacao concluida', 'excel'],
    checkTimestamp: true
  });
  record(
    'excel_arquivo_gerado',
    exportExcel.documents.length >= 1 && exportExcel.documents[0].exists && exportExcel.documents[0].size > 0,
    JSON.stringify(exportExcel.documents[0] || null)
  );

  const exportPdf = await send('/exportar pdf');
  expectContains('exportar_pdf', exportPdf, {
    include: ['exportacao concluida', 'pdf'],
    checkTimestamp: true
  });
  record(
    'pdf_arquivo_gerado',
    exportPdf.documents.length >= 1 && exportPdf.documents[0].exists && exportPdf.documents[0].size > 0,
    JSON.stringify(exportPdf.documents[0] || null)
  );

  const exportAll = await send('/exportar ambos');
  expectContains('exportar_ambos', exportAll, {
    include: ['exportacao concluida', 'excel', 'pdf'],
    checkTimestamp: true
  });
  record(
    'ambos_arquivos_gerados',
    exportAll.documents.length >= 2,
    `Documentos enviados: ${exportAll.documents.length}`
  );

  const dashboardCmd = await send('/dashboard');
  expectContains('dashboard_comando', dashboardCmd, {
    include: ['dashboard web', '/dashboard'],
    checkTimestamp: true
  });

  const forecast = await send('/previsao ia');
  expectContains('previsao', forecast, {
    include: ['previsao de gastos'],
    notInclude: ['erro ao executar comando']
  });

  const nonAdminSync = await send('/sync status');
  expectContains('sync_nao_admin', nonAdminSync, {
    include: ['operacao nao permitida']
  });

  const adminOnboarding = await send('/start', ADMIN_NUMBER, 'Admin QA');
  expectContains('admin_start', adminOnboarding, {
    include: ['bem-vindo']
  });
  const adminStats = await send('!stats', ADMIN_NUMBER, 'Admin QA');
  expectContains('admin_stats', adminStats, {
    include: ['estatisticas do bot', 'total de usuarios']
  });
  const adminSyncStatus = await send('/sync status', ADMIN_NUMBER, 'Admin QA');
  expectContains('admin_sync_status', adminSyncStatus, {
    include: ['status do sync', 'postgresql']
  });
  const adminSyncNow = await send('/sync agora', ADMIN_NUMBER, 'Admin QA');
  expectContains('admin_sync_now', adminSyncNow, {
    include: ['sync concluido']
  });

  const unknown = await send('/comando_inexistente');
  expectContains('comando_desconhecido', unknown, {
    include: ['comando nao reconhecido']
  });

  const health = await httpGetJson(`http://127.0.0.1:${port}/health`);
  record('dashboard_health', health.status === 200 && health.body && health.body.ok === true, JSON.stringify(health));

  const unauthorizedOverview = await httpGetJson(`http://127.0.0.1:${port}/api/overview?userId=1`);
  record('dashboard_auth_bloqueio', unauthorizedOverview.status === 401, JSON.stringify(unauthorizedOverview));

  const authorizedOverview = await httpGetJson(`http://127.0.0.1:${port}/api/overview?token=token-prod-sim&userId=1`);
  const authorizedOk = authorizedOverview.status === 200 &&
    authorizedOverview.body &&
    authorizedOverview.body.user &&
    authorizedOverview.body.balances &&
    typeof authorizedOverview.body.balances.current === 'number';
  record('dashboard_overview_ok', authorizedOk, JSON.stringify(authorizedOverview));

  const dashboardGoals = await httpGetJson(`http://127.0.0.1:${port}/api/goals?token=token-prod-sim&userId=1`);
  record('dashboard_goals_ok', dashboardGoals.status === 200 && Array.isArray(dashboardGoals.body.goals), JSON.stringify(dashboardGoals));

  if (dashboardServer && typeof dashboardServer.close === 'function') {
    await new Promise((resolve) => dashboardServer.close(resolve));
  }

  const result = {
    pass: bugs.length === 0,
    totalChecks: checks.length,
    failedChecks: bugs.length,
    bugs,
    totals: {
      replies: whatsapp.replies.length,
      sentMessages: whatsapp.sentMessages.length,
      documents: whatsapp.documents.length,
      users: dao.getAllUsers().length
    },
    tempRoot
  };

  console.log(JSON.stringify(result, null, 2));
  process.exit(result.pass ? 0 : 1);
}

main().catch((error) => {
  console.error(JSON.stringify({
    pass: false,
    fatalError: error && error.stack ? error.stack : String(error)
  }, null, 2));
  process.exit(1);
});

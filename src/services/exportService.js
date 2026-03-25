const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');

class ExportService {
  constructor(dao, reports, exportDir) {
    this.dao = dao;
    this.reports = reports;
    this.exportDir = exportDir || path.join(__dirname, '../../exports');

    if (!fs.existsSync(this.exportDir)) {
      fs.mkdirSync(this.exportDir, { recursive: true });
    }
  }

  getSafeFileName(input) {
    return String(input || 'usuario')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 28) || 'usuario';
  }

  toValidDate(value) {
    if (!value) return null;
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  formatFileTimestamp(dateValue) {
    const date = this.toValidDate(dateValue) || new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hour = String(date.getHours()).padStart(2, '0');
    const minute = String(date.getMinutes()).padStart(2, '0');
    const second = String(date.getSeconds()).padStart(2, '0');
    return `${year}-${month}-${day}_${hour}-${minute}-${second}`;
  }

  getLastDataChangeAt(data) {
    const candidates = [];
    const addCandidate = (value) => {
      const parsed = this.toValidDate(value);
      if (parsed) candidates.push(parsed);
    };

    if (data && data.user) {
      addCandidate(data.user.updated_at);
      addCandidate(data.user.created_at);
    }

    const listGroups = [
      data ? data.expensesYear : null,
      data ? data.installments : null,
      data ? data.cards : null,
      data ? data.goals : null
    ];

    for (let i = 0; i < listGroups.length; i++) {
      const group = listGroups[i];
      if (!Array.isArray(group)) continue;

      for (let j = 0; j < group.length; j++) {
        const item = group[j] || {};
        addCandidate(item.updated_at);
        addCandidate(item.created_at);
        addCandidate(item.date);
        addCandidate(item.transaction_date);
        addCandidate(item.paid_at);
        addCandidate(item.completed_at);
        addCandidate(item.last_payment_date);
      }
    }

    if (candidates.length === 0) return data && data.generatedAt ? data.generatedAt : new Date();

    let latest = candidates[0];
    for (let i = 1; i < candidates.length; i++) {
      if (candidates[i].getTime() > latest.getTime()) latest = candidates[i];
    }
    return latest;
  }

  buildExportFileName(userName, generatedAt, lastDataChangeAt, extension) {
    const safeUser = this.getSafeFileName(userName);
    const generatedStamp = this.formatFileTimestamp(generatedAt);
    const lastChangeStamp = this.formatFileTimestamp(lastDataChangeAt);
    return `relatorio_${safeUser}_gerado_${generatedStamp}_ult_alt_${lastChangeStamp}.${extension}`;
  }

  validateExportedFile(filePath, fileType) {
    try {
      if (!fs.existsSync(filePath)) {
        return { ok: false, error: 'Arquivo nao foi criado.' };
      }

      const stat = fs.statSync(filePath);
      if (!stat.isFile() || stat.size <= 0) {
        return { ok: false, error: 'Arquivo criado esta vazio.' };
      }

      if (fileType === 'pdf') {
        const head = fs.readFileSync(filePath).subarray(0, 5).toString('utf8');
        if (head !== '%PDF-') {
          return { ok: false, error: 'Arquivo PDF invalido.' };
        }
      }

      return { ok: true };
    } catch (error) {
      return { ok: false, error: error.message || 'Falha ao validar arquivo gerado.' };
    }
  }

  getUserDataset(userId) {
    const user = this.dao.getUserById(userId);
    if (!user) return null;

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const yearStart = new Date(now.getFullYear(), 0, 1);

    const expensesMonth = this.dao.getExpensesByUser(userId, {
      startDate: monthStart.toISOString(),
      endDate: now.toISOString(),
      transactionType: 'expense'
    });

    const expensesYear = this.dao.getExpensesByUser(userId, {
      startDate: yearStart.toISOString(),
      endDate: now.toISOString(),
      transactionType: 'expense'
    });

    const installments = this.dao.getInstallmentsByUser(userId);
    const cards = this.dao.getAllCardsByUserId(userId);
    const goals = this.dao.getSavingsGoalsByUser(userId);

    return {
      user,
      generatedAt: now,
      expensesMonth,
      expensesYear,
      installments,
      cards,
      goals,
      categoryMonth: this.dao.getExpensesByCategory(userId, monthStart.toISOString(), now.toISOString()),
      trendMonth: this.dao.getExpenseTrendByDay(userId, monthStart.toISOString(), now.toISOString()),
      trendMonths: this.dao.getExpenseTrendByMonth(userId, 6)
    };
  }

  async exportPdf(userId) {
    const data = this.getUserDataset(userId);
    if (!data) return { success: false, error: 'Usuario nao encontrado.' };

    const lastDataChangeAt = this.getLastDataChangeAt(data);
    const fileName = this.buildExportFileName(data.user.name, data.generatedAt, lastDataChangeAt, 'pdf');
    const filePath = path.join(this.exportDir, fileName);

    const totalMonth = data.expensesMonth.reduce((sum, e) => sum + Number(e.amount || 0), 0);
    const topCategories = data.categoryMonth.slice(0, 8);

    await new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 40 });
      const stream = fs.createWriteStream(filePath);
      doc.pipe(stream);

      doc.fontSize(18).text('Relatorio Financeiro', { align: 'left' });
      doc.moveDown(0.5);
      doc.fontSize(10).text(`Usuario: ${data.user.name}`);
      doc.text(`WhatsApp: ${data.user.whatsapp_id}`);
      doc.text(`Gerado em: ${data.generatedAt.toISOString()}`);
      doc.text(`Ultima alteracao dos dados: ${lastDataChangeAt.toISOString()}`);
      doc.moveDown();

      doc.fontSize(14).text('Resumo');
      doc.fontSize(10);
      doc.text(`Saldo principal: ${this.reports.formatMoney(Number(data.user.current_balance || 0))}`);
      doc.text(`Poupanca: ${this.reports.formatMoney(Number(data.user.savings_balance || 0))}`);
      doc.text(`Reserva emergencia: ${this.reports.formatMoney(Number(data.user.emergency_fund || 0))}`);
      doc.text(`Gastos no mes: ${this.reports.formatMoney(totalMonth)}`);
      doc.text(`Transacoes no mes: ${data.expensesMonth.length}`);
      doc.text(`Parcelamentos ativos: ${data.installments.length}`);
      doc.text(`Cartoes cadastrados: ${data.cards.length}`);
      doc.text(`Metas de economia: ${data.goals.length}`);

      doc.moveDown();
      doc.fontSize(14).text('Categorias do mes');
      doc.fontSize(10);

      if (topCategories.length === 0) {
        doc.text('Sem gastos no periodo.');
      } else {
        for (let i = 0; i < topCategories.length; i++) {
          const c = topCategories[i];
          doc.text(`${i + 1}. ${c.category}: ${this.reports.formatMoney(Number(c.total || 0))} (${c.count}x)`);
        }
      }

      doc.moveDown();
      doc.fontSize(14).text('Metas');
      doc.fontSize(10);
      if (data.goals.length === 0) {
        doc.text('Nenhuma meta cadastrada.');
      } else {
        for (let i = 0; i < data.goals.length; i++) {
          const g = data.goals[i];
          doc.text(`#${g.id} ${g.name}`);
          doc.text(`Alvo: ${this.reports.formatMoney(Number(g.target_amount || 0))} | Progresso: ${this.reports.formatMoney(Number(g.current_progress || 0))} (${g.progress_percent || 0}%)`);
          doc.text(`Status: ${g.status}${g.target_date ? ` | Prazo: ${g.target_date}` : ''}`);
          doc.moveDown(0.4);
        }
      }

      doc.end();
      stream.on('finish', resolve);
      stream.on('error', reject);
    });

    const validation = this.validateExportedFile(filePath, 'pdf');
    if (!validation.ok) {
      return { success: false, error: validation.error || 'Falha ao validar exportacao PDF.' };
    }

    return { success: true, filePath, fileName };
  }
}

module.exports = ExportService;

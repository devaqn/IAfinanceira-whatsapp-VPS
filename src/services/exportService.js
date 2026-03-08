const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const XLSX = require('xlsx');

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
      .slice(0, 40);
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

  async exportExcel(userId) {
    const data = this.getUserDataset(userId);
    if (!data) return { success: false, error: 'Usuario nao encontrado.' };

    const safeUser = this.getSafeFileName(data.user.name);
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const fileName = `relatorio_${safeUser}_${stamp}.xlsx`;
    const filePath = path.join(this.exportDir, fileName);

    const wb = XLSX.utils.book_new();

    const summaryRows = [
      ['Campo', 'Valor'],
      ['Usuario', data.user.name],
      ['WhatsApp', data.user.whatsapp_id],
      ['Gerado em', data.generatedAt.toISOString()],
      ['Saldo principal', Number(data.user.current_balance || 0)],
      ['Poupanca', Number(data.user.savings_balance || 0)],
      ['Reserva emergencia', Number(data.user.emergency_fund || 0)],
      ['Patrimonio total', Number((data.user.current_balance || 0) + (data.user.savings_balance || 0) + (data.user.emergency_fund || 0))],
      ['Gastos no mes', Number(data.expensesMonth.reduce((sum, e) => sum + Number(e.amount || 0), 0))],
      ['Transacoes no mes', data.expensesMonth.length],
      ['Parcelamentos ativos', data.installments.length],
      ['Cartoes cadastrados', data.cards.length],
      ['Metas', data.goals.length]
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summaryRows), 'Resumo');

    const expensesRows = [
      ['Data', 'Descricao', 'Categoria', 'Valor', 'Tipo']
    ];
    for (let i = 0; i < data.expensesYear.length; i++) {
      const e = data.expensesYear[i];
      expensesRows.push([
        e.date || e.created_at || '',
        e.description || '',
        e.category_name || '',
        Number(e.amount || 0),
        e.transaction_type || 'expense'
      ]);
    }
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(expensesRows), 'Transacoes');

    const goalsRows = [['ID', 'Meta', 'Alvo', 'Progresso', 'Percentual', 'Status', 'Prazo']];
    for (let i = 0; i < data.goals.length; i++) {
      const g = data.goals[i];
      goalsRows.push([
        g.id,
        g.name,
        Number(g.target_amount || 0),
        Number(g.current_progress || 0),
        Number(g.progress_percent || 0),
        g.status,
        g.target_date || ''
      ]);
    }
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(goalsRows), 'Metas');

    const cardsRows = [['ID', 'Nome', 'Limite', 'Usado', 'Disponivel', 'Fatura', 'Vencimento']];
    for (let i = 0; i < data.cards.length; i++) {
      const c = data.cards[i];
      cardsRows.push([
        c.id,
        c.card_name,
        Number(c.card_limit || 0),
        Number(c.current_balance || 0),
        Number(c.available_limit || 0),
        Number(c.invoice_amount || 0),
        c.invoice_due_day
      ]);
    }
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(cardsRows), 'Cartoes');

    const categoryRows = [['Categoria', 'Total', 'Qtd']];
    for (let i = 0; i < data.categoryMonth.length; i++) {
      const c = data.categoryMonth[i];
      categoryRows.push([c.category, Number(c.total || 0), Number(c.count || 0)]);
    }
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(categoryRows), 'CategoriasMes');

    XLSX.writeFile(wb, filePath);

    return { success: true, filePath, fileName };
  }

  async exportPdf(userId) {
    const data = this.getUserDataset(userId);
    if (!data) return { success: false, error: 'Usuario nao encontrado.' };

    const safeUser = this.getSafeFileName(data.user.name);
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const fileName = `relatorio_${safeUser}_${stamp}.pdf`;
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

    return { success: true, filePath, fileName };
  }
}

module.exports = ExportService;

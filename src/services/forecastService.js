class ForecastService {
  constructor(dao, reports) {
    this.dao = dao;
    this.reports = reports;
  }

  linearRegression(points) {
    const n = points.length;
    if (n === 0) return { slope: 0, intercept: 0 };

    let sumX = 0;
    let sumY = 0;
    let sumXY = 0;
    let sumXX = 0;

    for (let i = 0; i < n; i++) {
      const x = points[i].x;
      const y = points[i].y;
      sumX += x;
      sumY += y;
      sumXY += x * y;
      sumXX += x * x;
    }

    const denominator = (n * sumXX) - (sumX * sumX);
    if (denominator === 0) {
      return { slope: 0, intercept: sumY / n };
    }

    const slope = ((n * sumXY) - (sumX * sumY)) / denominator;
    const intercept = (sumY - (slope * sumX)) / n;
    return { slope, intercept };
  }

  getVolatility(values) {
    if (!values.length) return 0;
    const mean = values.reduce((s, v) => s + v, 0) / values.length;
    if (mean === 0) return 0;

    const variance = values.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / values.length;
    const stdDev = Math.sqrt(variance);
    return stdDev / mean;
  }

  generateForecast(userId) {
    const user = this.dao.getUserById(userId);
    if (!user) {
      return { success: false, error: 'Usuario nao encontrado.' };
    }

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    const history = this.dao.getExpensesForForecast(userId, 120);
    if (!history || history.length < 7) {
      return {
        success: false,
        error: 'Historico insuficiente. Registre pelo menos 7 dias de gastos para previsao.'
      };
    }

    const thisMonthDaily = this.dao.getExpenseTrendByDay(userId, monthStart.toISOString(), now.toISOString());
    const spentSoFar = thisMonthDaily.reduce((sum, row) => sum + Number(row.total || 0), 0);

    const points = history.map((row, idx) => ({ x: idx + 1, y: Number(row.total || 0) }));
    const values = points.map(p => p.y);
    const regression = this.linearRegression(points);

    const currentDay = Math.max(1, now.getDate());
    const daysInMonth = monthEnd.getDate();
    const remainingDays = Math.max(0, daysInMonth - currentDay);

    const avgDailyCurrentMonth = spentSoFar / currentDay;
    const trendDaily = Math.max(0, (regression.slope * (points.length + 1)) + regression.intercept);
    const projectedDaily = Math.max(0, (avgDailyCurrentMonth * 0.65) + (trendDaily * 0.35));

    const projectedTotal = parseFloat((spentSoFar + (projectedDaily * remainingDays)).toFixed(2));
    const volatility = this.getVolatility(values);

    let confidence = 90;
    if (history.length < 20) confidence -= 15;
    if (history.length < 45) confidence -= 10;
    confidence -= Math.min(35, Math.round(volatility * 30));
    confidence = Math.max(40, Math.min(95, confidence));

    const trendLabel = regression.slope > 1
      ? 'alta'
      : regression.slope < -1
        ? 'queda'
        : 'estavel';

    return {
      success: true,
      user,
      spentSoFar: parseFloat(spentSoFar.toFixed(2)),
      projectedTotal,
      projectedDaily: parseFloat(projectedDaily.toFixed(2)),
      remainingDays,
      daysInMonth,
      currentDay,
      confidence,
      trendLabel,
      slope: regression.slope,
      volatility: parseFloat(volatility.toFixed(3))
    };
  }

  generateForecastMessage(userId) {
    const result = this.generateForecast(userId);
    const timestamp = this.reports.getCurrentBrazilTimestamp();

    if (!result.success) {
      return `?? *PREVISAO DE GASTOS*\n\n${result.error}\n\n?? ${timestamp.formatted}`;
    }

    let msg = '?? *PREVISAO DE GASTOS (IA)*\n\n';
    msg += `?? Usuario: ${result.user.name}\n`;
    msg += `?? Mes atual: dia ${result.currentDay}/${result.daysInMonth}\n`;
    msg += `?? Gasto ate agora: ${this.reports.formatMoney(result.spentSoFar)}\n`;
    msg += `?? Projecao do mes: *${this.reports.formatMoney(result.projectedTotal)}*\n`;
    msg += `?? Media diaria projetada: ${this.reports.formatMoney(result.projectedDaily)}\n`;
    msg += `? Dias restantes: ${result.remainingDays}\n\n`;

    msg += '?? *SINAL DA IA*\n';
    msg += `   Tendencia: ${result.trendLabel}\n`;
    msg += `   Confianca estimada: ${result.confidence}%\n`;

    if (result.trendLabel === 'alta') {
      msg += '\n?? Seus gastos estao acelerando. Considere reduzir despesas variaveis.';
    } else if (result.trendLabel === 'queda') {
      msg += '\n? Boa tendencia: seus gastos estao desacelerando.';
    } else {
      msg += '\n?? Tendencia neutra no momento.';
    }

    msg += `\n\n?? ${timestamp.formatted}`;
    return msg;
  }
}

module.exports = ForecastService;

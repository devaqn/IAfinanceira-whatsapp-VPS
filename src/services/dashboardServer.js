const express = require('express');
const ForecastService = require('./forecastService');

class DashboardServer {
  constructor(dao, reports) {
    this.dao = dao;
    this.reports = reports;
    this.forecast = new ForecastService(dao, reports);
    this.app = express();

    this.port = parseInt(process.env.DASHBOARD_PORT || '3030', 10);
    this.enabled = String(process.env.DASHBOARD_ENABLED || '').toLowerCase() === 'true';
    this.token = process.env.DASHBOARD_TOKEN || '';
    this.baseUrl = process.env.DASHBOARD_BASE_URL || `http://localhost:${this.port}`;

    this.server = null;
  }

  isAuthorized(req) {
    if (!this.token) return true;
    const headerToken = req.headers['x-dashboard-token'];
    const queryToken = req.query.token;
    return headerToken === this.token || queryToken === this.token;
  }

  getUserFromQuery(req) {
    if (req.query.userId) {
      return this.dao.getUserById(parseInt(req.query.userId, 10));
    }

    if (req.query.whatsapp) {
      return this.dao.getUserByWhatsAppId(String(req.query.whatsapp));
    }

    const users = this.dao.getAllUsers();
    return users[0] || null;
  }

  buildAsciiBars(categoryRows) {
    const total = categoryRows.reduce((sum, c) => sum + Number(c.total || 0), 0);
    if (total <= 0) return [];

    return categoryRows.slice(0, 8).map((c) => {
      const value = Number(c.total || 0);
      const percent = Math.round((value / total) * 100);
      const filled = Math.max(1, Math.round(percent / 5));
      return {
        category: c.category,
        total: value,
        percent,
        bar: `${'█'.repeat(filled)}${'░'.repeat(Math.max(0, 20 - filled))}`
      };
    });
  }

  setupRoutes() {
    this.app.get('/health', (_req, res) => {
      res.json({ ok: true, dashboard: true, timestamp: new Date().toISOString() });
    });

    this.app.use(['/api', '/dashboard'], (req, res, next) => {
      if (!this.isAuthorized(req)) {
        return res.status(401).json({ error: 'Nao autorizado. Informe token.' });
      }
      return next();
    });

    this.app.get('/api/users', (_req, res) => {
      const users = this.dao.getAllUsers().map((u) => ({
        id: u.id,
        name: u.name,
        whatsapp_id: u.whatsapp_id
      }));
      res.json({ users });
    });

    this.app.get('/api/overview', (req, res) => {
      const user = this.getUserFromQuery(req);
      if (!user) return res.status(404).json({ error: 'Usuario nao encontrado.' });

      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const expensesMonth = this.dao.getExpensesByUser(user.id, {
        startDate: monthStart.toISOString(),
        endDate: now.toISOString(),
        transactionType: 'expense'
      });

      const totalMonth = expensesMonth.reduce((sum, e) => sum + Number(e.amount || 0), 0);
      const cards = this.dao.getAllCardsByUserId(user.id);
      const installments = this.dao.getInstallmentsByUser(user.id);
      const goals = this.dao.getSavingsGoalsByUser(user.id);

      res.json({
        user: {
          id: user.id,
          name: user.name,
          whatsapp_id: user.whatsapp_id
        },
        balances: {
          current: Number(user.current_balance || 0),
          savings: Number(user.savings_balance || 0),
          emergency: Number(user.emergency_fund || 0),
          total: Number((user.current_balance || 0) + (user.savings_balance || 0) + (user.emergency_fund || 0))
        },
        month: {
          spent: totalMonth,
          transactions: expensesMonth.length
        },
        cards: {
          total: cards.length,
          used: cards.reduce((sum, c) => sum + Number(c.current_balance || 0), 0),
          limits: cards.reduce((sum, c) => sum + Number(c.card_limit || 0), 0)
        },
        installments: installments.length,
        goals: goals.length,
        generatedAt: new Date().toISOString()
      });
    });

    this.app.get('/api/expenses/trend', (req, res) => {
      const user = this.getUserFromQuery(req);
      if (!user) return res.status(404).json({ error: 'Usuario nao encontrado.' });

      const days = Math.max(7, Math.min(180, parseInt(req.query.days || '30', 10)));
      const end = new Date();
      const start = new Date(end);
      start.setDate(start.getDate() - days + 1);

      const trend = this.dao.getExpenseTrendByDay(user.id, start.toISOString(), end.toISOString());
      res.json({
        userId: user.id,
        start: start.toISOString(),
        end: end.toISOString(),
        points: trend
      });
    });

    this.app.get('/api/expenses/categories', (req, res) => {
      const user = this.getUserFromQuery(req);
      if (!user) return res.status(404).json({ error: 'Usuario nao encontrado.' });

      const period = String(req.query.period || 'month').toLowerCase();
      const end = new Date();
      const start = new Date(end);
      if (period === 'week') {
        start.setDate(start.getDate() - 7);
      } else {
        start.setDate(1);
      }

      const categories = this.dao.getExpensesByCategory(user.id, start.toISOString(), end.toISOString());
      const bars = this.buildAsciiBars(categories);

      res.json({
        userId: user.id,
        period,
        categories,
        bars
      });
    });

    this.app.get('/api/goals', (req, res) => {
      const user = this.getUserFromQuery(req);
      if (!user) return res.status(404).json({ error: 'Usuario nao encontrado.' });
      res.json({ userId: user.id, goals: this.dao.getSavingsGoalsByUser(user.id) });
    });

    this.app.get('/api/forecast', (req, res) => {
      const user = this.getUserFromQuery(req);
      if (!user) return res.status(404).json({ error: 'Usuario nao encontrado.' });
      res.json(this.forecast.generateForecast(user.id));
    });

    this.app.get('/dashboard', (_req, res) => {
      res.type('html').send(`<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>Finance Dashboard</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  <style>
    body{font-family:Segoe UI,Arial,sans-serif;background:#0b1220;color:#e7eefb;margin:0}
    .wrap{max-width:1100px;margin:0 auto;padding:20px}
    .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:12px}
    .card{background:#111b2e;border:1px solid #23314d;border-radius:12px;padding:14px}
    h1{margin:0 0 16px;font-size:24px}
    h3{margin:0 0 8px;font-size:14px;color:#a8c1ff;font-weight:600}
    .v{font-size:20px;font-weight:700}
    .row{display:flex;gap:12px;flex-wrap:wrap;margin:16px 0}
    select,button,input{background:#0f1a2c;color:#fff;border:1px solid #334a77;border-radius:8px;padding:8px}
    canvas{background:#0f1a2c;border-radius:12px;border:1px solid #23314d;padding:8px}
    .hint{opacity:.8;font-size:12px}
  </style>
</head>
<body>
<div class="wrap">
  <h1>Dashboard Financeiro (Read-only)</h1>
  <div class="row">
    <select id="userSelect"></select>
    <button onclick="loadAll()">Atualizar</button>
  </div>
  <div class="grid" id="cards"></div>
  <div class="row">
    <canvas id="trend" width="500" height="260"></canvas>
    <canvas id="cats" width="500" height="260"></canvas>
  </div>
  <div class="hint">Visualizacao apenas leitura. API protegida por token quando configurado.</div>
</div>
<script>
let trendChart; let catChart;
const qs = new URLSearchParams(location.search);
const token = qs.get('token') || '';
function api(path){
  const sep = path.includes('?') ? '&' : '?';
  const t = token ? sep + 'token=' + encodeURIComponent(token) : '';
  return fetch(path + t).then(r=>r.json());
}
async function loadUsers(){
  const data = await api('/api/users');
  const s = document.getElementById('userSelect');
  s.innerHTML='';
  (data.users||[]).forEach(u=>{
    const o=document.createElement('option');
    o.value=u.id;
    o.textContent=u.name + ' (#' + u.id + ')';
    s.appendChild(o);
  });
}
function currentUser(){ return document.getElementById('userSelect').value; }
function formatValue(k,v){
  if(typeof v!=='number') return v;
  const isMoney = k.includes('Saldo')||k.includes('Total')||k.includes('Gasto')||k.includes('Poupanca')||k.includes('Emergencia');
  return v.toLocaleString('pt-BR',{style:isMoney?'currency':'decimal',currency:'BRL'});
}
async function loadAll(){
  const id = currentUser();
  if(!id) return;
  const [ov,trend,cats] = await Promise.all([
    api('/api/overview?userId='+id),
    api('/api/expenses/trend?days=30&userId='+id),
    api('/api/expenses/categories?period=month&userId='+id)
  ]);

  const list = [
    ['Saldo', ov.balances.current],
    ['Poupanca', ov.balances.savings],
    ['Emergencia', ov.balances.emergency],
    ['Total Patrimonio', ov.balances.total],
    ['Gasto no mes', ov.month.spent],
    ['Transacoes mes', ov.month.transactions],
    ['Cartoes', ov.cards.total],
    ['Parcelamentos', ov.installments],
    ['Metas', ov.goals]
  ];

  document.getElementById('cards').innerHTML = list.map(function(item){
    const k = item[0];
    const v = item[1];
    return '<div class="card"><h3>' + k + '</h3><div class="v">' + formatValue(k,v) + '</div></div>';
  }).join('');

  const trendLabels=(trend.points||[]).map(p=>p.day);
  const trendValues=(trend.points||[]).map(p=>Number(p.total||0));
  if(trendChart) trendChart.destroy();
  trendChart = new Chart(document.getElementById('trend'), {
    type:'line', data:{labels:trendLabels,datasets:[{label:'Gasto diario',data:trendValues,borderColor:'#62b0ff',backgroundColor:'rgba(98,176,255,.2)'}]}, options:{responsive:false}
  });

  const catLabels=(cats.categories||[]).map(c=>c.category);
  const catValues=(cats.categories||[]).map(c=>Number(c.total||0));
  if(catChart) catChart.destroy();
  catChart = new Chart(document.getElementById('cats'), {
    type:'bar', data:{labels:catLabels,datasets:[{label:'Categorias',data:catValues,backgroundColor:'#30c49b'}]}, options:{responsive:false}
  });
}
(async()=>{ await loadUsers(); await loadAll(); })();
</script>
</body>
</html>`);
    });
  }

  start() {
    if (!this.enabled) return null;
    this.setupRoutes();
    this.server = this.app.listen(this.port, () => {
      console.log(`📊 Dashboard web ativo em ${this.baseUrl}/dashboard`);
    });
    return this.server;
  }

  getDashboardLink() {
    if (!this.enabled) return null;
    return `${this.baseUrl}/dashboard`;
  }
}

module.exports = DashboardServer;
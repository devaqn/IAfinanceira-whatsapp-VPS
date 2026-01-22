const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

class DatabaseSchema {
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

  initialize() {
    
    console.log('🗄️ Inicializando banco de dados...');

    // Tabelas existentes (mantidas)
    this.db.run(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        whatsapp_id TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        initial_balance REAL DEFAULT 0.0,
        current_balance REAL DEFAULT 0.0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL,
        emoji TEXT DEFAULT '📌',
        keywords TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS expenses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        amount REAL NOT NULL,
        description TEXT NOT NULL,
        category_id INTEGER NOT NULL,
        date DATETIME DEFAULT CURRENT_TIMESTAMP,
        chat_id TEXT NOT NULL,
        message_id TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
        FOREIGN KEY (category_id) REFERENCES categories (id)
      )
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS groups (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        chat_id TEXT UNIQUE NOT NULL,
        name TEXT,
        active INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS installments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        description TEXT NOT NULL,
        total_amount REAL NOT NULL,
        installment_amount REAL NOT NULL,
        total_installments INTEGER NOT NULL,
        category_id INTEGER NOT NULL,
        chat_id TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
        FOREIGN KEY (category_id) REFERENCES categories (id)
      )
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS installment_payments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        installment_id INTEGER NOT NULL,
        installment_number INTEGER NOT NULL,
        amount REAL NOT NULL,
        status TEXT DEFAULT 'pending',
        paid_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (installment_id) REFERENCES installments (id) ON DELETE CASCADE
      )
    `);

    // Índices
    try {
      this.db.run('CREATE INDEX IF NOT EXISTS idx_expenses_user_id ON expenses(user_id)');
      this.db.run('CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(date)');
      this.db.run('CREATE INDEX IF NOT EXISTS idx_expenses_category_id ON expenses(category_id)');
      this.db.run('CREATE INDEX IF NOT EXISTS idx_users_whatsapp_id ON users(whatsapp_id)');
      this.db.run('CREATE INDEX IF NOT EXISTS idx_installments_user_id ON installments(user_id)');
      this.db.run('CREATE INDEX IF NOT EXISTS idx_installment_payments_installment_id ON installment_payments(installment_id)');
      this.db.run('CREATE INDEX IF NOT EXISTS idx_installment_payments_status ON installment_payments(status)');
    } catch (e) {
      // Índices já existem
    }

    console.log('✅ Estrutura básica criada!');
    
    this.migrateDatabase();
    this.insertDefaultCategories();
    
    this.save();
    console.log('✅ Banco de dados pronto!\n');
    // ============ 💳 TABELA DE CARTÃO DE CRÉDITO ============
// Armazena as configurações do cartão do usuário
this.db.run(`
  CREATE TABLE IF NOT EXISTS credit_cards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    card_limit REAL DEFAULT 0.0,           -- Limite total do cartão
    current_balance REAL DEFAULT 0.0,      -- Quanto já foi usado
    available_limit REAL DEFAULT 0.0,      -- Quanto ainda tem disponível
    invoice_amount REAL DEFAULT 0.0,       -- Valor da fatura atual
    invoice_due_day INTEGER DEFAULT 10,    -- Dia de vencimento da fatura
    last_payment_date DATETIME,            -- Data do último pagamento
    last_payment_amount REAL DEFAULT 0.0,  -- Valor do último pagamento
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
  )
`);

// ============ 💳 TABELA DE TRANSAÇÕES DO CARTÃO ============
// Registra cada compra feita no cartão
this.db.run(`
  CREATE TABLE IF NOT EXISTS card_transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    card_id INTEGER NOT NULL,
    amount REAL NOT NULL,                  -- Valor da compra
    description TEXT NOT NULL,             -- Descrição da compra
    category_id INTEGER NOT NULL,          -- Categoria
    transaction_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    is_installment INTEGER DEFAULT 0,      -- Se é parcelamento (1) ou à vista (0)
    installment_id INTEGER,                -- ID do parcelamento (se aplicável)
    chat_id TEXT NOT NULL,
    message_id TEXT,
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    FOREIGN KEY (card_id) REFERENCES credit_cards (id) ON DELETE CASCADE,
    FOREIGN KEY (category_id) REFERENCES categories (id),
    FOREIGN KEY (installment_id) REFERENCES installments (id) ON DELETE SET NULL
  )
`);

console.log('✅ Tabelas de cartão criadas!');
  }
  

  migrateDatabase() {
    try {
      console.log('🔄 Verificando migração...');
      
      // MIGRAÇÃO: USERS
      const userColumns = this.db.exec("PRAGMA table_info(users)");
      if (userColumns[0]) {
        const columnNames = userColumns[0].values.map(row => row[1]);
        
        if (!columnNames.includes('savings_balance')) {
          console.log('   → Adicionando savings_balance');
          this.db.run('ALTER TABLE users ADD COLUMN savings_balance REAL DEFAULT 0.0');
        }
        
        if (!columnNames.includes('emergency_fund')) {
          console.log('   → Adicionando emergency_fund');
          this.db.run('ALTER TABLE users ADD COLUMN emergency_fund REAL DEFAULT 0.0');
        }
        
        if (!columnNames.includes('low_balance_warned')) {
          console.log('   → Adicionando low_balance_warned');
          this.db.run('ALTER TABLE users ADD COLUMN low_balance_warned INTEGER DEFAULT 0');
        }
      }

      // MIGRAÇÃO: EXPENSES
      const expenseColumns = this.db.exec("PRAGMA table_info(expenses)");
      if (expenseColumns[0]) {
        const columnNames = expenseColumns[0].values.map(row => row[1]);
        
        if (!columnNames.includes('transaction_type')) {
          console.log('   → Adicionando transaction_type');
          this.db.run("ALTER TABLE expenses ADD COLUMN transaction_type TEXT DEFAULT 'expense'");
          
          try {
            this.db.run('CREATE INDEX IF NOT EXISTS idx_expenses_type ON expenses(transaction_type)');
          } catch (e) {}
        }
      }

      // 🆕 MIGRAÇÃO: INSTALLMENT_PAYMENTS (VENCIMENTO E LEMBRETE)
      const paymentColumns = this.db.exec("PRAGMA table_info(installment_payments)");
      if (paymentColumns[0]) {
        const columnNames = paymentColumns[0].values.map(row => row[1]);
        
        if (!columnNames.includes('due_date')) {
          console.log('   → Adicionando due_date (vencimento)');
          this.db.run('ALTER TABLE installment_payments ADD COLUMN due_date DATETIME');
        }
        
        if (!columnNames.includes('reminded_at')) {
          console.log('   → Adicionando reminded_at (último lembrete)');
          this.db.run('ALTER TABLE installment_payments ADD COLUMN reminded_at DATETIME');
        }
        
        // Criar índice para buscas de vencimento
        try {
          this.db.run('CREATE INDEX IF NOT EXISTS idx_installment_payments_due_date ON installment_payments(due_date)');
          console.log('   → Índice de vencimento criado');
        } catch (e) {}
      }

      console.log('✅ Migração concluída!');
      this.save();
    } catch (error) {
      console.log('⚠️ Aviso: ' + error.message);
    }
  }

  insertDefaultCategories() {
    try {
      const check = this.db.exec('SELECT COUNT(*) as count FROM categories');
      const count = check[0] ? check[0].values[0][0] : 0;
      
      if (count > 0) {
        console.log('✅ Categorias já existem (' + count + ')');
        return;
      }

      const categories = [
        { 
          name: 'Alimentação', 
          emoji: '🍔', 
          keywords: 'comida,almoço,almoco,jantar,café,cafe,lanche,restaurante,delivery,ifood,rappi,pizza,hamburger,hamburguer,sorvete,açai,acai,pastel,coxinha,salgado,bebida,cerveja,refri,refrigerante,suco,padaria,pão,pao,bolo,doce,chocolate,mcdonalds,burger king,subway,kfc,starbucks,outback'
        },
        { 
          name: 'Transporte', 
          emoji: '🚗', 
          keywords: 'uber,99,taxi,ônibus,onibus,metrô,metro,trem,gasolina,combustível,combustivel,etanol,diesel,passagem,estacionamento,pedágio,pedagio,aplicativo,corrida,viagem,carro,moto,bicicleta,patinete,mobilidade,frete,entrega'
        },
        { 
          name: 'Mercado', 
          emoji: '🛒', 
          keywords: 'mercado,supermercado,feira,compras,açougue,acougue,padaria,hortifruti,verduras,frutas,legumes,carrefour,extra,pão de açucar,atacadão,atacadao,walmart,makro,assaí,assai,cesta básica,basica'
        },
        { 
          name: 'Lazer', 
          emoji: '🎮', 
          keywords: 'cinema,teatro,show,festa,balada,jogo,games,diversão,diversao,parque,viagem,passeio,netflix,streaming,spotify,amazon prime,disney,hbo,ingresso,concerto,museu,zoo,praia,piscina,clube,entretenimento'
        },
        { 
          name: 'Contas', 
          emoji: '💳', 
          keywords: 'conta,luz,energia elétrica,eletrica,água,agua,saneamento,internet,telefone,celular,aluguel,condomínio,condominio,cartão,cartao,fatura,boleto,pagamento,financiamento,prestação,prestacao,iptu,ipva,seguro,taxa,tarifa,mensalidade'
        },
        { 
          name: 'Saúde', 
          emoji: '💊', 
          keywords: 'médico,medico,remédio,remedio,farmácia,farmacia,consulta,exame,hospital,clínica,clinica,dentista,odonto,plano de saúde,saude,medicamento,drogaria,droga raia,drogasil,pague menos,ultrafarma,panvel,laboratório,laboratorio,fisioterapia,terapia,psicólogo,psicologo'
        },
        { 
          name: 'Educação', 
          emoji: '📚', 
          keywords: 'curso,faculdade,universidade,escola,colégio,colegio,livro,material escolar,mensalidade,matrícula,matricula,apostila,aula,professor,educação,educacao,estudo,formação,formacao,treinamento,workshop,seminário,seminario,udemy,coursera,alura'
        },
        { 
          name: 'Vestuário', 
          emoji: '👕', 
          keywords: 'roupa,calça,calca,camisa,blusa,camiseta,sapato,tênis,tenis,sandália,sandalia,chinelo,moda,loja de roupa,shopping,calçado,calcado,vestido,saia,bermuda,shorts,jaqueta,casaco,boné,bone,acessório,acessorio,bolsa,mochila,carteira,renner,c&a,riachuelo,marisa,hering,zara,adidas,nike'
        },
        { 
          name: 'Poupança', 
          emoji: '🐷', 
          keywords: 'poupança,poupanca,guardado,economia,reserva,investimento,aplicação,aplicacao'
        },
        { 
          name: 'Emergência', 
          emoji: '🚨', 
          keywords: 'emergência,emergencia,urgência,urgencia,imprevisto'
        },
        { 
          name: 'Outros', 
          emoji: '📦', 
          keywords: 'outro,diversos,variados,geral,vários,varios,demais'
        }
      ];

      const stmt = this.db.prepare('INSERT OR IGNORE INTO categories (name, emoji, keywords) VALUES (?, ?, ?)');
      let inserted = 0;
      
      for (const cat of categories) {
        stmt.run([cat.name, cat.emoji, cat.keywords]);
        inserted++;
      }
      stmt.free();
      
      console.log('✅ ' + inserted + ' categorias inseridas!');
      this.save();
    } catch (error) {
      console.log('⚠️ Erro ao inserir categorias: ' + error.message);
    }
  }

  save() {
    try {
      const data = this.db.export();
      const buffer = Buffer.from(data);
      fs.writeFileSync(this.dbPath, buffer);
    } catch (error) {
      console.error('Erro ao salvar banco:', error.message);
    }
  }

  close() {
    if (this.db) {
      this.save();
      this.db.close();
    }
  }

  getDatabase() {
    return this.db;
  }
}

module.exports = DatabaseSchema;
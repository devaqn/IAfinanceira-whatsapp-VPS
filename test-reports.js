const DAO = require('./src/database/dao');
const ReportGenerator = require('./src/services/reports');

async function test() {
  try {
    const dao = new DAO('./database/finance.db');
    await dao.init();
    
    const reports = new ReportGenerator(dao);
    console.log('✅ ReportGenerator criado com sucesso');
    
    const timestamp = reports.getCurrentBrazilTimestamp();
    console.log('✅ Timestamp:', timestamp.formatted);
    
  } catch (error) {
    console.error('❌ Erro:', error.message);
    console.error(error.stack);
  }
}

test();
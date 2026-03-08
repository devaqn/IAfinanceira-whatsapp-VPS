const { Pool } = require('pg');

class PostgresSyncService {
  constructor(dao, options = {}) {
    this.dao = dao;
    this.enabled = String(process.env.POSTGRES_ENABLED || '').toLowerCase() === 'true' && !!process.env.DATABASE_URL;
    this.source = options.source || 'whatsapp-bot';
    this.pool = null;

    this.syncInProgress = false;
    this.pendingSync = false;
    this.lastSyncAt = null;
    this.lastError = null;
    this.lastStatus = 'idle';
  }

  async init() {
    if (!this.enabled) return;

    this.pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: String(process.env.POSTGRES_SSL || '').toLowerCase() === 'true'
        ? { rejectUnauthorized: false }
        : undefined
    });

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS finance_cloud_state (
        id INTEGER PRIMARY KEY,
        source TEXT NOT NULL,
        state JSONB NOT NULL,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS finance_sync_log (
        id BIGSERIAL PRIMARY KEY,
        source TEXT NOT NULL,
        status TEXT NOT NULL,
        details TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    this.lastStatus = 'ready';
  }

  getStatus() {
    return {
      enabled: this.enabled,
      inProgress: this.syncInProgress,
      pending: this.pendingSync,
      lastSyncAt: this.lastSyncAt,
      lastError: this.lastError,
      lastStatus: this.lastStatus
    };
  }

  queueSync() {
    if (!this.enabled) return;
    this.pendingSync = true;

    if (this.syncInProgress) return;
    setTimeout(() => {
      this.syncNow().catch(() => {});
    }, 3000);
  }

  async syncNow() {
    if (!this.enabled) return { success: false, error: 'PostgreSQL desabilitado.' };
    if (this.syncInProgress) return { success: false, error: 'Sync ja em andamento.' };

    this.syncInProgress = true;
    this.pendingSync = false;
    this.lastStatus = 'running';

    try {
      const state = this.dao.getAllTableData();
      const payload = {
        version: 1,
        generated_at: new Date().toISOString(),
        source: this.source,
        tables: state
      };

      await this.pool.query(
        `INSERT INTO finance_cloud_state (id, source, state, updated_at)
         VALUES (1, $1, $2::jsonb, NOW())
         ON CONFLICT (id)
         DO UPDATE SET source = EXCLUDED.source, state = EXCLUDED.state, updated_at = NOW()`,
        [this.source, JSON.stringify(payload)]
      );

      await this.pool.query(
        'INSERT INTO finance_sync_log (source, status, details) VALUES ($1, $2, $3)',
        [this.source, 'success', 'Sync completo']
      );

      this.lastSyncAt = new Date().toISOString();
      this.lastError = null;
      this.lastStatus = 'ok';
      return { success: true, syncedAt: this.lastSyncAt };
    } catch (error) {
      this.lastError = error.message;
      this.lastStatus = 'error';

      try {
        await this.pool.query(
          'INSERT INTO finance_sync_log (source, status, details) VALUES ($1, $2, $3)',
          [this.source, 'error', error.message]
        );
      } catch (_) {}

      return { success: false, error: error.message };
    } finally {
      this.syncInProgress = false;
      if (this.pendingSync) {
        setTimeout(() => this.syncNow().catch(() => {}), 2000);
      }
    }
  }
}

module.exports = PostgresSyncService;

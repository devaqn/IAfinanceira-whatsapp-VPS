const makeWASocket = require('@whiskeysockets/baileys').default;
const {
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore
} = require('@whiskeysockets/baileys');

const pino = require('pino');
const qrcode = require('qrcode-terminal');
const fs = require('fs');

class WhatsAppService {
  constructor(authPath = './auth_info') {
    this.authPath = authPath;
    this.sock = null;
    this.qrAttempts = 0;
    this.maxQRAttempts = 3;
    this.isConnected = false;

    if (!fs.existsSync(this.authPath)) {
      fs.mkdirSync(this.authPath, { recursive: true });
    }

    this.logger = pino({ level: 'silent' });
  }

  async connect(messageHandler) {
    return new Promise(async (resolve, reject) => {
      try {
        console.log('📱 Iniciando conexão com WhatsApp...\n');

        const { state, saveCreds } = await useMultiFileAuthState(this.authPath);
        const { version } = await fetchLatestBaileysVersion();

        this.sock = makeWASocket({
          version,
          auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, this.logger)
          },
          logger: this.logger,
          printQRInTerminal: false,
          browser: ['Finance Bot', 'Chrome', '1.0.0'],
          connectTimeoutMs: 60000,
          keepAliveIntervalMs: 30000
        });

        this.sock.ev.on('creds.update', saveCreds);

        this.sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
          if (qr) {
            this.qrAttempts++;
            console.log(`\n📱 QR CODE (${this.qrAttempts}/${this.maxQRAttempts})\n`);
            qrcode.generate(qr, { small: false });

            if (this.qrAttempts >= this.maxQRAttempts) {
              this.qrAttempts = 0;
              console.log('⚠️ Muitas tentativas de QR\n');
            }
          }

          if (connection === 'close') {
            this.isConnected = false;
            const reason = lastDisconnect?.error?.output?.statusCode;
            
            console.log('🔌 Conexão fechada');
            console.log('📊 Motivo:', reason);
            console.log('📊 Descrição:', lastDisconnect?.error?.message);

            if (reason === DisconnectReason.loggedOut) {
              console.log('❌ Sessão inválida. Limpando auth...\n');
              fs.rmSync(this.authPath, { recursive: true, force: true });
              fs.mkdirSync(this.authPath, { recursive: true });
              setTimeout(() => this.connect(messageHandler), 5000);
            } else if (reason === DisconnectReason.restartRequired) {
              console.log('🔄 Restart necessário...\n');
              setTimeout(() => this.connect(messageHandler), 3000);
            } else if (reason === DisconnectReason.connectionClosed ||
                       reason === DisconnectReason.connectionLost) {
              console.log('⚠️ Conexão perdida, reconectando...\n');
              setTimeout(() => this.connect(messageHandler), 5000);
            } else if (reason === 440) {
              console.log('⚠️ CONFLITO DETECTADO!');
              console.log('🚨 Outra instância está conectada neste número.');
              console.log('📌 Feche outros bots/apps usando este WhatsApp.\n');
              console.log('⏸️ Aguardando 30s antes de reconectar...\n');
              setTimeout(() => this.connect(messageHandler), 30000);
            } else if (reason === 515) {
              console.log('⚠️ ERRO 515 - Sessão perdida/inválida');
              console.log('🔄 Limpando credenciais e reconectando...\n');
              fs.rmSync(this.authPath, { recursive: true, force: true });
              fs.mkdirSync(this.authPath, { recursive: true });
              setTimeout(() => this.connect(messageHandler), 5000);
            } else {
              console.log('⏸️ Aguardando 10s antes de reconectar...\n');
              setTimeout(() => this.connect(messageHandler), 10000);
            }
          }

          if (connection === 'open') {
            this.isConnected = true;
            this.qrAttempts = 0;

            const me = this.sock.user;
            console.log('✅ Conectado!');
            console.log(`📱 Conta: ${me.name || 'Sem nome'}`);
            console.log(`📞 Número: ${me.id.split(':')[0]}`);

            resolve(this.sock);
          }
        });

        this.sock.ev.on('messages.upsert', async ({ messages, type }) => {
          if (type !== 'notify') return;

          for (const msg of messages) {
            if (!msg.message || msg.key.remoteJid === 'status@broadcast') continue;

            try {
              if (messageHandler) await messageHandler(msg);
            } catch (err) {
              console.error('❌ Erro no handler:', err.message);
            }
          }
        });

      } catch (error) {
        console.error('❌ Erro ao conectar:', error.message);
        reject(error);
      }
    });
  }

  async sendMessage(jid, text) {
    if (!this.sock) throw new Error('Socket não conectado');
    await this.sock.sendMessage(jid, { text });
  }

  async replyMessage(originalMessage, text) {
    if (!this.isConnected) return;

    await this.sock.sendMessage(
      originalMessage.key.remoteJid,
      { text },
      { quoted: originalMessage }
    );
  }

  getMessageText(message) {
    const msg = message.message;
    return (
      msg?.conversation ||
      msg?.extendedTextMessage?.text ||
      msg?.imageMessage?.caption ||
      msg?.videoMessage?.caption ||
      ''
    );
  }
  
  async markAsRead(jid, messageId) {
    if (!this.sock || !this.isConnected) return;
    
    try {
      await this.sock.readMessages([{
        remoteJid: jid,
        id: messageId,
        participant: undefined
      }]);
    } catch (error) {
      console.error('⚠️ Erro ao marcar como lido:', error.message);
    }
  }

  async sendPresence(jid, type) {
    if (!this.sock || !this.isConnected) return;
    
    try {
      await this.sock.sendPresenceUpdate(type, jid);
    } catch (error) {
      console.error('⚠️ Erro ao enviar presença:', error.message);
    }
  }

  getSenderInfo(message) {
    const isGroup = message.key.remoteJid.endsWith('@g.us');
    const sender = isGroup ? message.key.participant : message.key.remoteJid;
    
    return {
      sender: sender,
      chatId: message.key.remoteJid,
      isGroup: isGroup,
      messageId: message.key.id
    };
  }

  async disconnect() {
    if (this.sock) {
      await this.sock.logout();
      this.isConnected = false;
      console.log('👋 WhatsApp desconectado');
    }
  }
}

module.exports = WhatsAppService;
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
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;

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
          browser: ['Finance Bot', 'Safari', '1.0.0'], // Mudei para Safari
          connectTimeoutMs: 60000,
          keepAliveIntervalMs: 30000,
          // 🔥 CONFIGURAÇÕES ANTI-CONFLITO MAIS AGRESSIVAS
          markOnlineOnConnect: false,
          syncFullHistory: false,
          shouldIgnoreJid: jid => jid === 'status@broadcast',
          getMessage: async () => undefined,
          defaultQueryTimeoutMs: undefined,
          emitOwnEvents: false,
          fireInitQueries: false,
          generateHighQualityLinkPreview: false
        });

        this.sock.ev.on('creds.update', saveCreds);

        this.sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
          if (qr) {
            this.qrAttempts++;
            console.log(`\n📱 QR CODE (${this.qrAttempts}/${this.maxQRAttempts})\n`);
            qrcode.generate(qr, { small: false });

            if (this.qrAttempts >= this.maxQRAttempts) {
              this.qrAttempts = 0;
              console.log('⚠️ Muitas tentativas de QR. Aguarde 1 minuto...\n');
              setTimeout(() => this.connect(messageHandler), 60000);
              return;
            }
          }

          if (connection === 'close') {
            this.isConnected = false;
            const reason = lastDisconnect?.error?.output?.statusCode;
            const errorMsg = lastDisconnect?.error?.message || 'Desconhecido';
            
            console.log('🔌 Conexão fechada');
            console.log('📊 Código:', reason);
            console.log('📊 Mensagem:', errorMsg);

            // 🔥 TRATAMENTO ESPECIAL PARA ERRO 440 (CONFLITO)
            if (reason === 440 || errorMsg.includes('conflict')) {
              this.reconnectAttempts++;
              console.log('\n⚠️ ========================================');
              console.log('🚨 CONFLITO DETECTADO! (Erro 440)');
              console.log('⚠️ ========================================');
              console.log('');
              console.log('📌 Possíveis causas:');
              console.log('   1. Outro bot rodando com este número');
              console.log('   2. WhatsApp Web aberto no navegador');
              console.log('   3. Múltiplas instâncias no PM2');
              console.log('');
              console.log('🔧 Para corrigir:');
              console.log('   • pm2 delete all');
              console.log('   • pkill -9 node');
              console.log('   • pm2 start index.js --instances 1');
              console.log('');
              
              if (this.reconnectAttempts >= this.maxReconnectAttempts) {
                console.log('❌ Máximo de tentativas atingido.');
                console.log('🗑️ Limpando sessão para forçar novo login...\n');
                fs.rmSync(this.authPath, { recursive: true, force: true });
                fs.mkdirSync(this.authPath, { recursive: true });
                this.reconnectAttempts = 0;
              }
              
              const waitTime = Math.min(this.reconnectAttempts * 15000, 60000);
              console.log(`⏸️ Aguardando ${waitTime/1000}s antes de reconectar...\n`);
              setTimeout(() => this.connect(messageHandler), waitTime);
              return;
            }

            // OUTROS ERROS
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
            this.reconnectAttempts = 0; // 🔥 RESETAR CONTADOR

            const me = this.sock.user;
            console.log('\n✅ Conectado!');
            console.log(`📱 Conta: ${me.name || 'Sem nome'}`);
            console.log(`📞 Número: ${me.id.split(':')[0]}`);
            console.log('');

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
    if (!this.sock || !this.isConnected) {
      throw new Error('WhatsApp não conectado');
    }
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
const makeWASocket = require('@whiskeysockets/baileys').default;
const { DisconnectReason, useMultiFileAuthState, fetchLatestBaileysVersion, makeCacheableSignalKeyStore } = require('@whiskeysockets/baileys');
const pino = require('pino');
const qrcode = require('qrcode-terminal');
const fs = require('fs');

class WhatsAppService {
  constructor(authPath) {
    this.authPath = authPath || './auth_info';
    this.sock = null;
    this.qrAttempts = 0;
    this.maxQRAttempts = 3;
    this.isConnected = false; // ✅ ADICIONADO
    
    if (!fs.existsSync(this.authPath)) {
      fs.mkdirSync(this.authPath, { recursive: true });
    }
    
    this.logger = pino({ level: 'silent' });
  }

  async connect(messageHandler) {
    // ✅ RETORNAR UMA PROMISE QUE SÓ RESOLVE QUANDO CONECTAR
    return new Promise(async (resolve, reject) => {
      try {
        console.log('📱 Iniciando conexão com WhatsApp...\n');

        const { state, saveCreds } = await useMultiFileAuthState(this.authPath);
        const { version } = await fetchLatestBaileysVersion();
        
        console.log('📦 Versão Baileys: ' + version.join('.') + '\n');

        this.sock = makeWASocket({
          version: version,
          auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, this.logger)
          },
          logger: this.logger,
          printQRInTerminal: false,
          browser: ['Finance Bot', 'Chrome', '1.0.0'],
          defaultQueryTimeoutMs: 60000,
          // ✅ CONFIGURAÇÕES ADICIONAIS PARA ESTABILIDADE
          connectTimeoutMs: 60000,
          keepAliveIntervalMs: 30000
        });

        this.sock.ev.on('creds.update', saveCreds);

        const self = this;
        
        this.sock.ev.on('connection.update', async (update) => {
          const connection = update.connection;
          const lastDisconnect = update.lastDisconnect;
          const qr = update.qr;

          if (qr) {
            self.qrAttempts++;
            console.log('\n📱 QR CODE (Tentativa ' + self.qrAttempts + '/' + self.maxQRAttempts + '):\n');
            console.log('╔═══════════════════════════════════════════════════════════╗\n');
            qrcode.generate(qr, { small: false });
            console.log('\n╚═══════════════════════════════════════════════════════════╝');
            console.log('\n📋 Abra o WhatsApp no celular:');
            console.log('   1. Toque nos três pontos (⋮)');
            console.log('   2. Toque em "Aparelhos conectados"');
            console.log('   3. Toque em "Conectar um aparelho"');
            console.log('   4. Aponte a câmera para o QR Code acima\n');
            console.log('💡 DICA: Afaste o celular da tela se o QR estiver grande!\n');

            if (self.qrAttempts >= self.maxQRAttempts) {
              console.log('⚠️ Máximo de tentativas atingido. Reiniciando...\n');
              self.qrAttempts = 0;
            }
          }

          if (connection === 'close') {
            const reason = lastDisconnect?.error?.output?.statusCode;

            console.log('🔌 Conexão fechada');
            self.isConnected = false; // ✅ MARCAR COMO DESCONECTADO

            if (reason === DisconnectReason.loggedOut) {
              console.log('❌ Sessão inválida. Apagando auth_info e solicitando novo QR...\n');

              try {
                fs.rmSync(self.authPath, { recursive: true, force: true });
                fs.mkdirSync(self.authPath, { recursive: true });
              } catch (e) {
                console.error('Erro ao limpar auth_info:', e.message);
              }

              setTimeout(() => {
                self.connect(messageHandler).then(resolve).catch(reject);
              }, 3000);

            } else {
              console.log('🔄 Conexão caiu. Tentando reconectar...\n');
              setTimeout(() => {
                self.connect(messageHandler).then(resolve).catch(reject);
              }, 5000);
            }
          }

          // ✅ SÓ RESOLVER A PROMISE QUANDO REALMENTE CONECTAR
          if (connection === 'open') {
            console.log('✅ Conectado ao WhatsApp!\n');
            self.qrAttempts = 0;
            self.isConnected = true; // ✅ MARCAR COMO CONECTADO
            
            const me = self.sock.user;
            console.log('═'.repeat(60));
            console.log('📱 Conta: ' + (me.name || 'Sem nome'));
            console.log('📞 Número: ' + me.id.split(':')[0]);
            console.log('═'.repeat(60));
            console.log('\n👂 Bot ativo e aguardando mensagens...\n');
            
            // ✅ RESOLVER A PROMISE AQUI
            resolve(self.sock);
          }
        });

        this.sock.ev.on('messages.upsert', async (m) => {
  try {
    const messages = m.messages;
    const type = m.type;
    
    if (type !== 'notify') return;

    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      
      // Ignorar mensagens sem conteúdo ou status
      if (!msg.message || msg.key.remoteJid === 'status@broadcast') continue;
      
      if (messageHandler) {
        try {
          await messageHandler(msg);
        } catch (handlerError) {
          console.error('❌ Erro no handler de mensagem:', handlerError);
          console.error('Stack:', handlerError.stack);
          
          // ✅ TENTAR RESPONDER COM ERRO SEM DERRUBAR A CONEXÃO
          try {
            await self.sock.sendMessage(msg.key.remoteJid, {
              text: '❌ Erro ao processar mensagem. Tente novamente.'
            });
          } catch (e) {
            // Silencioso
          }
        }
      }
    }
  } catch (outerError) {
    console.error('❌ Erro crítico no processamento de mensagens:', outerError);
    console.error('Stack:', outerError.stack);
  }
});

      } catch (error) {
        console.error('❌ Erro ao conectar:', error.message);
        reject(error);
      }
    });
  }

  async sendMessage(jid, text) {
    if (!this.isConnected) {
      console.log('⚠️ WhatsApp não conectado, aguardando...');
      return;
    }
    
    try {
      await this.sock.sendMessage(jid, { text: text });
    } catch (error) {
      console.error('❌ Erro ao enviar mensagem:', error.message);
    }
  }

  async replyMessage(originalMessage, text) {
    if (!this.isConnected) {
      console.log('⚠️ WhatsApp não conectado, aguardando...');
      return;
    }
    
    try {
      await this.sock.sendMessage(originalMessage.key.remoteJid, {
        text: text
      }, {
        quoted: originalMessage
      });
    } catch (error) {
      console.error('❌ Erro ao responder mensagem:', error.message);
    }
  }

  async markAsRead(jid, messageId) {
    if (!this.isConnected) return;
    
    try {
      await this.sock.readMessages([{ remoteJid: jid, id: messageId }]);
    } catch (error) {
      // Silencioso
    }
  }

  async sendPresence(jid, presence) {
    if (!this.isConnected) return;
    
    try {
      await this.sock.sendPresenceUpdate(presence || 'available', jid);
    } catch (error) {
      // Silencioso
    }
  }

  getMessageText(message) {
    const msg = message.message;
    return (
      msg.conversation ||
      (msg.extendedTextMessage && msg.extendedTextMessage.text) ||
      (msg.imageMessage && msg.imageMessage.caption) ||
      (msg.videoMessage && msg.videoMessage.caption) ||
      ''
    );
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

  isFromMe(message) {
    return message.key.fromMe === true;
  }

  async disconnect() {
    if (this.sock) {
      await this.sock.logout();
      this.isConnected = false;
      console.log('👋 Desconectado do WhatsApp');
    }
  }
}

module.exports = WhatsAppService;
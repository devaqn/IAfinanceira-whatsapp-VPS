# 🤖 Bot Financeiro WhatsApp - Versão Termux

Bot financeiro para WhatsApp rodando 100% no Android via Termux, sem Docker ou VPS.

## 📋 Pré-requisitos

- Android com Termux instalado
- Node.js 18+ instalado no Termux
- Conexão com internet
- WhatsApp instalado

## 🚀 Instalação

### 1. Preparar o Termux

```bash
# Atualizar pacotes
pkg update && pkg upgrade -y

# Instalar Node.js
pkg install nodejs -y

# Instalar dependências de compilação
pkg install python build-essential -y

# Instalar setuptools
pip install setuptools --break-system-packages
```

### 2. Transferir o projeto

**Opção A - Via PC:**
1. Baixe todos os arquivos deste projeto
2. Conecte o celular via USB
3. Copie a pasta `whatsapp-bot-native` para `/storage/emulated/0/Download/`
4. No Termux:
```bash
cd ~
cp -r /storage/emulated/0/Download/whatsapp-bot-native .
cd whatsapp-bot-native
```

**Opção B - Criar manualmente:**
1. Crie a estrutura de pastas no Termux
2. Copie cada arquivo usando nano ou outro editor

### 3. Instalar dependências

```bash
npm install
```

**Aguarde 5-10 minutos** enquanto o better-sqlite3 compila.

### 4. Iniciar o bot

```bash
node index.js
```

## 📱 Conectar ao WhatsApp

1. Quando o QR Code aparecer no terminal
2. Abra WhatsApp no celular
3. Toque nos **3 pontos (⋮)** → **Aparelhos conectados**
4. Toque em **Conectar um aparelho**
5. Escaneie o QR Code

## 🎯 Como usar

### Definir saldo inicial
```
/saldo 1000
```

### Registrar gastos
```
gastei 50 reais no mercado
paguei 15 no uber
comprei sorvete por 3 reais
```

### Consultar saldo
```
/saldo
```

### Gerar relatórios
```
/relatorio diário
/relatorio semanal
/relatorio mensal
```

### Ver ajuda
```
/ajuda
```

## 🏷️ Categorias automáticas

O bot identifica automaticamente a categoria baseado em palavras-chave:

- 🍔 **Alimentação**: comida, almoço, jantar, café, lanche, restaurante, delivery, ifood, pizza
- 🚗 **Transporte**: uber, taxi, ônibus, metrô, gasolina, combustível, passagem
- 🛒 **Mercado**: mercado, supermercado, feira, compras, açougue, padaria
- 🎮 **Lazer**: cinema, teatro, show, festa, jogo, diversão, parque, viagem
- 💳 **Contas**: conta, luz, água, internet, telefone, celular, aluguel, cartão
- 💊 **Saúde**: médico, remédio, farmácia, consulta, exame, hospital, dentista
- 📚 **Educação**: curso, faculdade, escola, livro, material, mensalidade
- 👕 **Vestuário**: roupa, calça, camisa, sapato, tênis, moda, loja
- 📝 **Outros**: tudo que não se encaixa nas categorias acima

## 📂 Estrutura do projeto

```
whatsapp-bot-native/
├── package.json              # Dependências
├── index.js                  # Arquivo principal
├── .env.example              # Exemplo de configuração
├── .gitignore                # Arquivos ignorados
└── src/
    ├── services/
    │   ├── whatsapp.js      # Serviço Baileys
    │   ├── nlp.js           # Processamento de linguagem
    │   └── reports.js       # Geração de relatórios
    ├── handlers/
    │   └── messageHandler.js # Processamento de mensagens
    └── database/
        ├── schema.js         # Estrutura do banco
        └── dao.js            # Acesso aos dados
```

## 🔧 Solução de problemas

### Erro ao instalar better-sqlite3

```bash
pkg install python build-essential -y
pip install setuptools --break-system-packages
rm -rf node_modules package-lock.json
npm install
```

### Bot desconecta sozinho

1. Use `termux-wake-lock` para manter o Termux ativo
2. Desative a otimização de bateria do Termux nas configurações do Android
3. Mantenha o celular conectado ao carregador

### Resetar sessão do WhatsApp

```bash
rm -rf auth_info/
node index.js
```

## ⚡ Dicas de performance

- Mantenha o Termux em primeiro plano
- Use Wakelock: `termux-wake-lock`
- Desative otimização de bateria
- Consumo aproximado: 2-5% de bateria por hora

## 📊 Dados armazenados

- **Banco de dados**: `database/finance.db` (SQLite)
- **Sessão WhatsApp**: `auth_info/` (credenciais criptografadas)

## 🔒 Segurança

- ✅ Dados armazenados localmente no celular
- ✅ Sessão WhatsApp criptografada
- ✅ Sem envio de dados para servidores externos
- ✅ Sem coleta de informações pessoais

## 📝 Licença

MIT

## 🆘 Suporte

Em caso de dúvidas ou problemas:
1. Verifique se todas as dependências foram instaladas
2. Confira se o Node.js está atualizado (`node --version`)
3. Revise os logs de erro no terminal

## ✅ Checklist de instalação

- [ ] Termux atualizado
- [ ] Node.js instalado
- [ ] Python e build-essential instalados
- [ ] setuptools instalado
- [ ] Projeto copiado para o Termux
- [ ] `npm install` executado com sucesso
- [ ] Bot iniciado com `node index.js`
- [ ] QR Code escaneado
- [ ] Bot conectado e funcionando

---

**Desenvolvido para rodar 100% no Android via Termux** 🚀

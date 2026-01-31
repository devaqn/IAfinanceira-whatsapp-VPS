para clonar o repo : git clone https://github.com/devaqn/IAfinanceira-whatsapp-VPS.git
# 💰 Bot Financeiro WhatsApp

<div align="center">

![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)
![Node](https://img.shields.io/badge/node-%3E%3D14.0.0-brightgreen.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)
![WhatsApp](https://img.shields.io/badge/WhatsApp-API-25D366?logo=whatsapp)

**Seu assistente financeiro pessoal direto no WhatsApp! 📊💳**

[Características](#-características) •
[Instalação](#-instalação) •
[Comandos](#-comandos) •
[Estrutura](#-estrutura-do-projeto) •
[Contribuindo](#-contribuindo)

</div>

---

## 📖 Sobre o Projeto

Bot inteligente de controle financeiro pessoal que funciona 100% pelo WhatsApp. Gerencie seu dinheiro, cartões de crédito, parcelas e investimentos com comandos simples e naturais!

### 🎯 Por que usar?

- ✅ **Simples**: Comandos em português natural - "gastei 50 no mercado"
- ✅ **Completo**: Saldo, cartões múltiplos, parcelamentos, poupança e emergência
- ✅ **Inteligente**: Categorização automática de gastos com NLP
- ✅ **Privado**: Seus dados ficam no seu servidor
- ✅ **Rápido**: Registre gastos em segundos pelo celular

---

## ✨ Características

### 💵 Controle de Saldo
- Saldo principal, poupança e reserva de emergência
- Adicionar/remover dinheiro facilmente
- Alertas de saldo baixo automáticos

### 💳 Múltiplos Cartões de Crédito
- Cadastre quantos cartões quiser (Nubank, Inter, C6, etc)
- Controle de limite, fatura e disponível
- Pagamento de fatura direto pelo bot
- Alertas quando usar 70% do limite
- Dias de vencimento personalizados

### 📦 Parcelamentos Inteligentes
- Registre compras parceladas automaticamente
- Veja todas as parcelas pendentes
- Pague parcelas individuais
- Lembretes de vencimento

### 📊 Relatórios Detalhados
- Relatórios semanais e mensais
- Gastos por categoria com emojis
- Gráficos de progresso
- Exportação de dados

### 🤖 Processamento Natural de Linguagem
Escreva naturalmente:
- "gastei 50 no mercado"
- "comprei 200 em 4x na farmácia"
- "guardei 100 na poupança"

---

## 🚀 Instalação

### Pré-requisitos

- Node.js v14 ou superior
- npm ou yarn
- Conta WhatsApp (número dedicado recomendado)

### Passo a passo

1. **Clone o repositório**
```bash
git clone https://github.com/seu-usuario/bot-financeiro-whatsapp.git
cd bot-financeiro-whatsapp
```

2. **Instale as dependências**
```bash
npm install
```

3. **Configure o ambiente**

Crie um arquivo `.env` baseado no `.env.example`:

```env
# Número do administrador (com DDI)
ADMIN_NUMBER=5581999999999

# Caminho do banco de dados
DB_PATH=./database/finance.db

# Ambiente
NODE_ENV=production
```

4. **Inicie o bot**
```bash
npm start
```

5. **Escaneie o QR Code**

Um QR Code aparecerá no terminal. Escaneie com o WhatsApp (WhatsApp Web).

6. **Pronto!** 🎉

Envie `/start` para o bot e comece a usar!

---

## 📱 Comandos

### 🏦 Saldo e Controle

| Comando | Descrição | Exemplo |
|---------|-----------|---------|
| `/saldo` | Ver saldo atual | `/saldo` |
| `/saldo [valor]` | Definir saldo inicial | `/saldo 5000` |
| `/adicionar [valor]` | Adicionar dinheiro | `/adicionar 1000` |

### 💳 Cartões de Crédito

| Comando | Descrição | Exemplo |
|---------|-----------|---------|
| `/cartao criar` | Criar novo cartão | `/cartao criar` |
| `/cartoes` | Listar todos os cartões | `/cartoes` |
| `/cartao [nome]` | Ver detalhes do cartão | `/cartao nubank` |
| `/pagar fatura [nome]` | Pagar fatura | `/pagar fatura nubank` |
| `/deletar cartao [nome]` | Remover cartão | `/deletar cartao inter` |
| `/zerar cartao [nome]` | Zerar saldo do cartão | `/zerar cartao c6` |
| `/vencimentos` | Ver vencimentos | `/vencimentos` |

### 🐷 Poupança

| Comando | Descrição | Exemplo |
|---------|-----------|---------|
| `/poupanca` | Ver saldo guardado | `/poupanca` |
| `/guardar [valor]` | Guardar dinheiro | `/guardar 500` |
| `/retirar [valor]` | Retirar da poupança | `/retirar 200` |

### 🚨 Reserva de Emergência

| Comando | Descrição | Exemplo |
|---------|-----------|---------|
| `/emergencia` | Ver reserva | `/emergencia` |
| `/reservar [valor]` | Adicionar à reserva | `/reservar 1000` |
| `/usar [valor]` | Usar da reserva | `/usar 300` |

### 📦 Parcelamentos

| Comando | Descrição | Exemplo |
|---------|-----------|---------|
| `/parcelamentos` | Ver todas as parcelas | `/parcelamentos` |
| `/pagar [produto]` | Pagar parcela | `/pagar notebook` |

### 📊 Relatórios

| Comando | Descrição | Exemplo |
|---------|-----------|---------|
| `/semana` ou `/semanal` | Relatório semanal | `/semana` |
| `/mes` ou `/mensal` | Relatório mensal | `/mes` |

### 🗑️ Limpeza

| Comando | Descrição | Exemplo |
|---------|-----------|---------|
| `/zerar saldo` | Zerar saldo principal | `/zerar saldo` |
| `/zerar poupanca` | Zerar poupança | `/zerar poupanca` |
| `/zerar parcelas` | Remover parcelamentos | `/zerar parcelas` |
| `/zerar tudo` | Resetar sistema completo | `/zerar tudo` |

### ℹ️ Ajuda

| Comando | Descrição |
|---------|-----------|
| `/ajuda` ou `/help` | Ver comandos |
| `/start` | Iniciar bot |

---

## 💬 Uso Natural (sem comandos)

O bot entende linguagem natural! Você pode apenas conversar:

### ✅ Registrar Gastos
```
"gastei 50 no mercado"
"paguei 120 na farmácia"
"saiu 30 no uber"
```

### ✅ Compras Parceladas
```
"comprei 1200 em 6x notebook"
"paguei 500 parcelado em 10x"
```

O bot vai perguntar:
1. Foi no cartão? (digite o nome) ou no saldo? (digite "saldo")
2. Confirmar categoria automaticamente detectada

---

## 🏗️ Estrutura do Projeto

```
bot-financeiro-whatsapp/
│
├── 📁 src/
│   ├── 📁 config/
│   │   └── constants.js          # Constantes do sistema
│   │
│   ├── 📁 database/
│   │   ├── dao.js                # Data Access Object
│   │   └── schema.js             # Schema do banco SQLite
│   │
│   ├── 📁 handlers/
│   │   └── messageHandler.js     # Processador de mensagens
│   │
│   ├── 📁 services/
│   │   ├── nlp.js                # Processamento de linguagem natural
│   │   ├── reports.js            # Gerador de relatórios
│   │   └── whatsapp.js           # Serviço do WhatsApp
│   │
│   └── 📁 utils/
│       ├── ErrorMessages.js      # Mensagens de erro
│       ├── logger.js             # Sistema de logs
│       └── memoryManager.js      # Gerenciador de memória
│
├── 📁 database/
│   └── finance.db                # Banco de dados SQLite
│
├── 📄 index.js                   # Arquivo principal
├── 📄 package.json               # Dependências
├── 📄 .gitignore                 # Arquivos ignorados
├── 📄 .env.example               # Exemplo de configuração
└── 📄 README.md                  # Este arquivo
```

---

## 🛠️ Tecnologias

- **[Node.js](https://nodejs.org/)** - Runtime JavaScript
- **[Baileys](https://github.com/WhiskeySockets/Baileys)** - WhatsApp Web API
- **[SQLite](https://www.sqlite.org/)** - Banco de dados local
- **[sql.js](https://github.com/sql-js/sql.js/)** - SQLite em JavaScript

---

## 📊 Categorias Automáticas

O bot categoriza seus gastos automaticamente com IA:

| Categoria | Emoji | Palavras-chave |
|-----------|-------|----------------|
| Alimentação | 🍔 | mercado, restaurante, ifood, pizza |
| Transporte | 🚗 | uber, gasolina, ônibus, taxi |
| Mercado | 🛒 | supermercado, feira, açougue |
| Lazer | 🎮 | cinema, netflix, show, jogo |
| Contas | 💳 | luz, água, internet, aluguel |
| Saúde | 💊 | farmácia, médico, consulta |
| Educação | 📚 | curso, faculdade, livro |
| Vestuário | 👕 | roupa, sapato, shopping |
| Outros | 📦 | demais gastos |

---

## 🔐 Segurança

### Dados Privados
- ✅ Todos os dados ficam localmente no seu servidor
- ✅ Nenhuma informação é enviada para terceiros
- ✅ Criptografia de ponta a ponta do WhatsApp

### Boas Práticas
- 🔒 Use um número dedicado para o bot
- 🔒 Mantenha o `.env` sempre no `.gitignore`
- 🔒 Faça backups regulares do `finance.db`
- 🔒 Use VPS segura em produção

---

## 🤝 Contribuindo

Contribuições são bem-vindas! Para contribuir:

1. **Fork** o projeto
2. **Crie** uma branch para sua feature (`git checkout -b feature/MinhaFeature`)
3. **Commit** suas mudanças (`git commit -m 'Add: nova feature incrível'`)
4. **Push** para a branch (`git push origin feature/MinhaFeature`)
5. Abra um **Pull Request**

### 🐛 Reportando Bugs

Encontrou um bug? Abra uma [issue](https://github.com/seu-usuario/bot-financeiro-whatsapp/issues) com:
- Descrição do problema
- Passos para reproduzir
- Comportamento esperado vs atual
- Screenshots (se aplicável)

---

## 📝 Roadmap

### ✅ Implementado
- [x] Controle de saldo múltiplo (principal, poupança, emergência)
- [x] Múltiplos cartões de crédito
- [x] Parcelamentos inteligentes
- [x] NLP para registro natural de gastos
- [x] Categorização automática
- [x] Relatórios detalhados
- [x] Alertas automáticos

### 🚧 Em Desenvolvimento
- [ ] Gráficos visuais nos relatórios
- [ ] Metas de economia
- [ ] Previsão de gastos com IA
- [ ] Integração com bancos (Open Banking)

### 💡 Planejado
- [ ] Exportação para Excel/PDF
- [ ] Dashboard web
- [ ] App mobile nativo
- [ ] Múltiplos usuários
- [ ] Sincronização em nuvem

---

## 📜 Licença

Este projeto está sob a licença MIT. Veja o arquivo [LICENSE](LICENSE) para mais detalhes.

---

## 👨‍💻 Autor

Desenvolvido com ❤️ por **[devaqn]**

- GitHub: (https://github.com/devaqn)
- Email: pedromiguelaqn@gmail.com

---

## 📸 Screenshots

### Registrando Gasto
```
Você: gastei 50 no mercado

Bot: 
🛒 *GASTO REGISTRADO*

💰 Valor: R$ 50,00
📝 Descrição: mercado
📁 Categoria: Mercado 🛒
💳 Forma: Saldo
🕐 Data/Hora: 31/01/2026 14:30

💰 *SALDO ATUALIZADO*
   Anterior: R$ 1.000,00
   Atual: R$ 950,00
   Diferença: -R$ 50,00
```

### Listando Cartões
```
Você: /cartoes

Bot:
💳 *SEUS CARTÕES*

📇 *Nubank*
   Limite: R$ 5.000,00
   Usado: R$ 1.234,56 (24.7%)
   Disponível: R$ 3.765,44
   Fatura: R$ 1.234,56
   Vencimento: Dia 15

📇 *Inter*
   Limite: R$ 3.000,00
   Usado: R$ 500,00 (16.7%)
   Disponível: R$ 2.500,00
   Fatura: R$ 500,00
   Vencimento: Dia 10
```

---

<div align="center">

**⭐ Se este projeto te ajudou, deixe uma estrela! ⭐**

**Feito com ❤️ e muito ☕**

</div>

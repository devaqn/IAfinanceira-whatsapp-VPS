# Bot Financeiro WhatsApp (Produção)

Bot de controle financeiro pessoal via WhatsApp, com saldo, poupança, reserva de emergência, cartões de crédito (múltiplos), parcelamentos e relatórios.

## Status de Produção

Verificado em: **08/03/2026**

Validação executada localmente com fluxo completo simulado (mensagens reais do handler):
- cadastro de usuário
- saldo/poupança/emergência
- criação e uso de múltiplos cartões
- gastos à vista e parcelados
- pagamento de parcelas
- pagamento de fatura (incluindo bloqueio de sobrepagamento)
- relatórios semanal/mensal
- gráficos visuais por categoria (`/grafico semana` e `/grafico mes`)
- metas de economia com progresso (`/meta`)
- exportação de relatório em Excel/PDF (`/exportar`)
- dashboard web read-only (API + gráficos)
- previsão de gastos com IA local (`/previsao`)
- sincronização em nuvem opcional com PostgreSQL
- reset global completo (incluindo cartões e transações de cartão)
- comandos inválidos com `/` retornando erro explícito
- comandos administrativos

## Funcionalidades Implementadas e Funcionando

### 1. Saldo Principal
- ✅ `/saldo`
- ✅ `/saldo [valor]`
- ✅ `/adicionar [valor]`
- ✅ `/zerar saldo` (com confirmação por repetição)

### 2. Poupança
- ✅ `/poupanca`
- ✅ `/guardar [valor]`
- ✅ `/retirar [valor]`
- ✅ `/zerar poupanca` (com confirmação por repetição)

### 3. Reserva de Emergência
- ✅ `/emergencia`
- ✅ `/reservar [valor]`
- ✅ `/usar [valor]`
- ✅ `/zerar reserva` (com confirmação por repetição)

### 4. Cartões de Crédito (Múltiplos)
- ✅ `/cartao criar` (fluxo guiado: nome, limite, vencimento)
- ✅ `/cartoes`
- ✅ `/cartao [nome]`
- ✅ `/cartao` (quando houver apenas 1 cartão)
- ✅ `/cartao limite [valor]` (aplicável quando houver 1 cartão)
- ✅ `/pagar fatura [nome]`
- ✅ `/deletar cartao [nome]`
- ✅ `/zerar cartao [nome]`
- ✅ `/vencimentos`

### 5. Gastos em Linguagem Natural
- ✅ Ex.: `gastei 50 no mercado`
- ✅ Ex.: `paguei 120 no uber`
- ✅ Ex.: `gastei 1.200,50 no mercado`

Fluxo com cartão:
- ✅ pergunta forma de pagamento (`nome do cartão` ou `saldo`)
- ✅ se cartão for escolhido em compra simples, pergunta se deseja parcelar

### 6. Parcelamentos
- ✅ Ex.: `comprei 1200 em 6x notebook`
- ✅ `/parcelamentos`
- ✅ `/pagar [produto]`
- ✅ `/zerar parcelas` (com confirmação por repetição)

### 7. Reset Global
- ✅ `/zerar tudo` (com confirmação por repetição do mesmo comando)
- ✅ Remove saldo, poupança, reserva, parcelamentos, histórico e dados de cartão

### 8. Lembretes e Vencimentos
- ✅ `/lembretes`
- ✅ `/vencidas`
- ✅ lembretes automáticos (bot precisa estar online)

### 9. Relatórios
- ✅ `/semana` ou `/relatorio semanal`
- ✅ `/mes` ou `/relatorio mensal`
- ✅ `/grafico semana`
- ✅ `/grafico mes`

### 10. Metas de Economia
- ✅ `/meta` (listar metas)
- ✅ `/meta criar [valor] [nome]`
- ✅ `/meta remover [id]`
- ✅ `/meta concluir [id]`

### 11. Exportação
- ✅ `/exportar excel`
- ✅ `/exportar pdf`
- ✅ `/exportar ambos`

### 12. Dashboard, IA e Nuvem
- ✅ `/dashboard` (painel read-only)
- ✅ `/previsao` (projeção de gastos com IA local)
- ✅ `/sync status` (admin)
- ✅ `/sync agora` (admin)

### 13. Comandos Gerais
- ✅ `/ajuda`
- ✅ `/start`

### 14. Comandos Administrativos
- ✅ `!stats`
- ✅ `!broadcast [mensagem]`
- ✅ `!limpar`
- ✅ `!limpartudo`
- ✅ `!status`
- ✅ `!ajuda`

## Ajustes Críticos Aplicados para Produção

- ✅ Correção do `!stats` para estrutura atual de banco.
- ✅ Bloqueio de pagamento de fatura acima do valor devido.
- ✅ Correção de parsing monetário para formatos com milhar/decimal (`1.200,50`, `1,200.50`, `5.000`).
- ✅ Correção de data da primeira parcela na confirmação de parcelamento no cartão.
- ✅ Correção de débito único ao pagar parcela (sem descontar duas vezes).
- ✅ Correção do `/zerar tudo` para também limpar `user_cards` e `card_transactions`.
- ✅ Fallback para comando com `/` não reconhecido responder `Comando não reconhecido`.
- ✅ Implementação de metas de economia com progresso automático.
- ✅ Implementação de exportação real para Excel e PDF.
- ✅ Implementação de dashboard web read-only com API de dados.
- ✅ Implementação de sincronização opcional com PostgreSQL (`POSTGRES_ENABLED`).
- ✅ Implementação de previsão de gastos com modelo estatístico local.

## Formatos de Valor Aceitos

- `100`
- `100,50`
- `100.50`
- `1.200,50`
- `1,200.50`
- `R$ 1.200,50`

## Instalação

### 1. Clonar projeto
```bash
git clone https://github.com/devaqn/IAfinanceira-whatsapp-VPS.git
cd IAfinanceira-whatsapp-VPS
```

### 2. Instalar dependências
```bash
npm install
```

### 3. Configurar `.env`
Crie com base no `.env.example`:

```env
ADMIN_NUMBER=5581999999999
DB_PATH=./database/finance.db
NODE_ENV=production

# Dashboard
DASHBOARD_ENABLED=true
DASHBOARD_PORT=3030
DASHBOARD_BASE_URL=http://localhost:3030
DASHBOARD_TOKEN=troque-este-token

# PostgreSQL cloud sync (opcional)
POSTGRES_ENABLED=false
DATABASE_URL=postgres://user:password@localhost:5432/finance_bot
POSTGRES_SSL=false
```

### 4. Iniciar
```bash
npm start
```

### 5. Conectar WhatsApp
Escaneie o QR Code exibido no terminal.

## Operação em Produção

Checklist recomendado:
- usar processo gerenciado (`pm2` ou `systemd`)
- habilitar restart automático
- manter backup periódico de `database/finance.db`
- monitorar logs e espaço em disco
- usar número dedicado para o bot

## Estrutura do Projeto

```text
src/
  config/
  database/
  handlers/
  services/
  utils/
index.js
```

## Licença

MIT

# IAFinanceira WhatsApp VPS - Guia de uso e validacao (Atualizado em 08/03/2026)

Este documento junta:

- o que foi corrigido de bugs;
- como configurar corretamente;
- como usar no dia a dia;
- como rodar varredura tecnica para evitar regressao.

---

## 1) Correcao de bugs aplicada

### Bug 1: valor com ponto decimal era interpretado errado

Antes:
- `1000.50` podia virar `100050` em fluxos de cartao/fatura.

Agora:
- o parser aceita corretamente:
  - `1000.50`
  - `1.000,50`
  - `R$ 1000,50`
  - `1000`

Impacto:
- cadastro de limite de cartao;
- pagamento de fatura;
- qualquer entrada numerica nesses fluxos.

### Bug 2: admin fixo no codigo (ignorava `.env`)

Antes:
- o admin dependia de numero hardcoded.

Agora:
- `ADMIN_NUMBER` vem do `.env`;
- aceita com ou sem sufixo (`@s.whatsapp.net`).

Exemplo valido no `.env`:
- `ADMIN_NUMBER=5581999999999`

### Bug 3: timeout antigo encerrava fluxo novo (race condition)

Antes:
- em fluxos multi-etapa (principalmente compra/cartao), timeout antigo podia apagar o estado atual.

Agora:
- timeout so encerra o estado que ele mesmo abriu (controle por timestamp).

Impacto:
- fluxo de compra/cartao e criacao de cartao fica estavel mesmo com interacoes em sequencia.

---

## 2) Requisitos da VPS

- Node.js 20+
- npm 10+
- PM2 (recomendado)
- PostgreSQL (opcional, somente se usar sync)

---

## 3) Configuracao do `.env`

Use o `.env.example` como base.

Exemplo recomendado:

```env
ADMIN_NUMBER=5581999999999
DB_PATH=./database/finance.db
NODE_ENV=production

# Sync PostgreSQL (opcional)
POSTGRES_ENABLED=false
DATABASE_URL=postgres://user:password@host:5432/finance_bot
POSTGRES_SSL=false
```

Observacoes:
- Ajuste `DATABASE_URL` e `POSTGRES_ENABLED` somente se for usar sincronizacao em nuvem.

---

## 4) Deploy/atualizacao

```bash
cd /caminho/do/projeto/IAfinanceira-whatsapp-VPS
git pull
npm install
```

Subir com PM2:

```bash
pm2 start index.js --name iafinanceira
pm2 save
pm2 startup
```

Logs:

```bash
pm2 logs iafinanceira --lines 200
```

---

## 5) Como usar (usuario normal)

### Primeiros comandos

1. `/start`
2. `/saldo 5000`
3. `/adicionar 300`
4. `/guardar 200`
5. `/reservar 100`

### Gastos

- `gastei 120 mercado`
- `paguei 89.90 uber`
- `comprei 250 restaurante`

### Cartoes

1. `/cartao criar`
2. Envie nome (ex: `Nubank`)
3. Envie limite (ex: `1000.50` ou `1.000,50`)
4. Envie vencimento (1 a 31)

Outros comandos:
- `/cartoes`
- `/cartao nubank`
- `/pagar fatura nubank`

### Parcelamentos

- `comprei celular 1200 em 4x`
- `/parcelamentos`
- `/pagar celular`

### Metas e relatorios

- `/meta criar 2000 viagem`
- `/meta`
- `/grafico semana`
- `/grafico mes`
- `/relatorio semanal`
- `/relatorio mensal`

### Exportacoes

- `/exportar pdf`
- Excel removido (somente PDF)

---

## 6) Como usar (admin)

Com `ADMIN_NUMBER` correto no `.env`:

- `!stats`
- `!status`
- `!limpar`
- `!limpartudo`
- `!broadcast mensagem`
- `/sync status`
- `/sync agora`

---

## 7) Varredura tecnica recomendada

### Suite principal

```bash
node scripts/production-stress-test.js
```

Esperado:
- `pass: true`
- `failedChecks: 0`

### Suite de borda (bugs conhecidos)

```bash
node scripts/edge-bug-sweep.js
```

Ou via npm:

```bash
npm run test:stress
npm run test:edge
```

### Checklist manual rapido (5 minutos)

1. Criar cartao com decimal:
   - limite `1000.50`
2. Fazer compra no cartao.
3. Pagar fatura com decimal:
   - valor `100.50`
4. Validar admin com numero do `.env`:
   - executar `!stats`

Se tudo acima responder corretamente, ambiente esta consistente.

---

## 8) Checklist de producao

- Bot responde `/ajuda`
- Bot responde comando invalido com mensagem de erro amigavel
- Exportacao em PDF envia arquivo
- PM2 online e com restart automatico

---

## 9) Problemas comuns

- Sync nao configurado:
  - revisar `POSTGRES_ENABLED` e `DATABASE_URL`.
- Exportacao falhando:
  - conferir permissao de escrita em `exports/`.
- Comandos admin nao funcionando:
  - validar `ADMIN_NUMBER` no `.env` e reiniciar o processo.

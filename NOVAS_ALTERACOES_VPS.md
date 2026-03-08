# Novas Alteracoes e Fluxo Funcional (VPS)

Este guia documenta as alteracoes novas implementadas no bot e mostra exatamente como colocar para rodar em VPS com validacao pratica.

## 1. O que foi adicionado

- Metas de economia com progresso automatico
  - `/meta`
  - `/meta criar [valor] [nome]`
  - `/meta remover [id]`
  - `/meta concluir [id]`

- Exportacao de relatorios
  - `/exportar excel`
  - `/exportar pdf`
  - `/exportar ambos`

- Graficos visuais em texto
  - `/grafico semana`
  - `/grafico mes`

- Dashboard web read-only (API + interface web com charts)
  - `/dashboard`

- Previsao de gastos com IA local (estatistica)
  - `/previsao`

- Sincronizacao opcional em nuvem com PostgreSQL
  - `/sync status` (admin)
  - `/sync agora` (admin)

## 2. Requisitos da VPS

- Node.js 20+
- npm 10+
- PM2 (recomendado para producao)
- Porta do dashboard liberada (se for usar dashboard)
- PostgreSQL (opcional, apenas se for usar sync em nuvem)

## 3. Deploy/atualizacao na VPS

No diretorio do projeto:

```bash
cd /caminho/do/projeto/IAfinanceira-whatsapp-VPS
git pull
npm install
```

## 4. Configuracao do .env

Use como base o `.env.example` e ajuste os valores reais.

Exemplo recomendado:

```env
ADMIN_NUMBER=5581999999999
DB_PATH=./database/finance.db
NODE_ENV=production

# Dashboard web read-only
DASHBOARD_ENABLED=true
DASHBOARD_PORT=3030
DASHBOARD_BASE_URL=http://SEU_IP_PUBLICO:3030
DASHBOARD_TOKEN=troque-este-token-forte

# Sync em nuvem com PostgreSQL (opcional)
POSTGRES_ENABLED=false
DATABASE_URL=postgres://user:password@host:5432/finance_bot
POSTGRES_SSL=false
```

### Observacoes importantes

- Se `DASHBOARD_ENABLED=true`, abra a porta no firewall.
- Se usar token no dashboard, acesse com `?token=SEU_TOKEN`.
- Se `POSTGRES_ENABLED=true`, o bot cria as tabelas de sync automaticamente no banco remoto.

## 5. Subir em producao com PM2

```bash
pm2 start index.js --name iafinanceira
pm2 save
pm2 startup
```

Ver logs:

```bash
pm2 logs iafinanceira --lines 200
```

## 6. Fluxo funcional validado (usuario normal)

Abaixo esta um fluxo pronto, ja testado localmente no handler, para validar ponta a ponta.

1. `/start`
2. `/saldo 5000`
3. `/adicionar 300`
4. `/guardar 500`
5. `/reservar 200`
6. `gastei 90 mercado`
7. `/meta criar 1500 notebook`
8. `/meta`
9. `/grafico semana`
10. `/grafico mes`
11. `/previsao`
12. `/exportar excel`
13. `/exportar pdf`
14. `/dashboard`
15. `/comandoinexistente`

Resultado esperado:

- Todos os comandos respondem.
- Meta aparece com progresso.
- Grafico retorna barras por categoria.
- Exportacoes enviam arquivos.
- Dashboard retorna URL.
- Comando invalido retorna "Comando nao reconhecido".

## 7. Fluxo funcional validado (cartao + reset total)

1. `/saldo 3000`
2. `/cartao criar`
3. `Nubank QA`
4. `3000`
5. `10`
6. `gastei 150 uber`
7. `nubank`
8. `nao`
9. `/cartoes`
10. `/zerar tudo`
11. `/zerar tudo`
12. `/cartoes`

Resultado esperado:

- Cartao criado e compra registrada.
- Depois do reset total, lista de cartoes deve ficar vazia.

## 8. Fluxo admin para sync PostgreSQL (opcional)

Requer numero admin (`ADMIN_NUMBER`) e sync habilitado.

1. `/sync status`
2. `/sync agora`
3. `/sync status`

Resultado esperado:

- Exibe status de sync e horario do ultimo sync.

## 9. Checklist rapido de producao

- Bot responde `/ajuda`
- Bot responde `/comandoinexistente`
- `/exportar excel` envia arquivo
- `/dashboard` retorna link valido
- `curl http://127.0.0.1:3030/health` retorna `{"ok":true,...}` quando dashboard habilitado
- PM2 com processo online e restart automatico

## 10. Problemas comuns

- "Dashboard desabilitado": ativar `DASHBOARD_ENABLED=true` e reiniciar bot.
- "Sync nao configurado": ativar `POSTGRES_ENABLED=true` e configurar `DATABASE_URL`.
- "Previsao com historico insuficiente": registrar gastos por mais dias para melhorar estimativa.
- Arquivo nao enviado na exportacao: verificar permissao de escrita na pasta `exports/`.

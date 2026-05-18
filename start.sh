#!/bin/bash

# ─────────────────────────────────────────
#  Bot Financeiro WhatsApp — Start Script
# ─────────────────────────────────────────

BOT_NAME="bot-financeiro"
BOT_FILE="index.js"
DIR="$(cd "$(dirname "$0")" && pwd)"

cd "$DIR"

echo ""
echo "══════════════════════════════════════"
echo "   BOT FINANCEIRO — INICIANDO PM2"
echo "══════════════════════════════════════"
echo ""

# Verifica se já está rodando
if pm2 describe "$BOT_NAME" &>/dev/null; then
  STATUS=$(pm2 describe "$BOT_NAME" | grep -i "status" | awk '{print $4}' | head -1)
  echo "⚠️  Bot já registrado no PM2 (status: $STATUS)"
  echo ""
  echo "Escolha uma opção:"
  echo "  [1] Reiniciar o bot"
  echo "  [2] Apenas abrir os logs"
  echo "  [3] Sair"
  echo ""
  read -rp "Opção: " OPCAO

  case "$OPCAO" in
    1)
      echo ""
      echo "🔄 Reiniciando..."
      pm2 restart "$BOT_NAME"
      ;;
    2)
      echo ""
      echo "📋 Abrindo logs..."
      ;;
    3)
      echo "Saindo."
      exit 0
      ;;
    *)
      echo "Opção inválida. Saindo."
      exit 1
      ;;
  esac
else
  echo "🚀 Registrando bot no PM2..."
  pm2 start "$BOT_FILE" \
    --name "$BOT_NAME" \
    --restart-delay 3000 \
    --max-restarts 10 \
    --log-date-format "YYYY-MM-DD HH:mm:ss"

  echo ""
  echo "✅ Bot registrado com sucesso!"
fi

echo ""
echo "══════════════════════════════════════"
echo "   LOGS AO VIVO — Leia o QR Code"
echo "   Pressione Ctrl+C para sair"
echo "══════════════════════════════════════"
echo ""

# Abre os logs — usuário lê o QR Code e sai com Ctrl+C
pm2 logs "$BOT_NAME" --lines 50

# Após sair dos logs, salva o estado do PM2
echo ""
echo "💾 Salvando configuração do PM2..."
pm2 save

echo ""
echo "══════════════════════════════════════"
echo "✅ Pronto! Bot rodando em background."
echo ""
echo "Comandos úteis:"
echo "  pm2 status               → ver se está online"
echo "  pm2 logs $BOT_NAME       → ver logs ao vivo"
echo "  pm2 restart $BOT_NAME    → reiniciar"
echo "  pm2 stop $BOT_NAME       → parar"
echo "══════════════════════════════════════"
echo ""

# Lembra o usuário de rodar o startup (só precisa fazer uma vez)
if ! systemctl is-enabled pm2-"$USER" &>/dev/null 2>&1; then
  echo "⚠️  ATENÇÃO: Para o bot iniciar automaticamente com o servidor,"
  echo "   rode este comando UMA VEZ (como root ou com sudo):"
  echo ""
  echo "   pm2 startup"
  echo "   (copie e cole o comando que ele gerar)"
  echo ""
fi

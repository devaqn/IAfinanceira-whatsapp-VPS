#!/bin/bash

echo "╔═══════════════════════════════════════════════════════════╗"
echo "║        🔥 FORÇAR NOVA SESSÃO DO WHATSAPP 🔥               ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo ""

# 1. Parar tudo
echo "🛑 Parando todas as instâncias..."
pm2 delete all 2>/dev/null
pm2 kill 2>/dev/null
pkill -9 node 2>/dev/null
sleep 3

# 2. Remover sessão antiga
echo "🗑️ Removendo sessão antiga COMPLETAMENTE..."
rm -rf auth_info
rm -rf auth_info_multi
rm -rf .wwebjs_auth
rm -rf .wwebjs_cache
rm -rf baileys_store*

# 3. Limpar node_modules do baileys (cache pode estar corrompido)
echo "🧹 Limpando cache do Baileys..."
rm -rf node_modules/@whiskeysockets/baileys/.cache 2>/dev/null
rm -rf node_modules/.cache 2>/dev/null

# 4. Criar pasta limpa
echo "📁 Criando estrutura limpa..."
mkdir -p auth_info
chmod 755 auth_info

echo ""
echo "╔═══════════════════════════════════════════════════════════╗"
echo "║  📱 AGORA FAÇA NO CELULAR (IMPORTANTE!):                  ║"
echo "║                                                           ║"
echo "║  1. WhatsApp > ⋮ > Aparelhos conectados                   ║"
echo "║  2. Se houver "Finance Bot", "Chrome" ou similar          ║"
echo "║     → Desconectar esse dispositivo                        ║"
echo "║  3. Volte aqui e pressione ENTER para continuar           ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo ""
read -p "Pressione ENTER após desconectar no celular... "

echo ""
echo "⏳ Aguardando WhatsApp liberar a sessão antiga..."
echo "   (Isso pode levar até 2 minutos)"

for i in {120..1}; do
    printf "\r   ⏱️  %3d segundos restantes... " $i
    sleep 1
done

echo ""
echo ""
echo "🚀 Iniciando bot com nova sessão..."

pm2 start index.js \
    --name "IAfinancias" \
    --instances 1 \
    --max-memory-restart 500M \
    --time

sleep 3

echo ""
echo "╔═══════════════════════════════════════════════════════════╗"
echo "║                     ✅ PRONTO!                            ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo ""
echo "📋 Acompanhe os logs:"
echo ""

<<<<<<< HEAD
pm2 logs IAfinancias --lines 50
=======
pm2 logs IAfinancias --lines 500
>>>>>>> 9f34b68 ( commitando alteraçoes dentro da vps)

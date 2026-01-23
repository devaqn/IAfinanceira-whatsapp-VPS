#!/bin/bash

echo "🔧 CORRIGINDO CONFLITO DO WHATSAPP"
echo "=================================="
echo ""

# 1. PARAR TODAS AS INSTÂNCIAS DO PM2
echo "1️⃣ Parando todas as instâncias do PM2..."
pm2 delete all 2>/dev/null
pm2 kill

# 2. MATAR PROCESSOS NODE RESIDUAIS
echo ""
echo "2️⃣ Matando processos Node.js residuais..."
pkill -9 node

# 3. LIMPAR SESSÃO DO WHATSAPP
echo ""
echo "3️⃣ Você quer limpar a sessão do WhatsApp? (s/n)"
read -r resposta

if [[ "$resposta" == "s" || "$resposta" == "S" ]]; then
    echo "🗑️ Limpando sessão..."
    rm -rf auth_info/
    echo "✅ Sessão removida! Você precisará ler o QR Code novamente."
else
    echo "⏭️ Mantendo sessão atual..."
fi

# 4. VERIFICAR SE HÁ PROCESSOS NA PORTA (caso use)
echo ""
echo "4️⃣ Verificando portas em uso..."
netstat -tlnp 2>/dev/null | grep -E ':(3000|8080|5000)' && {
    echo "⚠️ Porta em uso encontrada. Liberando..."
    fuser -k 3000/tcp 2>/dev/null
    fuser -k 8080/tcp 2>/dev/null
    fuser -k 5000/tcp 2>/dev/null
} || echo "✅ Nenhuma porta em uso"

# 5. INICIAR NOVAMENTE
echo ""
echo "5️⃣ Iniciando bot novamente..."
pm2 start index.js --name "IAfinanc" --instances 1 --max-memory-restart 500M

echo ""
echo "✅ PRONTO!"
echo ""
echo "📊 Status:"
pm2 status

echo ""
echo "📋 Logs em tempo real:"
echo "   pm2 logs IAfinanc"
echo ""
echo "⚠️ SE O ERRO PERSISTIR:"
echo "   1. Feche o WhatsApp Web no navegador"
echo "   2. Execute: ./fix-conflict.sh"
echo "   3. Escolha 's' para limpar a sessão"
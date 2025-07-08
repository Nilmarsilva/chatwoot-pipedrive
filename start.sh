#!/bin/sh

# Script de inicialização para diagnóstico de problemas
echo "Iniciando script de diagnóstico..."

# Verificar variáveis de ambiente
echo "Verificando variáveis de ambiente..."
if [ -z "$CHATWOOT_API_TOKEN" ]; then
  echo "AVISO: CHATWOOT_API_TOKEN não está definido"
fi

if [ -z "$CHATWOOT_BASE_URL" ]; then
  echo "AVISO: CHATWOOT_BASE_URL não está definido"
fi

if [ -z "$PIPEDRIVE_API_TOKEN" ]; then
  echo "AVISO: PIPEDRIVE_API_TOKEN não está definido"
fi

if [ -z "$PIPEDRIVE_BASE_URL" ]; then
  echo "AVISO: PIPEDRIVE_BASE_URL não está definido"
fi

# Verificar diretórios
echo "Verificando diretórios..."
mkdir -p /app/logs
mkdir -p /app/temp
chmod -R 777 /app/logs /app/temp

# Verificar arquivos de configuração
echo "Verificando arquivos de configuração..."
if [ -f "/app/.env" ]; then
  echo "Arquivo .env encontrado"
else
  echo "AVISO: Arquivo .env não encontrado"
fi

# Verificar dependências
echo "Verificando dependências..."
if command -v ffmpeg >/dev/null 2>&1; then
  echo "FFmpeg instalado: $(ffmpeg -version | head -n 1)"
else
  echo "ERRO: FFmpeg não está instalado"
fi

# Iniciar a aplicação com redirecionamento de logs
echo "Iniciando aplicação..."
node src/index.js 2>&1 | tee /app/logs/app.log

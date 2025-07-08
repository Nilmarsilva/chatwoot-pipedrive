/**
 * Integração Chatwoot-Pipedrive
 * Aplicação para integrar o Chatwoot com o Pipedrive, permitindo a criação de deals
 * a partir de conversas do Chatwoot e anexação de arquivos, imagens e áudios.
 */
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const config = require('./config/config');
const webhookRoutes = require('./routes/webhook');
const { logToFile } = require('./utils/fileUtils');

// Inicializar Express
const app = express();
const PORT = config.PORT || 3000;

// Middleware para parsing de JSON e URL-encoded
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(cors());

// Criar diretórios necessários se não existirem
const tempDir = path.join(__dirname, '../temp');
const logsDir = path.join(__dirname, '../logs');

if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
  console.log(`Diretório de arquivos temporários criado: ${tempDir}`);
}

if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
  console.log(`Diretório de logs criado: ${logsDir}`);
}

// Rota de status/health check
app.get('/', (req, res) => {
  console.log(`Health check solicitado: ${new Date().toISOString()}`);
  res.json({
    status: 'online',
    versao: '2.0.0',
    nome: 'Integração Chatwoot-Pipedrive',
    timestamp: new Date().toISOString()
  });
});

// Rota adicional para health check do Docker
app.get('/health', (req, res) => {
  console.log(`Health check Docker solicitado: ${new Date().toISOString()}`);
  res.json({
    status: 'online',
    timestamp: new Date().toISOString()
  });
});

// Registrar rotas do webhook
app.use('/webhook', webhookRoutes);

// Registrar rota alternativa para compatibilidade
app.use('/api/webhook', webhookRoutes);

// Capturar sinais de encerramento para log
process.on('SIGTERM', () => {
  console.log('Recebido sinal SIGTERM - Encerrando aplicação');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('Recebido sinal SIGINT - Encerrando aplicação');
  process.exit(0);
});

process.on('uncaughtException', (error) => {
  console.error('Erro não tratado:', error);
  // Não encerrar o processo para evitar que o Docker reinicie o contêiner
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Promessa rejeitada não tratada:', reason);
  // Não encerrar o processo para evitar que o Docker reinicie o contêiner
});

// Iniciar o servidor
const server = app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
  console.log(`Acesse: http://localhost:${PORT}`);
  console.log(`Versão Node.js: ${process.version}`);
  console.log(`Memória: ${JSON.stringify(process.memoryUsage())}`);
  console.log(`Ambiente: ${process.env.NODE_ENV}`);
  
  // Registrar informações de inicialização
  logToFile('servidor_iniciado', {
    porta: PORT,
    ambiente: process.env.NODE_ENV || 'development',
    timestamp: new Date().toISOString(),
    config: {
      chatwoot_url: config.CHATWOOT_BASE_URL,
      pipedrive_url: config.PIPEDRIVE_BASE_URL,
      temp_dir: config.TEMP_DIR,
      log_dir: config.LOG_DIR
    }
  });
});

// Tratamento de erros não capturados
process.on('uncaughtException', (error) => {
  console.error('Erro não capturado:', error);
  logToFile('erro_nao_capturado', {
    error: error.message,
    stack: error.stack
  });
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Promessa rejeitada não tratada:', reason);
  logToFile('promessa_rejeitada', {
    reason: reason?.message || String(reason),
    stack: reason?.stack
  });
});

module.exports = app;

/**
 * Configurações centralizadas para a integração Chatwoot-Pipedrive
 */
require('dotenv').config();

// Log para verificar se as variáveis de ambiente estão sendo carregadas
console.log('============= CONFIGURAÇÕES CARREGADAS =============');
console.log('CHATWOOT_BASE_URL:', process.env.CHATWOOT_BASE_URL ? 'Configurado' : 'Não configurado');
console.log('CHATWOOT_API_KEY:', process.env.CHATWOOT_API_KEY ? 'Configurado' : 'Não configurado');
console.log('CHATWOOT_ACCOUNT_ID:', process.env.CHATWOOT_ACCOUNT_ID ? 'Configurado' : 'Não configurado');
console.log('PIPEDRIVE_API_TOKEN:', process.env.PIPEDRIVE_API_TOKEN ? 'Configurado' : 'Não configurado');
console.log('OPENAI_API_KEY:', process.env.OPENAI_API_KEY ? 'Configurado' : 'Não configurado');
console.log('====================================================');

// Configurações do Chatwoot
const chatwootConfig = {
  baseUrl: process.env.CHATWOOT_BASE_URL || 'https://app.chatwoot.com',
  apiKey: process.env.CHATWOOT_API_KEY,
  accountId: process.env.CHATWOOT_ACCOUNT_ID,
  inboxId: process.env.CHATWOOT_INBOX_ID,
};

// Configurações do Pipedrive
const pipedriveConfig = {
  apiToken: process.env.PIPEDRIVE_API_TOKEN,
  baseUrl: 'https://api.pipedrive.com/v1',
  dealStageId: process.env.PIPEDRIVE_DEAL_STAGE_ID || null,
  dealTitle: process.env.PIPEDRIVE_DEAL_TITLE || 'Lead do Chatwoot',
};

// Configurações do OpenAI
const openaiConfig = {
  apiKey: process.env.OPENAI_API_KEY || '',
};

// Configurações do servidor
const serverConfig = {
  port: process.env.PORT || 3000,
  logDir: process.env.LOG_DIR || '../logs',
};

// Configurações de arquivos
const fileConfig = {
  tempDir: process.env.TEMP_DIR || '../temp',
  maxRetries: 2,
  timeout: 30000,
};

module.exports = {
  chatwoot: chatwootConfig,
  pipedrive: pipedriveConfig,
  openai: openaiConfig,
  server: serverConfig,
  file: fileConfig,
};

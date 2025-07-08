/**
 * Configurações centralizadas para a integração Chatwoot-Pipedrive
 */
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

// Verificar se o arquivo .env existe
const envPath = path.resolve(process.cwd(), '.env');
const envExists = fs.existsSync(envPath);

console.log(`Verificando arquivo .env em: ${envPath}`);
console.log(`Arquivo .env existe: ${envExists ? 'Sim' : 'Não'}`);

if (envExists) {
  try {
    // Tentar ler o conteúdo do arquivo .env (sem mostrar valores sensíveis)
    const envContent = fs.readFileSync(envPath, 'utf8');
    const envLines = envContent.split('\n').filter(line => line.trim() && !line.startsWith('#'));
    console.log(`Arquivo .env contém ${envLines.length} variáveis definidas`);
    
    // Mostrar quais variáveis estão definidas (sem valores)
    envLines.forEach(line => {
      const varName = line.split('=')[0].trim();
      console.log(`Variável encontrada: ${varName}`);
    });
  } catch (err) {
    console.error(`Erro ao ler arquivo .env: ${err.message}`);
  }
}

// Carregar variáveis de ambiente do arquivo .env
const result = dotenv.config();
if (result.error) {
  console.error(`Erro ao carregar .env: ${result.error.message}`);
} else {
  console.log('.env carregado com sucesso');
}

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
  // Verificar tanto CHATWOOT_API_KEY quanto CHATWOOT_API_TOKEN (usado no .env)
  apiKey: process.env.CHATWOOT_API_KEY || process.env.CHATWOOT_API_TOKEN,
  // Se não estiver definido no .env, será extraído do payload do webhook
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

// Verificar se a chave da API OpenAI está configurada
if (process.env.OPENAI_API_KEY) {
  console.log(`OpenAI API Key encontrada: ${process.env.OPENAI_API_KEY.substring(0, 5)}...${process.env.OPENAI_API_KEY.substring(process.env.OPENAI_API_KEY.length - 4)}`);
} else {
  console.warn('AVISO: OPENAI_API_KEY não está configurada no arquivo .env. A transcrição de áudio não funcionará.');
}

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

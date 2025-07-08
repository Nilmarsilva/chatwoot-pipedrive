/**
 * Script de inicialização que verifica o arquivo .env antes de iniciar a aplicação
 */
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

// Caminhos possíveis para o arquivo .env
const possiblePaths = [
  path.resolve(process.cwd(), '.env'),
  path.resolve(process.cwd(), '../.env'),
  path.resolve(process.cwd(), '../../.env'),
  path.resolve(__dirname, '.env')
];

console.log('=== VERIFICANDO ARQUIVO .ENV ===');

// Verificar cada caminho possível
let envFound = false;
for (const envPath of possiblePaths) {
  if (fs.existsSync(envPath)) {
    console.log(`Arquivo .env encontrado em: ${envPath}`);
    
    // Ler e mostrar as variáveis (sem valores)
    try {
      const envContent = fs.readFileSync(envPath, 'utf8');
      const envLines = envContent.split('\n').filter(line => line.trim() && !line.startsWith('#'));
      console.log(`Arquivo .env contém ${envLines.length} variáveis definidas`);
      
      // Mostrar quais variáveis estão definidas (sem valores)
      envLines.forEach(line => {
        const varName = line.split('=')[0].trim();
        console.log(`Variável encontrada: ${varName}`);
        
        // Definir variável de ambiente explicitamente se não estiver definida
        if (!process.env[varName]) {
          const value = line.substring(line.indexOf('=') + 1).trim();
          process.env[varName] = value;
          console.log(`Variável ${varName} definida manualmente`);
        }
      });
      
      envFound = true;
      break;
    } catch (err) {
      console.error(`Erro ao ler arquivo .env: ${err.message}`);
    }
  }
}

if (!envFound) {
  console.warn('AVISO: Arquivo .env não encontrado em nenhum local esperado!');
  console.warn('Verifique se o arquivo .env foi incluído no deploy.');
}

// Verificar variáveis críticas
const criticalVars = [
  'CHATWOOT_API_TOKEN', 
  'CHATWOOT_API_KEY', 
  'CHATWOOT_ACCOUNT_ID', 
  'CHATWOOT_BASE_URL'
];

console.log('\n=== VERIFICANDO VARIÁVEIS CRÍTICAS ===');
criticalVars.forEach(varName => {
  if (process.env[varName]) {
    // Mostrar apenas os primeiros e últimos caracteres para segurança
    const value = process.env[varName];
    const maskedValue = value.length > 8 ? 
      `${value.substring(0, 4)}...${value.substring(value.length - 4)}` : 
      '[definido]';
    console.log(`${varName}: ${maskedValue}`);
  } else {
    console.error(`ERRO: ${varName} não está definido!`);
  }
});

// Iniciar a aplicação principal
console.log('\n=== INICIANDO APLICAÇÃO ===');
const app = spawn('node', ['src/index.js'], { stdio: 'inherit' });

app.on('close', (code) => {
  console.log(`Aplicação encerrada com código: ${code}`);
});

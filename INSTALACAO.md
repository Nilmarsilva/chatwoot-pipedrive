# Instruções de Instalação - Integração Chatwoot-Pipedrive

Este documento contém as instruções para instalar e configurar a integração entre o Chatwoot e o Pipedrive.

## Requisitos do Sistema

- Node.js 14.x ou superior
- NPM 6.x ou superior
- FFmpeg (necessário para processamento de áudio)

## Funcionalidades Principais

- Recebe webhooks do Chatwoot quando conversas são marcadas como resolvidas
- Gera um documento PDF completo com todo o histórico da conversa, incluindo:
  - Mensagens de texto
  - Imagens incorporadas diretamente no PDF
  - Transcrições de áudio usando a API da OpenAI
  - Documentos e arquivos incorporados quando possível
- Cria/atualiza entidades no Pipedrive (Deal, Pessoa, Organização)
- Anexa o PDF completo ao Deal no Pipedrive

## Instalação do FFmpeg

### Windows
1. Baixe o FFmpeg do site oficial: https://ffmpeg.org/download.html
2. Extraia o arquivo baixado
3. Adicione o caminho da pasta `bin` ao PATH do sistema
4. Verifique a instalação executando `ffmpeg -version` no terminal

### Linux (Ubuntu/Debian)
```bash
sudo apt update
sudo apt install ffmpeg
```

### macOS
```bash
brew install ffmpeg
```

## Instalação das Dependências do Projeto

1. Clone o repositório (ou extraia os arquivos)
2. Navegue até a pasta do projeto
3. Execute o comando:

```bash
npm install
```

Este comando instalará todas as dependências listadas no arquivo `package.json`:

- express: Framework web para Node.js
- axios: Cliente HTTP para fazer requisições
- form-data: Para envio de formulários multipart
- dotenv: Para carregar variáveis de ambiente
- openai: SDK da OpenAI para transcrição de áudio
- fluent-ffmpeg: Interface para FFmpeg

## Configuração

1. Edite o arquivo `.env` com suas credenciais:

```
# Token da API do Chatwoot
CHATWOOT_API_TOKEN=seu-token-aqui

# URL base do Chatwoot
CHATWOOT_BASE_URL=https://sua-instancia-chatwoot.com

# Token da API do Pipedrive
PIPEDRIVE_API_TOKEN=seu-token-aqui

# URL base da API do Pipedrive
PIPEDRIVE_BASE_URL=https://sua-instancia.pipedrive.com/api/v1

# Chave da API da OpenAI para transcrição de áudio
OPENAI_API_KEY=sua-chave-openai-aqui
```

## Executando o Projeto

Para iniciar o servidor com a nova implementação:

```bash
npm run start:new
```

O servidor estará disponível na porta 3000 (ou na porta definida na variável de ambiente PORT).

## Testando a Integração

1. Configure um webhook no Chatwoot apontando para `http://seu-servidor:3000/webhook`
2. Quando uma conversa for marcada como "resolved" no Chatwoot, o webhook será acionado
3. A integração processará a conversa e criará/atualizará as entidades no Pipedrive

## Estrutura de Diretórios

- `src/`: Contém os arquivos fonte do projeto
  - `index.js`: Implementação original
  - `index-new.js`: Nova implementação com processamento de mídia e transcrição
- `logs/`: Logs das requisições (criado automaticamente)
- `temp/`: Arquivos temporários para processamento de áudio (criado automaticamente)

## Solução de Problemas

### Erro na transcrição de áudio
- Verifique se o FFmpeg está instalado corretamente
- Confirme que a chave da API da OpenAI está configurada no arquivo `.env`
- Verifique os logs para mais detalhes sobre o erro

### Erro ao anexar arquivos ao Pipedrive
- Verifique se o token da API do Pipedrive está correto
- Confirme que o Deal ID está sendo encontrado corretamente
- Verifique os logs para mais detalhes sobre o erro

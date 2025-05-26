# Integração Chatwoot-Pipedrive

Este projeto implementa uma integração completa entre o Chatwoot (plataforma de atendimento ao cliente) e o Pipedrive (CRM), permitindo sincronizar conversas, contatos e mídias entre os dois sistemas.

## Funcionalidades

- Recebe webhooks do Chatwoot quando conversas são marcadas como resolvidas
- Busca o histórico completo de mensagens da conversa
- Processa diferentes tipos de mídia:
  - Texto: Formatado e incluído na nota do Pipedrive
  - Imagens: Baixadas e anexadas ao Deal no Pipedrive
  - Áudio: Baixado, transcrito usando OpenAI Whisper e incluído na nota
  - Arquivos: Baixados e anexados ao Deal no Pipedrive
- Gerencia entidades no Pipedrive:
  - Verifica se o Deal já existe
  - Cria Deal, Pessoa e Organização quando necessário
  - Vincula as entidades entre si
- Atualiza o contato no Chatwoot com o ID do Deal do Pipedrive
- Formata e cria notas detalhadas no Pipedrive com o histórico da conversa

## Tecnologias Utilizadas

- Node.js e Express para o servidor web
- Axios para requisições HTTP
- OpenAI API para transcrição de áudio
- FFmpeg para processamento de áudio
- FormData para upload de arquivos

## Instalação

Veja o arquivo [INSTALACAO.md](INSTALACAO.md) para instruções detalhadas de instalação e configuração.

## Uso

1. Configure um webhook no Chatwoot apontando para o endpoint `/webhook` deste servidor
2. Quando uma conversa for marcada como "resolved" no Chatwoot, o webhook será acionado
3. A integração processará a conversa e criará/atualizará as entidades no Pipedrive

## Estrutura do Projeto

- `src/index.js`: Implementação original simples
- `src/index-new.js`: Implementação completa com processamento de mídia e transcrição
- `.env`: Configurações e credenciais
- `package.json`: Dependências e scripts

## Configuração

Edite o arquivo `.env` com suas credenciais:

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

## Executando

```bash
# Inicia o servidor com a implementação original
npm start

# Inicia o servidor com a nova implementação completa
npm run start:new
```

O servidor estará disponível na porta 3000 (ou na porta definida na variável de ambiente PORT).

## Logs

Os logs das requisições são salvos na pasta `logs/` para facilitar a depuração.

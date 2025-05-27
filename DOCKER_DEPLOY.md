# Guia de Implantação com Docker e Portainer

Este guia explica como implantar a integração Chatwoot-Pipedrive em um container Docker usando Portainer em uma VPS.

## Pré-requisitos

- VPS com Docker e Portainer instalados
- Acesso SSH à VPS
- Conhecimento básico de Docker e Portainer
- Credenciais das APIs (Chatwoot, Pipedrive, OpenAI)

## Preparação dos Arquivos

1. Clone o repositório na sua máquina local
2. Certifique-se de que os seguintes arquivos estão presentes:
   - `Dockerfile`
   - `docker-compose.yml`
   - `.dockerignore`
   - `package.json`
   - `src/index-new.js` e outros arquivos de código

## Opção 1: Implantação via Docker Compose

### 1. Preparar o arquivo .env

Crie um arquivo `.env` na raiz do projeto com suas credenciais:

```
CHATWOOT_API_TOKEN=seu-token-aqui
CHATWOOT_BASE_URL=https://sua-instancia-chatwoot.com
PIPEDRIVE_API_TOKEN=seu-token-aqui
PIPEDRIVE_BASE_URL=https://sua-instancia.pipedrive.com/api/v1
OPENAI_API_KEY=sua-chave-openai-aqui
```

### 2. Transferir os arquivos para a VPS

Use SCP ou outro método para transferir os arquivos para sua VPS:

```bash
scp -r ./chatwoot-pipedrive user@sua-vps:/caminho/para/chatwoot-pipedrive
```

### 3. Conectar-se à VPS e construir/iniciar os containers

```bash
ssh user@sua-vps
cd /caminho/para/chatwoot-pipedrive
docker-compose up -d
```

## Opção 2: Implantação via Portainer

### 1. Compactar o projeto

Compacte todo o projeto em um arquivo ZIP:

```bash
zip -r chatwoot-pipedrive.zip . -x "node_modules/*" "logs/*" "temp/*"
```

### 2. Acessar o Portainer

1. Acesse a interface web do Portainer (geralmente em `http://sua-vps:9000`)
2. Faça login com suas credenciais

### 3. Criar uma Stack no Portainer

1. No menu lateral, clique em "Stacks"
2. Clique em "Add stack"
3. Dê um nome à stack (ex: "chatwoot-pipedrive")
4. Na seção "Build method", escolha "Upload" e faça upload do arquivo ZIP
5. Alternativamente, você pode colar o conteúdo do arquivo `docker-compose.yml` diretamente
6. Configure as variáveis de ambiente:
   - `CHATWOOT_API_TOKEN`
   - `CHATWOOT_BASE_URL`
   - `PIPEDRIVE_API_TOKEN`
   - `PIPEDRIVE_BASE_URL`
   - `OPENAI_API_KEY`
7. Clique em "Deploy the stack"

## Configurações Adicionais

### Configurar DNS

Crie um registro DNS do tipo CNAME para o subdomínio que será usado pelo webhook:

```
webhookdata.authbrasil.app.br  CNAME  seu-servidor-vps.authbrasil.app.br
```

### Configurar Traefik (Já configurado no docker-compose.yml)

O arquivo `docker-compose.yml` já contém as configurações necessárias para o Traefik:

```yaml
labels:
  - "traefik.enable=true"
  - "traefik.http.routers.chatwoot-pipedrive.rule=Host(`webhook.authbrasil.app.br`)"
  - "traefik.http.services.chatwoot-pipedrive.loadbalancer.server.port=3000"
  - "traefik.http.routers.chatwoot-pipedrive.entrypoints=websecure"
  - "traefik.http.routers.chatwoot-pipedrive.tls=true"
  - "traefik.http.routers.chatwoot-pipedrive.tls.certresolver=myresolver"
```

Certifique-se de que:
1. O nome do resolver (`myresolver`) corresponde ao configurado no seu Traefik
2. O entrypoint (`websecure`) está configurado no seu Traefik
3. A rede externa `network_public` existe e é a mesma usada pelo Traefik

### Configurar Webhook no Chatwoot

Configure o webhook no Chatwoot para apontar para:
`https://webhookdata.authbrasil.app.br/webhook`

## Monitoramento e Manutenção

### Verificar Logs

```bash
docker logs chatwoot-pipedrive
```

Ou através do Portainer:
1. Vá para "Containers"
2. Clique no container "chatwoot-pipedrive"
3. Clique na aba "Logs"

### Reiniciar o Serviço

```bash
docker-compose restart
```

Ou através do Portainer:
1. Vá para "Containers"
2. Selecione o container "chatwoot-pipedrive"
3. Clique em "Restart"

## Considerações Importantes

### Persistência de Dados

Os diretórios `logs` e `temp` são montados como volumes para garantir que os dados persistam mesmo se o container for reiniciado. Certifique-se de que esses diretórios tenham permissões adequadas.

### Segurança

- Nunca exponha a porta 3000 diretamente à internet. Use sempre um proxy reverso com SSL.
- Mantenha suas credenciais de API seguras e nunca as inclua em repositórios públicos.
- Considere usar um gerenciador de segredos como Docker Secrets ou Vault para gerenciar credenciais.

### Escalabilidade

Esta configuração é adequada para cargas de trabalho moderadas. Para maior escalabilidade:
- Considere usar um balanceador de carga
- Implemente monitoramento com Prometheus/Grafana
- Configure alertas para falhas no serviço

## Solução de Problemas

### O container não inicia

Verifique os logs:
```bash
docker logs chatwoot-pipedrive
```

### Problemas com FFmpeg

Verifique se o FFmpeg está instalado corretamente no container:
```bash
docker exec -it chatwoot-pipedrive ffmpeg -version
```

### Problemas de permissão

Verifique as permissões dos diretórios montados:
```bash
docker exec -it chatwoot-pipedrive ls -la /app/logs /app/temp
```

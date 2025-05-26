# Guia Detalhado de Implantação no Portainer

Este guia explica em detalhes as diferentes maneiras de implantar a integração Chatwoot-Pipedrive usando o Portainer.

## Opção 1: Implantação Usando Repositório Git (Recomendado)

Esta é a maneira mais simples e recomendada, pois o Portainer clonará todo o repositório automaticamente.

### Pré-requisitos
- Repositório Git (GitHub, GitLab, Bitbucket, etc.) contendo todos os arquivos do projeto
- Portainer configurado com acesso à internet

### Passos

1. **Acesse o Portainer**
   - Abra o navegador e acesse a interface do Portainer (ex: `https://seu-servidor:9000`)
   - Faça login com suas credenciais

2. **Crie uma nova Stack**
   - No menu lateral, clique em "Stacks"
   - Clique no botão "Add stack"
   - Dê um nome à stack (ex: "chatwoot-pipedrive")

3. **Configure o Repositório Git**
   - Em "Build method", selecione "Repository"
   - Insira a URL do repositório Git (ex: `https://github.com/seu-usuario/chatwoot-pipedrive.git`)
   - Se for um repositório privado, forneça as credenciais de acesso
   - Em "Repository reference", você pode especificar uma branch, tag ou commit (ex: `main` ou `master`)
   - Em "Compose path", mantenha como `docker-compose.yml` (ou ajuste se seu arquivo estiver em outro local)

4. **Configure as Variáveis de Ambiente**
   - Role para baixo até a seção "Environment variables"
   - Adicione todas as variáveis necessárias:
     - `CHATWOOT_API_TOKEN`
     - `CHATWOOT_BASE_URL`
     - `PIPEDRIVE_API_TOKEN`
     - `PIPEDRIVE_BASE_URL`
     - `OPENAI_API_KEY`

5. **Implante a Stack**
   - Clique no botão "Deploy the stack"
   - O Portainer clonará o repositório e iniciará os containers conforme definido no docker-compose.yml

## Opção 2: Implantação Usando Upload de Arquivos

Se você não tem um repositório Git, pode fazer upload dos arquivos diretamente para o Portainer.

### Pré-requisitos
- Todos os arquivos do projeto em sua máquina local
- Acesso ao Portainer

### Passos

1. **Prepare os Arquivos para Upload**
   - Compacte todos os arquivos do projeto em um arquivo ZIP
   ```bash
   zip -r chatwoot-pipedrive.zip . -x "node_modules/*" "logs/*" "temp/*"
   ```

2. **Acesse o Portainer**
   - Abra o navegador e acesse a interface do Portainer
   - Faça login com suas credenciais

3. **Crie uma nova Stack**
   - No menu lateral, clique em "Stacks"
   - Clique no botão "Add stack"
   - Dê um nome à stack (ex: "chatwoot-pipedrive")

4. **Faça Upload dos Arquivos**
   - Em "Build method", selecione "Upload"
   - Clique em "Select file" e selecione o arquivo ZIP que você criou
   - Clique em "Upload"
   - O Portainer extrairá o ZIP e usará o docker-compose.yml encontrado

5. **Configure as Variáveis de Ambiente**
   - Role para baixo até a seção "Environment variables"
   - Adicione todas as variáveis necessárias (mesmas da Opção 1)

6. **Implante a Stack**
   - Clique no botão "Deploy the stack"

## Opção 3: Implantação Usando Apenas o docker-compose.yml com Imagem Pré-construída

Se você já tem uma imagem Docker pré-construída (ou planeja construí-la e enviá-la para um registro Docker), pode usar apenas o arquivo docker-compose.yml.

### Pré-requisitos
- Imagem Docker pré-construída em um registro acessível (Docker Hub, GitLab Container Registry, etc.)
- Acesso ao Portainer

### Passos

1. **Construa e Envie a Imagem Docker** (se ainda não tiver feito)
   ```bash
   # Construir a imagem
   docker build -t seu-usuario/chatwoot-pipedrive:latest .
   
   # Fazer login no Docker Hub (ou outro registro)
   docker login
   
   # Enviar a imagem
   docker push seu-usuario/chatwoot-pipedrive:latest
   ```

2. **Modifique o docker-compose.yml**
   - Edite o arquivo para usar a imagem pré-construída em vez de construir localmente
   - Comente a seção `build` e descomente a linha `image`
   ```yaml
   chatwoot-pipedrive:
     # build:
     #   context: .
     #   dockerfile: Dockerfile
     image: seu-usuario/chatwoot-pipedrive:latest
   ```

3. **Acesse o Portainer**
   - Abra o navegador e acesse a interface do Portainer
   - Faça login com suas credenciais

4. **Crie uma nova Stack**
   - No menu lateral, clique em "Stacks"
   - Clique no botão "Add stack"
   - Dê um nome à stack (ex: "chatwoot-pipedrive")

5. **Cole o Conteúdo do docker-compose.yml**
   - Em "Build method", selecione "Web editor"
   - Cole o conteúdo do seu arquivo docker-compose.yml modificado

6. **Configure as Variáveis de Ambiente**
   - Role para baixo até a seção "Environment variables"
   - Adicione todas as variáveis necessárias (mesmas das opções anteriores)

7. **Implante a Stack**
   - Clique no botão "Deploy the stack"

## Opção 4: Implantação via API do Portainer

Para automação, você pode usar a API do Portainer para implantar a stack.

### Exemplo usando curl:

```bash
curl -X POST \
  https://seu-portainer:9000/api/stacks \
  -H 'Authorization: Bearer seu-token-api' \
  -H 'Content-Type: application/json' \
  -d '{
    "name": "chatwoot-pipedrive",
    "stackFileContent": "versão: \'3\'...", # Conteúdo do docker-compose.yml
    "env": [
      {
        "name": "CHATWOOT_API_TOKEN",
        "value": "seu-token-aqui"
      },
      # Outras variáveis de ambiente
    ]
  }'
```

## Solução de Problemas

### A imagem não está sendo construída corretamente
- Verifique se todos os arquivos necessários estão presentes no repositório ou no ZIP
- Verifique se o Dockerfile está correto e se todas as dependências estão sendo instaladas
- Verifique os logs de build no Portainer

### O container inicia mas o serviço não funciona
- Verifique os logs do container para identificar erros
- Verifique se todas as variáveis de ambiente estão configuradas corretamente
- Verifique se o Traefik está configurado corretamente e se o domínio está apontando para o servidor

### Problemas com o Traefik
- Verifique se a rede `network_public` existe e está configurada como externa
- Verifique se os labels do Traefik estão corretos e se correspondem à sua configuração
- Verifique se o entrypoint e o resolver especificados existem na configuração do Traefik

## Manutenção

### Atualização da Stack
Para atualizar a stack após alterações no código:

1. Se estiver usando a opção de repositório Git:
   - Faça commit e push das alterações para o repositório
   - No Portainer, vá para a stack e clique em "Pull and redeploy"

2. Se estiver usando a opção de upload:
   - Faça upload do novo arquivo ZIP
   - Reimplante a stack

3. Se estiver usando a opção de imagem pré-construída:
   - Construa e envie a nova versão da imagem
   - No Portainer, vá para a stack e clique em "Redeploy"

# Guia de Uso do Git para o Projeto Chatwoot-Pipedrive

Este guia explica como usar o Git para manter e atualizar o projeto Chatwoot-Pipedrive, facilitando a implantação via Portainer.

## Configuração Inicial do Repositório

O repositório Git já foi inicializado. Para configurar um repositório remoto e fazer o primeiro push, siga estes passos:

### 1. Criar um Repositório Remoto

Primeiro, crie um repositório vazio no GitHub, GitLab ou outro serviço Git de sua preferência.

### 2. Adicionar o Repositório Remoto

```bash
# Substitua a URL pelo seu repositório
git remote add origin https://github.com/seu-usuario/chatwoot-pipedrive.git
```

### 3. Adicionar os Arquivos ao Repositório

```bash
# Adicionar todos os arquivos (exceto os ignorados pelo .gitignore)
git add .

# Verificar quais arquivos serão commitados
git status
```

### 4. Fazer o Primeiro Commit

```bash
git commit -m "Versão inicial da integração Chatwoot-Pipedrive"
```

### 5. Enviar para o Repositório Remoto

```bash
git push -u origin main
# ou
git push -u origin master
# dependendo da branch padrão do seu repositório
```

## Fluxo de Trabalho para Atualizações

Sempre que fizer alterações no código, siga este fluxo de trabalho:

### 1. Verificar Alterações

```bash
git status
```

### 2. Adicionar Alterações

```bash
# Adicionar todas as alterações
git add .

# Ou adicionar arquivos específicos
git add arquivo1.js arquivo2.js
```

### 3. Commit das Alterações

```bash
git commit -m "Descrição das alterações realizadas"
```

### 4. Enviar para o Repositório Remoto

```bash
git push
```

## Implantação no Portainer após Atualizações

Depois de enviar as alterações para o repositório remoto, você pode facilmente atualizar a implantação no Portainer:

1. Acesse o Portainer
2. Vá para a seção "Stacks"
3. Encontre a stack "chatwoot-pipedrive"
4. Clique no botão "Pull and redeploy" (se estiver usando Git)
   - Ou "Redeploy" se estiver usando outro método

O Portainer irá buscar as alterações mais recentes do repositório Git e reimplantar o serviço automaticamente.

## Dicas Importantes

1. **Nunca comite arquivos sensíveis**
   - Certifique-se de que o arquivo `.env` está no `.gitignore`
   - Use o `.env.example` como modelo para as variáveis de ambiente

2. **Mantenha o .gitignore atualizado**
   - Se adicionar novos tipos de arquivos temporários, atualize o `.gitignore`

3. **Faça commits frequentes e descritivos**
   - Commits pequenos e focados são mais fáceis de entender e reverter se necessário

4. **Use branches para novas funcionalidades**
   - Para funcionalidades maiores, crie uma branch separada
   - Mescle com a branch principal quando a funcionalidade estiver pronta

## Solução de Problemas

### Arquivos grandes demais para o Git

Se tiver arquivos muito grandes que foram acidentalmente commitados:

```bash
# Remover arquivos grandes do histórico
git filter-branch --tree-filter 'rm -rf path/to/large/file' HEAD

# Forçar push (cuidado, isso altera o histórico)
git push origin --force
```

### Reverter alterações indesejadas

```bash
# Reverter para o último commit
git reset --hard HEAD

# Reverter para um commit específico
git reset --hard commit_hash
```

### Conflitos de merge

Se ocorrerem conflitos durante um pull:

```bash
# Verificar arquivos com conflitos
git status

# Após resolver os conflitos manualmente
git add .
git commit -m "Resolvido conflitos de merge"
```

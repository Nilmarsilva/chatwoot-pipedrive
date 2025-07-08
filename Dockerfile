FROM node:16-alpine

# Instalar dependências do sistema, incluindo FFmpeg
RUN apk add --no-cache ffmpeg

# Criar diretório da aplicação
WORKDIR /app

# Copiar arquivos de dependências
COPY package*.json ./

# Instalar dependências
RUN npm install

# Copiar código-fonte
COPY . .

# Criar diretórios necessários
RUN mkdir -p logs temp

# Expor porta
EXPOSE 3000

# Verificar e mostrar o conteúdo do diretório para debug
RUN echo "Conteúdo do diretório:" && ls -la

# Verificar permissões do arquivo .env se existir
RUN if [ -f .env ]; then echo "Arquivo .env encontrado" && cat .env | grep -v "=" | sed 's/=.*/=****/'; else echo "Arquivo .env não encontrado"; fi

# Comando para iniciar a aplicação usando o script de inicialização
CMD ["node", "start.js"]

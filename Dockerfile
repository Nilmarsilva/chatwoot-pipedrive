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

# Comando para iniciar a aplicação
CMD ["npm", "run", "start:new"]

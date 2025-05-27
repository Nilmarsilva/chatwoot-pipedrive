// Importa bibliotecas necessárias
const express = require('express');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const FormData = require('form-data');
const { OpenAI } = require('openai');
const ffmpeg = require('fluent-ffmpeg');
const sharp = require('sharp');
const { generateConversationPDF } = require('./pdfGenerator');
require('dotenv').config();

// Configurar cliente OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || '', // Chave da API da OpenAI
});

// Inicializa o app Express
const app = express();
app.use(express.json());

// Configuração de logs
const logDir = path.join(__dirname, '../logs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

const logRequest = (req, message) => {
  const timestamp = new Date().toISOString();
  const logFile = path.join(logDir, `request-${timestamp.split('T')[0]}.log`);
  const logData = `${timestamp} - ${message}\n${JSON.stringify(req.body, null, 2)}\n\n`;
  
  fs.appendFileSync(logFile, logData);
};

// Função para buscar todo o histórico do Chatwoot com paginação
async function getChatwootMessages(conversationId, accountId) {
  const allMessages = [];
  let hasMoreMessages = true;
  let beforeId = null;
  let requestCount = 0;
  const maxRequests = 100; // Limite de segurança para evitar loops infinitos

  try {
    console.log(`[Chatwoot] Iniciando busca de mensagens da conversa ${conversationId}...`);
    
    while (hasMoreMessages && requestCount < maxRequests) {
      requestCount++;
      
      // Parâmetros da requisição - Chatwoot Community Edition tem limite de 20 mensagens por requisição
      const params = { per_page: 20 }; // Limite máximo na versão Community
      if (beforeId) {
        params.before = beforeId;
      }
      
      console.log(`[Chatwoot] Buscando mensagens ${beforeId ? `anteriores a ${beforeId}` : 'mais recentes'}...`);
      
      // Garantir que a URL base termine com uma barra
      const baseUrl = process.env.CHATWOOT_BASE_URL.endsWith('/') 
        ? process.env.CHATWOOT_BASE_URL 
        : `${process.env.CHATWOOT_BASE_URL}/`;
      
      // Remover barras extras para evitar duplicação
      const apiPath = `api/v1/accounts/${accountId}/conversations/${conversationId}/messages`.replace(/^\/+|\/+$/g, '');
      const fullUrl = `${baseUrl}${apiPath}`;
      
      console.log(`[Chatwoot] URL da requisição: ${fullUrl}`);
      
      const response = await axios.get(
        fullUrl,
        {
          params,
          headers: {
            'api_access_token': process.env.CHATWOOT_API_TOKEN,
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'User-Agent': 'chatwoot-pipedrive/1.0'
          }
        }
      );
      
      const pageMessages = response.data.payload || response.data.data || [];
      console.log(`[Chatwoot] ${pageMessages.length} mensagens recebidas`);
      
      if (pageMessages.length === 0) {
        console.log('[Chatwoot] Nenhuma mensagem adicional encontrada');
        hasMoreMessages = false;
        break;
      }
      
      // Filtrar mensagens do sistema
      const validMessages = pageMessages.filter(msg => {
        const isSystemMessage = msg.message_type === 2 || msg.private === true;
        if (isSystemMessage) {
          console.log(`[Chatwoot] Mensagem do sistema ignorada:`, {
            id: msg.id,
            content: msg.content?.substring(0, 100) + (msg.content?.length > 100 ? '...' : ''),
            message_type: msg.message_type,
            private: msg.private
          });
          return false;
        }
        return true;
      });
      
      // Adicionar mensagens válidas ao array principal
      allMessages.push(...validMessages);
      
      // Atualizar o ID para a próxima página (mensagens mais antigas)
      // Ordenamos por ID para garantir que pegamos a mensagem mais antiga
      const sortedMessages = [...pageMessages].sort((a, b) => a.id - b.id);
      const oldestMessage = sortedMessages[0];
      
      if (oldestMessage && oldestMessage.id !== beforeId) {
        beforeId = oldestMessage.id;
        console.log(`[Chatwoot] Próximo ID para paginação: ${beforeId}`);
      } else {
        // Se não conseguimos obter um novo ID, paramos a paginação
        console.log('[Chatwoot] Não foi possível obter mais mensagens');
        hasMoreMessages = false;
      }
      
      // Na versão Community, sempre recebemos no máximo 20 mensagens
      // A única forma de saber se terminou é quando não recebermos mais mensagens
      // (já tratado no bloco pageMessages.length === 0)
      
      // Pequena pausa entre as requisições para evitar sobrecarga
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    
    // Ordenar mensagens por data de criação (mais antigas primeiro)
    allMessages.sort((a, b) => (a.created_at || 0) - (b.created_at || 0));
    
    console.log(`[Chatwoot] Total de ${allMessages.length} mensagens válidas encontradas`);
    return allMessages;
  } catch (error) {
    console.error('Erro detalhado ao buscar mensagens do Chatwoot:', {
      message: error.message,
      response: error.response?.data,
      status: error.response?.status,
      headers: error.response?.headers,
      config: {
        url: error.config?.url,
        method: error.config?.method,
        headers: error.config?.headers
      }
    });
    throw error;
  }
}

// Função para filtrar e organizar mensagens por tipo
function filterMessages(messages) {
  console.log(`Processando ${messages.length} mensagens do histórico`);
  
  // Filtrar mensagens públicas (cliente e atendente) e que tenham conteúdo ou anexos
  const filteredMessages = messages.filter(msg => {
    const hasContent = msg.content && msg.content.trim() !== '';
    const hasAttachments = msg.attachments && msg.attachments.length > 0;
    const isValidType = msg.message_type === 0 || msg.message_type === 1; // 0 = incoming, 1 = outgoing
    
    return !msg.private && isValidType && (hasContent || hasAttachments);
  });
  
  console.log(`Filtradas ${filteredMessages.length} mensagens públicas com conteúdo`);
  
  // Organizar mensagens por tipo
  const messagesByType = {
    text: [],
    image: [],
    audio: [],
    file: []
  };

  filteredMessages.forEach(msg => {
    try {
      // Determinar o tipo de remetente
      let senderType = 'Cliente';
      let senderName = 'Cliente';
      
      if (msg.sender) {
        if (msg.sender.type === 'user' || msg.sender.type === 'agent') {
          senderType = 'Atendente';
          senderName = msg.sender.name || 'Atendente';
        } else if (msg.sender.type === 'contact') {
          senderName = msg.sender.name || 'Cliente';
        }
      }

      // Log detalhado da mensagem para debug
      console.log(`Processando mensagem ${msg.id}:`, {
        content: msg.content,
        message_type: msg.message_type,
        sender_type: msg.sender?.type,
        sender_name: senderName,
        attachments: msg.attachments?.length || 0,
        created_at: msg.created_at
      });

      // Processar anexos se existirem
      if (msg.attachments && msg.attachments.length > 0) {
        console.log(`Mensagem ${msg.id} contém ${msg.attachments.length} anexos`);
        
        msg.attachments.forEach(attachment => {
          try {
            const commonData = {
              id: `${msg.id}_${attachment.id || Date.now()}`,
              original_id: msg.id,
              sender: senderName,
              sender_type: senderType,
              content: msg.content || '',
              url: attachment.data_url || attachment.url,
              file_type: attachment.file_type || path.extname(attachment.file_name || '').substring(1),
              file_name: attachment.file_name || `arquivo_${Date.now()}`,
              created_at: msg.created_at || Math.floor(Date.now() / 1000)
            };

            console.log(`Processando anexo:`, commonData);

            const fileType = (attachment.file_type || '').toLowerCase();
            
            if (fileType.includes('image')) {
              messagesByType.image.push(commonData);
            } else if (fileType.includes('audio')) {
              messagesByType.audio.push(commonData);
            } else {
              messagesByType.file.push({
                ...commonData,
                extension: attachment.extension || path.extname(attachment.file_name || '').substring(1)
              });
            }
          } catch (attachmentError) {
            console.error(`Erro ao processar anexo da mensagem ${msg.id}:`, attachmentError);
          }
        });
      } 
      
      // Processar mensagem de texto (mesmo se tiver anexos, pois pode ter texto junto)
      if (msg.content && msg.content.trim() !== '') {
        messagesByType.text.push({
          id: msg.id,
          sender: senderName,
          sender_type: senderType,
          content: msg.content,
          created_at: msg.created_at || Math.floor(Date.now() / 1000)
        });
      }
    } catch (error) {
      console.error(`Erro ao processar mensagem ${msg.id}:`, error);
    }
  });

  console.log(`Mensagens separadas por tipo:`, {
    textos: messagesByType.text.length,
    imagens: messagesByType.image.length,
    audios: messagesByType.audio.length,
    arquivos: messagesByType.file.length,
    total: messagesByType.text.length + messagesByType.image.length + messagesByType.audio.length + messagesByType.file.length
  });
  
  return {
    messagesByType,
    allMessages: filteredMessages
  };
}

// Função para extrair dados do contato
function extractContactData(webhookData) {
  const meta = webhookData.meta || {};
  const contact = meta.sender || meta.contact || {};
  const customAttributes = contact.custom_attributes || {};
  const additionalAttributes = contact.additional_attributes || {};
  const webhookAttributes = webhookData.additional_attributes || {};

  // Verificar múltiplas localizações possíveis para o id_deal_pipedrive
  let id_pipedrive = '';
  
  // Verificar em meta.sender.custom_attributes
  if (meta.sender?.custom_attributes?.id_deal_pipedrive) {
    id_pipedrive = meta.sender.custom_attributes.id_deal_pipedrive;
  }
  // Verificar em meta.contact.custom_attributes
  else if (meta.contact?.custom_attributes?.id_deal_pipedrive) {
    id_pipedrive = meta.contact.custom_attributes.id_deal_pipedrive;
  }
  // Verificar em additional_attributes do webhook
  else if (webhookAttributes.id_deal_pipedrive) {
    id_pipedrive = webhookAttributes.id_deal_pipedrive;
  }
  
  // Extrair nome da empresa de múltiplas possíveis localizações
  const empresa = 
    customAttributes.org_name || 
    additionalAttributes.company_name || 
    webhookAttributes.organizacao || 
    '';
  
  // Extrair processo de múltiplas possíveis localizações
  const processo = 
    customAttributes.processo || 
    webhookAttributes.processo || 
    '';
  
  // Extrair profissão de múltiplas possíveis localizações (mantendo o campo original 'profisso')
  const profissao = 
    customAttributes.profisso || 
    webhookAttributes.profissao_cbo || 
    '';
  
  // Extrair CPF de múltiplas possíveis localizações
  const cpf = 
    customAttributes.cpf || 
    webhookAttributes.cpf || 
    '';
  
  // Extrair nome do contato
  const nome = contact.name || customAttributes.nome || '';
  
  // Extrair telefone
  const telefone = contact.phone_number || additionalAttributes.phone_number || '';
  
  // Extrair email
  const email = contact.email || '';
  
  // Log dos dados extraídos para debug
  console.log('Dados extraídos do contato:', {
    nome,
    email,
    telefone,
    cpf,
    empresa,
    processo,
    profissao,
    id_pipedrive
  });
  
  return {
    nome,
    email,
    cpf,
    telefone,
    empresa,
    processo,
    profissao,
    id_pipedrive,
    thumbnail: contact.thumbnail || ''
  };
}

// Função para baixar arquivo de URL
async function downloadFile(url, maxRetries = 2, timeout = 30000) {
  let lastError;
  
  // Configuração de cabeçalhos para autenticação no Chatwoot, se necessário
  const headers = {};
  if (process.env.CHATWOOT_API_TOKEN) {
    headers['api_access_token'] = process.env.CHATWOOT_API_TOKEN;
  }
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`[Tentativa ${attempt}/${maxRetries}] Baixando arquivo de: ${url}`);
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);
      
      const response = await axios({
        url,
        method: 'GET',
        responseType: 'arraybuffer',
        headers,
        signal: controller.signal,
        maxContentLength: 50 * 1024 * 1024, // 50MB
        maxBodyLength: 50 * 1024 * 1024,    // 50MB
        timeout: timeout,
        validateStatus: (status) => status >= 200 && status < 400
      });
      
      clearTimeout(timeoutId);
      
      if (!response.data || response.data.length === 0) {
        throw new Error('O arquivo baixado está vazio');
      }
      
      const contentType = response.headers['content-type'] || 'application/octet-stream';
      const contentLength = parseInt(response.headers['content-length']) || response.data.length;
      
      console.log(`Download concluído: ${(contentLength / 1024).toFixed(2)} KB, tipo: ${contentType}`);
      
      return {
        data: response.data,
        contentType,
        headers: response.headers,
        status: response.status,
        size: contentLength
      };
      
    } catch (error) {
      lastError = error;
      
      if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
        console.warn(`[Tentativa ${attempt}/${maxRetries}] Timeout ao baixar arquivo: ${url}`);
      } else if (error.response) {
        // Erro de resposta HTTP (4xx, 5xx)
        console.error(`[Tentativa ${attempt}/${maxRetries}] Erro HTTP ${error.response.status}: ${error.response.statusText}`, {
          url,
          headers: error.config?.headers,
          responseHeaders: error.response.headers
        });
      } else if (error.request) {
        // Erro de requisição (sem resposta)
        console.error(`[Tentativa ${attempt}/${maxRetries}] Sem resposta do servidor:`, {
          url,
          code: error.code,
          message: error.message
        });
      } else {
        // Outros erros
        console.error(`[Tentativa ${attempt}/${maxRetries}] Erro ao baixar arquivo:`, {
          url,
          message: error.message,
          stack: error.stack
        });
      }
      
      // Se não for a última tentativa, aguarda um tempo antes de tentar novamente
      if (attempt < maxRetries) {
        const backoffTime = Math.min(1000 * Math.pow(2, attempt), 10000); // Backoff exponencial, máximo 10s
        console.log(`Aguardando ${backoffTime}ms antes da próxima tentativa...`);
        await new Promise(resolve => setTimeout(resolve, backoffTime));
      }
    }
  }
  
  // Se chegou aqui, todas as tentativas falharam
  console.error(`Falha ao baixar o arquivo após ${maxRetries} tentativas: ${url}`);
  return null;
}

// Função para converter arquivo para base64
function convertToBase64(buffer, contentType) {
  return `data:${contentType};base64,${Buffer.from(buffer).toString('base64')}`;
}

// Função para processar imagens
async function processImages(images) {
  console.log(`Iniciando processamento de ${images.length} imagens...`);
  const processedImages = [];
  const startTime = Date.now();
  
  for (const [index, image] of images.entries()) {
    const imageStartTime = Date.now();
    const imageId = image.id || `img_${index}`;
    
    console.log(`[${index + 1}/${images.length}] Processando imagem: ${imageId}`);
    
    try {
      // Validação básica
      if (!image.url) {
        throw new Error('URL da imagem não fornecida');
      }
      
      // Baixar a imagem com tratamento de erros
      console.log(`Baixando imagem ${imageId} de: ${image.url}`);
      const fileData = await downloadFile(image.url);
      
      if (!fileData || !fileData.data) {
        throw new Error('Falha ao baixar a imagem: dados inválidos');
      }
      
      const contentType = fileData.contentType || 'image/jpeg'; // Default para JPEG se não especificado
      const fileSize = fileData.size || fileData.data.length;
      
      console.log(`Imagem ${imageId} baixada: ${(fileSize / 1024).toFixed(2)} KB, tipo: ${contentType}`);
      
      // Verificar se é realmente uma imagem
      if (!contentType.startsWith('image/')) {
        throw new Error(`Tipo de arquivo não suportado: ${contentType}. Esperado um tipo de imagem.`);
      }
      
      // Extrair metadados da imagem (se disponível)
      let metadata = {};
      try {
        const tempFile = await saveBufferToTempFile(fileData.data, 'img');
        const result = await sharp(tempFile).metadata();
        metadata = {
          width: result.width,
          height: result.height,
          format: result.format,
          hasAlpha: result.hasAlpha,
          hasProfile: result.hasProfile,
          isProgressive: result.isProgressive,
          size: fileSize,
          space: result.space,
          channels: result.channels
        };
        
        // Remover o arquivo temporário
        try {
          await fs.promises.unlink(tempFile);
        } catch (e) {
          console.warn(`Não foi possível remover arquivo temporário ${tempFile}:`, e.message);
        }
      } catch (metadataError) {
        console.warn(`Não foi possível extrair metadados da imagem ${imageId}:`, metadataError.message);
        metadata = { error: metadataError.message };
      }
      
      // Converter para base64
      const base64Data = convertToBase64(fileData.data, contentType);
      
      // Criar objeto com informações da imagem processada
      const processedImage = {
        ...image,
        id: imageId,
        base64: base64Data,
        content_type: contentType,
        size: fileSize,
        extension: image.extension || contentType.split('/').pop() || 'jpg',
        file_type: 'imagem',
        file_name: image.file_name || `imagem_${Date.now()}.${contentType.split('/').pop() || 'jpg'}`,
        metadata,
        processado: true,
        processado_em: new Date().toISOString()
      };
      
      processedImages.push(processedImage);
      
      const processingTime = (Date.now() - imageStartTime) / 1000;
      console.log(`Imagem ${imageId} processada com sucesso em ${processingTime.toFixed(2)}s ` +
                 `(${metadata.width}x${metadata.height}px, ${(fileSize / 1024).toFixed(2)}KB)`);
      
    } catch (error) {
      console.error(`Erro ao processar imagem ${image.id}:`, error.message);
    }
  }
  
  return processedImages;
}

// Função para processar arquivos
async function processFiles(files) {
  console.log(`Iniciando processamento de ${files.length} arquivos...`);
  const processedFiles = [];
  const startTime = Date.now();
  
  for (const [index, file] of files.entries()) {
    const fileStartTime = Date.now();
    const fileId = file.id || `file_${index}`;
    
    console.log(`[${index + 1}/${files.length}] Processando arquivo: ${fileId}`);
    
    try {
      if (!file.url) {
        throw new Error('URL do arquivo não fornecida');
      }
      
      // Extrair extensão do nome do arquivo ou da URL
      let extension = '';
      if (file.file_name) {
        const parts = file.file_name.split('.');
        if (parts.length > 1) {
          extension = parts[parts.length - 1].toLowerCase();
        }
      } else if (file.url) {
        const urlParts = file.url.split('.');
        if (urlParts.length > 1) {
          extension = urlParts[urlParts.length - 1].split('?')[0].toLowerCase();
        }
      }
      
      // Baixar o arquivo com tratamento de erros
      console.log(`Baixando arquivo ${fileId} de: ${file.url}`);
      const fileData = await downloadFile(file.url);
      
      if (!fileData || !fileData.data) {
        throw new Error('Falha ao baixar o arquivo: dados inválidos');
      }
      
      const contentType = fileData.contentType || 'application/octet-stream';
      const fileSize = fileData.size || fileData.data.length;
      
      console.log(`Arquivo ${fileId} baixado: ${(fileSize / 1024).toFixed(2)} KB, tipo: ${contentType}`);
      
      // Determinar o tipo de arquivo baseado no content-type ou extensão
      let fileType = 'outro';
      const typeMap = {
        'pdf': ['application/pdf'],
        'imagem': ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'],
        'documento': [
          'application/msword',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'application/vnd.oasis.opendocument.text',
          'application/rtf',
          'text/plain'
        ],
        'planilha': [
          'application/vnd.ms-excel',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'application/vnd.oasis.opendocument.spreadsheet',
          'text/csv'
        ],
        'apresentacao': [
          'application/vnd.ms-powerpoint',
          'application/vnd.openxmlformats-officedocument.presentationml.presentation',
          'application/vnd.oasis.opendocument.presentation'
        ],
        'arquivo_compactado': [
          'application/zip',
          'application/x-rar-compressed',
          'application/x-7z-compressed',
          'application/x-tar',
          'application/x-gzip'
        ]
      };
      
      // Verifica o tipo pelo content-type
      for (const [type, mimeTypes] of Object.entries(typeMap)) {
        if (mimeTypes.some(mime => contentType.includes(mime.split('/')[1] || ''))) {
          fileType = type;
          break;
        }
      }
      
      // Se não encontrou pelo content-type, tenta pela extensão
      if (fileType === 'outro' && extension) {
        const extensionMap = {
          // Imagens
          'jpg': 'imagem', 'jpeg': 'imagem', 'png': 'imagem', 'gif': 'imagem', 'webp': 'imagem', 'svg': 'imagem',
          // Documentos
          'doc': 'documento', 'docx': 'documento', 'odt': 'documento', 'rtf': 'documento', 'txt': 'documento',
          // Planilhas
          'xls': 'planilha', 'xlsx': 'planilha', 'ods': 'planilha', 'csv': 'planilha',
          // Apresentações
          'ppt': 'apresentacao', 'pptx': 'apresentacao', 'odp': 'apresentacao',
          // Compactados
          'zip': 'arquivo_compactado', 'rar': 'arquivo_compactado', '7z': 'arquivo_compactado', 'tar': 'arquivo_compactado', 'gz': 'arquivo_compactado'
        };
        
        fileType = extensionMap[extension.toLowerCase()] || 'outro';
      }
      
      // Converter para base64
      const base64 = convertToBase64(fileData.data, contentType);
      
      // Criar objeto com informações do arquivo processado
      const processedFile = {
        ...file,
        id: fileId,
        base64,
        content_type: contentType,
        size: fileSize,
        extension: extension || file.extension || '',
        file_type: fileType,
        file_name: file.file_name || `arquivo_${Date.now()}.${extension || 'bin'}`,
        processado: true,
        processado_em: new Date().toISOString()
      };
      
      processedFiles.push(processedFile);
      
      const processingTime = (Date.now() - fileStartTime) / 1000;
      console.log(`Arquivo ${fileId} processado com sucesso em ${processingTime.toFixed(2)}s (${fileType})`);
      
    } catch (error) {
      console.error(`Erro ao processar arquivo ${fileId}:`, error.message);
      
      // Adiciona o arquivo mesmo com erro, para manter o registro
      processedFiles.push({
        ...file,
        id: fileId,
        processado: false,
        erro: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
        processado_em: new Date().toISOString()
      });
    }
  }
  
  const totalTime = (Date.now() - startTime) / 1000;
  const successCount = processedFiles.filter(f => f.processado).length;
  const errorCount = processedFiles.length - successCount;
  
  console.log(`Processamento de arquivos concluído em ${totalTime.toFixed(2)}s. ` +
              `Sucesso: ${successCount}, Falhas: ${errorCount}`);
              
  return processedFiles;
}

// Função para converter buffer de áudio para arquivo temporário
async function saveBufferToTempFile(buffer, extension = 'mp3') {
  const tempDir = path.join(__dirname, '../temp');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }
  
  const tempFile = path.join(tempDir, `audio_${Date.now()}_${Math.floor(Math.random() * 1000)}.${extension}`);
  await fs.promises.writeFile(tempFile, buffer);
  return tempFile;
}

// Função para converter áudio para formato mp3 compatível com OpenAI
async function convertAudioToMp3(inputFile) {
  return new Promise((resolve, reject) => {
    // Cria um nome de arquivo de saída único
    const outputFile = path.join(
      path.dirname(inputFile),
      `converted_${Date.now()}_${Math.floor(Math.random() * 1000)}.mp3`
    );
    
    console.log(`Convertendo áudio: ${inputFile} -> ${outputFile}`);
    
    ffmpeg()
      .input(inputFile)
      .output(outputFile)
      .audioCodec('libmp3lame')
      .audioBitrate('128k')
      .outputOptions([
        '-ar 16000',
        '-ac 1',
        '-f mp3'
      ])
      .on('start', (commandLine) => {
        console.log('Comando FFmpeg:', commandLine);
      })
      .on('end', () => {
        console.log(`Conversão concluída: ${outputFile}`);
        // Remove o arquivo de entrada após a conversão
        fs.unlink(inputFile, (err) => {
          if (err) console.warn(`Não foi possível remover arquivo temporário ${inputFile}:`, err);
        });
        resolve(outputFile);
      })
      .on('error', (err, stdout, stderr) => {
        console.error('Erro na conversão do áudio:', err);
        console.error('Saída do FFmpeg (stdout):', stdout);
        console.error('Erro do FFmpeg (stderr):', stderr);
        reject(new Error(`Falha na conversão do áudio: ${err.message}`));
      })
      .run();
  });
}

// Função para transcrever áudio usando a API da OpenAI
async function transcribeAudio(audioFilePath) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      console.warn('OPENAI_API_KEY não configurada, pulando transcrição');
      return '[Transcrição indisponível: Chave da API não configurada]';
    }
    
    console.log(`Iniciando transcrição do áudio: ${audioFilePath}`);
    
    // Verifica se o arquivo existe e tem tamanho maior que zero
    const stats = await fs.promises.stat(audioFilePath);
    if (stats.size === 0) {
      console.warn('Arquivo de áudio vazio:', audioFilePath);
      return '[Transcrição indisponível: Arquivo de áudio vazio]';
    }
    
    console.log(`Tamanho do arquivo de áudio: ${(stats.size / 1024).toFixed(2)} KB`);
    
    // Configura o tempo limite para a requisição (30 segundos)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);
    
    try {
      const transcription = await openai.audio.transcriptions.create(
        {
          file: fs.createReadStream(audioFilePath),
          model: 'whisper-1',
          language: 'pt', // Idioma português
          response_format: 'text',
        },
        {
          signal: controller.signal,
          maxBodyLength: 1024 * 1024 * 10, // 10MB
          timeout: 30000 // 30 segundos
        }
      );
      
      clearTimeout(timeoutId);
      
      if (!transcription) {
        console.warn('Transcrição retornou vazia');
        return '[Transcrição indisponível: Resposta vazia da API]';
      }
      
      console.log('Transcrição concluída com sucesso');
      return transcription.toString().trim();
      
    } catch (apiError) {
      clearTimeout(timeoutId);
      
      if (apiError.name === 'AbortError') {
        console.error('Tempo limite excedido ao transcrever áudio');
        return '[Transcrição indisponível: Tempo limite excedido]';
      }
      
      if (apiError.response) {
        // Erro da API da OpenAI
        console.error('Erro na API da OpenAI:', {
          status: apiError.response.status,
          statusText: apiError.response.statusText,
          data: apiError.response.data
        });
      } else if (apiError.request) {
        // Erro de requisição (sem resposta)
        console.error('Erro na requisição para a API da OpenAI:', {
          message: apiError.message,
          code: apiError.code
        });
      } else {
        // Outros erros
        console.error('Erro ao configurar a requisição para a API da OpenAI:', apiError.message);
      }
      
      return `[Erro na transcrição: ${apiError.message || 'Erro desconhecido'}]`;
    }
    
  } catch (error) {
    console.error('Erro ao transcrever áudio:', {
      message: error.message,
      stack: error.stack,
      filePath: audioFilePath,
      fileExists: fs.existsSync(audioFilePath)
    });
    
    return `[Erro na transcrição: ${error.message || 'Erro desconhecido'}]`;
  }
}

// Função para processar áudios com transcrição
async function processAudios(audios) {
  const processedAudios = [];
  
  for (const audio of audios) {
    console.log(`Processando áudio: ${audio.id}`);
    let tempFile, mp3File;
    
    try {
      if (!audio.url) {
        console.warn(`Áudio ${audio.id} não tem URL, pulando...`);
        continue;
      }
      
      // Baixar o arquivo de áudio
      console.log(`Baixando áudio de: ${audio.url}`);
      const fileData = await downloadFile(audio.url);
      if (!fileData || !fileData.data) {
        console.warn(`Não foi possível baixar o áudio ${audio.id}: dados inválidos`);
        continue;
      }
      
      // Converter para base64 para armazenamento
      const base64Data = convertToBase64(fileData.data, fileData.contentType);
      
      try {
        // Salvar em arquivo temporário
        const extension = audio.file_name ? path.extname(audio.file_name).substring(1) || 'mp3' : 'mp3';
        tempFile = await saveBufferToTempFile(fileData.data, extension);
        console.log(`Áudio salvo temporariamente em: ${tempFile}`);
        
        // Converter para MP3 se necessário
        mp3File = await convertAudioToMp3(tempFile);
        
        // Transcrever o áudio
        console.log(`Transcrevendo áudio: ${mp3File}`);
        const transcricao = await transcribeAudio(mp3File);
        
        processedAudios.push({
          ...audio,
          base64: base64Data,
          transcricao: transcricao || '[Transcrição indisponível]',
          processado: true,
          tamanho: fileData.data.length,
          contentType: fileData.contentType
        });
        
      } catch (processError) {
        console.error(`Erro ao processar áudio ${audio.id}:`, processError);
        // Adiciona o áudio mesmo sem transcrição
        processedAudios.push({
          ...audio,
          base64: base64Data,
          transcricao: '[Erro ao processar áudio]',
          processado: false,
          erro: processError.message
        });
      }
      
    } catch (error) {
      console.error(`Erro ao processar áudio ${audio.id}:`, error);
      processedAudios.push({
        ...audio,
        processado: false,
        erro: error.message
      });
    } finally {
      // Limpeza de arquivos temporários
      const cleanup = async (file) => {
        if (file && fs.existsSync(file)) {
          try {
            await fs.promises.unlink(file);
          } catch (e) {
            console.warn(`Não foi possível remover arquivo temporário ${file}:`, e.message);
          }
        }
      };
      
      if (tempFile) await cleanup(tempFile);
      if (mp3File) await cleanup(mp3File);
    }
  }
  
  console.log(`Processamento de áudios concluído. ${processedAudios.length} de ${audios.length} processados com sucesso.`);
  return processedAudios;
}

// Função para criar Deal no Pipedrive
async function createDeal(contactData) {
  try {
    // Preparar dados para o Deal
    const dealData = {
      title: contactData.nome || 'Novo contato',
      stage_id: 1,
      status: 'open',
      // Campo personalizado para o processo
      '7209652e4af718728421f8d2a551f083a619649c': contactData.processo || ''
    };
    
    // Adicionar telefone ao título se disponível
    if (contactData.telefone) {
      dealData.title = `${dealData.title} - ${contactData.telefone}`;
    }
    
    console.log('Criando Deal com dados:', JSON.stringify(dealData, null, 2));
    
    const response = await axios.post(
      `${process.env.PIPEDRIVE_BASE_URL}/deals`,
      dealData,
      {
        params: { api_token: process.env.PIPEDRIVE_API_TOKEN }
      }
    );
    
    return response.data.data;
  } catch (error) {
    console.error('Erro ao criar Deal no Pipedrive:', error.message);
    throw error;
  }
}

// Função para criar Pessoa no Pipedrive
async function createPerson(contactData) {
  try {
    // Preparar dados da pessoa com campos personalizados usando os IDs corretos
    const personData = {
      name: contactData.nome || 'Contato sem nome',
      visible_to: 3,
      // Campos personalizados com IDs específicos
      'e3c63a9658469cbb216157a807cadcf263637383': contactData.cpf || '',
      '9b53e2463b25750ca6aac638b394d24dc1510b74': contactData.profisso || ''
    };
    
    // Adicionar email se disponível
    if (contactData.email) {
      personData.email = [{ value: contactData.email, primary: true }];
    }
    
    // Adicionar telefone se disponível
    if (contactData.telefone) {
      personData.phone = [{ value: contactData.telefone, primary: true }];
    }
    
    console.log('Criando Pessoa com dados:', JSON.stringify(personData, null, 2));
    
    const response = await axios.post(
      `${process.env.PIPEDRIVE_BASE_URL}/persons`,
      personData,
      {
        params: { api_token: process.env.PIPEDRIVE_API_TOKEN }
      }
    );
    
    return response.data.data;
  } catch (error) {
    console.error('Erro ao criar Pessoa no Pipedrive:', error.message);
    throw error;
  }
}

// Função para buscar Organização no Pipedrive
async function findOrganization(companyName) {
  if (!companyName) return null;
  
  try {
    console.log(`Buscando organização com nome: ${companyName}`);
    
    const response = await axios.get(
      `${process.env.PIPEDRIVE_BASE_URL}/organizations/search`,
      {
        params: { 
          term: companyName,
          exact_match: true,
          api_token: process.env.PIPEDRIVE_API_TOKEN 
        }
      }
    );
    
    // Verificar se encontrou alguma organização
    if (response.data.data && response.data.data.items && response.data.data.items.length > 0) {
      const organization = response.data.data.items[0].item;
      console.log(`Organização encontrada com ID: ${organization.id}`);
      return organization;
    }
    
    console.log('Nenhuma organização encontrada com esse nome');
    return null;
  } catch (error) {
    console.error('Erro ao buscar Organização no Pipedrive:', error.message);
    return null; // Retorna null em caso de erro para permitir a criação
  }
}

// Função para criar Organização no Pipedrive
async function createOrganization(contactData) {
  try {
    // Determinar o nome da empresa a partir dos campos disponíveis
    const companyName = contactData.empresa || '';
    if (!companyName) {
      console.warn('Nome da empresa não fornecido, não é possível criar organização');
      return null;
    }
    
    // Verificar se a organização já existe
    const existingOrg = await findOrganization(companyName);
    if (existingOrg) {
      console.log(`Usando organização existente com ID: ${existingOrg.id}`);
      return existingOrg;
    }
    
    // Criar nova organização se não existir
    console.log(`Criando nova organização: ${companyName}`);
    const response = await axios.post(
      `${process.env.PIPEDRIVE_BASE_URL}/organizations`,
      {
        name: companyName,
        visible_to: 3
      },
      {
        params: { api_token: process.env.PIPEDRIVE_API_TOKEN }
      }
    );
    
    console.log(`Nova organização criada com ID: ${response.data.data.id}`);
    return response.data.data;
  } catch (error) {
    console.error('Erro ao criar Organização no Pipedrive:', error.message);
    throw error;
  }
}

// Função para atualizar Deal com relações
async function updateDealRelations(dealId, personId, organizationId) {
  try {
    if (!dealId) {
      console.error('ID do Deal não fornecido para atualização de relações');
      return;
    }
    
    // Preparar dados para atualização
    const updateData = {};
    
    // Adicionar person_id se disponível
    if (personId) {
      updateData.person_id = personId;
    }
    
    // Adicionar org_id se disponível
    if (organizationId) {
      updateData.org_id = organizationId;
    }
    
    // Se não há dados para atualizar, retornar
    if (Object.keys(updateData).length === 0) {
      console.log('Nenhum dado de relação para atualizar no Deal');
      return;
    }
    
    console.log(`Atualizando Deal ${dealId} com relações:`, JSON.stringify(updateData, null, 2));
    
    await axios.put(
      `${process.env.PIPEDRIVE_BASE_URL}/deals/${dealId}`,
      updateData,
      {
        params: { api_token: process.env.PIPEDRIVE_API_TOKEN }
      }
    );
    
    console.log(`Deal ${dealId} atualizado com sucesso`);
  } catch (error) {
    console.error('Erro ao atualizar Deal com relações:', error.message);
    throw error;
  }
}

// Função para atualizar contato no Chatwoot com ID do Deal
async function updateChatwootContact(contactId, dealId) {
  try {
    await axios.put(
      `${process.env.CHATWOOT_BASE_URL}/api/v1/accounts/3/contacts/${contactId}`,
      {
        custom_attributes: {
          id_deal_pipedrive: dealId
        }
      },
      {
        headers: {
          api_access_token: process.env.CHATWOOT_API_TOKEN
        }
      }
    );
  } catch (error) {
    console.error('Erro ao atualizar contato no Chatwoot:', error.message);
    throw error;
  }
}

// Função para formatar mensagens para nota do Pipedrive
function formatNotaTexto(messages) {
  let nota = '📝 Histórico da Conversa com Cliente via Chatwoot\n\n';
  
  // Ordenar mensagens por data
  const sortedMessages = [...messages];
  sortedMessages.sort((a, b) => (a.created_at || 0) - (b.created_at || 0));
  
  // Contar tipos de mensagens para resumo
  const tiposMensagens = {
    texto: 0,
    imagem: 0,
    audio: 0,
    arquivo: 0
  };
  
  // Formatar cada mensagem
  for (const msg of sortedMessages) {
    const data = formatarData(msg.created_at);
    const remetente = msg.sender || 'Desconhecido';
    
    if (msg.type === 'audio') {
      tiposMensagens.audio++;
      nota += `[${data}] ${remetente} (áudio): ${msg.file_name || 'Mensagem de voz'}\n`;
      if (msg.transcricao) {
        nota += `    Transcrição: "${msg.transcricao}"\n\n`;
      } else {
        nota += '\n';
      }
    } else if (msg.type === 'image') {
      tiposMensagens.imagem++;
      nota += `[${data}] ${remetente} (imagem): ${msg.file_name || 'Imagem'} [anexada ao Deal]\n\n`;
    } else if (msg.type === 'file') {
      tiposMensagens.arquivo++;
      nota += `[${data}] ${remetente} (arquivo): ${msg.file_name || 'Arquivo'} ${msg.extension ? '.' + msg.extension : ''} [anexado ao Deal]\n\n`;
    } else if (msg.content) {
      tiposMensagens.texto++;
      nota += `[${data}] ${remetente}: ${msg.content}\n\n`;
    } else {
      nota += `[${data}] ${remetente}: (mensagem não reconhecida)\n\n`;
    }
  }
  
  // Adicionar resumo no final
  if (messages.length > 0) {
    nota += '\n---\n';
    nota += `Resumo da conversa: ${messages.length} mensagens no total`;
    if (tiposMensagens.texto > 0) nota += `, ${tiposMensagens.texto} mensagens de texto`;
    if (tiposMensagens.imagem > 0) nota += `, ${tiposMensagens.imagem} imagens`;
    if (tiposMensagens.audio > 0) nota += `, ${tiposMensagens.audio} áudios`;
    if (tiposMensagens.arquivo > 0) nota += `, ${tiposMensagens.arquivo} arquivos`;
  }
  
  return nota.trim();
}

// Função para formatar timestamp
function formatarData(timestamp) {
  if (!timestamp) return 'Data desconhecida';
  const date = new Date(timestamp * 1000); // timestamp do Chatwoot é em segundos
  return date.toLocaleString('pt-BR');
}

// Função para criar nota no Pipedrive
async function createPipedriveNote(dealId, content) {
  try {
    console.log(`Criando nota para o Deal ${dealId}`);
    const response = await axios.post(
      `${process.env.PIPEDRIVE_BASE_URL}/notes`,
      {
        content: content,
        deal_id: dealId
      },
      {
        params: { api_token: process.env.PIPEDRIVE_API_TOKEN }
      }
    );
    
    return response.data.data;
  } catch (error) {
    console.error('Erro ao criar nota no Pipedrive:', error.message);
    throw error;
  }
}

// Função para anexar arquivo ao Deal no Pipedrive
async function attachFileToDeal(dealId, fileName, fileContent, fileType) {
  try {
    console.log(`Anexando arquivo ${fileName} ao Deal ${dealId}`);
    
    // Criar FormData para upload
    const formData = new FormData();
    
    // Extrair o tipo MIME e os dados do base64
    const matches = fileContent.match(/^data:(.+);base64,(.+)$/);
    if (!matches || matches.length !== 3) {
      throw new Error('Formato de base64 inválido');
    }
    
    const mimeType = matches[1];
    const base64Data = matches[2];
    const buffer = Buffer.from(base64Data, 'base64');
    
    // Adicionar o arquivo ao FormData
    formData.append('file', buffer, {
      filename: fileName,
      contentType: mimeType
    });
    
    // Adicionar o deal_id
    formData.append('deal_id', dealId);
    
    // Fazer a requisição para a API do Pipedrive
    const response = await axios.post(
      `${process.env.PIPEDRIVE_BASE_URL}/files`,
      formData,
      {
        params: { api_token: process.env.PIPEDRIVE_API_TOKEN },
        headers: {
          ...formData.getHeaders()
        }
      }
    );
    
    return response.data.data;
  } catch (error) {
    console.error(`Erro ao anexar arquivo ${fileName} ao Deal:`, error.message);
    return null; // Retorna null em vez de lançar erro para não interromper o fluxo
  }
}

// Endpoint que recebe o webhook do Chatwoot
app.post('/webhook', async (req, res) => {
  try {
    // Log detalhado da requisição recebida
    console.log('==================== WEBHOOK RECEBIDO ====================');
    console.log('Headers:', JSON.stringify(req.headers, null, 2));
    console.log('Body:', JSON.stringify(req.body, null, 2));
    console.log('===========================================================');
    
    // Processa o corpo da requisição
    let webhookData;
    
    // Se for um array (formato do Chatwoot), pega o primeiro item
    if (Array.isArray(req.body) && req.body.length > 0) {
      webhookData = req.body[0].body;
      console.log('Webhook processado (formato array Chatwoot):', JSON.stringify(webhookData, null, 2));
    }
    // Se for um objeto direto (para compatibilidade com testes)
    else if (req.body && typeof req.body === 'object') {
      // Se tiver a propriedade body, assume que é o formato do Chatwoot
      webhookData = req.body.body || req.body;
      console.log('Webhook processado (formato objeto):', JSON.stringify(webhookData, null, 2));
    }
    // Se for uma string JSON
    else if (typeof req.body === 'string') {
      try {
        const parsedBody = JSON.parse(req.body);
        webhookData = Array.isArray(parsedBody) ? parsedBody[0]?.body : (parsedBody.body || parsedBody);
        console.log('Webhook processado (formato string JSON):', JSON.stringify(webhookData, null, 2));
      } catch (e) {
        console.error('Erro ao fazer parse do JSON:', e);
        return res.status(400).json({ status: 'erro', motivo: 'Formato JSON inválido' });
      }
    }
    
    if (!webhookData) {
      console.error('Não foi possível processar os dados do webhook');
      return res.status(400).json({ status: 'erro', motivo: 'Formato de webhook não suportado' });
    }
    
    // Verifica se o status é "resolved"
    if (webhookData.status !== 'resolved') {
      console.log(`Status da conversa é ${webhookData.status || 'undefined'}, não "resolved". Ignorando.`);
      return res.json({ 
        status: 'ignorado', 
        motivo: 'Status não é resolved',
        conversation_id: webhookData.id || 'desconhecido'
      });
    }
    
    // Extrai dados importantes
    const conversationId = webhookData.id;
    if (!conversationId) {
      console.error('ID da conversa não encontrado no webhook');
      return res.status(400).json({ 
        status: 'erro', 
        motivo: 'ID da conversa não encontrado' 
      });
    }
    
    const contactId = webhookData.meta?.sender?.id || webhookData.meta?.contact?.id;
    if (!contactId) {
      console.warn('ID do contato não encontrado no webhook, continuando mesmo assim');
    }
    
    const contactData = extractContactData(webhookData);
    console.log('Dados do contato extraídos:', JSON.stringify(contactData, null, 2));
    
    // Busca histórico completo de mensagens
    const accountId = webhookData.account_id || webhookData.account?.id || webhookData.inbox_id;
    if (!accountId) {
      console.error('ID da conta não encontrado no webhook. Campos disponíveis:', {
        account_id: webhookData.account_id,
        account: webhookData.account,
        inbox_id: webhookData.inbox_id,
        body_keys: Object.keys(webhookData)
      });
      return res.status(400).json({ 
        status: 'erro', 
        motivo: 'ID da conta não encontrado no webhook',
        campos_disponiveis: Object.keys(webhookData)
      });
    }
    
    console.log(`Buscando histórico completo da conversa ${conversationId} na conta/inbox ${accountId}...`);
    const chatwootMessages = await getChatwootMessages(conversationId, accountId);
    console.log(`Encontradas ${chatwootMessages.length} mensagens no histórico`);
    
    // Filtra e organiza mensagens por tipo
    const { messagesByType, allMessages } = filterMessages(chatwootMessages);
    
    // Verifica se já existe um Deal no Pipedrive
    let dealId = contactData.id_pipedrive;
    let personId, organizationId;
    
    // Verificar também no histórico de mensagens se alguma mensagem contém o id_deal_pipedrive
    if (!dealId) {
      console.log('ID do Deal não encontrado nos dados do contato, procurando nas mensagens...');
      // Procurar nas mensagens do histórico
      for (const message of chatwootMessages) {
        if (message.sender?.custom_attributes?.id_deal_pipedrive) {
          dealId = message.sender.custom_attributes.id_deal_pipedrive;
          console.log(`Encontrado dealId ${dealId} nas mensagens do histórico`);
          break;
        }
      }
    }
    
    // Fluxo de criação ou atualização no Pipedrive
    try {
      if (!dealId) {
        console.log('Nenhum dealId encontrado, criando novas entidades no Pipedrive');
        
        // Verifica se temos dados mínimos para criar entidades
        if (!contactData.nome && !contactData.telefone) {
          console.warn('Dados insuficientes para criar entidades no Pipedrive');
        } else {
          // Cria Deal no Pipedrive
          const dealData = await createDeal(contactData);
          dealId = dealData.id;
          console.log(`Novo Deal criado com ID: ${dealId}`);
          
          // Cria Pessoa no Pipedrive
          const personData = await createPerson(contactData);
          personId = personData.id;
          console.log(`Nova Pessoa criada com ID: ${personId}`);
          
          // Busca ou cria Organização no Pipedrive
          let orgData = null;
          if (contactData.empresa) {
            orgData = await createOrganization(contactData);
            if (orgData) {
              organizationId = orgData.id;
              console.log(`Organização ${orgData.id} (${orgData.name}) será vinculada ao Deal`);
            }
          }
          
          // Vincula entidades
          await updateDealRelations(dealId, personId, organizationId);
          console.log('Entidades vinculadas com sucesso');
          
          // Atualiza contato no Chatwoot com ID do Deal
          if (contactId) {
            await updateChatwootContact(contactId, dealId);
            console.log(`Contato ${contactId} atualizado no Chatwoot com dealId ${dealId}`);
          } else {
            console.warn('Não foi possível atualizar o contato no Chatwoot (ID ausente)');
          }
        }
      } else {
        console.log(`Usando dealId existente: ${dealId}`);
      }
    } catch (pipedriveError) {
      console.error('Erro ao interagir com o Pipedrive:', pipedriveError);
      // Continuamos mesmo com erro para tentar criar a nota
    }
    
    // Se não temos um dealId, não podemos criar a nota
    if (!dealId) {
      console.error('Não foi possível obter ou criar um Deal ID');
      return res.status(400).json({ 
        status: 'erro', 
        motivo: 'Não foi possível obter ou criar um Deal ID' 
      });
    }
    
    // Processa as mídias antes de criar a nota
    console.log('Iniciando processamento de mídias...');
    
    // Processar imagens
    let processedImages = [];
    if (messagesByType.image && messagesByType.image.length > 0) {
      console.log(`Processando ${messagesByType.image.length} imagens...`);
      processedImages = await processImages(messagesByType.image);
      console.log(`${processedImages.length} imagens processadas com sucesso`);
    }
    
    // Processar áudios
    let processedAudios = [];
    if (messagesByType.audio && messagesByType.audio.length > 0) {
      console.log(`Processando ${messagesByType.audio.length} áudios...`);
      processedAudios = await processAudios(messagesByType.audio);
      console.log(`${processedAudios.length} áudios processados com sucesso`);
    }
    
    // Processar arquivos
    let processedFiles = [];
    if (messagesByType.file && messagesByType.file.length > 0) {
      console.log(`Processando ${messagesByType.file.length} arquivos...`);
      processedFiles = await processFiles(messagesByType.file);
      console.log(`${processedFiles.length} arquivos processados com sucesso`);
    }
    
    // Prepara todas as mensagens para criar nota
    const todasMensagens = [
      ...messagesByType.text.map(msg => ({ ...msg, type: 'text' })),
      ...processedImages.map(msg => ({ ...msg, type: 'image' })),
      ...processedAudios.map(msg => ({ ...msg, type: 'audio' })),
      ...processedFiles.map(msg => ({ ...msg, type: 'file' }))
    ];
    
    // Ordenar mensagens por data de criação
    todasMensagens.sort((a, b) => (a.created_at || 0) - (b.created_at || 0));
    
    // Pulamos a criação da nota de texto, já que o PDF conterá todo o histórico
    console.log('Pulando criação de nota de texto, pois o PDF conterá todo o histórico');
    
    // Gerar PDF com o histórico completo da conversa (incluindo imagens e documentos)
    console.log('Gerando PDF com o histórico completo da conversa...');
    try {
      // Criar um único documento PDF com todo o conteúdo
      console.log('Preparando mensagens para o PDF completo...');
      
      // Criar uma nota de texto resumida para o Pipedrive (apenas para referência rápida)
      const notaResumo = `Conversa com ${contactData.nome || 'Cliente'} finalizada em ${new Date().toLocaleString('pt-BR')}. ` +
                        `Conteúdo completo disponível no documento PDF anexado a este Deal.`;
      
      try {
        await createPipedriveNote(dealId, notaResumo);
        console.log('Nota resumida criada com sucesso no Pipedrive');
      } catch (noteError) {
        console.error('Erro ao criar nota resumida:', noteError.message);
      }
      
      // Gerar o PDF com todas as mensagens, imagens e documentos
      const pdfPath = await generateConversationPDF(todasMensagens, contactData);
      console.log(`PDF completo gerado com sucesso: ${pdfPath}`);
      
      // Converter o PDF para base64 para anexar ao Deal
      const pdfBuffer = fs.readFileSync(pdfPath);
      const pdfBase64 = `data:application/pdf;base64,${pdfBuffer.toString('base64')}`;
      
      // Anexar o PDF ao Deal como documento principal
      const pdfFileName = `Conversa_Completa_${contactData.nome || 'Cliente'}_${new Date().toLocaleDateString('pt-BR').replace(/\//g, '-')}.pdf`;
      const pdfData = await attachFileToDeal(dealId, pdfFileName, pdfBase64, 'application/pdf');
      
      if (pdfData) {
        console.log(`PDF completo anexado com sucesso ao Deal com ID: ${pdfData.id}`);
      } else {
        console.error('Erro ao anexar PDF completo ao Deal');
      }
      
      // Remover arquivo temporário
      fs.unlinkSync(pdfPath);
      
    } catch (pdfError) {
      console.error('Erro ao gerar ou anexar PDF:', pdfError);
      // Se falhar a geração do PDF, criar uma nota tradicional como fallback
      try {
        const notaFormatada = formatNotaTexto(todasMensagens);
        await createPipedriveNote(dealId, notaFormatada);
        console.log('Nota de fallback criada com sucesso no Pipedrive');
      } catch (fallbackError) {
        console.error('Erro ao criar nota de fallback:', fallbackError.message);
      }
    }
    
    // Anexar apenas arquivos que não puderam ser incorporados no PDF
    // Por exemplo, arquivos muito grandes ou formatos não suportados
    const anexos = [];
    
    // Para áudios, não anexamos o arquivo, apenas adicionamos a transcrição no PDF
    // Pipedrive não aceita arquivos MP3/MP4, então usamos apenas a transcrição
    console.log(`${processedAudios.length} áudios foram transcritos e incluídos no PDF`);
    
    // Anexar apenas arquivos grandes ou formatos especiais que não puderam ser incorporados no PDF
    for (const file of processedFiles) {
      // Verificar se é um arquivo que deve ser anexado separadamente
      // Arquivos como .doc, .xls, ou arquivos muito grandes
      const isSpecialFormat = file.file_type === 'document' || 
                            file.file_type === 'spreadsheet' ||
                            (file.size && parseInt(file.size) > 5 * 1024 * 1024); // > 5MB
      
      if (file.base64 && isSpecialFormat) {
        try {
          const extension = file.extension || 'pdf';
          const fileName = `${file.file_name || 'arquivo'}_${file.id}.${extension}`;
          const fileData = await attachFileToDeal(dealId, fileName, file.base64, file.content_type || 'application/octet-stream');
          if (fileData) {
            anexos.push({
              tipo: file.file_type || 'arquivo',
              id: fileData.id,
              nome: fileName
            });
            console.log(`Arquivo ${fileName} anexado separadamente ao Deal`);
          }
        } catch (error) {
          console.error(`Erro ao anexar arquivo ${file.id}:`, error.message);
        }
      }
    }
    
    console.log(`Total de anexos adicionais ao Deal: ${anexos.length}`);
    
    // Resposta de sucesso
    return res.json({ 
      status: 'sucesso', 
      mensagens: allMessages.length,
      dealId: dealId,
      anexos: anexos.length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Erro ao processar webhook:', error);
    res.status(500).json({ 
      erro: 'Erro ao processar conversa',
      detalhes: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Rota de verificação de saúde
app.get('/health', (req, res) => {
  console.log('Health check solicitado:', new Date().toISOString());
  res.json({ status: 'ok' });
});

// Rota de teste para webhook
app.get('/test-webhook', (req, res) => {
  console.log('Teste de webhook solicitado:', new Date().toISOString());
  res.json({ 
    status: 'ok', 
    message: 'Endpoint de teste do webhook está funcionando. Use POST /webhook para enviar dados reais.'
  });
});

// Inicia servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});

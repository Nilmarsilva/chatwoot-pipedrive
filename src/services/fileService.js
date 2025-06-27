/**
 * Serviço para processamento de arquivos
 */
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const sharp = require('sharp');
const { logToFile } = require('../utils/fileUtils');
const { convertToBase64, getMimeTypeFromExtension } = require('../utils/fileUtils');
const config = require('../config/config');

/**
 * Baixa arquivo de URL com tratamento de erros e retentativas
 * @param {string} url - URL do arquivo para download
 * @param {number} maxRetries - Número máximo de tentativas
 * @param {number} timeout - Timeout em milissegundos
 * @returns {Object|null} Objeto com dados do arquivo ou null em caso de falha
 */
async function downloadFile(url, maxRetries = 2, timeout = 30000) {
  let lastError;
  
  // Configuração de cabeçalhos para autenticação no Chatwoot, se necessário
  const headers = {};
  if (config.CHATWOOT_API_TOKEN) {
    headers['api_access_token'] = config.CHATWOOT_API_TOKEN;
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
  logToFile('Erro de download', {
    url,
    error: lastError?.message || 'Erro desconhecido',
    maxRetries
  });
  return null;
}

/**
 * Processa imagens para anexação
 * @param {Array} images - Lista de imagens para processar
 * @returns {Array} Lista de imagens processadas
 */
async function processImages(images) {
  console.log(`Iniciando processamento de ${images.length} imagens...`);
  const processedImages = [];
  const startTime = Date.now();
  
  for (const [index, image] of images.entries()) {
    const imageStartTime = Date.now();
    const imageId = image.id || `image_${index}`;
    
    console.log(`[${index + 1}/${images.length}] Processando imagem: ${imageId}`);
    
    try {
      if (!image.url) {
        throw new Error('URL da imagem não fornecida');
      }
      
      // Baixar a imagem com tratamento de erros
      console.log(`Baixando imagem ${imageId} de: ${image.url}`);
      const fileData = await downloadFile(image.url);
      
      if (!fileData || !fileData.data) {
        throw new Error('Falha ao baixar a imagem: dados inválidos');
      }
      
      const contentType = fileData.contentType || 'image/jpeg';
      const fileSize = fileData.size || fileData.data.length;
      
      console.log(`Imagem ${imageId} baixada: ${(fileSize / 1024).toFixed(2)} KB, tipo: ${contentType}`);
      
      // Extrair metadados da imagem
      let metadata = {};
      try {
        // Salvar em arquivo temporário para processamento
        const tempDir = path.join(config.TEMP_DIR || path.join(__dirname, '../../temp'));
        if (!fs.existsSync(tempDir)) {
          fs.mkdirSync(tempDir, { recursive: true });
        }
        
        const tempFile = path.join(tempDir, `img_${Date.now()}_${Math.floor(Math.random() * 1000)}.tmp`);
        await fs.promises.writeFile(tempFile, fileData.data);
        
        // Extrair metadados com sharp
        const imageInfo = await sharp(tempFile).metadata();
        metadata = {
          width: imageInfo.width,
          height: imageInfo.height,
          format: imageInfo.format,
          space: imageInfo.space,
          channels: imageInfo.channels,
          depth: imageInfo.depth,
          density: imageInfo.density,
          hasAlpha: imageInfo.hasAlpha,
          orientation: imageInfo.orientation
        };
        
        // Remover arquivo temporário
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
      logToFile('Erro ao processar imagem', {
        imageId: image.id,
        error: error.message
      });
      
      // Adiciona a imagem mesmo com erro, para manter o registro
      processedImages.push({
        ...image,
        id: imageId,
        processado: false,
        erro: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
        processado_em: new Date().toISOString()
      });
    }
  }
  
  const totalTime = (Date.now() - startTime) / 1000;
  const successCount = processedImages.filter(img => img.processado).length;
  const errorCount = processedImages.length - successCount;
  
  console.log(`Processamento de imagens concluído em ${totalTime.toFixed(2)}s. ` +
              `Sucesso: ${successCount}, Falhas: ${errorCount}`);
              
  return processedImages;
}

/**
 * Processa arquivos para anexação
 * @param {Array} files - Lista de arquivos para processar
 * @returns {Array} Lista de arquivos processados
 */
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
      logToFile('Erro ao processar arquivo', {
        fileId,
        error: error.message
      });
      
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

/**
 * Converte buffer de áudio para arquivo temporário
 * @param {Buffer} buffer - Buffer do áudio
 * @param {string} extension - Extensão do arquivo
 * @returns {string} Caminho do arquivo temporário
 */
async function saveBufferToTempFile(buffer, extension = 'mp3') {
  const tempDir = path.join(config.TEMP_DIR || path.join(__dirname, '../../temp'));
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }
  
  const tempFile = path.join(tempDir, `audio_${Date.now()}_${Math.floor(Math.random() * 1000)}.${extension}`);
  await fs.promises.writeFile(tempFile, buffer);
  return tempFile;
}

module.exports = {
  downloadFile,
  processImages,
  processFiles,
  saveBufferToTempFile
};

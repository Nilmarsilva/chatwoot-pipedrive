/**
 * Utilitários para manipulação de arquivos
 */
const fs = require('fs');
const path = require('path');
const config = require('../config/config');

/**
 * Cria um diretório se ele não existir
 * @param {string} dirPath - Caminho do diretório
 * @returns {string} Caminho do diretório criado
 */
function createDirIfNotExists(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
  return dirPath;
}

/**
 * Cria um diretório temporário com nome único
 * @returns {string} Caminho do diretório temporário
 */
function createTempDir() {
  const tempDir = path.join(config.file.tempDir, `temp_${Date.now()}`);
  return createDirIfNotExists(tempDir);
}

/**
 * Salva um buffer em um arquivo temporário
 * @param {Buffer} buffer - Buffer do arquivo
 * @param {string} extension - Extensão do arquivo
 * @returns {string} Caminho do arquivo temporário
 */
function saveBufferToTempFile(buffer, extension = 'tmp') {
  const tempDir = createDirIfNotExists(config.file.tempDir);
  const tempFilePath = path.join(tempDir, `temp_${Date.now()}.${extension}`);
  fs.writeFileSync(tempFilePath, buffer);
  return tempFilePath;
}

/**
 * Converte um buffer para base64
 * @param {Buffer} buffer - Buffer do arquivo
 * @param {string} contentType - Tipo de conteúdo MIME
 * @returns {string} String base64
 */
function convertToBase64(buffer, contentType) {
  return `data:${contentType};base64,${buffer.toString('base64')}`;
}

/**
 * Mapeia tipo MIME para extensão de arquivo
 * @param {string} mimeType - Tipo MIME
 * @returns {string} Extensão de arquivo
 */
function getMimeToExtension(mimeType) {
  const mimeToExt = {
    // Documentos
    'application/pdf': 'pdf',
    'application/msword': 'doc',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
    'text/plain': 'txt',
    'application/rtf': 'rtf',
    'application/vnd.oasis.opendocument.text': 'odt',
    'text/markdown': 'md',
    'application/vnd.apple.pages': 'pages',
    
    // Planilhas
    'application/vnd.ms-excel': 'xls',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
    'text/csv': 'csv',
    'application/vnd.oasis.opendocument.spreadsheet': 'ods',
    'application/vnd.apple.numbers': 'numbers',
    
    // Apresentações
    'application/vnd.ms-powerpoint': 'ppt',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
    'application/vnd.oasis.opendocument.presentation': 'odp',
    'application/vnd.apple.keynote': 'key',
    
    // Imagens
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/gif': 'gif',
    'image/bmp': 'bmp',
    'image/webp': 'webp',
    'image/svg+xml': 'svg',
    'image/tiff': 'tiff',
    'image/heic': 'heic',
    'image/heif': 'heif',
    
    // Compactados
    'application/zip': 'zip',
    'application/x-rar-compressed': 'rar',
    'application/x-7z-compressed': '7z',
    'application/x-tar': 'tar',
    'application/gzip': 'gz',
    'application/x-bzip2': 'bz2',
    
    // Outros
    'application/json': 'json',
    'application/xml': 'xml',
    'application/sql': 'sql',
    'text/x-log': 'log',
    'audio/mpeg': 'mp3',
    'audio/wav': 'wav',
    'audio/ogg': 'ogg',
    'video/mp4': 'mp4',
    'video/webm': 'webm',
    'video/ogg': 'ogv'
  };
  
  return mimeToExt[mimeType] || 'bin'; // Retorna 'bin' como padrão se não encontrar
}

/**
 * Registra logs em arquivo
 * @param {string} message - Mensagem para log
 * @param {Object} data - Dados adicionais para log
 */
function logToFile(message, data = null) {
  const timestamp = new Date().toISOString();
  const logDir = createDirIfNotExists(config.server.logDir);
  const logFile = path.join(logDir, `app-${timestamp.split('T')[0]}.log`);
  
  let logData = `${timestamp} - ${message}\n`;
  if (data) {
    logData += `${JSON.stringify(data, null, 2)}\n`;
  }
  logData += '\n';
  
  fs.appendFileSync(logFile, logData);
}

module.exports = {
  createDirIfNotExists,
  createTempDir,
  saveBufferToTempFile,
  convertToBase64,
  getMimeToExtension,
  logToFile
};

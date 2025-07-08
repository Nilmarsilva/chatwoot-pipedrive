/**
 * Serviço para processamento de áudio
 */
const fs = require('fs');
const path = require('path');
const ffmpeg = require('fluent-ffmpeg');
const { OpenAI } = require('openai');
const { downloadFile } = require('./fileService');
const { convertToBase64, logToFile } = require('../utils/fileUtils');
const config = require('../config/config');

// Inicializar cliente OpenAI se a chave estiver disponível
const openai = config.OPENAI_API_KEY ? new OpenAI({ apiKey: config.OPENAI_API_KEY }) : null;

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

/**
 * Converte áudio para formato mp3 compatível com OpenAI
 * @param {string} inputFile - Caminho do arquivo de entrada
 * @returns {Promise<string>} Caminho do arquivo convertido
 */
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

/**
 * Transcreve áudio usando a API da OpenAI
 * @param {string} audioFilePath - Caminho do arquivo de áudio
 * @returns {Promise<string>} Texto transcrito
 */
async function transcribeAudio(audioFilePath) {
  try {
    if (!config.OPENAI_API_KEY) {
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
    
    logToFile('Erro na transcrição de áudio', {
      filePath: audioFilePath,
      error: error.message
    });
    
    return `[Erro na transcrição: ${error.message || 'Erro desconhecido'}]`;
  }
}

/**
 * Processa áudios com transcrição
 * @param {Array} audios - Lista de áudios para processar
 * @returns {Promise<Array>} Lista de áudios processados com transcrição
 */
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
        
        // Garantir que a transcrição seja armazenada em múltiplos locais para compatibilidade
        const audioProcessado = {
          ...audio,
          base64: base64Data,
          transcricao: transcricao || '[Transcrição indisponível]',
          transcript: transcricao || '[Transcrição indisponível]',  // Campo alternativo para compatibilidade
          processado: true,
          tamanho: fileData.data.length,
          contentType: fileData.contentType,
          file_type: 'audio/mpeg'  // Garantir que o tipo de arquivo seja reconhecido
        };
        
        // Adicionar transcrição aos content_attributes para compatibilidade com diferentes formatos
        if (!audioProcessado.content_attributes) {
          audioProcessado.content_attributes = {};
        }
        audioProcessado.content_attributes.transcription = transcricao || '[Transcrição indisponível]';
        
        // Adicionar ao array de áudios processados
        processedAudios.push(audioProcessado);
        
        console.log(`Áudio ${audio.id} processado com sucesso. Transcrição: ${(transcricao || '').substring(0, 50)}...`);
        
      } catch (processError) {
        console.error(`Erro ao processar áudio ${audio.id}:`, processError);
        logToFile('Erro ao processar áudio', {
          audioId: audio.id,
          error: processError.message
        });
        
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

module.exports = {
  saveBufferToTempFile,
  convertAudioToMp3,
  transcribeAudio,
  processAudios
};

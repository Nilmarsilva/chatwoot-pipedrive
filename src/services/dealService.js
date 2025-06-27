/**
 * Serviço para gerenciamento de deals no Pipedrive
 */
const { 
  createDeal, 
  createPerson, 
  findOrganization, 
  createOrganization, 
  updateDealRelations, 
  createPipedriveNote, 
  attachFileToDeal 
} = require('../api/pipedrive');
const { updateChatwootContact } = require('../api/chatwoot');
const { formatNotaTexto, combineMessages } = require('./messageService');
const { logToFile } = require('../utils/fileUtils');

/**
 * Cria um deal completo no Pipedrive com todas as relações e anexos
 * @param {Object} contactData - Dados do contato extraídos do webhook
 * @param {Object} messagesByType - Mensagens organizadas por tipo
 * @param {Array} processedImages - Imagens processadas
 * @param {Array} processedFiles - Arquivos processados
 * @param {Array} processedAudios - Áudios processados
 * @returns {Object} Informações do deal criado
 */
async function createFullDeal(contactData, messagesByType, processedImages = [], processedFiles = [], processedAudios = []) {
  try {
    console.log('Iniciando criação de Deal completo no Pipedrive');
    
    // Se já existe um ID de deal, não criar novo
    if (contactData.id_pipedrive) {
      console.log(`Deal já existe com ID: ${contactData.id_pipedrive}`);
      return { id: contactData.id_pipedrive, existente: true };
    }
    
    // 1. Criar Deal
    console.log('Criando Deal no Pipedrive');
    const deal = await createDeal(contactData);
    const dealId = deal.id;
    console.log(`Deal criado com ID: ${dealId}`);
    
    // 2. Criar Pessoa
    console.log('Criando Pessoa no Pipedrive');
    const person = await createPerson(contactData);
    const personId = person.id;
    console.log(`Pessoa criada com ID: ${personId}`);
    
    // 3. Criar ou buscar Organização se tiver empresa
    let organizationId = null;
    if (contactData.empresa) {
      console.log(`Processando organização: ${contactData.empresa}`);
      const organization = await createOrganization(contactData);
      if (organization) {
        organizationId = organization.id;
        console.log(`Organização definida com ID: ${organizationId}`);
      }
    }
    
    // 4. Atualizar Deal com relações (pessoa e organização)
    console.log('Atualizando Deal com relações');
    await updateDealRelations(dealId, personId, organizationId);
    
    // 5. Criar nota com histórico da conversa
    console.log('Criando nota com histórico da conversa');
    const allMessages = combineMessages(messagesByType);
    const notaTexto = formatNotaTexto(allMessages);
    await createPipedriveNote(dealId, notaTexto);
    
    // 6. Anexar arquivos ao Deal
    const anexos = [];
    
    // Anexar imagens
    if (processedImages && processedImages.length > 0) {
      console.log(`Anexando ${processedImages.length} imagens ao Deal ${dealId}`);
      for (const image of processedImages) {
        if (image.processado && image.base64) {
          try {
            const fileName = image.file_name || `imagem_${image.id}.${image.extension || 'jpg'}`;
            const result = await attachFileToDeal(dealId, fileName, image.base64, 'image');
            if (result) {
              anexos.push({
                tipo: 'imagem',
                nome: fileName,
                id: result.id,
                sucesso: true
              });
            }
          } catch (error) {
            console.error(`Erro ao anexar imagem ${image.id}:`, error.message);
            anexos.push({
              tipo: 'imagem',
              nome: image.file_name,
              sucesso: false,
              erro: error.message
            });
          }
        }
      }
    }
    
    // Anexar arquivos
    if (processedFiles && processedFiles.length > 0) {
      console.log(`Anexando ${processedFiles.length} arquivos ao Deal ${dealId}`);
      for (const file of processedFiles) {
        if (file.processado && file.base64) {
          try {
            const fileName = file.file_name || `arquivo_${file.id}.${file.extension || 'bin'}`;
            const result = await attachFileToDeal(dealId, fileName, file.base64, file.file_type);
            if (result) {
              anexos.push({
                tipo: file.file_type || 'arquivo',
                nome: fileName,
                id: result.id,
                sucesso: true
              });
            }
          } catch (error) {
            console.error(`Erro ao anexar arquivo ${file.id}:`, error.message);
            anexos.push({
              tipo: 'arquivo',
              nome: file.file_name,
              sucesso: false,
              erro: error.message
            });
          }
        }
      }
    }
    
    // Anexar áudios
    if (processedAudios && processedAudios.length > 0) {
      console.log(`Anexando ${processedAudios.length} áudios ao Deal ${dealId}`);
      for (const audio of processedAudios) {
        if (audio.processado && audio.base64) {
          try {
            const fileName = audio.file_name || `audio_${audio.id}.mp3`;
            const result = await attachFileToDeal(dealId, fileName, audio.base64, 'audio');
            if (result) {
              anexos.push({
                tipo: 'audio',
                nome: fileName,
                id: result.id,
                transcricao: audio.transcricao,
                sucesso: true
              });
            }
          } catch (error) {
            console.error(`Erro ao anexar áudio ${audio.id}:`, error.message);
            anexos.push({
              tipo: 'audio',
              nome: audio.file_name,
              sucesso: false,
              erro: error.message
            });
          }
        }
      }
    }
    
    // 7. Atualizar contato no Chatwoot com ID do Deal
    if (contactData.id) {
      console.log(`Atualizando contato ${contactData.id} no Chatwoot com ID do Deal ${dealId}`);
      try {
        await updateChatwootContact(contactData.id, dealId);
      } catch (error) {
        console.error('Erro ao atualizar contato no Chatwoot:', error.message);
        logToFile('Erro ao atualizar contato', {
          contactId: contactData.id,
          dealId,
          error: error.message
        });
      }
    }
    
    // Retornar informações do Deal criado
    return {
      id: dealId,
      personId,
      organizationId,
      anexos,
      existente: false
    };
    
  } catch (error) {
    console.error('Erro ao criar Deal completo:', error.message);
    logToFile('Erro ao criar Deal', {
      contactData: JSON.stringify(contactData),
      error: error.message,
      stack: error.stack
    });
    throw error;
  }
}

/**
 * Processa um webhook do Chatwoot e cria um deal no Pipedrive
 * @param {Object} webhookData - Dados do webhook do Chatwoot
 * @returns {Object} Resultado do processamento
 */
async function processWebhook(webhookData) {
  try {
    // Extrair dados do contato
    const contactData = require('./messageService').extractContactData(webhookData);
    
    // Verificar se já existe um Deal associado
    if (contactData.id_pipedrive) {
      console.log(`Contato já possui Deal associado: ${contactData.id_pipedrive}`);
      return {
        status: 'existente',
        dealId: contactData.id_pipedrive,
        contactData
      };
    }
    
    // Buscar mensagens do Chatwoot
    const chatwootApi = require('../api/chatwoot');
    const conversationId = webhookData.conversation?.id;
    
    if (!conversationId) {
      console.error('ID da conversa não encontrado no webhook');
      return {
        status: 'erro',
        motivo: 'ID da conversa não encontrado'
      };
    }
    
    // Buscar mensagens da conversa
    const messages = await chatwootApi.getChatwootMessages(conversationId);
    
    // Filtrar e organizar mensagens
    const { messagesByType } = require('./messageService').filterMessages(messages);
    
    // Processar imagens, arquivos e áudios
    const fileService = require('./fileService');
    const audioService = require('./audioService');
    
    const processedImages = await fileService.processImages(messagesByType.image);
    const processedFiles = await fileService.processFiles(messagesByType.file);
    const processedAudios = await audioService.processAudios(messagesByType.audio);
    
    // Criar Deal completo
    const dealResult = await createFullDeal(
      contactData,
      messagesByType,
      processedImages,
      processedFiles,
      processedAudios
    );
    
    return {
      status: 'sucesso',
      dealId: dealResult.id,
      dealResult,
      contactData
    };
    
  } catch (error) {
    console.error('Erro ao processar webhook:', error.message);
    logToFile('Erro ao processar webhook', {
      error: error.message,
      stack: error.stack
    });
    
    return {
      status: 'erro',
      motivo: error.message
    };
  }
}

module.exports = {
  createFullDeal,
  processWebhook
};

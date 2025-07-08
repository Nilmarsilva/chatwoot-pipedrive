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
 * Cria um Deal completo no Pipedrive com todas as informações do contato e mensagens
 * @param {Object} contactData - Dados do contato
 * @param {Object} messagesByType - Mensagens organizadas por tipo
 * @param {Array} processedImages - Imagens processadas
 * @param {Array} processedFiles - Arquivos processados
 * @param {Array} processedAudios - Áudios processados
 * @param {string} [accountId] - ID da conta do Chatwoot (opcional)
 * @returns {Promise<Object>} - Deal criado
 */
async function createFullDeal(contactData, messagesByType, processedImages = [], processedFiles = [], processedAudios = [], accountId) {
  try {
    console.log('Iniciando criação ou atualização de Deal no Pipedrive');
    
    let dealId;
    let dealExistente = false;
    
    // Se já existe um ID de deal, usar o existente
    if (contactData.id_pipedrive) {
      console.log(`Deal já existe com ID: ${contactData.id_pipedrive}`);
      dealId = contactData.id_pipedrive;
      dealExistente = true;
    } else {
      // 1. Criar Deal
      console.log('Criando novo Deal no Pipedrive');
      const deal = await createDeal(contactData);
      dealId = deal.id;
      console.log(`Deal criado com ID: ${dealId}`);
      
      // 2. Criar Pessoa
      console.log('Criando Pessoa no Pipedrive');
      const person = await createPerson(contactData);
      const personId = person.id;
      console.log(`Pessoa criada com ID: ${personId}`);
      
      // 3. Criar ou buscar Organização se tiver empresa
      let organizationId = null;
      if (contactData.empresa) {
        console.log(`Buscando organização para: ${contactData.empresa}`);
        const orgResult = await findOrganization(contactData.empresa);
        
        if (orgResult && orgResult.id) {
          organizationId = orgResult.id;
          console.log(`Organização encontrada com ID: ${organizationId}`);
        } else {
          console.log(`Criando nova organização: ${contactData.empresa}`);
          const newOrg = await createOrganization(contactData.empresa);
          organizationId = newOrg.id;
          console.log(`Organização criada com ID: ${organizationId}`);
        }
      }
      
      // 4. Atualizar relações do Deal (pessoa e organização)
      console.log('Atualizando relações do Deal');
      await updateDealRelations(dealId, personId, organizationId);
      console.log('Relações do Deal atualizadas com sucesso');
      
      // 5. Atualizar contato no Chatwoot com o ID do deal
      try {
        console.log(`Atualizando contato ${contactData.id} no Chatwoot com Deal ID: ${dealId}`);
        // Usar o ID da conta extraído do payload para atualizar o contato
        await updateChatwootContact(contactData.id, dealId, accountId);
        console.log('Contato atualizado com sucesso no Chatwoot');
      } catch (chatwootError) {
        console.error('Erro ao atualizar contato no Chatwoot:', chatwootError);
      }
    }
    
    // 4. Atualizar Deal com relações (pessoa e organização) - apenas para novos deals
    if (!dealExistente) {
      console.log('Atualizando Deal com relações');
      await updateDealRelations(dealId, personId, organizationId);
    }
    
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
            // Garantir que o nome do arquivo tenha extensão .mp3
            let fileName = audio.file_name || `audio_${audio.id}.mp3`;
            if (!fileName.toLowerCase().endsWith('.mp3')) {
              fileName = `${fileName}.mp3`;
            }
            
            // Anexar o áudio ao Deal com tipo MIME específico para áudio
            const result = await attachFileToDeal(dealId, fileName, audio.base64, 'audio/mpeg');
            
            if (result) {
              // Se o áudio foi anexado com sucesso, criar uma nota adicional com a transcrição
              if (audio.transcricao) {
                const transcricaoNota = `🎤 Transcrição do áudio: ${fileName}\n\n"${audio.transcricao}"\n\n---\nGerado automaticamente via OpenAI`;
                await createPipedriveNote(dealId, transcricaoNota);
                console.log(`✅ Nota com transcrição do áudio ${fileName} criada com sucesso`);
              }
              
              anexos.push({
                tipo: 'audio',
                nome: fileName,
                id: result.id,
                url: result.viewUrl || result.url,
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
        // Usar o ID da conta extraído do payload para atualizar o contato
        await updateChatwootContact(contactData.id, dealId, accountId);
      } catch (error) {
        console.error('Erro ao atualizar contato no Chatwoot:', error.message);
        logToFile('Erro ao atualizar contato', {
          contactId: contactData.id,
          dealId,
          error: error.message
        });
      }
    }
    
    // Retornar informações do Deal criado ou atualizado
    return {
      id: dealId,
      personId: dealExistente ? undefined : personId,
      organizationId: dealExistente ? undefined : organizationId,
      anexos,
      existente: dealExistente
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
    
    // Verificar se há ID do deal no Pipedrive em qualquer um dos campos possíveis
    // Alguns webhooks usam id_pipedrive, outros usam id_deal_pipedrive
    const dealId = contactData.id_pipedrive || contactData.id_deal_pipedrive;
    if (dealId) {
      console.log(`Contato já possui Deal associado: ${dealId}`);
      // Garantir que o ID esteja disponível em ambos os campos para consistência
      contactData.id_pipedrive = dealId;
      contactData.id_deal_pipedrive = dealId;
      // Não retornamos aqui, continuamos o processamento
    }
    
    // Buscar mensagens do Chatwoot
    const chatwootApi = require('../api/chatwoot');
    
    // Buscar o ID da conversa em diferentes locais possíveis do payload
    const conversationId = webhookData.conversation?.id || 
                          webhookData.id || 
                          webhookData.conversation_id || 
                          (webhookData.meta?.conversation ? webhookData.meta.conversation.id : null);
    
    console.log('Tentando extrair ID da conversa:', {
      'webhookData.conversation?.id': webhookData.conversation?.id,
      'webhookData.id': webhookData.id,
      'webhookData.conversation_id': webhookData.conversation_id,
      'webhookData.meta?.conversation?.id': webhookData.meta?.conversation?.id,
      'conversationId encontrado': conversationId
    });
    
    if (!conversationId) {
      console.error('ID da conversa não encontrado no webhook');
      // Registrar o payload completo para diagnóstico
      console.error('Payload do webhook:', JSON.stringify(webhookData, null, 2));
      return {
        status: 'erro',
        motivo: 'ID da conversa não encontrado'
      };
    }
    
    // Buscar mensagens da conversa
    const config = require('../config/config');
    
    // Sempre extrair o ID da conta do payload do webhook para suportar múltiplas contas
    console.log('Extraindo ID da conta do payload do webhook...');
    
    // Estratégia de extração do ID da conta em ordem de prioridade
    let accountId;
    
    // 1. Tentar extrair das mensagens (mais comum)
    if (webhookData.messages && webhookData.messages.length > 0 && webhookData.messages[0].account_id) {
      accountId = webhookData.messages[0].account_id;
      console.log(`ID da conta encontrado nas mensagens: ${accountId}`);
    }
    // 2. Tentar extrair do campo account_id direto no payload
    else if (webhookData.account_id) {
      accountId = webhookData.account_id;
      console.log(`ID da conta encontrado no campo account_id: ${accountId}`);
    }
    // 3. Tentar extrair do objeto account
    else if (webhookData.account && webhookData.account.id) {
      accountId = webhookData.account.id;
      console.log(`ID da conta encontrado no objeto account: ${accountId}`);
    }
    // 4. Tentar extrair dos metadados
    else if (webhookData.meta && webhookData.meta.account_id) {
      accountId = webhookData.meta.account_id;
      console.log(`ID da conta encontrado nos metadados: ${accountId}`);
    }
    // 5. Tentar extrair da conversa
    else if (webhookData.conversation && webhookData.conversation.account_id) {
      accountId = webhookData.conversation.account_id;
      console.log(`ID da conta encontrado na conversa: ${accountId}`);
    }
    // 6. Último recurso: usar o valor da configuração (se existir)
    else if (config.chatwoot.accountId) {
      accountId = config.chatwoot.accountId;
      console.log(`ID da conta obtido das configurações: ${accountId}`);
    }
    
    // Verificar se conseguimos obter o ID da conta
    if (!accountId) {
      console.error('ID da conta do Chatwoot não encontrado no payload');
      // Registrar o payload completo para diagnóstico
      console.error('Payload do webhook:', JSON.stringify(webhookData, null, 2));
      return {
        status: 'erro',
        motivo: 'ID da conta do Chatwoot não encontrado'
      };
    }
    
    console.log(`Buscando mensagens da conversa ${conversationId} na conta ${accountId}`);
    const messages = await chatwootApi.getChatwootMessages(conversationId, accountId);
    
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
      processedAudios,
      accountId // Passar o ID da conta para uso nas chamadas à API do Chatwoot
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

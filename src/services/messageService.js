/**
 * Serviço para processamento de mensagens
 */
const path = require('path');
const { formatarData } = require('../utils/formatters');
const { logToFile } = require('../utils/fileUtils');

/**
 * Filtra e organiza mensagens por tipo
 * @param {Array} messages - Lista de mensagens do Chatwoot
 * @returns {Object} Mensagens filtradas e organizadas por tipo
 */
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
            logToFile('Erro ao processar anexo', {
              messageId: msg.id,
              error: attachmentError.message
            });
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
      logToFile('Erro ao processar mensagem', {
        messageId: msg.id,
        error: error.message
      });
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

/**
 * Extrai dados do contato a partir dos dados do webhook
 * @param {Object} webhookData - Dados do webhook do Chatwoot
 * @returns {Object} Dados do contato extraídos
 */
function extractContactData(webhookData) {
  const meta = webhookData.meta || {};
  const contact = meta.sender || meta.contact || {};
  const customAttributes = contact.custom_attributes || {};
  const additionalAttributes = contact.additional_attributes || {};
  const webhookAttributes = webhookData.additional_attributes || {};

  // Verificar múltiplas localizações possíveis para o ID do deal
  let id_pipedrive = '';
  let id_deal_pipedrive = '';
  
  // Verificar em meta.sender.custom_attributes
  if (meta.sender?.custom_attributes?.id_deal_pipedrive) {
    id_deal_pipedrive = meta.sender.custom_attributes.id_deal_pipedrive;
  } else if (meta.sender?.custom_attributes?.id_pipedrive) {
    id_pipedrive = meta.sender.custom_attributes.id_pipedrive;
  }
  
  // Verificar em meta.contact.custom_attributes
  if (!id_deal_pipedrive && !id_pipedrive) {
    if (meta.contact?.custom_attributes?.id_deal_pipedrive) {
      id_deal_pipedrive = meta.contact.custom_attributes.id_deal_pipedrive;
    } else if (meta.contact?.custom_attributes?.id_pipedrive) {
      id_pipedrive = meta.contact.custom_attributes.id_pipedrive;
    }
  }
  
  // Verificar em additional_attributes do webhook
  if (!id_deal_pipedrive && !id_pipedrive) {
    if (webhookAttributes.id_deal_pipedrive) {
      id_deal_pipedrive = webhookAttributes.id_deal_pipedrive;
    } else if (webhookAttributes.id_pipedrive) {
      id_pipedrive = webhookAttributes.id_pipedrive;
    }
  }
  
  // Usar o primeiro ID encontrado, priorizando id_deal_pipedrive
  const dealId = id_deal_pipedrive || id_pipedrive || '';
  
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
    id_pipedrive: dealId,
    id_deal_pipedrive
  });
  
  return {
    nome,
    email,
    cpf,
    telefone,
    empresa,
    processo,
    profissao,
    id_pipedrive: dealId,
    id_deal_pipedrive: dealId,
    thumbnail: contact.thumbnail || ''
  };
}

/**
 * Formata mensagens para nota do Pipedrive
 * @param {Array} messages - Lista de mensagens
 * @returns {string} Nota formatada
 */
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
      nota += `[${data}] ${remetente} (áudio): ${msg.file_name || 'Mensagem de voz'}`;
      
      // Verificar transcrição em múltiplos locais possíveis
      let transcricao = msg.transcricao || msg.transcript || 
                        (msg.content_attributes && msg.content_attributes.transcription) || 
                        (msg.content_attributes && msg.content_attributes.transcript) || 
                        (msg.content && msg.content.includes('Transcrição:') ? msg.content : null);
      
      // Log para debug dos campos disponíveis no objeto de áudio
      console.log(`DEBUG - Objeto de áudio ${msg.id || 'desconhecido'}:`, {
        transcricao: msg.transcricao,
        transcript: msg.transcript,
        content_attributes: msg.content_attributes,
        content: msg.content && msg.content.substring(0, 50) + '...',
        keys: Object.keys(msg)
      });
      
      // Verificar se a transcrição está em algum outro campo (para compatibilidade)
      if (!transcricao && msg.content) {
        try {
          // Tentar extrair de um possível JSON no content
          const contentObj = JSON.parse(msg.content);
          transcricao = contentObj.transcricao || contentObj.transcript || contentObj.text;
        } catch (e) {
          // Não é JSON, ignorar
        }
      }
      
      if (transcricao) {
        nota += `\n    Transcrição: "${transcricao}"\n\n`;
        console.log(`✅ Transcrição de áudio incluída para mensagem ${msg.id || 'desconhecido'}: ${transcricao.substring(0, 50)}...`);
      } else {
        // Tentativa adicional de encontrar a transcrição em qualquer campo do objeto
        const allKeys = Object.keys(msg);
        for (const key of allKeys) {
          if (typeof msg[key] === 'string' && 
              (key.includes('transcr') || key.includes('text')) && 
              msg[key].length > 10) {
            transcricao = msg[key];
            nota += `\n    Transcrição: "${transcricao}"\n\n`;
            console.log(`✅ Transcrição encontrada no campo ${key}: ${transcricao.substring(0, 50)}...`);
            break;
          }
        }
        
        if (!transcricao) {
          console.log(`⚠️ Nenhuma transcrição encontrada para áudio ${msg.id || 'desconhecido'}`);
          nota += ' [Sem transcrição disponível]\n\n';
        }
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

/**
 * Combina todas as mensagens em uma única lista para processamento
 * @param {Object} messagesByType - Mensagens organizadas por tipo
 * @returns {Array} Lista combinada de mensagens
 */
function combineMessages(messagesByType) {
  // Função util para normalizar timestamp (segundos)
  const normalizeTs = (ts) => {
    if (!ts) return Math.floor(Date.now() / 1000);
    return ts > 1e12 ? Math.floor(ts / 1000) : ts; // se vier em ms, converte
  };
  const combinedMessages = [];
  
  // Adicionar mensagens de texto
  messagesByType.text.forEach(msg => {
    combinedMessages.push({
       ...msg,
       type: 'text',
       created_at: normalizeTs(msg.created_at)
     });
  });
  
  // Adicionar imagens
  messagesByType.image.forEach(msg => {
    combinedMessages.push({
       ...msg,
       type: 'image',
       created_at: normalizeTs(msg.created_at)
     });
  });
  
  // Adicionar áudios
  messagesByType.audio.forEach(msg => {
    // Log para debug do objeto de áudio antes de combinar
    console.log(`DEBUG - Objeto de áudio antes de combinar:`, {
      id: msg.id,
      transcricao: msg.transcricao,
      transcript: msg.transcript,
      content_attributes: msg.content_attributes,
      keys: Object.keys(msg)
    });
    
    // Garantir que a transcrição seja passada corretamente
    const audioMsg = {
       ...msg,
       type: 'audio',
       created_at: normalizeTs(msg.created_at),
      // Garantir que a transcrição esteja disponível em múltiplos campos para compatibilidade
      transcricao: msg.transcricao || msg.transcript || 
                  (msg.content_attributes && msg.content_attributes.transcription) || 
                  (msg.content_attributes && msg.content_attributes.transcript)
    };
    
    // Se ainda não encontrou transcrição, procurar em qualquer campo
    if (!audioMsg.transcricao) {
      const allKeys = Object.keys(msg);
      for (const key of allKeys) {
        if (typeof msg[key] === 'string' && 
            (key.includes('transcr') || key.includes('text')) && 
            msg[key].length > 10) {
          audioMsg.transcricao = msg[key];
          console.log(`Transcrição encontrada no campo ${key}: ${msg[key].substring(0, 50)}...`);
          break;
        }
      }
    }
    
    // Adicionar o objeto de áudio com transcrição garantida
    combinedMessages.push(audioMsg);
  });
  
  // Adicionar arquivos
  messagesByType.file.forEach(msg => {
    combinedMessages.push({
       ...msg,
       type: 'file',
       created_at: normalizeTs(msg.created_at)
     });
  });
  
  // Ordenar por data (mais antigo primeiro)
   combinedMessages.sort((a, b) => (a.created_at || 0) - (b.created_at || 0));
   return combinedMessages;
}

module.exports = {
  filterMessages,
  extractContactData,
  formatNotaTexto,
  combineMessages
};

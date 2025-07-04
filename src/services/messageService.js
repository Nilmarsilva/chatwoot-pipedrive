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
      nota += `[${data}] ${remetente} (áudio): ${msg.file_name || 'Mensagem de voz'}\n`;
      if (msg.transcricao) {
        nota += `    Transcrição: "${msg.transcricao}"\n\n`;
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

/**
 * Combina todas as mensagens em uma única lista para processamento
 * @param {Object} messagesByType - Mensagens organizadas por tipo
 * @returns {Array} Lista combinada de mensagens
 */
function combineMessages(messagesByType) {
  const combinedMessages = [];
  
  // Adicionar mensagens de texto
  messagesByType.text.forEach(msg => {
    combinedMessages.push({
      ...msg,
      type: 'text'
    });
  });
  
  // Adicionar imagens
  messagesByType.image.forEach(msg => {
    combinedMessages.push({
      ...msg,
      type: 'image'
    });
  });
  
  // Adicionar áudios
  messagesByType.audio.forEach(msg => {
    combinedMessages.push({
      ...msg,
      type: 'audio'
    });
  });
  
  // Adicionar arquivos
  messagesByType.file.forEach(msg => {
    combinedMessages.push({
      ...msg,
      type: 'file'
    });
  });
  
  // Ordenar por data de criação
  combinedMessages.sort((a, b) => (a.created_at || 0) - (b.created_at || 0));
  
  return combinedMessages;
}

module.exports = {
  filterMessages,
  extractContactData,
  formatNotaTexto,
  combineMessages
};

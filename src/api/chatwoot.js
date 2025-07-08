/**
 * Cliente para API do Chatwoot
 */
const axios = require('axios');
const config = require('../config/config');
const { logToFile } = require('../utils/fileUtils');

/**
 * Busca todo o histórico do Chatwoot com paginação
 * @param {string} conversationId - ID da conversa
 * @param {string} accountId - ID da conta
 * @returns {Array} Lista de mensagens
 */
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
      const baseUrl = config.chatwoot.baseUrl.endsWith('/') 
        ? config.chatwoot.baseUrl 
        : `${config.chatwoot.baseUrl}/`;
      
      // Remover barras extras para evitar duplicação
      const apiPath = `api/v1/accounts/${accountId}/conversations/${conversationId}/messages`.replace(/^\/+|\/+$/g, '');
      const fullUrl = `${baseUrl}${apiPath}`;
      
      console.log(`[Chatwoot] URL da requisição: ${fullUrl}`);
      
      // Verificar se o token de API está configurado
      if (!config.chatwoot.apiKey) {
        console.error('[Chatwoot] Token de API não configurado');
        throw new Error('Token de API do Chatwoot não configurado');
      }
      
      // Log para debug (sem mostrar o token completo)
      const apiKeyMasked = config.chatwoot.apiKey ? 
        `${config.chatwoot.apiKey.substring(0, 4)}...${config.chatwoot.apiKey.substring(config.chatwoot.apiKey.length - 4)}` : 
        'undefined';
      console.log(`[Chatwoot] Usando token de API: ${apiKeyMasked}`);
      
      const response = await axios.get(
        fullUrl,
        {
          params,
          headers: {
            'api_access_token': config.chatwoot.apiKey,
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

/**
 * Atualiza contato no Chatwoot com ID do Deal
 * @param {string} contactId - ID do contato
 * @param {string} dealId - ID do Deal
 * @param {string} [accountId] - ID da conta (opcional, usará config se não fornecido)
 * @returns {Promise<void>}
 */
async function updateChatwootContact(contactId, dealId, accountId) {
  try {
    // Verificar se o token de API está configurado
    if (!config.chatwoot.apiKey) {
      console.error('[Chatwoot] Token de API não configurado');
      throw new Error('Token de API do Chatwoot não configurado');
    }
    
    // Usar o ID da conta fornecido ou tentar usar o das configurações
    const usedAccountId = accountId || config.chatwoot.accountId;
    
    // Verificar se temos um ID de conta válido
    if (!usedAccountId) {
      console.error('[Chatwoot] ID da conta não fornecido nem configurado');
      throw new Error('ID da conta do Chatwoot não fornecido nem configurado');
    }
    
    const baseUrl = config.chatwoot.baseUrl.endsWith('/') 
      ? config.chatwoot.baseUrl 
      : `${config.chatwoot.baseUrl}/`;
    
    const apiUrl = `${baseUrl}api/v1/accounts/${usedAccountId}/contacts/${contactId}`;
    console.log(`[Chatwoot] Atualizando contato: ${apiUrl}`);
    
    await axios.put(
      apiUrl,
      {
        custom_attributes: {
          id_deal_pipedrive: dealId
        }
      },
      {
        headers: {
          api_access_token: config.chatwoot.apiKey
        }
      }
    );
    
    console.log(`[Chatwoot] Contato ${contactId} atualizado com ID do Deal ${dealId}`);
  } catch (error) {
    console.error('Erro ao atualizar contato no Chatwoot:', error.message);
    logToFile('Erro ao atualizar contato no Chatwoot', {
      contactId,
      dealId,
      error: error.message,
      response: error.response?.data
    });
    throw error;
  }
}

/**
 * Busca detalhes de uma conversa no Chatwoot
 * @param {string} conversationId - ID da conversa
 * @param {string} accountId - ID da conta
 * @returns {Object} Detalhes da conversa
 */
async function getChatwootConversation(conversationId, accountId) {
  try {
    // Verificar se o token de API está configurado
    if (!config.chatwoot.apiKey) {
      console.error('[Chatwoot] Token de API não configurado');
      throw new Error('Token de API do Chatwoot não configurado');
    }
    
    // Verificar se o ID da conta foi fornecido
    if (!accountId) {
      console.error('[Chatwoot] ID da conta não fornecido');
      throw new Error('ID da conta do Chatwoot não fornecido');
    }
    
    const baseUrl = config.chatwoot.baseUrl.endsWith('/') 
      ? config.chatwoot.baseUrl 
      : `${config.chatwoot.baseUrl}/`;
    
    const apiPath = `api/v1/accounts/${accountId}/conversations/${conversationId}`.replace(/^\/+|\/+$/g, '');
    const fullUrl = `${baseUrl}${apiPath}`;
    
    console.log(`[Chatwoot] Buscando conversa: ${fullUrl}`);
    
    // Log para debug (sem mostrar o token completo)
    const apiKeyMasked = config.chatwoot.apiKey ? 
      `${config.chatwoot.apiKey.substring(0, 4)}...${config.chatwoot.apiKey.substring(config.chatwoot.apiKey.length - 4)}` : 
      'undefined';
    console.log(`[Chatwoot] Usando token de API: ${apiKeyMasked}`);
    
    const response = await axios.get(
      fullUrl,
      {
        headers: {
          'api_access_token': config.chatwoot.apiKey,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'User-Agent': 'chatwoot-pipedrive/1.0'
        }
      }
    );
    return response.data;
  } catch (error) {
    console.error('Erro ao buscar conversa no Chatwoot:', error.message);
    logToFile('Erro ao buscar conversa no Chatwoot', {
      conversationId,
      accountId,
      error: error.message,
      response: error.response?.data
    });
    throw error;
  }
}

module.exports = {
  getChatwootMessages,
  updateChatwootContact,
  getChatwootConversation
};

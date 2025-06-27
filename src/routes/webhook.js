/**
 * Rotas para o webhook do Chatwoot
 */
const express = require('express');
const router = express.Router();
const dealService = require('../services/dealService');
const { logToFile } = require('../utils/fileUtils');

/**
 * Endpoint que recebe o webhook do Chatwoot
 */
router.post('/', async (req, res) => {
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
    
    // Verificar se é um evento de mensagem
    const isMessageEvent = webhookData.event === 'message_created';
    
    // Se não for um evento de mensagem, apenas registra e retorna sucesso
    if (!isMessageEvent) {
      console.log(`Evento ignorado: ${webhookData.event || 'desconhecido'}`);
      return res.json({ status: 'ignorado', motivo: 'Evento não é de mensagem' });
    }
    
    // Verificar se a conversa está fechada
    const isClosed = webhookData.conversation?.status === 'resolved';
    
    // Se a conversa não estiver fechada, apenas registra e retorna sucesso
    if (!isClosed) {
      console.log('Conversa ainda não está fechada, ignorando');
      return res.json({ status: 'ignorado', motivo: 'Conversa não está fechada' });
    }
    
    // Processar o webhook e criar Deal no Pipedrive
    console.log('Iniciando processamento do webhook para criação de Deal');
    
    // Responder imediatamente para não bloquear o Chatwoot
    res.json({ status: 'processando', mensagem: 'Webhook recebido, processamento iniciado' });
    
    // Continuar o processamento em background
    dealService.processWebhook(webhookData)
      .then(result => {
        console.log('Processamento do webhook concluído com sucesso:', result);
        logToFile('webhook_processado', result);
      })
      .catch(error => {
        console.error('Erro no processamento do webhook:', error);
        logToFile('erro_webhook', {
          error: error.message,
          stack: error.stack
        });
      });
    
  } catch (error) {
    console.error('Erro ao processar webhook:', error);
    logToFile('erro_webhook', {
      error: error.message,
      stack: error.stack
    });
    
    // Responder com erro apenas se ainda não tiver respondido
    if (!res.headersSent) {
      res.status(500).json({ status: 'erro', motivo: error.message });
    }
  }
});

module.exports = router;

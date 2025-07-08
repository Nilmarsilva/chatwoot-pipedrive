/**
 * Cliente para API do Pipedrive
 */
const axios = require('axios');
const FormData = require('form-data');
const config = require('../config/config');
const { logToFile } = require('../utils/fileUtils');

/**
 * Criar Deal no Pipedrive
 * @param {Object} contactData - Dados do contato
 * @returns {Object} Deal criado
 */
async function createDeal(contactData) {
  try {
    // Preparar dados para o Deal
    const dealData = {
      title: contactData.nome || 'Novo contato',
      stage_id: config.pipedrive.dealStageId || 1,
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
      `${config.pipedrive.baseUrl}/deals`,
      dealData,
      {
        params: { api_token: config.pipedrive.apiToken }
      }
    );
    
    return response.data.data;
  } catch (error) {
    console.error('Erro ao criar Deal no Pipedrive:', error.message);
    logToFile('Erro ao criar Deal no Pipedrive', {
      contactData,
      error: error.message,
      response: error.response?.data
    });
    throw error;
  }
}

/**
 * Criar Pessoa no Pipedrive
 * @param {Object} contactData - Dados do contato
 * @returns {Object} Pessoa criada
 */
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
      `${config.pipedrive.baseUrl}/persons`,
      personData,
      {
        params: { api_token: config.pipedrive.apiToken }
      }
    );
    
    return response.data.data;
  } catch (error) {
    console.error('Erro ao criar Pessoa no Pipedrive:', error.message);
    logToFile('Erro ao criar Pessoa no Pipedrive', {
      contactData,
      error: error.message,
      response: error.response?.data
    });
    throw error;
  }
}

/**
 * Buscar Organização no Pipedrive
 * @param {string} companyName - Nome da empresa
 * @returns {Object|null} Organização encontrada ou null
 */
async function findOrganization(companyName) {
  if (!companyName) return null;
  
  try {
    console.log(`Buscando organização com nome: ${companyName}`);
    
    const response = await axios.get(
      `${config.pipedrive.baseUrl}/organizations/search`,
      {
        params: { 
          term: companyName,
          exact_match: true,
          api_token: config.pipedrive.apiToken 
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
    logToFile('Erro ao buscar Organização no Pipedrive', {
      companyName,
      error: error.message,
      response: error.response?.data
    });
    return null; // Retorna null em caso de erro para permitir a criação
  }
}

/**
 * Criar Organização no Pipedrive
 * @param {Object} contactData - Dados do contato
 * @returns {Object|null} Organização criada ou null
 */
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
      `${config.pipedrive.baseUrl}/organizations`,
      {
        name: companyName,
        visible_to: 3
      },
      {
        params: { api_token: config.pipedrive.apiToken }
      }
    );
    
    console.log(`Nova organização criada com ID: ${response.data.data.id}`);
    return response.data.data;
  } catch (error) {
    console.error('Erro ao criar Organização no Pipedrive:', error.message);
    logToFile('Erro ao criar Organização no Pipedrive', {
      contactData,
      error: error.message,
      response: error.response?.data
    });
    throw error;
  }
}

/**
 * Atualizar Deal com relações
 * @param {string} dealId - ID do Deal
 * @param {string} personId - ID da Pessoa
 * @param {string} organizationId - ID da Organização
 * @returns {Promise<void>}
 */
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
      `${config.pipedrive.baseUrl}/deals/${dealId}`,
      updateData,
      {
        params: { api_token: config.pipedrive.apiToken }
      }
    );
    
    console.log(`Deal ${dealId} atualizado com sucesso`);
  } catch (error) {
    console.error('Erro ao atualizar Deal com relações:', error.message);
    logToFile('Erro ao atualizar Deal com relações', {
      dealId,
      personId,
      organizationId,
      error: error.message,
      response: error.response?.data
    });
    throw error;
  }
}

/**
 * Criar nota no Pipedrive
 * @param {string} dealId - ID do Deal
 * @param {string} content - Conteúdo da nota
 * @returns {Object} Nota criada
 */
async function createPipedriveNote(dealId, content) {
  try {
    console.log(`Criando nota para o Deal ${dealId}`);
    const response = await axios.post(
      `${config.pipedrive.baseUrl}/notes`,
      {
        content: content,
        deal_id: dealId
      },
      {
        params: { api_token: config.pipedrive.apiToken }
      }
    );
    
    return response.data.data;
  } catch (error) {
    console.error('Erro ao criar nota no Pipedrive:', error.message);
    logToFile('Erro ao criar nota no Pipedrive', {
      dealId,
      error: error.message,
      response: error.response?.data
    });
    throw error;
  }
}

/**
 * Anexar arquivo ao Deal no Pipedrive
 * @param {string} dealId - ID do Deal
 * @param {string} fileName - Nome do arquivo
 * @param {string} fileContent - Conteúdo do arquivo em base64
 * @param {string} fileType - Tipo do arquivo
 * @returns {Object|null} Arquivo anexado ou null em caso de erro
 */
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
    
    // Adicionar o arquivo ao FormData com configurações adequadas para visualização no navegador
    formData.append('file', buffer, {
      filename: fileName,
      contentType: mimeType,
      knownLength: buffer.length
    });
    
    // Adicionar campo para indicar que o arquivo deve ser visualizável no navegador
    formData.append('inline_image', '1');
    
    // Adicionar o deal_id
    formData.append('deal_id', dealId);
    
    // Fazer a requisição para a API do Pipedrive
    const response = await axios.post(
      `${config.pipedrive.baseUrl}/files`,
      formData,
      {
        params: { api_token: config.pipedrive.apiToken },
        headers: {
          ...formData.getHeaders()
        }
      }
    );
    
    // Verificar se o arquivo foi anexado com sucesso
    const fileData = response.data.data;
    if (fileData && fileData.id && fileData.active_flag) {
      console.log(`✅ Arquivo anexado com sucesso: ${fileName}`);
      console.log(`   📌 ID: ${fileData.id}`);
      
      // Configurar URL para visualização direta quando possível
      let fileUrl = fileData.url || fileData.download_url || `${config.pipedrive.baseUrl}/files/${fileData.id}`;
      
      // Para imagens e PDFs, tentar usar a URL de visualização direta
      if (mimeType.startsWith('image/') || mimeType === 'application/pdf') {
        fileUrl = fileData.url || `${config.pipedrive.baseUrl}/files/${fileData.id}/inline`;
      }
      
      console.log(`   🔗 URL: ${fileUrl}`);
      
      // Adicionar metadados adicionais ao retorno para uso posterior
      return {
        ...fileData,
        viewUrl: fileUrl,
        mimeType: mimeType
      };
    } else {
      console.error(`❌ Falha ao anexar arquivo: ${fileName}`);
      console.error(`   Resposta: ${JSON.stringify(fileData)}`);
      return null;
    }
  } catch (error) {
    console.error(`Erro ao anexar arquivo ${fileName} ao Deal:`, error.message);
    logToFile('Erro ao anexar arquivo ao Deal', {
      dealId,
      fileName,
      error: error.message,
      response: error.response?.data
    });
    return null; // Retorna null em vez de lançar erro para não interromper o fluxo
  }
}

module.exports = {
  createDeal,
  createPerson,
  findOrganization,
  createOrganization,
  updateDealRelations,
  createPipedriveNote,
  attachFileToDeal
};

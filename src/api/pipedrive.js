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
 * Anexa um arquivo a um Deal no Pipedrive
 * @param {string} dealId - ID do Deal
 * @param {string} fileName - Nome do arquivo
 * @param {string} fileContent - Conteúdo do arquivo em base64
 * @param {string} fileType - Tipo do arquivo (opcional)
 * @returns {Promise<Object>} - Dados do arquivo anexado
 */
async function attachFileToDeal(dealId, fileName, fileContent, fileType) {
  try {
    // Verificar se é um arquivo de áudio (mp3, oga, ogg, wav)
    const audioExtensions = ['mp3', 'oga', 'ogg', 'wav', 'mp4', 'webm'];
    
    // Garantir que o nome do arquivo tenha uma extensão
    let fileNameWithExt = fileName;
    let fileExt = '';
    
    // Extrair a extensão do nome do arquivo
    if (fileName.includes('.')) {
      fileExt = fileName.split('.').pop().toLowerCase();
    } else {
      // Se não tiver extensão, tentar determinar pelo tipo MIME
      if (fileType) {
        const mimeToExt = {
          'image/jpeg': 'jpg',
          'image/jpg': 'jpg',
          'image/png': 'png',
          'image/gif': 'gif',
          'application/pdf': 'pdf',
          'text/plain': 'txt',
          'application/msword': 'doc',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
          'application/vnd.ms-excel': 'xls',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx'
        };
        
        const cleanMimeType = fileType.split(';')[0].trim();
        fileExt = mimeToExt[cleanMimeType] || cleanMimeType.split('/').pop().replace(/[^a-z0-9]/g, '');
        fileNameWithExt = `${fileName}.${fileExt}`;
        console.log(`Adicionada extensão .${fileExt} ao nome do arquivo: ${fileNameWithExt}`);
      }
    }
    
    // Verificar se é um arquivo de áudio
    if (audioExtensions.includes(fileExt)) {
      console.log(`Pulando anexo de arquivo de áudio ${fileNameWithExt} - O Pipedrive não suporta anexos de áudio`);
      return null;
    }
    
    console.log(`Anexando arquivo ${fileNameWithExt} ao Deal ${dealId}`);
    
    // Criar FormData para upload
    const formData = new FormData();
    
    // Verificar se o conteúdo já está no formato data:mime;base64
    let mimeType = fileType || 'application/octet-stream';
    let buffer;
    
    console.log(`Arquivo ${fileName} ${fileContent.startsWith('data:') ? 'já está no formato data:mime;base64' : 'não está no formato data:mime;base64'}`);
    
    if (fileContent.startsWith('data:')) {
      // Extrair o tipo MIME e os dados do base64
      const matches = fileContent.match(/^data:(.+);base64,(.+)$/);
      if (!matches || matches.length !== 3) {
        throw new Error('Formato de base64 inválido');
      }
      
      mimeType = matches[1];
      const base64Data = matches[2];
      buffer = Buffer.from(base64Data, 'base64');
      console.log(`Extraiu conteúdo base64 com tipo MIME ${mimeType}: ${buffer.length} bytes`);
    } else {
      // Tentar detectar o tipo MIME pela extensão do arquivo
      if (fileName && !fileType) {
        const ext = fileName.split('.').pop().toLowerCase();
        const mimeTypes = {
          'jpg': 'image/jpeg',
          'jpeg': 'image/jpeg',
          'png': 'image/png',
          'gif': 'image/gif',
          'pdf': 'application/pdf',
          'txt': 'text/plain',
          'doc': 'application/msword',
          'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'xls': 'application/vnd.ms-excel',
          'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'ppt': 'application/vnd.ms-powerpoint',
          'pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
        };
        mimeType = mimeTypes[ext] || 'application/octet-stream';
      }
      
      // Verificar se o conteúdo é uma string base64 sem o prefixo data:mime
      try {
        buffer = Buffer.from(fileContent, 'base64');
        console.log(`Convertido conteúdo base64 para buffer: ${buffer.length} bytes`);
      } catch (error) {
        console.error(`Erro ao converter conteúdo para buffer: ${error.message}`);
        throw new Error(`Formato de arquivo inválido para ${fileName}`);
      }
    }
    
    // Adicionar o arquivo ao FormData
    formData.append('file', buffer, {
      filename: fileNameWithExt,
      contentType: mimeType,
      knownLength: buffer.length
    });
    
    // Adicionar o deal_id
    formData.append('deal_id', dealId);
    
    // Log detalhado para debug
    console.log(`Anexando arquivo ao Pipedrive:`);
    console.log(`- Nome: ${fileNameWithExt}`);
    console.log(`- Tipo MIME: ${mimeType}`);
    console.log(`- Tamanho: ${buffer.length} bytes`);
    console.log(`- Deal ID: ${dealId}`);
    console.log(`- URL: ${config.pipedrive.baseUrl}/files`);
    
    // Verificar se o token da API do Pipedrive está configurado
    if (!config.pipedrive.apiToken) {
      console.error('PIPEDRIVE_API_TOKEN não está configurado no .env');
      throw new Error('Token da API do Pipedrive não configurado');
    }
    
    // Fazer a requisição para a API do Pipedrive com retry
    let response;
    let retryCount = 0;
    const maxRetries = 3;
    
    while (retryCount < maxRetries) {
      try {
        response = await axios.post(
          `${config.pipedrive.baseUrl}/files`,
          formData,
          {
            params: { api_token: config.pipedrive.apiToken },
            headers: {
              ...formData.getHeaders()
            },
            maxContentLength: Infinity,
            maxBodyLength: Infinity
          }
        );
        break; // Se a requisição for bem-sucedida, sair do loop
      } catch (error) {
        retryCount++;
        console.error(`Tentativa ${retryCount}/${maxRetries} falhou: ${error.message}`);
        
        if (error.response) {
          console.error(`Status: ${error.response.status}`);
          console.error(`Resposta: ${JSON.stringify(error.response.data)}`);
        }
        
        if (retryCount >= maxRetries) {
          throw error; // Re-lançar o erro após todas as tentativas
        }
        
        // Esperar antes de tentar novamente (backoff exponencial)
        await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, retryCount)));
      }
    }
    
    // Verificar se o arquivo foi anexado com sucesso
    const fileData = response.data.data;
    if (fileData && fileData.id && fileData.active_flag) {
      console.log(`✅ Arquivo anexado com sucesso: ${fileNameWithExt}`);
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
        mimeType: mimeType,
        fileName: fileNameWithExt,  // Adicionar o nome do arquivo com extensão para uso posterior
        extension: fileExt          // Adicionar a extensão para uso posterior
      };
    } else {
      console.error(`❌ Falha ao anexar arquivo: ${fileNameWithExt}`);
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

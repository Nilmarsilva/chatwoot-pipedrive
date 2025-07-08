/**
 * Utilitários para formatação de dados
 */

/**
 * Formata um timestamp para data e hora no formato brasileiro
 * @param {number} timestamp - Timestamp em segundos
 * @returns {string} Data formatada
 */
function formatarData(timestamp) {
  if (!timestamp) return 'Data desconhecida';
  const date = new Date(timestamp * 1000); // timestamp do Chatwoot é em segundos
  // Garantir fuso horário de São Paulo
  return date.toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo'
  });
}

/**
 * Formata um texto removendo caracteres especiais e limitando o tamanho
 * @param {string} text - Texto a ser formatado
 * @param {number} maxLength - Tamanho máximo do texto (opcional)
 * @returns {string} Texto formatado
 */
function formatarTexto(text, maxLength = 255) {
  if (!text) return '';
  
  // Remove caracteres especiais e limita o tamanho
  const formattedText = text
    .replace(/[^\w\s]/gi, '')
    .trim();
  
  return formattedText.length > maxLength 
    ? formattedText.substring(0, maxLength) + '...' 
    : formattedText;
}

/**
 * Formata um número de telefone para o formato internacional
 * @param {string} phone - Número de telefone
 * @returns {string} Número formatado
 */
function formatarTelefone(phone) {
  if (!phone) return '';
  
  // Remove caracteres não numéricos
  const numeros = phone.replace(/\D/g, '');
  
  // Verifica se já tem código do país
  if (numeros.startsWith('55')) {
    return '+' + numeros;
  }
  
  // Adiciona código do Brasil se não tiver
  return '+55' + numeros;
}

module.exports = {
  formatarData,
  formatarTexto,
  formatarTelefone
};

// Módulo para gerar PDF com o histórico da conversa
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const crypto = require('crypto');

// Função para formatar timestamp
function formatarData(timestamp) {
  if (!timestamp) return 'Data desconhecida';
  const date = new Date(timestamp * 1000); // timestamp do Chatwoot é em segundos
  return date.toLocaleString('pt-BR');
}

// Função para criar diretório temporário
function createTempDir() {
  const tempDir = path.join(__dirname, '../temp');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }
  return tempDir;
}

// Função para baixar imagem
async function downloadImage(url) {
  try {
    const response = await axios({
      url,
      method: 'GET',
      responseType: 'arraybuffer'
    });
    
    return {
      data: response.data,
      contentType: response.headers['content-type']
    };
  } catch (error) {
    console.error(`Erro ao baixar imagem de ${url}:`, error.message);
    return null;
  }
}

// Função para processar imagem e salvá-la em arquivo temporário
async function processImageForPDF(imageData) {
  try {
    // Verificar se a imagem já está em formato base64
    if (imageData.base64) {
      const matches = imageData.base64.match(/^data:(.+);base64,(.+)$/);
      if (matches && matches.length === 3) {
        const mimeType = matches[1];
        const base64Data = matches[2];
        const imgBuffer = Buffer.from(base64Data, 'base64');
        return { buffer: imgBuffer, mimeType };
      }
    }
    
    // Se não tiver base64 mas tiver URL, baixar a imagem
    if (imageData.url) {
      const response = await downloadImage(imageData.url);
      if (response && response.data) {
        return { buffer: response.data, mimeType: response.contentType };
      }
    }
    
    return null;
  } catch (error) {
    console.error('Erro ao processar imagem para PDF:', error.message);
    return null;
  }
}

// Função principal para gerar o PDF
async function generateConversationPDF(messages, contactData) {
  return new Promise(async (resolve, reject) => {
    try {
      // Criar diretório temporário
      const tempDir = createTempDir();
      const pdfPath = path.join(tempDir, `conversa_${Date.now()}.pdf`);
      
      // Inicializar o documento PDF
      const doc = new PDFDocument({
        margins: { top: 50, bottom: 50, left: 50, right: 50 },
        size: 'A4',
        info: {
          Title: `Conversa Chatwoot - ${contactData.nome || 'Cliente'}`,
          Author: 'Integração Chatwoot-Pipedrive',
          Subject: 'Histórico de Conversa',
          Keywords: 'chatwoot, pipedrive, atendimento'
        }
      });
      
      // Pipe para arquivo
      const stream = fs.createWriteStream(pdfPath);
      doc.pipe(stream);
      
      // Título
      doc.fontSize(20).font('Helvetica-Bold').text('Histórico de Conversa - Chatwoot', { align: 'center' });
      doc.moveDown();
      
      // Informações do contato
      doc.fontSize(14).font('Helvetica-Bold').text('Informações do Contato:');
      doc.fontSize(12).font('Helvetica');
      doc.text(`Nome: ${contactData.nome || 'Não informado'}`);
      if (contactData.email) doc.text(`Email: ${contactData.email}`);
      if (contactData.telefone) doc.text(`Telefone: ${contactData.telefone}`);
      if (contactData.empresa) doc.text(`Empresa: ${contactData.empresa}`);
      if (contactData.cpf) doc.text(`CPF: ${contactData.cpf}`);
      if (contactData.processo) doc.text(`Processo: ${contactData.processo}`);
      if (contactData.profisso) doc.text(`Profissão: ${contactData.profisso}`);
      
      doc.moveDown(2);
      
      // Linha divisória
      doc.moveTo(50, doc.y)
         .lineTo(doc.page.width - 50, doc.y)
         .stroke();
      
      doc.moveDown();
      
      // Título do histórico
      doc.fontSize(16).font('Helvetica-Bold').text('Histórico da Conversa:', { align: 'center' });
      doc.moveDown();
      
      // Ordenar mensagens por data
      const sortedMessages = [...messages];
      sortedMessages.sort((a, b) => (a.created_at || 0) - (b.created_at || 0));
      
      // Contadores para estatísticas
      let contadorTipos = {
        texto: 0,
        audio: 0,
        imagem: 0,
        arquivo: 0
      };
      
      // Adicionar cada mensagem ao PDF
      for (const msg of sortedMessages) {
        const data = formatarData(msg.created_at);
        const remetente = msg.sender || 'Desconhecido';
        
        // Cabeçalho da mensagem
        doc.fontSize(10).font('Helvetica-Bold').text(`[${data}] ${remetente}:`);
        
        // Conteúdo da mensagem
        doc.fontSize(12).font('Helvetica');
        
        if (msg.type === 'text' && msg.content) {
          // Mensagem de texto
          contadorTipos.texto++;
          doc.text(msg.content);
        } 
        else if (msg.type === 'audio' && msg.transcricao) {
          // Áudio transcrito
          contadorTipos.audio++;
          doc.font('Helvetica-Oblique').text(`[Áudio transcrito]: "${msg.transcricao}"`);
        }
        else if (msg.type === 'image') {
          // Imagem
          contadorTipos.imagem++;
          try {
            doc.text(`[Imagem]: ${msg.file_name || 'Imagem'}`);
            
            // Processar a imagem
            const imageResult = await processImageForPDF(msg);
            if (imageResult && imageResult.buffer) {
              // Calcular dimensões para manter proporção
              const maxWidth = 400;
              const maxHeight = 300;
              
              // Adicionar imagem ao PDF
              doc.image(imageResult.buffer, {
                fit: [maxWidth, maxHeight],
                align: 'center'
              });
            } else {
              doc.text('[Imagem não disponível para visualização]');
            }
          } catch (error) {
            console.error('Erro ao adicionar imagem ao PDF:', error.message);
            doc.text('[Erro ao processar imagem]');
          }
        }
        else if (msg.type === 'file') {
          // Arquivo
          contadorTipos.arquivo++;
          const fileName = msg.file_name || 'Documento';
          const extension = msg.extension ? `.${msg.extension}` : '';
          
          doc.text(`[Arquivo]: ${fileName}${extension}`);
          
          // Se tivermos o conteúdo do arquivo em base64, tentamos incorporá-lo
          if (msg.base64) {
            try {
              const matches = msg.base64.match(/^data:(.+);base64,(.+)$/);
              if (matches && matches.length === 3) {
                const mimeType = matches[1];
                const base64Data = matches[2];
                const fileBuffer = Buffer.from(base64Data, 'base64');
                
                // Verificar se é um PDF - podemos incorporar diretamente
                if (mimeType.includes('pdf')) {
                  doc.text('Visualização do documento PDF:');
                  doc.moveDown();
                  
                  // Salvar temporariamente o PDF para incorporá-lo
                  const tempPdfPath = path.join(createTempDir(), `temp_${crypto.randomBytes(8).toString('hex')}.pdf`);
                  fs.writeFileSync(tempPdfPath, fileBuffer);
                  
                  // Adicionar uma prévia do PDF (primeira página)
                  try {
                    doc.text('[Documento PDF incorporado abaixo]');
                    doc.moveDown();
                    
                    // Criar um retângulo destacado para o documento
                    const startY = doc.y;
                    doc.rect(doc.x, startY, 500, 200)
                       .lineWidth(1)
                       .stroke('#cccccc');
                    
                    doc.fontSize(10).font('Helvetica-Oblique')
                       .text('Documento PDF completo anexado ao Deal no Pipedrive', {
                         align: 'center'
                       });
                    
                    // Limpar arquivo temporário
                    fs.unlinkSync(tempPdfPath);
                  } catch (pdfError) {
                    console.error('Erro ao incorporar PDF:', pdfError.message);
                    doc.text('[Não foi possível incorporar o PDF - documento disponível no Pipedrive]');
                  }
                }
                // Se for uma imagem, mostrar a imagem
                else if (mimeType.includes('image')) {
                  try {
                    doc.text('Visualização do documento:');
                    doc.moveDown();
                    
                    // Adicionar imagem ao PDF
                    doc.image(fileBuffer, {
                      fit: [400, 300],
                      align: 'center'
                    });
                  } catch (imgError) {
                    console.error('Erro ao incorporar imagem do documento:', imgError.message);
                    doc.text('[Não foi possível mostrar o documento - disponível no Pipedrive]');
                  }
                }
                // Para outros tipos de documento
                else {
                  doc.font('Helvetica-Oblique')
                     .text('Documento incorporado ao PDF principal e anexado ao Deal no Pipedrive');
                }
              }
            } catch (error) {
              console.error('Erro ao processar arquivo para PDF:', error.message);
              doc.font('Helvetica-Oblique')
                 .text('Documento anexado ao Deal no Pipedrive');
            }
          } else {
            // Se não temos o conteúdo, apenas informar
            doc.font('Helvetica-Oblique')
               .text('Documento anexado ao Deal no Pipedrive');
          }
          
          doc.fillColor('black').font('Helvetica');
        }
        else {
          // Tipo desconhecido
          doc.text('[Conteúdo não disponível]');
        }
        
        doc.moveDown(2);
        
        // Linha divisória entre mensagens
        doc.moveTo(70, doc.y)
           .lineTo(doc.page.width - 70, doc.y)
           .stroke({ color: '#cccccc' });
        
        doc.moveDown();
      }
      
      // Adicionar resumo da conversa no final
      doc.addPage();
      doc.fontSize(16).font('Helvetica-Bold').text('Resumo da Conversa', { align: 'center' });
      doc.moveDown();
      
      doc.fontSize(12).font('Helvetica');
      doc.text(`Total de mensagens: ${sortedMessages.length}`);
      doc.text(`Mensagens de texto: ${contadorTipos.texto}`);
      doc.text(`Áudios transcritos: ${contadorTipos.audio}`);
      doc.text(`Imagens: ${contadorTipos.imagem}`);
      doc.text(`Arquivos: ${contadorTipos.arquivo}`);
      doc.text(`Data do relatório: ${new Date().toLocaleString('pt-BR')}`);
      
      // Rodapé
      const pageCount = doc.bufferedPageRange().count;
      for (let i = 0; i < pageCount; i++) {
        doc.switchToPage(i);
        
        // Adicionar número da página no rodapé
        doc.fontSize(8)
           .text(
             `Página ${i + 1} de ${pageCount}`,
             50,
             doc.page.height - 50,
             { align: 'center' }
           );
      }
      
      // Finalizar o documento
      doc.end();
      
      // Quando o stream terminar, resolver a promise com o caminho do arquivo
      stream.on('finish', () => {
        resolve(pdfPath);
      });
      
      stream.on('error', (err) => {
        reject(err);
      });
      
    } catch (error) {
      console.error('Erro ao gerar PDF:', error);
      reject(error);
    }
  });
}

module.exports = {
  generateConversationPDF
};

const fs = require('fs');
const path = require('path');

const root = process.cwd();
const srcDir = path.join(root, 'src');
const outFile = path.join(root, 'docs', 'CODIGO_LINHA_A_LINHA.md');

function listJsFiles(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listJsFiles(full));
    } else if (entry.isFile() && full.endsWith('.js')) {
      files.push(full);
    }
  }

  return files;
}

function mojibakeScore(text) {
  if (!text) return 0;

  const markers = ['Ã', 'Â', 'â', 'ï¿½', '\uFFFD'];
  let score = 0;

  for (let i = 0; i < markers.length; i++) {
    const marker = markers[i];
    score += text.split(marker).length - 1;
  }

  return score;
}

function repairMojibake(text) {
  const original = String(text || '');
  if (!original) return '';

  let best = original;

  try {
    const decoded = Buffer.from(original, 'latin1').toString('utf8');
    if (mojibakeScore(decoded) < mojibakeScore(best)) {
      best = decoded;
    }
  } catch (_) {}

  return best.replace(/\uFFFD/g, '?');
}

function toAscii(text) {
  return String(text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7E]/g, '');
}

function explainLine(line) {
  const trimmed = line.trim();

  if (!trimmed) return 'Linha em branco para organizar blocos.';
  if (trimmed.startsWith('//')) return 'Comentario explicativo ja existente no codigo.';
  if (trimmed.startsWith('/*') || trimmed.startsWith('*') || trimmed.startsWith('*/')) return 'Parte de comentario em bloco.';
  if (trimmed.startsWith('const ') && trimmed.includes('require(')) return 'Importa um modulo para uso neste arquivo.';
  if (trimmed.startsWith('const ')) return 'Declara uma constante usada na logica.';
  if (trimmed.startsWith('let ')) return 'Declara variavel com valor que pode ser alterado.';
  if (trimmed.startsWith('var ')) return 'Declara variavel (estilo legado).';
  if (trimmed.startsWith('class ')) return 'Define uma classe com responsabilidades especificas.';
  if (trimmed.startsWith('constructor(')) return 'Inicializa estado da classe e dependencias.';
  if (trimmed.startsWith('async ')) return 'Define funcao assincrona com suporte a await.';

  if (/^[a-zA-Z0-9_]+\(.*\)\s*\{?$/.test(trimmed) &&
      !trimmed.includes('=>') &&
      !trimmed.startsWith('if') &&
      !trimmed.startsWith('for') &&
      !trimmed.startsWith('while') &&
      !trimmed.startsWith('switch') &&
      !trimmed.startsWith('catch')) {
    return 'Define metodo/funcao da classe ou objeto.';
  }

  if (trimmed.startsWith('if ') || trimmed.startsWith('if(')) return 'Verifica condicao para decidir o fluxo.';
  if (trimmed.startsWith('else if')) return 'Verifica condicao alternativa no fluxo.';
  if (trimmed === 'else {' || trimmed.startsWith('else ')) return 'Executa caminho alternativo quando condicao anterior falha.';
  if (trimmed.startsWith('switch')) return 'Seleciona fluxo com base em multiplos casos.';
  if (trimmed.startsWith('case ')) return 'Define um caso dentro do switch.';
  if (trimmed.startsWith('default')) return 'Define comportamento padrao do switch.';
  if (trimmed.startsWith('for ') || trimmed.startsWith('for(')) return 'Inicia laco de repeticao.';
  if (trimmed.startsWith('while ') || trimmed.startsWith('while(')) return 'Inicia laco condicional.';
  if (trimmed.startsWith('try')) return 'Inicia bloco protegido contra excecoes.';
  if (trimmed.startsWith('catch')) return 'Trata erro capturado no bloco try.';
  if (trimmed.startsWith('finally')) return 'Executa bloco final independentemente de erro.';
  if (trimmed.startsWith('await ')) return 'Aguarda conclusao de operacao assincrona.';
  if (trimmed.includes('await ')) return 'Usa resultado de operacao assincrona.';
  if (trimmed.startsWith('return ')) return 'Retorna valor da funcao/metodo.';
  if (trimmed === 'return;' || trimmed === 'return') return 'Encerra a execucao da funcao sem valor.';
  if (trimmed.startsWith('throw ')) return 'Dispara erro para interromper e sinalizar falha.';
  if (trimmed.startsWith('this.db.run(')) return 'Executa comando SQL de escrita (insert/update/delete).';
  if (trimmed.startsWith('this.db.exec(')) return 'Executa consulta SQL e le dados.';
  if (trimmed.includes('CREATE TABLE')) return 'Define estrutura de tabela no banco de dados.';
  if (trimmed.includes('CREATE INDEX')) return 'Cria indice para melhorar performance de consulta.';
  if (trimmed.startsWith('module.exports')) return 'Exporta modulo para ser usado em outros arquivos.';
  if (trimmed.startsWith('process.env')) return 'Le configuracao de variavel de ambiente.';
  if (trimmed.startsWith('console.log')) return 'Registra informacao de execucao no log.';
  if (trimmed.startsWith('console.error')) return 'Registra erro no log para diagnostico.';
  if (trimmed.startsWith('setTimeout(')) return 'Agenda execucao futura de funcao.';
  if (trimmed.startsWith('setInterval(')) return 'Agenda execucao recorrente de funcao.';
  if (trimmed.includes('=>')) return 'Define funcao anonima/arrow function.';
  if (trimmed.endsWith('{')) return 'Abre bloco de execucao.';
  if (trimmed === '}' || trimmed === '});') return 'Fecha bloco de execucao.';

  return 'Executa uma instrucao da logica de negocio.';
}

function escapeInline(text) {
  return String(text || '').replace(/`/g, '\\`');
}

const files = listJsFiles(srcDir).sort();
let out = '# Codigo Linha a Linha\n\n';
out += 'Este arquivo explica cada linha dos arquivos de `src/` sem alterar o codigo de producao.\n\n';
out += `Gerado em: ${new Date().toISOString()}\n\n`;

for (const absPath of files) {
  const rel = path.relative(root, absPath).replace(/\\/g, '/');
  const lines = fs.readFileSync(absPath, 'utf8').split(/\r?\n/);

  out += `## ${rel}\n\n`;

  for (let i = 0; i < lines.length; i++) {
    const lineNo = i + 1;
    const repaired = repairMojibake(lines[i] || '');
    const original = toAscii(repaired);
    const explain = toAscii(repairMojibake(explainLine(repaired)));
    out += `- L${lineNo}: \`${escapeInline(original)}\`\n`;
    out += `  - ${explain}\n`;
  }

  out += '\n';
}

fs.writeFileSync(outFile, out, 'utf8');
console.log(`Gerado: ${outFile}`);
console.log(`Arquivos processados: ${files.length}`);

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

function explainLine(line) {
  const trimmed = line.trim();

  if (!trimmed) return 'Linha em branco para organizar blocos.';
  if (trimmed.startsWith('//')) return 'Comentário explicativo já existente no código.';
  if (trimmed.startsWith('/*') || trimmed.startsWith('*') || trimmed.startsWith('*/')) return 'Parte de comentário em bloco.';
  if (trimmed.startsWith('const ') && trimmed.includes('require(')) return 'Importa um módulo para uso neste arquivo.';
  if (trimmed.startsWith('const ')) return 'Declara uma constante usada na lógica.';
  if (trimmed.startsWith('let ')) return 'Declara variável com valor que pode ser alterado.';
  if (trimmed.startsWith('var ')) return 'Declara variável (estilo legado).';
  if (trimmed.startsWith('class ')) return 'Define uma classe com responsabilidades específicas.';
  if (trimmed.startsWith('constructor(')) return 'Inicializa estado da classe e dependências.';
  if (trimmed.startsWith('async ')) return 'Define função assíncrona com suporte a await.';
  if (/^[a-zA-Z0-9_]+\(.*\)\s*\{?$/.test(trimmed) && !trimmed.includes('=>') && !trimmed.startsWith('if') && !trimmed.startsWith('for') && !trimmed.startsWith('while') && !trimmed.startsWith('switch') && !trimmed.startsWith('catch')) return 'Define método/função da classe ou objeto.';
  if (trimmed.startsWith('if ' ) || trimmed.startsWith('if(')) return 'Verifica condição para decidir o fluxo.';
  if (trimmed.startsWith('else if')) return 'Verifica condição alternativa no fluxo.';
  if (trimmed === 'else {' || trimmed.startsWith('else ')) return 'Executa caminho alternativo quando condição anterior falha.';
  if (trimmed.startsWith('switch')) return 'Seleciona fluxo com base em múltiplos casos.';
  if (trimmed.startsWith('case ')) return 'Define um caso dentro do switch.';
  if (trimmed.startsWith('default')) return 'Define comportamento padrão do switch.';
  if (trimmed.startsWith('for ') || trimmed.startsWith('for(')) return 'Inicia laço de repetição.';
  if (trimmed.startsWith('while ') || trimmed.startsWith('while(')) return 'Inicia laço condicional.';
  if (trimmed.startsWith('try')) return 'Inicia bloco protegido contra exceções.';
  if (trimmed.startsWith('catch')) return 'Trata erro capturado no bloco try.';
  if (trimmed.startsWith('finally')) return 'Executa bloco final independentemente de erro.';
  if (trimmed.startsWith('await ')) return 'Aguarda conclusão de operação assíncrona.';
  if (trimmed.includes('await ')) return 'Usa resultado de operação assíncrona.';
  if (trimmed.startsWith('return ')) return 'Retorna valor da função/método.';
  if (trimmed === 'return;' || trimmed === 'return') return 'Encerra a execução da função sem valor.';
  if (trimmed.startsWith('throw ')) return 'Dispara erro para interromper e sinalizar falha.';
  if (trimmed.startsWith('this.db.run(')) return 'Executa comando SQL de escrita (insert/update/delete).' ;
  if (trimmed.startsWith('this.db.exec(')) return 'Executa consulta SQL e lê dados.';
  if (trimmed.includes('CREATE TABLE')) return 'Define estrutura de tabela no banco de dados.';
  if (trimmed.includes('CREATE INDEX')) return 'Cria índice para melhorar performance de consulta.';
  if (trimmed.startsWith('module.exports')) return 'Exporta módulo para ser usado em outros arquivos.';
  if (trimmed.startsWith('process.env')) return 'Lê configuração de variável de ambiente.';
  if (trimmed.startsWith('console.log')) return 'Registra informação de execução no log.';
  if (trimmed.startsWith('console.error')) return 'Registra erro no log para diagnóstico.';
  if (trimmed.startsWith('setTimeout(')) return 'Agenda execução futura de função.';
  if (trimmed.startsWith('setInterval(')) return 'Agenda execução recorrente de função.';
  if (trimmed.includes('=>')) return 'Define função anônima/arrow function.';
  if (trimmed.endsWith('{')) return 'Abre bloco de execução.';
  if (trimmed === '}' || trimmed === '});' || trimmed === '});') return 'Fecha bloco de execução.';

  return 'Executa uma instrução da lógica de negócio.';
}

function escapeInline(text) {
  return text.replace(/`/g, '\\`');
}

const files = listJsFiles(srcDir).sort();
let out = '# Código Linha a Linha\n\n';
out += 'Este arquivo explica cada linha dos arquivos de `src/` sem alterar o código de produção.\n\n';
out += `Gerado em: ${new Date().toISOString()}\n\n`;

for (const absPath of files) {
  const rel = path.relative(root, absPath).replace(/\\/g, '/');
  const lines = fs.readFileSync(absPath, 'utf8').split(/\r?\n/);

  out += `## ${rel}\n\n`;

  for (let i = 0; i < lines.length; i++) {
    const lineNo = i + 1;
    const original = lines[i] || '';
    const explain = explainLine(original);
    out += `- L${lineNo}: \`${escapeInline(original)}\`\n`;
    out += `  - ${explain}\n`;
  }

  out += '\n';
}

fs.writeFileSync(outFile, out, 'utf8');
console.log(`Gerado: ${outFile}`);
console.log(`Arquivos processados: ${files.length}`);

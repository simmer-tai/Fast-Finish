import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import ts from 'typescript';

async function jsFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(entries.map(entry => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? jsFiles(path) : entry.isFile() && path.endsWith('.js') ? [path] : [];
  }));
  return files.flat().sort();
}

// Use the parser so that comments and ordinary strings are never rewritten.
function imports(source, file, version) {
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const edits = [];
  function visit(node) {
    let specifier;
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) specifier = node.moduleSpecifier;
    else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) specifier = node.arguments[0];
    if (specifier && ts.isStringLiteral(specifier)) {
      const match = /^(\.\.?\/[^?#]+\.js)(?:\?v=[^&#]*)?$/.exec(specifier.text);
      if (match) edits.push({ start: specifier.getStart(tree) + 1, end: specifier.end - 1, text: match[1] + (version ? `?v=${version}` : '') });
    }
    ts.forEachChild(node, visit);
  }
  visit(tree);
  for (const edit of edits.reverse()) source = source.slice(0, edit.start) + edit.text + source.slice(edit.end);
  return source;
}

const files = await jsFiles('dist');
if (!files.length) throw new Error('No JavaScript files found in dist');
const hash = createHash('sha256');
const normalized = [];
for (const file of files) {
  const source = imports(await readFile(file, 'utf8'), file, '');
  normalized.push(source);
  // Include paths and lengths to make file boundaries unambiguous across platforms.
  const name = relative('dist', file).replaceAll('\\', '/');
  hash.update(`${Buffer.byteLength(name)}:${name}${Buffer.byteLength(source)}:`).update(source);
}
const version = hash.digest('hex').slice(0, 8);
for (let i = 0; i < files.length; i++) {
  await writeFile(files[i], imports(normalized[i], files[i], version));
}
const html = await readFile('index.html', 'utf8');
let count = 0;
const stampedHtml = html.replace(/(\bimport\s*\(\s*['"])\.\/dist\/main\.js(?:\?v=[^'"&#]*)?(['"]\s*\))/g, (_, before, after) => {
  count++;
  return `${before}./dist/main.js?v=${version}${after}`;
});
if (count !== 1) throw new Error(`Expected one main.js import in index.html, found ${count}`);
await writeFile('index.html', stampedHtml);
console.log(`Stamped ${files.length} JavaScript files with ${version}`);

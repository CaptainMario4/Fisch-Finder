import fs from 'node:fs';
import ts from 'typescript';
const cache = new Map();
export function moduleUri(url) {
  const key = String(url);
  if (cache.has(key)) return cache.get(key);
  const code = ts.transpileModule(fs.readFileSync(url,'utf8'), { compilerOptions: { module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022 } }).outputText
    .replace(/from\s+(['"])(\.[^'"]+)\1/g, (_,quote,path) => `from '${moduleUri(new URL(path + '.ts',url))}'`);
  const uri = 'data:text/javascript;base64,' + Buffer.from(code).toString('base64');
  cache.set(key,uri); return uri;
}

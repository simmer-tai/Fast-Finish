import { createHash } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { basename } from 'node:path';
import * as esbuild from 'esbuild';

async function validateHtml() {
  const html = await readFile('index.html', 'utf8');
  const maps = [...html.matchAll(/<script\s+type=["']importmap["']\s*>([\s\S]*?)<\/script>/g)];
  if (maps.length !== 1) throw new Error(`Expected one import map, found ${maps.length}`);
  const url = JSON.parse(maps[0][1]).imports?.three;
  const version = /(?:^|\/)three@([^/]+)\/build\/three\.module\.js(?:[?#].*)?$/.exec(url ?? '')?.[1];
  const installed = JSON.parse(await readFile('node_modules/three/package.json', 'utf8')).version;
  if (version !== installed) throw new Error(`three import map version ${version ?? '(missing)'} does not match installed ${installed}`);
  const imports = [...html.matchAll(/(\bimport\s*\(\s*['"])\.\/dist\/main\.js(?:\?v=[^'"&#]*)?(['"]\s*\))/g)];
  if (imports.length !== 1) throw new Error(`Expected one main.js import in index.html, found ${imports.length}`);
  return html;
}

const plugin = {
  name: 'external-three-and-stamp',
  setup(build) {
    build.onResolve({ filter: /^three$/ }, () => ({ path: 'three', external: true }));
    build.onStart(async () => { await validateHtml(); });
    build.onEnd(async result => {
      if (result.errors.length) return;
      const html = await validateHtml();
      const source = result.outputFiles.find(file => basename(file.path) === 'main.js')?.contents;
      if (!source) throw new Error('Build did not produce main.js');
      const version = createHash('sha256').update(source).digest('hex').slice(0, 8);
      const stamped = html.replace(/(\bimport\s*\(\s*['"])\.\/dist\/main\.js(?:\?v=[^'"&#]*)?(['"]\s*\))/g,
        (_, before, after) => `${before}./dist/main.js?v=${version}${after}`);
      await rm('dist', { recursive: true, force: true });
      await mkdir('dist', { recursive: true });
      await Promise.all(result.outputFiles.map(file => writeFile(file.path, file.contents)));
      if (stamped !== html) await writeFile('index.html', stamped);
      console.log(`Built dist with main.js version ${version}`);
    });
  },
};

await validateHtml();
const options = {
  entryPoints: ['src/main.ts', 'src/devPreviews.ts'],
  outdir: 'dist',
  bundle: true,
  format: 'esm',
  target: 'es2022',
  minify: true,
  sourcemap: 'external',
  write: false,
  plugins: [plugin],
};
if (process.argv.includes('--watch')) {
  const context = await esbuild.context(options);
  await context.watch();
  console.log('Watching for changes');
} else {
  await esbuild.build(options);
}

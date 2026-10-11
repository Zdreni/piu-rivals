const { copyFile, mkdir, readFile, writeFile } = require('node:fs/promises');
const path = require('node:path');
const esbuild = require('esbuild');

const root = path.resolve(__dirname, '..');
const dist = path.join(root, 'dist');

async function writeManifest() {
  const manifest = JSON.parse(await readFile(path.join(root, 'manifest.json'), 'utf8'));
  for (const contentScript of manifest.content_scripts) {
    contentScript.js = contentScript.js.map((file) => file.replace(/^dist\//, ''));
  }
  await writeFile(path.join(dist, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
}

async function build() {
  await mkdir(dist, { recursive: true });
  const options = {
    entryPoints: [path.join(root, 'src', 'content.js')],
    bundle: true,
    format: 'iife',
    target: 'chrome110',
    outfile: path.join(dist, 'content.js'),
  };

  if (process.argv.includes('--watch')) {
    const context = await esbuild.context(options);
    await context.watch();
  } else {
    await esbuild.build(options);
  }
  await writeManifest();
}

build().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

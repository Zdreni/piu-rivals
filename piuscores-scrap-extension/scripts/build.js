const { copyFile, mkdir } = require('node:fs/promises');
const path = require('node:path');
const esbuild = require('esbuild');

const root = path.resolve(__dirname, '..');
const dist = path.join(root, 'dist');

// Each entry becomes one self-contained script in dist/, named as in the manifest.
const entries = ['background.js', 'piuscores.js', 'token_sync.js'];


async function build() {
  await mkdir(dist, { recursive: true });
  await copyFile(path.join(root, 'src', 'manifest.json'), path.join(dist, 'manifest.json'));

  const options = {
    entryPoints: entries.map((entry) => path.join(root, 'src', entry)),
    bundle: true,
    format: 'iife',
    target: 'chrome110',
    outdir: dist,
  };

  if (process.argv.includes('--watch')) {
    const context = await esbuild.context(options);
    await context.watch();
  } else {
    await esbuild.build(options);
  }
}


build().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

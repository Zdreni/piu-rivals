const { mkdir } = require('node:fs/promises');
const path = require('node:path');
const esbuild = require('esbuild');

const root = path.resolve(__dirname, '..');
const dist = path.join(root, 'dist');

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
}

build().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

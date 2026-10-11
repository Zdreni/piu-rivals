# PIU Scores Scraper

This Chrome extension collects rival scores from player pages on
`piuscores.arroweclip.se` and shows changes and saved scores.

## Build

The generated `dist/` directory is a self-contained extension package and is
checked in so it can be loaded directly as an unpacked extension in Chrome
without building. Load `dist/` in Chrome's extension management page.

To modify the source modules, install dependencies and rebuild the bundle:

```sh
npm install
npm run build
```

The build bundles the ES modules in `src/` into `dist/content.js` and copies the
manifest into `dist/manifest.json` with its content-script path adjusted.
Commit the regenerated `dist/` files along with source changes so a checkout
remains directly installable. Run `npm run build` again after changing source
files, or use `npm run watch` to rebuild when they change.

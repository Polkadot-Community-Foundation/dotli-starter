import { build } from "esbuild";
import { readFileSync, writeFileSync, mkdirSync } from "fs";

// 1. Bundle main.js with all dependencies inlined
const result = await build({
  entryPoints: ["src/main.js"],
  bundle: true,
  format: "esm",
  write: false,
  minify: true,
});

const bundledJs = result.outputFiles[0].text;

// 2. Read the HTML and replace the external script + import map with the bundle
let html = readFileSync("src/index.html", "utf-8");

// Remove the import map (no longer needed — deps are bundled)
html = html.replace(/<script type="importmap">[\s\S]*?<\/script>\s*/, "");

// Replace external script tag with inlined bundle
html = html.replace(
  /<script type="module" src="main.js"><\/script>/,
  `<script type="module">\n${bundledJs}</script>`,
);

// 3. Write to dist/
mkdirSync("dist", { recursive: true });
writeFileSync("dist/index.html", html);

const bytes = Buffer.byteLength(html);
console.log(`dist/index.html (${(bytes / 1024).toFixed(1)} KB)`);

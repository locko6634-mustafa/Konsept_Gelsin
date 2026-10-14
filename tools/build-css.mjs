import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const rootDirectory = fileURLToPath(new URL("../", import.meta.url));

function minifyCss(css) {
  return css
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\s*([\{\}\:\;\,\>\+\~])\s*/g, "$1")
    .replace(/;;+/g, ";")
    .replace(/;}/g, "}")
    .trim();
}

async function bundleCss(relativeSources, relativeOutput, bundleName) {
  const sections = await Promise.all(
    relativeSources.map(async (relPath) => {
      const fullPath = path.join(rootDirectory, relPath);
      const css = await readFile(fullPath, "utf8");
      return `/* Kaynak: ${relPath} */\n\n${css.trim()}`;
    })
  );

  const minified = minifyCss(sections.join("\n"));
  const banner = "/* Otomatik uretilir: npm run build:css */\n";
  const outputPath = path.join(rootDirectory, relativeOutput);
  await writeFile(outputPath, `${banner}${minified}\n`, "utf8");
  console.log(`${bundleName} CSS paketi olusturuldu ve minified edildi: ${relativeSources.length} modul -> ${relativeOutput}`);
}

const homeSources = [
  "css/shared/tokens.css",
  "css/shared/base.css",
  "css/shared/components.css",
  "css/home/home.css",
  "css/home/responsive.css",
  "css/home/motion.css",
];

const packageSources = [
  "css/shared/tokens.css",
  "css/shared/base.css",
  "css/shared/components.css",
  "css/package/package-detail.css",
  "css/package/package-media.css",
  "css/home/responsive.css",
  "css/package/package-detail-responsive.css",
  "css/home/motion.css",
];

await bundleCss(homeSources, "css/home/site.css", "Ana sayfa");
await bundleCss(packageSources, "css/package/package.css", "Paket detay");

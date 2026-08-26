import { access, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const sourceDirectories = ["content", "css", "js", "tests", "tools"];
const rootFiles = [".gitignore", "README.md", "PRODUCT.md", "index.html", "package.json"];
const textExtensions = new Set([".css", ".html", ".js", ".json", ".md", ".mjs"]);

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries
      .filter((entry) => !entry.name.startsWith("."))
      .map(async (entry) => {
        const target = path.join(directory, entry.name);
        return entry.isDirectory() ? walk(target) : [target];
      }),
  );
  return nested.flat();
}

async function existingRootFiles() {
  const existing = [];
  for (const relativePath of rootFiles) {
    const absolutePath = path.join(projectRoot, relativePath);
    try {
      await access(absolutePath);
      existing.push(absolutePath);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  return existing;
}

const discovered = (
  await Promise.all(
    sourceDirectories.map(async (directory) => {
      const absolutePath = path.join(projectRoot, directory);
      try {
        return await walk(absolutePath);
      } catch (error) {
        if (error.code === "ENOENT") return [];
        throw error;
      }
    }),
  )
).flat();

const files = [...(await existingRootFiles()), ...discovered]
  .filter((file) => textExtensions.has(path.extname(file).toLowerCase()) || path.basename(file) === ".gitignore")
  .sort((left, right) => left.localeCompare(right, "tr"));
const violations = [];

for (const file of files) {
  const source = await readFile(file, "utf8");
  const relativePath = path.relative(projectRoot, file);

  if (source.startsWith("\uFEFF")) violations.push(`${relativePath}: UTF-8 BOM kullanılmamalı`);
  if (source.length > 0 && !source.endsWith("\n")) violations.push(`${relativePath}: dosya satır sonuyla bitmeli`);

  source.split(/\r?\n/).forEach((line, index) => {
    if (/\s+$/.test(line)) violations.push(`${relativePath}:${index + 1}: satır sonunda boşluk var`);
    if (line.includes("\t")) violations.push(`${relativePath}:${index + 1}: girintide sekme karakteri var`);
  });

  if (path.extname(file).toLowerCase() === ".json") {
    try {
      JSON.parse(source);
    } catch (error) {
      violations.push(`${relativePath}: geçersiz JSON (${error.message})`);
    }
  }
}

if (violations.length > 0) {
  console.error(`Biçim kontrolü ${violations.length} sorun buldu:\n${violations.map((item) => `- ${item}`).join("\n")}`);
  process.exitCode = 1;
} else {
  console.log(`Biçim kontrolü geçti (${files.length} metin dosyası).`);
}

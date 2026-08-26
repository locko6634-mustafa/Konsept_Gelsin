import { spawnSync } from "node:child_process";
import { readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const sourceDirectories = ["js", "tests", "tools"];

async function collectJavaScriptFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries
      .filter((entry) => !entry.name.startsWith("."))
      .map(async (entry) => {
        const target = path.join(directory, entry.name);
        if (entry.isDirectory()) return collectJavaScriptFiles(target);
        return /\.(?:js|mjs)$/i.test(entry.name) ? [target] : [];
      }),
  );
  return nested.flat();
}

const files = (
  await Promise.all(
    sourceDirectories.map(async (directory) => {
      try {
        return await collectJavaScriptFiles(path.join(projectRoot, directory));
      } catch (error) {
        if (error.code === "ENOENT") return [];
        throw error;
      }
    }),
  )
)
  .flat()
  .sort((left, right) => left.localeCompare(right, "tr"));
const failures = [];

for (const file of files) {
  const result = spawnSync(process.execPath, ["--check", file], {
    cwd: projectRoot,
    encoding: "utf8",
    windowsHide: true,
  });

  if (result.status !== 0) {
    const output = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
    failures.push(`${path.relative(projectRoot, file)}\n${output}`);
  }
}

if (failures.length > 0) {
  console.error(`JavaScript sözdizimi kontrolü başarısız:\n\n${failures.join("\n\n")}`);
  process.exitCode = 1;
} else {
  console.log(`node --check geçti (${files.length} JavaScript dosyası).`);
}

import { createReadStream } from "node:fs";
import { realpath, stat } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { pageNames } from "./page-manifest.mjs";

const projectRoot = await realpath(fileURLToPath(new URL("../", import.meta.url)));
const host = process.env.HOST?.trim() || "127.0.0.1";
const port = Number.parseInt(process.env.PORT || "4173", 10);
const publicDirectories = new Set(["assets", "css", "js"]);
const mediaRoot = path.join(projectRoot, "storage", "public-media");
const publicRootFiles = new Set(pageNames);
const mimeTypes = new Map([
  [".avif", "image/avif"],
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".ico", "image/x-icon"],
  [".jpeg", "image/jpeg"],
  [".jpg", "image/jpeg"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml; charset=utf-8"],
  [".webp", "image/webp"],
  [".woff2", "font/woff2"],
]);
const revalidatedExtensions = new Set([".html", ".css", ".js", ".json", ".mjs"]);

if (!Number.isInteger(port) || port < 1 || port > 65_535) {
  throw new Error("PORT, 1 ile 65535 arasında bir tam sayı olmalı.");
}

function securityHeaders(contentType) {
  return {
    "Content-Security-Policy": [
      "default-src 'self'",
      "base-uri 'self'",
      "font-src 'self'",
      "form-action 'none'",
      "frame-ancestors 'none'",
      "img-src 'self' data:",
      "object-src 'none'",
      "script-src 'self'",
      "style-src 'self'",
    ].join("; "),
    "Content-Type": contentType,
    "Cross-Origin-Opener-Policy": "same-origin",
    "Permissions-Policy": "camera=(), geolocation=(), microphone=()",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
  };
}

function respond(response, statusCode, message, method = "GET") {
  const body = `${message}\n`;
  response.writeHead(statusCode, {
    ...securityHeaders("text/plain; charset=utf-8"),
    "Cache-Control": "no-store",
    "Content-Length": Buffer.byteLength(body),
  });
  response.end(method === "HEAD" ? undefined : body);
}

function requestedPath(requestUrl) {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(requestUrl, "http://localhost").pathname);
  } catch {
    return null;
  }

  pathname = pathname.replaceAll("\\", "/");
  if (pathname === "/" || pathname === "/index") return "index.html";
  const relativePath = pathname.replace(/^\/+/, "");
  const segments = relativePath.split("/").filter(Boolean);
  if (segments.length === 0 || segments.some((segment) => segment.startsWith("."))) return null;
  if (segments.length === 1) return publicRootFiles.has(relativePath) ? relativePath : null;
  if (segments[0] === "media" && segments[1] === "images") return relativePath;
  return publicDirectories.has(segments[0]) ? relativePath : null;
}

async function fileForRequest(requestUrl) {
  const relativePath = requestedPath(requestUrl);
  if (!relativePath) return null;

  const isMedia = relativePath.startsWith("media/");
  const servingRoot = isMedia ? mediaRoot : projectRoot;
  const servedPath = isMedia ? relativePath.slice("media/".length) : relativePath;
  const candidate = path.resolve(servingRoot, servedPath);
  const relativeToRoot = path.relative(servingRoot, candidate);
  if (relativeToRoot.startsWith("..") || path.isAbsolute(relativeToRoot)) return null;

  try {
    const fileInfo = await stat(candidate);
    if (!fileInfo.isFile()) return null;
    const resolvedFile = await realpath(candidate);
    const resolvedRelative = path.relative(servingRoot, resolvedFile);
    if (resolvedRelative.startsWith("..") || path.isAbsolute(resolvedRelative)) return null;
    return { fileInfo, path: resolvedFile };
  } catch (error) {
    if (error.code === "ENOENT" || error.code === "ENOTDIR") return null;
    throw error;
  }
}

const server = createServer(async (request, response) => {
  const method = request.method ?? "GET";
  if (method !== "GET" && method !== "HEAD") {
    response.setHeader("Allow", "GET, HEAD");
    respond(response, 405, "Yönteme izin verilmiyor.", method);
    return;
  }

  try {
    const result = await fileForRequest(request.url ?? "/");
    if (!result) {
      respond(response, 404, "Sayfa bulunamadı.", method);
      return;
    }

    const extension = path.extname(result.path).toLowerCase();
    const contentType = mimeTypes.get(extension) ?? "application/octet-stream";
    response.writeHead(200, {
      ...securityHeaders(contentType),
      "Cache-Control": revalidatedExtensions.has(extension) ? "no-cache" : "public, max-age=3600",
      "Content-Length": result.fileInfo.size,
    });

    if (method === "HEAD") response.end();
    else createReadStream(result.path).on("error", () => response.destroy()).pipe(response);
  } catch {
    respond(response, 500, "Sunucu isteği tamamlayamadı.", method);
  }
});

server.on("error", (error) => {
  console.error(`Sunucu başlatılamadı: ${error.message}`);
  process.exitCode = 1;
});

server.listen(port, host, () => {
  console.log(`Konsept Gelsin geliştirme sunucusu: http://${host}:${port}`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => server.close(() => process.exit(0)));
}

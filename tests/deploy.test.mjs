import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { packagePageNames } from "../tools/page-manifest.mjs";

const [workflow, compose, dockerfile, nginx, e2e] = await Promise.all([
  readFile(".github/workflows/deploy.yml", "utf8"),
  readFile("deploy/compose.production.yaml", "utf8"),
  readFile("deploy/Dockerfile", "utf8"),
  readFile("deploy/nginx.conf", "utf8"),
  readFile("tools/e2e.mjs", "utf8"),
]);

test("main push yalnız başarılı kalite kapısından sonra üretime gider", () => {
  assert.match(workflow, /branches:\s*\[main\]/);
  assert.match(workflow, /needs:\s*quality/);
  assert.match(workflow, /npm run validate/);
  assert.match(workflow, /environment:\s*\n\s+name: production/);
  assert.match(workflow, /StrictHostKeyChecking=yes/);
  assert.match(workflow, /SERVER_HOST_FINGERPRINT/);
  assert.match(workflow, /ssh-keyscan/);
  assert.match(workflow, /actual_fingerprint/);
  assert.doesNotMatch(workflow, /DEPLOY_KNOWN_HOSTS/);
  assert.match(workflow, /GITHUB_SHA/);
  assert.match(e2e, /process\.platform === "linux"/);
  assert.match(e2e, /--disable-dev-shm-usage/);
  assert.match(e2e, /--no-sandbox/);
  assert.match(e2e, /remote-debugging-address=127\.0\.0\.1/);
  assert.match(e2e, /createServer as createNetServer/);
  assert.match(e2e, /remote-debugging-port=\$\{devtoolsPort\}/);
  assert.match(e2e, /\/json\/version/);
  assert.doesNotMatch(e2e, /DevToolsActivePort/);
});

test("üretim containerı yetkileri daraltılmış ve healthchecklidir", () => {
  assert.match(dockerfile, /^FROM\s+nginx:[^\s]+@sha256:[a-f0-9]{64}/m);
  assert.match(dockerfile, /USER nginx/);
  for (const pageName of packagePageNames) assert.match(dockerfile, new RegExp(pageName.replace(".", "\\.")));
  assert.match(compose, /read_only:\s*true/);
  assert.match(compose, /no-new-privileges:true/);
  assert.match(compose, /cap_drop:\s*\n\s+- ALL/);
  assert.match(compose, /healthcheck:/);
  assert.match(compose, /name: edge_proxy/);
  assert.match(compose, /Host\(`konseptgelsin\.com`\)/);
  assert.match(compose, /source: \$\{PUBLIC_MEDIA_DIR:-\.\.\/storage\/public-media\}/);
  assert.match(compose, /target: \/srv\/konsept-gelsin-media/);
  assert.doesNotMatch(dockerfile, /COPY assets(?:\s|$)/);
});

test("Nginx çok sayfalı statik yüzeyi güvenlik başlıklarıyla sunar", () => {
  assert.match(nginx, /Content-Security-Policy/);
  assert.match(nginx, /Strict-Transport-Security/);
  assert.match(nginx, /X-Content-Type-Options/);
  assert.match(nginx, /location = \/healthz/);
  assert.match(nginx, /location \^~ \/media\/images\//);
  assert.match(nginx, /alias \/srv\/konsept-gelsin-media\/images\//);
  assert.match(nginx, /limit_except GET HEAD/);
});

test("Nginx değişebilir kod varlıklarını yeniden doğrular", () => {
  assert.match(
    nginx,
    /location ~\* \\\.\(\?:css\|js\|json\)\$ \{\s*expires -1;\s*limit_except GET HEAD \{ deny all; \}\s*try_files \$uri =404;\s*\}/,
    "CSS, JS ve JSON yanıtları eski sürümle karışmamalı",
  );
  assert.match(
    nginx,
    /location ~\* \\\.\(\?:webp\|png\|jpe\?g\|gif\|ico\|svg\|woff2\?\)\$ \{\s*expires 1h;\s*limit_except GET HEAD \{ deny all; \}\s*try_files \$uri =404;\s*\}/,
    "medya ve font önbelleği ayrı bir location içinde kalmalı",
  );
});

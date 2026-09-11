#!/usr/bin/env node
/**
 * Cloudflare Pages 上での再訪問を検査する（ビルド後に実行）
 *
 * Cloudflare Pages の配信規則を再現して dist/ を配信する。
 *   - /index.html は / へ 308 転送する。Service Worker が転送を経た応答を画面遷移に
 *     返すと、ブラウザが拒否して「このページに到達できません」になる。
 *   - 存在しないパスは、最上位に 404.html があれば 404、無ければ index.html を 200 で
 *     返す（SPA扱い）。後者では旧ハッシュのJS/CSSにHTMLが返り、更新途中で白画面になる。
 */
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, extname, join } from "node:path";
import { chromium } from "playwright";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");
const EXEC = process.env.CHROMIUM_PATH ?? (process.platform === "win32"
  ? "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"
  : "/opt/pw-browsers/chromium-1194/chrome-linux/chrome");
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript",
  ".css": "text/css",
  ".webmanifest": "application/manifest+json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
};

const failures = [];
const check = (condition, label) => {
  console.log(`  ${condition ? "ok " : "NG "} ${label}`);
  if (!condition) failures.push(label);
};

// true にすると 404.html の有無にかかわらず SPA扱い（Service Worker 側の防御を検査する）
let forceSpaFallback = false;

const server = createServer(async (req, res) => {
  const { pathname } = new URL(req.url, "http://localhost");
  if (pathname.endsWith("/index.html")) {
    res.writeHead(308, { Location: pathname.slice(0, -"index.html".length) }).end();
    return;
  }
  const file = pathname.endsWith("/") ? `${pathname}index.html` : pathname;
  try {
    const body = await readFile(join(dist, decodeURIComponent(file)));
    res.writeHead(200, { "Content-Type": TYPES[extname(file)] ?? "application/octet-stream" }).end(body);
  } catch {
    const notFound = forceSpaFallback ? null : await readFile(join(dist, "404.html")).catch(() => null);
    if (notFound) res.writeHead(404, { "Content-Type": TYPES[".html"] }).end(notFound);
    else res.writeHead(200, { "Content-Type": TYPES[".html"] }).end(await readFile(join(dist, "index.html")));
  }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const BASE = `http://127.0.0.1:${server.address().port}/`;

const browser = await chromium.launch({ executablePath: EXEC });
const context = await browser.newContext();
await context.addInitScript(() => localStorage.setItem("abx-navi/disclaimer-acknowledged/v1", "1"));
const page = await context.newPage();

const visit = async () => {
  try {
    await page.goto(BASE, { waitUntil: "load" });
    await page.waitForFunction(() => document.getElementById("root")?.childElementCount > 0, null, { timeout: 5000 });
    return true;
  } catch (err) {
    console.log(`     ${err.message.split("\n")[0]}`);
    return false;
  }
};

console.log("Cloudflare Pages（/index.html → / 転送）での表示");
check(await visit(), "初回表示できる");
const missing = await fetch(`${BASE}assets/index-OLDHASH.js`);
check(missing.status === 404, "存在しないファイルは404を返す（404.htmlでSPA扱いを止める）");
await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 10000 });
check(await visit(), "Service Worker 有効化後にもう一度開ける");
await context.setOffline(true);
check(await visit(), "オフラインでもう一度開ける");
await context.setOffline(false);

console.log("\n存在しないパスにindex.htmlを返す配信先（SPA扱い）での更新途中");
forceSpaFallback = true;
// 旧index.htmlが参照していた旧ハッシュのCSSを読み込む（更新の競合を再現する）
const oldCss = await page.evaluate(async () => {
  const url = new URL("./assets/index-OLDHASH.css", document.baseURI).href;
  const link = Object.assign(document.createElement("link"), { rel: "stylesheet", href: url });
  await new Promise((resolve) => {
    link.onload = link.onerror = resolve;
    document.head.append(link);
  });
  const cached = await caches.match(url);
  return { rules: link.sheet?.cssRules.length ?? 0, cachedType: cached?.headers.get("Content-Type") ?? null };
});
check(oldCss.rules > 0, "旧ハッシュのCSSに現行CSSを返す（HTMLを返さない）");
check(!oldCss.cachedType?.includes("text/html"), "CSSとして要求されたHTMLをキャッシュしない");

await browser.close();
server.close();
console.log(failures.length ? `\nCloudflare再訪問検査: ${failures.length}件失敗` : "\nCloudflare再訪問検査: 全て合格");
process.exit(failures.length ? 1 : 0);

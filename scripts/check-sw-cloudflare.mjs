#!/usr/bin/env node
/**
 * Cloudflare Pages 上での再訪問を検査する（ビルド後に実行）
 *
 * Cloudflare Pages は /index.html を / へ 308 転送する。Service Worker が転送を経た
 * 応答を画面遷移に返すと、ブラウザが拒否して「このページに到達できません」になる。
 * dist/ を同じ転送規則で配信し、初回表示・再訪問・オフライン再訪問を確認する。
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

// Cloudflare Pages と同じく /index.html は / へ 308 転送する
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
    res.writeHead(404).end("not found");
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
await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 10000 });
check(await visit(), "Service Worker 有効化後にもう一度開ける");
await context.setOffline(true);
check(await visit(), "オフラインでもう一度開ける");

await browser.close();
server.close();
console.log(failures.length ? `\nCloudflare再訪問検査: ${failures.length}件失敗` : "\nCloudflare再訪問検査: 全て合格");
process.exit(failures.length ? 1 : 0);

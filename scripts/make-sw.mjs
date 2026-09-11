#!/usr/bin/env node
/**
 * Service Worker を生成する（ビルド後に実行）
 *
 * 要件 NFR-002「完全オフラインで全機能が動作すること」を満たすため、
 * dist/ の全ファイルを列挙して precache する。
 *
 * 方針:
 *   - install で全アセットをキャッシュに入れる（1つでも失敗したら install を失敗させる）
 *   - 更新版は waiting に留め、画面の「今すぐ更新する」でのみ切り替える
 *   - navigation リクエストはキャッシュの index.html を返す（オフラインでも起動する）
 *   - それ以外は cache-first（アセットはハッシュ付きファイル名なので不変）
 *   - activate で古いバージョンのキャッシュを削除する
 *
 * キャッシュ名にはアセット一覧のハッシュを埋め込むため、ビルド内容が変われば
 * 自動的に新しいキャッシュへ切り替わる（NFR-010 の版管理）。
 */

import { readdirSync, statSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join, relative, sep } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

const files = walk(dist)
  .map((f) => "./" + relative(dist, f).split(sep).join("/"))
  .filter((f) => f !== "./sw.js")
  .sort();

// Cloudflare Pages は ./index.html を ./ へ 308 転送する。転送を経た応答を画面遷移に
// 返すとブラウザが拒否する（「このページに到達できません」）ため、./ として取得する
const APP_SHELL = "./";
const assets = files.map((f) => (f === "./index.html" ? APP_SHELL : f));

// 取得URLとアセットの中身から版を決める。どちらかが変わればキャッシュ名も変わる
const hash = createHash("sha256");
files.forEach((f, i) => {
  hash.update(assets[i]);
  hash.update(readFileSync(join(dist, f.slice(2))));
});
const version = hash.digest("hex").slice(0, 12);

const sw = `/* 自動生成 — scripts/make-sw.mjs。手で編集しないこと */
const CACHE = "abx-navi-${version}";
const APP_SHELL = "${APP_SHELL}";
const ASSETS = ${JSON.stringify(assets, null, 2)};

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      // 1つでも欠けるとオフラインで動かないため addAll（全件成功が条件）を使う
      await cache.addAll(ASSETS);
      // 既存ページの読込中に即時activateすると、旧index.htmlが参照する旧JSを
      // 旧キャッシュごと削除して白画面になる。更新版はwaitingに留める。
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names.filter((n) => n.startsWith("abx-navi-") && n !== CACHE).map((n) => caches.delete(n)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // 画面遷移はキャッシュ済みの index.html を返す（オフラインでも起動する）
  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE);
        // ignoreVary: サーバが Vary: Accept-Encoding を返す場合、
        // 保存時とリクエスト時でヘッダが異なると一致しなくなるため無視する
        const cached = await cache.match(APP_SHELL, { ignoreVary: true });
        // 転送を経た応答は画面遷移に使えないため、本文とヘッダから作り直す
        if (cached?.redirected) {
          return new Response(cached.body, { status: cached.status, statusText: cached.statusText, headers: cached.headers });
        }
        if (cached) return cached;
        try {
          return await fetch(request);
        } catch {
          return new Response(
            "<!doctype html><meta charset=utf-8><p>オフラインです。ネットワークに接続した状態で一度開き直してください。",
            { headers: { "Content-Type": "text/html; charset=utf-8" }, status: 503 },
          );
        }
      })(),
    );
    return;
  }

  // アセットはハッシュ付きファイル名で不変のため cache-first
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      const cached = await cache.match(request, { ignoreVary: true });
      if (cached) return cached;

      // 旧index.htmlの読込途中でSWが切り替わった端末の回復処理。
      // 旧ハッシュのJS/CSSが配信先から消えていても、現行キャッシュの同種アセットを返す。
      const currentAsset = async () => {
        const suffix = request.destination === "script" ? ".js" : request.destination === "style" ? ".css" : null;
        if (!suffix || !url.pathname.includes("/assets/")) return null;
        const currentPath = ASSETS.find((path) => path.startsWith("./assets/") && path.endsWith(suffix));
        return currentPath ? await cache.match(currentPath, { ignoreVary: true }) : null;
      };

      try {
        const response = await fetch(request);
        if (response.ok && response.type === "basic") cache.put(request, response.clone());
        if (!response.ok) {
          const fallback = await currentAsset();
          if (fallback) return fallback;
        }
        return response;
      } catch (err) {
        const fallback = await currentAsset();
        if (fallback) return fallback;
        // オフラインかつ未キャッシュ。空の応答よりエラーを明示する
        return new Response("", { status: 504, statusText: "オフライン（未キャッシュ）" });
      }
    })(),
  );
});

// ページからの更新要求（新しい版を今すぐ適用する）
self.addEventListener("message", (event) => {
  if (event.data === "skip-waiting") self.skipWaiting();
});
`;

writeFileSync(join(dist, "sw.js"), sw, "utf8");
console.log(
  `sw.js を生成しました — キャッシュ名 abx-navi-${version} ／ precache ${assets.length} ファイル`,
);
for (const f of assets) console.log(`  ${f}`);

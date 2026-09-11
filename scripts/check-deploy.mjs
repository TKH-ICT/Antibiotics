#!/usr/bin/env node
/**
 * 公開先の配信内容を検査する（デプロイ後に実行。ブラウザ不要）
 *
 * ダッシュボードのビルド設定の誤りや、配信先の挙動の違いは手元のビルドでは検出できない。
 * 実際の公開URLに対して、過去に起きた不具合が再発していないかを確認する。
 *   - ビルド前のソース（/src/main.tsx）が配信されて白紙になる
 *   - Service Worker が事前キャッシュするURLが転送される（再訪問で「このページに到達できません」）
 *   - 存在しないJS/CSSに index.html が 200 で返る（更新途中で白画面）
 *
 * 使い方: npm run check:deploy [-- https://example.pages.dev/]
 */

const BASE = new URL(process.argv[2] ?? process.env.BASE_URL ?? "https://antibiotics-4oo.pages.dev/");
const failures = [];
const check = (condition, label) => {
  console.log(`  ${condition ? "ok " : "NG "} ${label}`);
  if (!condition) failures.push(label);
};
const get = (path) => fetch(new URL(path, BASE), { redirect: "manual", cache: "no-store" });
const typeOf = (response) => response.headers.get("Content-Type") ?? "";

console.log(`公開先の検査: ${BASE.href}`);

const top = await get("./");
const html = await top.text();
const script = html.match(/<script[^>]+type="module"[^>]+src="([^"]+)"/)?.[1] ?? null;
check(top.status === 200 && typeOf(top).includes("text/html"), "トップページが200でHTMLを返す");
check(script !== null && !script.includes("/src/"), `ビルド済みのJSを読み込む（${script ?? "script無し"}）`);
if (script) {
  const js = await get(script);
  check(js.status === 200 && typeOf(js).includes("javascript"), "アプリのJSが200でJavaScriptとして配信される");
}

const sw = await get("./sw.js");
const swText = await sw.text();
check(sw.status === 200 && typeOf(sw).includes("javascript"), "sw.jsが200でJavaScriptとして配信される");
const assets = JSON.parse(swText.match(/const ASSETS = (\[[\s\S]*?\]);/)?.[1] ?? "[]");
check(assets.length > 0, `Service Workerの事前キャッシュ一覧を読める（${assets.length}件）`);
const statuses = await Promise.all(assets.map(async (path) => [path, (await get(path)).status]));
const bad = statuses.filter(([, status]) => status !== 200);
check(bad.length === 0, `事前キャッシュするURLが全て転送なしで200を返す${bad.length ? `（${bad.map(([p, s]) => `${p}→${s}`).join(", ")}）` : ""}`);

const missing = await get(`./assets/index-check-deploy-${Date.now()}.js`);
check(missing.status === 404, `存在しないJSは404を返す（実際: ${missing.status} ${typeOf(missing)}）`);

console.log(failures.length ? `\n公開先の検査: ${failures.length}件失敗` : "\n公開先の検査: 全て合格");
process.exit(failures.length ? 1 : 0);

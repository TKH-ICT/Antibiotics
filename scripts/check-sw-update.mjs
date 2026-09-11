#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const sw = readFileSync(join(root, "dist", "sw.js"), "utf8");
const index = readFileSync(join(root, "dist", "index.html"), "utf8");
const installStart = sw.indexOf('self.addEventListener("install"');
const activateStart = sw.indexOf('self.addEventListener("activate"');
const installBlock = sw.slice(installStart, activateStart);

const failures = [];
const check = (condition, label) => {
  console.log(`  ${condition ? "ok " : "NG "} ${label}`);
  if (!condition) failures.push(label);
};

check(installStart >= 0 && activateStart > installStart, "install/activate処理が存在する");
check(!installBlock.includes("skipWaiting"), "install中に即時activateせずwaitingへ留める");
check(sw.includes('event.data === "skip-waiting"'), "利用者の更新操作ではskipWaitingできる");
check(sw.includes("const currentAsset = async"), "旧ハッシュのJS/CSSから現行アセットへ回復できる");
check(sw.includes('request.destination === "script"') && sw.includes('request.destination === "style"'), "JSとCSSの両方を回復対象にする");
check(index.includes("abx-navi/chunk-recovery/v1"), "JS読込失敗時に端末側キャッシュを一度だけ自動修復する");
// Cloudflare Pages の配信規則への対応（詳細は check-sw-cloudflare.mjs）
check(!sw.includes('"./index.html"'), "アプリ本体は転送されない ./ でキャッシュする（/index.html は / へ308転送される）");
check(existsSync(join(root, "dist", "404.html")), "404.htmlを配信し、存在しないファイルにindex.htmlが返らないようにする");
check(sw.includes("const expectedType"), "JS/CSSとして要求したのにHTMLが返った応答を使わない");

console.log(failures.length ? `\nService Worker検査: ${failures.length}件失敗` : "\nService Worker更新安全性: 全て合格");
process.exit(failures.length ? 1 : 0);

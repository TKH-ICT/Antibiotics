#!/usr/bin/env node
/**
 * TDM画面の安全要件の回帰テスト（UI再編 版2.0 §3.2）
 *
 * 以下は「表示が崩れない」ではなく「誤った用量を出さない」ための要件であり、
 * 一度直しても再発しうるため機械的に検査する。
 *
 *   1. 患者条件が未入力でも、原典の投与量表を全区分そのまま表示する（何も出さない状態を作らない）
 *   2. 患者条件が未入力のとき、どの区分も強調しない（腎機能正常時の用量を既定値として出さない）
 *   3. 条件が確定したときだけ該当区分を強調し、他を淡色化する
 *   4. 上限量の警告は該当区分が確定しているときにのみ出す
 *   5. 採血日時は投与間隔とドーズ数から正しく求まる
 *
 * 使い方: npx vite preview を起動した状態で node scripts/check-tdm.mjs
 */

import { chromium } from "playwright";

const BASE = process.env.BASE_URL ?? "http://localhost:4173";
const EXEC =
  process.env.CHROMIUM_PATH ?? (process.platform === "win32"
    ? "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"
    : "/opt/pw-browsers/chromium-1194/chrome-linux/chrome");

const failures = [];
const check = (cond, label) => {
  console.log(`  ${cond ? "ok " : "NG "} ${label}`);
  if (!cond) failures.push(label);
};

const browser = await chromium.launch({ executablePath: EXEC });
const context = await browser.newContext({ viewport: { width: 900, height: 1000 } });
// 初回起動時の免責確認を済ませた状態で始める（TDMの検査が目的のため）
await context.addInitScript(() => {
  try {
    localStorage.setItem("abx-navi/disclaimer-acknowledged/v1", "1");
  } catch {
    /* noop */
  }
});
const page = await context.newPage();

const openPatientPanel = async () => {
  if ((await page.locator("#f-age").count()) === 0) {
    await page.locator(".ctx-btn.patient").first().click();
    await page.waitForTimeout(150);
  }
};

const setPatient = async (fields) => {
  await openPatientPanel();
  for (const [key, value] of Object.entries(fields)) {
    if (key === "sex") await page.selectOption("#f-sex", value);
    else await page.fill(`#f-${key}`, String(value));
  }
  await page.waitForTimeout(250);
};

/**
 * TDM画面はホームからではなく、薬剤詳細の「TDM対象」バッジから開く。
 * 注射薬 → 成人 → 薬剤名を入力 → カード → TDM対象
 */
const openDesigner = async (drugName) => {
  await page.locator('button:has-text("注射薬")').first().click();
  await page.waitForTimeout(200);
  if ((await page.locator('button:has-text("成人")').count()) > 0) {
    await page.locator('button:has-text("成人")').first().click();
    await page.waitForTimeout(200);
  }
  if ((await page.locator('button:has-text("この条件で薬剤を選ぶ")').count()) > 0) {
    await page.locator('button:has-text("この条件で薬剤を選ぶ")').first().click();
    await page.waitForTimeout(200);
  }
  await page.fill('input[aria-label="薬剤名を入力"]', drugName);
  await page.waitForTimeout(300);
  await page.locator(".result").first().click();
  await page.waitForTimeout(300);
  await page.locator('button:has-text("TDM対象")').first().click();
  await page.waitForTimeout(350);
};

/* ---- 1・2. 未入力でも全区分を出し、どれも強調しない ---- */
console.log("患者条件が未入力のとき");
await page.goto(BASE, { waitUntil: "networkidle" });
await openDesigner("バンコマイシン");
check((await page.locator(".renal-row").count()) === 6, "VCM: 全6区分（eGFR5段階＋HD）を表示する");
check((await page.locator(".renal-row.active").count()) === 0, "VCM: どの区分も強調しない");
check((await page.locator(".banner.danger").count()) === 0, "VCM: 上限警告を出さない");

/* 左の区分名が幅を取りすぎて、右の用量列をつぶさない */
await page.setViewportSize({ width: 600, height: 1000 });
const tdmColumns = await page.locator(".tdm-dose-grid .renal-row").first().evaluate((row) => {
  const cells = row.children;
  return {
    row: row.getBoundingClientRect().width,
    left: cells[0].getBoundingClientRect().width,
    right: cells[1].getBoundingClientRect().width,
  };
});
check(tdmColumns.left <= 112, "TDM: 左の区分名列を112px以下に抑える");
check(tdmColumns.right >= tdmColumns.row * 0.6, "TDM: 右の用量・数値列を行幅の60%以上確保する");
await page.setViewportSize({ width: 900, height: 1000 });

await page.goto(BASE, { waitUntil: "networkidle" });
await openDesigner("ゲンタマイシン");
check((await page.locator(".renal-row").count()) === 2, "AG: 全2区分を表示する");
check(
  (await page.locator(".renal-row.active").count()) === 0,
  "AG: どの区分も強調しない（腎機能正常時の用量を既定値にしない）",
);

/* ---- 3. 条件が確定したら該当区分だけを強調する ---- */
console.log("\n患者条件を入力したとき");
await page.goto(BASE, { waitUntil: "networkidle" });
await openDesigner("バンコマイシン");
await setPatient({ age: 70, sex: "male", weight: 60, height: 165, scr: "1.0", egfr: 95 });
const derived = await page.locator(".derived").innerText();
check(/58\.3/.test(derived), "Cockcroft-Gault: (140-70)×60/(72×1.0) = 58.3 mL/min");
const active = await page.locator(".renal-row.active").innerText();
check(/eGFR 90–120/.test(active), "VCM: eGFR 95 → 「eGFR 90–120」を強調");
check((await page.locator(".renal-row.dim").count()) === 5, "VCM: 他の5区分を淡色化");
check(/900mg/.test(active) && /1800mg/.test(active), "VCM: 15mg/kg×60kg = 1回900mg・1日1800mg");

/* ---- 4. 上限警告は該当区分にのみ出す ---- */
await page.goto(BASE, { waitUntil: "networkidle" });
await openDesigner("バンコマイシン");
await setPatient({ age: 70, sex: "male", height: 165, scr: "1.0", egfr: 95, weight: 150 });
check(
  (await page.locator(".renal-row.active .banner.danger").count()) === 1,
  "VCM: 1日総量4500mg で4g超過の警告を該当区分に出す",
);
check(
  (await page.locator(".renal-row.dim .banner").count()) === 0,
  "VCM: 淡色化した区分には警告を出さない",
);

await page.goto(BASE, { waitUntil: "networkidle" });
await openDesigner("ゲンタマイシン");
await setPatient({ age: 80, sex: "female", weight: 45, scr: "1.8" });
check(
  /≦ 50/.test(await page.locator(".renal-row.active").innerText()),
  "AG: CCr 17.7 → 「CCr ≦ 50 mL/min」を強調",
);

/* ---- 5. 採血日時 ---- */
console.log("\n採血日時の算出");
await page.goto(BASE, { waitUntil: "networkidle" });
await openDesigner("バンコマイシン");
check(
  (await page.locator(".card .dose-conv").count()) === 0,
  "入力が欠けているうちは採血日時を出さない（推定で埋めない）",
);
await page.fill("#tdm-first", "2026-08-27T09:00");
await page.fill("#tdm-interval", "12");
await page.fill("#tdm-dose-no", "5");
await page.waitForTimeout(250);
const sched = await page.locator(".card .dose-conv").innerText();
check(
  /8月29日/.test(sched) && /09:00/.test(sched) && /48 時間後/.test(sched),
  "8/27 09:00 から12時間毎の5ドーズ目 = 8/29 09:00（48時間後）",
);

await browser.close();
console.log(
  failures.length > 0 ? `\n失敗 ${failures.length}件` : "\nTDMの安全要件: 全て合格",
);
process.exit(failures.length > 0 ? 1 : 0);

#!/usr/bin/env node
import { chromium } from "playwright";

const BASE = process.env.BASE_URL ?? "http://localhost:4173";
const EXEC = process.env.CHROMIUM_PATH ?? (process.platform === "win32"
  ? "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"
  : "/opt/pw-browsers/chromium-1194/chrome-linux/chrome");
const failures = [];
const check = (condition, label) => {
  console.log(`  ${condition ? "ok " : "NG "} ${label}`);
  if (!condition) failures.push(label);
};

const browser = await chromium.launch({ executablePath: EXEC });
const context = await browser.newContext({ viewport: { width: 900, height: 1000 } });
await context.addInitScript(() => localStorage.setItem("abx-navi/disclaimer-acknowledged/v1", "1"));
const page = await context.newPage();
const click = async (text) => {
  await page.locator(`button:has-text("${text}")`).first().click();
  await page.waitForTimeout(150);
};
const openDrug = async (lane, mode, query) => {
  await page.goto(BASE, { waitUntil: "networkidle" });
  await click(lane);
  await click(mode);
  await click("この条件で薬剤を選ぶ");
  await page.fill('input[aria-label="薬剤名を入力"]', query);
  await page.locator(".result").first().click();
};

console.log("適応外使用の表示制御");
await openDrug("注射薬", "成人", "セフェピム");
const adultDetails = page.locator(".offlabel-details");
check(await adultDetails.count() === 1, "成人では適応外使用の入口を表示する");
check(!(await adultDetails.evaluate((el) => el.open)), "成人の適応外使用は初期状態で折り畳む");
check(await page.locator(".offlabel-details .dose-conv").count() === 0, "適応外用量に緑色の換算用クラスを使わない");
await adultDetails.locator("summary").click();
check(await page.locator(".offlabel-details .offlabel-dose").count() > 0, "クリック後に適応外用量を表示する");

console.log("選択した剤形だけを薬剤詳細に表示");
await openDrug("内服薬", "成人", "シプロキサン");
let routeText = await page.locator("main").innerText();
check(routeText.includes("1回200-400mg 1日2回"), "内服: シプロフロキサシンの経口用量を表示する");
check(!routeText.includes("400mg 12時間毎（最大1200mg/day）"), "内服: 注射通常量を表示しない");
check(!routeText.includes("シプロフロキサシン点滴静注液400mg"), "内服: 注射製品・適応外情報を表示しない");
check(!routeText.includes("当院採用注射抗菌薬一覧"), "内服: 注射製剤情報への導線を表示しない");

await openDrug("注射薬", "成人", "シプロキサン");
routeText = await page.locator("main").innerText();
check(routeText.includes("400mg 12時間毎（最大1200mg/day）"), "注射: シプロフロキサシンの注射用量を表示する");
check(!routeText.includes("1回200-400mg 1日2回"), "注射: 経口通常量を表示しない");
check(!routeText.includes("シプロキサン錠200mg"), "注射: 内服製品・適応外情報を表示しない");

await openDrug("内服薬", "成人", "アジスロマイシン");
routeText = await page.locator("main").innerText();
check(routeText.includes("1回500mg 1日1回 3日間"), "内服: アジスロマイシンの経口用量を表示する");
check(!routeText.includes("ジスロマック点滴静注用500mg"), "内服: アジスロマイシンの注射製品を表示しない");

// 集団の切替はラベル文言ではなくクラスで掴む。この検査の対象は適応外使用の出し分けであって
// ボタンの文言ではないため（文言は check-navigation.mjs が見ている）、
// 表記が変わってもここが落ちないようにする。
await openDrug("注射薬", "成人", "セフェピム");
await page.locator(".ctx-btn.switch").click();
await page.waitForTimeout(300);
const pediatricDetails = page.locator(".offlabel-details");
check(await pediatricDetails.count() === 1, "明示的な小児適応外使用は小児画面に表示する");
await pediatricDetails.locator("summary").click();
const pediatricText = await pediatricDetails.innerText();
check(pediatricText.includes("小児の肺炎"), "小児画面にセフェピム小児肺炎を表示する");
check(!pediatricText.includes("緑膿菌菌血症"), "成人向け適応外使用を小児画面に混在させない");

console.log("通常量・腎機能用量の強調");
await openDrug("注射薬", "成人", "イミペネム");
const primaryHeadings = await page.locator("section.dosing-primary > h3").allInnerTexts();
check(primaryHeadings.some((t) => t.includes("通常量")), "通常量を強調カードで表示する");
check(primaryHeadings.some((t) => t.includes("腎機能低下時")), "腎機能・透析用量を強調カードで表示する");
check((await page.locator(".renal-row").allInnerTexts()).some((t) => t.includes("血液透析")), "透析時用量を腎機能カード内に表示する");

console.log("薬剤詳細のピーク・トラフ・AUC表");
await openDrug("注射薬", "成人", "バンコマイシン");
await page.setViewportSize({ width: 375, height: 1000 });
const targetLayout = await page.locator(".tdm-kv").evaluate((grid) => {
  const label = grid.querySelector(".tdm-target-label");
  const values = [...grid.querySelectorAll(".tdm-target-value")];
  return {
    labelWidth: label?.getBoundingClientRect().width ?? Infinity,
    gridWidth: grid.getBoundingClientRect().width,
    valueWidths: values.map((value) => ({
      width: value.getBoundingClientRect().width,
      scrollWidth: value.scrollWidth,
      height: value.getBoundingClientRect().height,
      lineHeight: Number.parseFloat(getComputedStyle(value).lineHeight),
    })),
  };
});
check(targetLayout.labelWidth <= 124, "TDMピーク・トラフ表: 左タイトル列を124px以下に抑える");
check(targetLayout.valueWidths.every((v) => v.width >= targetLayout.gridWidth * 0.5), "TDMピーク・トラフ表: 右数値列を表幅の50%以上確保する");
check(targetLayout.valueWidths.every((v) => v.scrollWidth <= v.width + 1 && v.height <= v.lineHeight * 2 + 1), "TDMピーク・トラフ表: 数値をはみ出さず1-2行以内で表示する");
await page.setViewportSize({ width: 900, height: 1000 });

console.log("アンチバイオグラムから薬剤への遷移");
await page.goto(BASE, { waitUntil: "networkidle" });
await click("菌種別");
await page.fill('input[aria-label="菌名を入力"]', "大腸菌");
await page.locator(".result").first().click();
await page.getByRole("button", { name: "アンピシリンの薬剤画面を開く", exact: true }).click();
check((await page.locator(".detail-head h2").innerText()).includes("アンピシリン"), "抗菌薬略号クリックで該当薬剤画面へ遷移する");

await browser.close();
if (failures.length) {
  console.error(`\n不合格 ${failures.length}件`);
  process.exit(1);
}
console.log("\n今回の医学・UI修正: 全て合格");

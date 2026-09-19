#!/usr/bin/env node
/**
 * 画面構成の回帰テスト（要件 FR-000 / FR-011 / FR-013）
 *
 * オープニングの大項目、適正使用の手引き（感染症別）、その他の中身、成人／小児の選択、AWaRe分類の選択、
 * 小児で成人向けの情報を隠すこと、を機械的に確認する。
 *
 * 使い方: npx vite preview を起動した状態で node scripts/check-navigation.mjs
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
await context.addInitScript(() => {
  try {
    localStorage.setItem("abx-navi/disclaimer-acknowledged/v1", "1");
  } catch {
    /* noop */
  }
});
const page = await context.newPage();

const home = () => page.goto(BASE, { waitUntil: "networkidle" });
const click = async (text) => {
  await page.locator(`button:has-text("${text}")`).first().click();
  await page.waitForTimeout(220);
};
const openDrug = async (lane, mode, name) => {
  await home();
  await click(lane);
  await click(mode);
  await click("この条件で薬剤を選ぶ");
  await page.fill('input[aria-label="薬剤名を入力"]', name);
  await page.waitForTimeout(300);
  await page.locator(".result").first().click();
  await page.waitForTimeout(300);
};

/* ---- オープニング ---- */
console.log("オープニング");
await home();
check((await page.locator(".top-btn").count()) === 5, "大項目は5ボタン");
const tops = await page.locator(".top-btn").allInnerTexts();
for (const label of ["内服薬", "注射薬", "適正使用の手引き", "菌種別", "その他"]) {
  check(tops.some((t) => t.trim() === label), `大項目に「${label}」がある`);
}
check(
  (await page.locator("h1").innerText()).includes("TKH抗菌薬投与マニュアル"),
  "タイトルが表示される",
);
check((await page.locator(".opening-art").count()) === 1, "イラストが表示される");
check(
  (await page.locator('header button:has-text("アプリの説明")').count()) === 1,
  "「アプリの説明」がヘッダー（欄外）にある",
);

/* ---- その他 ---- */
console.log("\nその他");
await home();
await click("その他");
// 適正使用の手引きは大項目へ移したので4ボタン
check((await page.locator(".top-btn").count()) === 4, "その他は4ボタン");
const others = await page.locator(".top-btn").allInnerTexts();
for (const label of ["周術期", "暴露後予防投与", "小児体重服用量簡易表", "AMR対策"]) {
  check(others.some((t) => t.trim() === label), `その他に「${label}」がある`);
}
check(
  !others.some((t) => t.trim() === "適正使用の手引き"),
  "その他に適正使用の手引きを残さない（大項目へ移動）",
);
check(
  !(await page.locator("main").innerText()).includes("アナフィラキシー"),
  "アナフィラキシーの項目が削除されている",
);

/* ---- 成人／小児 ---- */
console.log("\n成人／小児の選択");
await home();
await click("内服薬");
check((await page.locator(".top-btn").count()) === 2, "成人・小児の2ボタンのみ");

// 一度選んだ後も、ホームから入り直せば必ず集団選択を経由する
await click("成人");
check((await page.locator(".patient-step").count()) === 1, "成人／小児の次に患者条件画面を出す");
await click("この条件で薬剤を選ぶ");
await page.locator('button:has-text("⌂ ホーム")').click();
await click("内服薬");
check((await page.locator(".top-btn").count()) === 2, "選択済みでも成人・小児画面を飛ばさない");

/* ---- 内服薬のAWaRe選択 ---- */
console.log("\n内服薬（AWaRe分類）");
await click("成人");
await click("この条件で薬剤を選ぶ");
check(
  (await page.locator('input[aria-label="薬剤名を入力"]').count()) === 1,
  "薬剤名の入力欄がある",
);
check((await page.locator(".result").count()) === 0, "この画面では薬剤一覧を出さない");
const awareText = await page.locator(".aware-lead").innerText();
check(/AWaRe分類/.test(awareText), "AWaRe分類の解説がある");
check(/Access から選択/.test(awareText), "理由がなければAccessから選ぶことを強調している");
const bigButtons = await page.locator(".top-btn").allInnerTexts();
for (const label of ["Access", "Watch", "Reserve"]) {
  check(bigButtons.some((t) => t.includes(label)), `大きなボタンに「${label}」がある`);
}

// 分類を選ぶと薬剤名が並ぶ
await click("Access");
check((await page.locator(".result").count()) > 0, "Accessを選ぶと薬剤名が一覧される");

/* ---- 小児では成人向けの情報を隠す ---- */
console.log("\n小児での表示");
await openDrug("注射薬", "成人", "セフェピム");
check((await page.locator(".renal-row").count()) > 0, "成人: 腎機能低下時の区分表が出る");

await openDrug("注射薬", "小児", "セフェピム");
const ped = await page.locator("main").innerText();
check((await page.locator(".renal-row").count()) === 0, "小児: 腎機能低下時の区分表を出さない");
check(/成人を対象/.test(ped), "小児: 成人向けである旨を明示する");
check(!/CCr > 50/.test(ped), "小児: 成人のCCr区分の用量が出ない");
check(/通常量（小児）/.test(ped), "小児: 小児の通常量は表示される");

/* ---- 薬剤ごとのツールへの導線 ---- */
console.log("\n薬剤に紐づくツール");
await openDrug("注射薬", "成人", "バンコマイシン");
check(
  (await page.locator('button:has-text("TDM対象")').count()) === 1,
  "TDM対象の薬剤から投与設計へ飛べる",
);
check(
  (await page.locator('button:has-text("当院採用注射抗菌薬一覧")').count()) === 1,
  "製剤情報から採用薬一覧へ飛べる",
);
await openDrug("注射薬", "成人", "ベンジルペニシリン");
check(
  (await page.locator('button:has-text("ペニシリンG持続静注")').count()) === 1,
  "ペニシリンGから持続静注の説明へ飛べる",
);

/* ---- 患者条件フォームを出す画面 ---- */
console.log("\n患者条件フォームの出し分け");
const hasPatientButton = async () => (await page.locator(".ctx-btn.patient").count()) > 0;

await home();
await click("菌種別");
check(!(await hasPatientButton()), "菌種別では患者条件を出さない");

for (const item of ["暴露後予防投与", "小児体重服用量簡易表", "AMR対策"]) {
  await home();
  await click("その他");
  check(!(await hasPatientButton()), `その他のメニューでは出さない（${item}の前）`);
  await click(item);
  check(!(await hasPatientButton()), `${item}では出さない`);
}

await home();
await click("その他");
await click("周術期");
check(await hasPatientButton(), "周術期では患者条件を出す（体重で1回量が決まるため）");

await home();
await click("内服薬");
await click("成人");
check((await page.locator(".patient-step").count()) === 1, "薬剤レーンでは患者条件を独立画面で出す");
check((await page.locator("#f-age").count()) === 1, "成人の患者条件入力欄を表示する");
await click("この条件で薬剤を選ぶ");
check(await hasPatientButton(), "薬剤選択後も患者条件を変更できる");

/* ---- 戻る／ホーム ---- */
console.log("\n戻る／ホーム");
await home();
await click("内服薬");
await click("成人");
await click("この条件で薬剤を選ぶ");
await click("Access");
check((await page.locator(".navkey").count()) === 2, "戻る・ホームの2キーがある");
await page.locator('.navkey:has-text("戻る")').click();
await page.waitForTimeout(250);
check((await page.locator(".aware-lead").count()) === 1, "戻るで分類の選択へ戻る");
await page.locator('.navkey:has-text("戻る")').click();
await page.waitForTimeout(250);
check((await page.locator(".patient-step").count()) === 1, "さらに戻ると患者条件入力へ");
await page.locator('.navkey:has-text("戻る")').click();
await page.waitForTimeout(250);
check((await page.locator(".top-btn.adult").count()) === 1, "患者条件から戻ると成人／小児の選択へ");
await page.locator('.navkey:has-text("ホーム")').click();
await page.waitForTimeout(250);
check((await page.locator(".opening-art").count()) === 1, "ホームでオープニングへ戻る");

/* ---- 小児の患者条件は体重のみ ---- */
console.log("\n小児の患者条件と1日投与量");
await home();
await click("内服薬");
await click("小児");
check((await page.locator("#f-weight").count()) === 1, "小児: 体重の入力欄がある");
for (const f of ["age", "sex", "height", "scr", "egfr", "rrt"]) {
  check((await page.locator(`#f-${f}`).count()) === 0, `小児: ${f} の欄を出さない`);
}

// 体重から1日投与量が出ること。
// 原典「1日20-40mg/kg（90mg/kg/dayまで）」の上限は体重あたりなので、
// 20kg なら 400-800mg。絶対量として扱うと 90mg に誤クリップされる。
await page.fill("#f-weight", "20");
await page.waitForTimeout(300);
await click("この条件で薬剤を選ぶ");
await page.fill('input[aria-label="薬剤名を入力"]', "アモキシシリン");
await page.waitForTimeout(350);
await page.locator(".result").first().click();
await page.waitForTimeout(350);
const pedText = await page.locator("main").innerText();
check(/1日 400-800mg/.test(pedText), "小児: 体重20kgで1日400-800mgと換算される");
check(!/上限でクリップ/.test(pedText), "小児: 体重あたりの上限を絶対量として誤クリップしない");

/* ---- 「1回◯mgまで」の分割回数の適用（divisionsPerDay） ---- */
console.log("\n「1回◯mgまで」の自動計算（分割回数）");

// リネゾリド 30mg/kg/day 分3（1回600mgまで）
// 25kg: 750mg/day ÷3 = 250mg/回。上限未満なのでクリップなし
await openDrug("注射薬", "小児", "リネゾリド");
await page.locator(".ctx-btn.patient").click();
await page.fill("#f-weight", "25");
await page.waitForTimeout(300);
await page.locator(".ctx-btn.patient").click();
await page.waitForTimeout(150);
let doseText = await page.locator("main").innerText();
check(/1日 750mg/.test(doseText), "リネゾリド25kg: 1日750mgと換算される");
check(/1回 250mg を1日3回/.test(doseText), "リネゾリド25kg: 1回250mg×3回の内訳が出る");
check(!/上限でクリップ/.test(doseText), "リネゾリド25kg: 上限未満なのでクリップされない");

// 70kg: 2100mg/day ÷3 = 700mg/回 → 600mgでクリップ。見出しの1日量も 600×3=1800mg に整合させる
await openDrug("注射薬", "小児", "リネゾリド");
await page.locator(".ctx-btn.patient").click();
await page.fill("#f-weight", "70");
await page.waitForTimeout(300);
await page.locator(".ctx-btn.patient").click();
await page.waitForTimeout(150);
doseText = await page.locator("main").innerText();
check(/1回 600mg を1日3回/.test(doseText), "リネゾリド70kg: 1回量が600mgの上限でクリップされる");
check(
  /1日 1800mg/.test(doseText),
  "リネゾリド70kg: 見出しの1日量も、クリップ後の1回量×回数(1800mg)に整合する",
);
check(/1回量の上限でクリップ/.test(doseText), "リネゾリド70kg: 1回量の上限でクリップした旨の注記がある");

/* ---- その他（AWaRe分類対象外）のジャンル分け ---- */
console.log("\nその他（AWaRe分類対象外）のジャンル分け");
await home();
await click("内服薬");
await click("成人");
await click("この条件で薬剤を選ぶ");
await click("その他");
await page.waitForTimeout(250);
const genreButtons = await page.locator(".top-btn").allInnerTexts();
for (const label of ["抗真菌薬", "抗ウイルス薬", "抗結核薬", "駆虫薬"]) {
  check(genreButtons.some((t) => t.includes(label)), `ジャンルボタンに「${label}」がある`);
}
await click("抗真菌薬");
check((await page.locator(".result").count()) > 0, "ジャンルを選ぶと薬剤名が一覧される");
const genreListText = await page.locator("main").innerText();
check(/フルコナゾール|ボリコナゾール/.test(genreListText), "選んだジャンルの薬剤が含まれる");
check(!/オセルタミビル/.test(genreListText), "他ジャンルの薬剤は含まれない");

/* ---- 小児ではTDM画面を出さない ---- */
console.log("\n小児ではTDM画面を出さない");
await openDrug("注射薬", "小児", "バンコマイシン");
check(
  (await page.locator('button:has-text("TDM対象")').count()) === 0,
  "小児の薬剤詳細にTDM対象バッジを出さない",
);
check(
  /TDM投与設計は成人を対象/.test(await page.locator("main").innerText()),
  "小児の薬剤詳細にTDMは成人向けである旨を出す",
);

await openDrug("注射薬", "成人", "バンコマイシン");
check(
  (await page.locator('button:has-text("TDM対象")').count()) === 1,
  "成人の薬剤詳細にはTDM対象バッジを出す",
);
await click("TDM対象");
check((await page.locator("#tdm-first").count()) === 1, "成人ではTDM投与設計画面が開く");

// ヘッダーから集団を切り替えた場合も、その場でTDM画面を止める
await page.locator(".ctx-btn.switch").click();
await page.waitForTimeout(300);
check(
  /TDM投与設計は成人を対象/.test(await page.locator("main").innerText()),
  "TDM画面表示中に小児へ切り替えると成人向けの案内に切り替わる",
);
check((await page.locator("#tdm-first").count()) === 0, "小児では投与設計フォームを表示しない");

/* ---- 感染症別（FR-017） ---- */
console.log("\n感染症別");
await home();
const topsWithInfection = await page.locator(".top-btn").allInnerTexts();
check(
  !topsWithInfection.some((t) => t.trim() === "感染症別"),
  "大項目から「感染症別」を外した",
);
check(
  topsWithInfection.some((t) => t.trim() === "適正使用の手引き"),
  "大項目に「適正使用の手引き」がある",
);

await click("適正使用の手引き");
const guideText = await page.locator("main").innerText();
check(/厚生労働省/.test(guideText), "手引きの画面で厚生労働省が出典であると明示する");
check(
  (await page.locator(".top-btn").allInnerTexts()).some((t) => t.trim() === "感染症別"),
  "手引きの先頭に「感染症別」がある",
);
await click("感染症別");
check((await page.locator(".top-btn").count()) === 2, "感染症別でも成人・小児の選択を挟む");
await click("成人");

// FR-100-5: 感染症名で引いたら、その感染症のことが1画面に集まっている
await page.fill('input[aria-label="感染症名を入力"]', "気管支炎");
await page.waitForTimeout(300);
check((await page.locator(".result").count()) > 0, "感染症名で検索できる");
await page.locator(".result").first().click();
await page.waitForTimeout(350);
let infText = await page.locator("main").innerText();
check(/平均17.8日/.test(infText) === false, "疾患メモの数値は初期表示で畳む");
check(/基礎疾患・合併症のない成人には投与しない/.test(infText), "気管支炎の外来編情報を表示する");

// FR-017-5: 薬剤名から薬剤詳細へ
await home();
await click("適正使用の手引き");
await click("感染症別");
await click("成人");
await click("気道・耳鼻科");
await click("急性鼻副鼻腔炎");
check((await page.locator(".rx-link").count()) > 0, "推奨薬が薬剤詳細へのリンクになっている");
await page.locator(".rx-link").first().click();
await page.waitForTimeout(350);
check(
  /アモキシシリン/.test(await page.locator("h2").first().innerText()),
  "薬剤名から当院の薬剤詳細へ遷移する",
);
await click("← 戻る");

// FR-000-7: 成人と小児の用量を同一画面に並べない
infText = await page.locator("main").innerText();
check(/1回 500mg 1日3回 経口（成人）/.test(infText), "成人では成人の用量を出す");
check(!/分3〜4/.test(infText), "成人の画面に小児の用量を出さない");
check(!/小児の遷延性/.test(infText), "成人の画面に小児向けの判定表を出さない");

await page.locator('.ctx-btn:has-text("小児に切替")').click();
await page.waitForTimeout(350);
infText = await page.locator("main").innerText();
check(/分3〜4/.test(infText), "小児に切り替えると小児の用量を出す");
check(!/1回 500mg 1日3回 経口（成人）/.test(infText), "小児の画面に成人の用量を出さない");
check(/遷延性/.test(infText), "小児では小児向けの判定表を出す");

// FR-100-2/FR-100-4: 数値は畳んで置くが、失われてはいない
await home();
await click("適正使用の手引き");
await click("感染症別");
await click("成人");
await click("気道・耳鼻科");
await page.locator('.result-name', { hasText: /^感冒$/ }).click();
infText = await page.locator("main").innerText();
check(/抗菌薬投与を行わないことを推奨/.test(infText), "「投与しない」推奨を結論として出す");
check(!/嘔吐・下痢・皮疹/.test(infText), "根拠の数値は初期表示では畳まれている");
await page.locator("summary").first().click();
await page.waitForTimeout(250);
check(/2.62倍/.test(await page.locator("main").innerText()), "開くと数値が読める");

// 外来編を残しつつ、院内表2は一つの項目に分離する
await home();
await click("適正使用の手引き");
await click("感染症別");
await click("成人");
await click("院内発症感染症");
await click("院内発症感染症");
infText = await page.locator("main").innerText();
check(/市中感染へ外挿しない/.test(infText), "院内発症の原因微生物表と明示する");
check(!/短期治療期間/.test(infText), "混在する投与期間表を疾患ページに載せない");
check((await page.locator(".chip-link").count()) === 0, "表外の菌リンク一覧を表示しない");
check((await page.locator(".table-organism-link").count()) > 0, "表2の菌名からアンチバイオグラムへ進める");

await home();
await click("適正使用の手引き");
await click("感染症別");
await click("小児");
await click("気道・耳鼻科");
await click("急性中耳炎");
infText = await page.locator("main").innerText();
check(/2〜3日経過観察/.test(infText), "小児の急性中耳炎を表示する");
check(/75%以上/.test(infText) === false, "中耳炎の数値も疾患メモに畳む");

/* ---- 手引きの小項目 ---- */
console.log("\n適正使用の手引き");
await home();
await click("適正使用の手引き");
const stewardshipItems = await page.locator(".top-btn").allInnerTexts();
check(stewardshipItems.length === 4, "手引きは 感染症別＋3項目 の4ボタン");
check(!stewardshipItems.some((t) => t.includes("急性下痢症")), "小項目に急性下痢症を重複表示しない");
check(!stewardshipItems.some((t) => t.includes("院内感染症の代表的な原因微生物")), "小項目に院内感染症の原因微生物を重複表示しない");
check(!stewardshipItems.some((t) => t.includes("感染症が改善しないとき")), "「感染症が改善しないとき」を廃止した");
check(!stewardshipItems.some((t) => t.includes("終末期患者への抗菌薬")), "「終末期患者への抗菌薬」を廃止した");
for (const label of ["血液培養の解釈", "治療期間の早見表", "経口薬への切り替え"]) {
  check(
    (await page.locator(".top-btn").allInnerTexts()).some((t) => t.includes(label)),
    `適正使用の手引きに「${label}」がある`,
  );
}
await click("治療期間の早見表");
const topicText = await page.locator("main").innerText();
check(/椎体椎間板炎/.test(topicText), "疾患ページに載らない行も表として残っている");
check(/6週間/.test(topicText), "治療期間の数値が出る");

await browser.close();
console.log(failures.length > 0 ? `\n失敗 ${failures.length}件` : "\n画面構成: 全て合格");
process.exit(failures.length > 0 ? 1 : 0);

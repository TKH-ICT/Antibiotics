import type { Drug, PatientState, PatientMode, Route, Dose, RenalBand } from "../types";
import { RENAL_BAND_LABEL, OFFLABEL_CATEGORY_LABEL } from "../types";
import { convertPerKg, renalRuleForPatient, resolveRenalBand } from "../lib/calc";
import { offLabelForDrug } from "../lib/search";
import { DISEASE_BY_ID } from "../data";
import type { DrugLane } from "../lib/lanes";

const ROUTE_LABEL: Record<Route, string> = {
  iv: "注射",
  po: "経口",
  im: "筋注",
  inhalation: "吸入",
};

const BAND_ORDER: RenalBand[] = ["gt50", "ccr10_50", "lt10", "hd", "chdf"];

/** 薬剤詳細から参照させたい専用ページ */
const RELATED_PAGES: Record<string, { key: string; label: string; sub: string }> = {
  benzylpenicillin: {
    key: "pcg",
    label: "ペニシリンG持続静注の投与方法 →",
    sub: "1日総量と投与経路から調製手順・K濃度を確認できます（原典 p.28-29）",
  },
};

type Props = {
  drug: Drug;
  lane?: DrugLane;
  mode: PatientMode;
  patient: PatientState;
  onOpenDesigner: (key: string) => void;
  onOpenPage: (key: string) => void;
  onSwitchMode: () => void;
};

const INJECTABLE_PRODUCT = /注射|点滴|静注|筋注|静脈|バイアル|バッグ/;
const ORAL_PRODUCT = /錠|カプセル|細粒|顆粒|ドライシロップ|シロップ|内服/;

/** 製品名が複数並ぶ適応外使用から、選択した剤形に該当する製品名だけを残す。 */
function productLabelForLane(label: string, lane?: DrugLane): string | null {
  if (!lane) return label;
  const products = label.split("、").map((part) => part.trim()).filter(Boolean);
  const classified = products.filter((part) => INJECTABLE_PRODUCT.test(part) || ORAL_PRODUCT.test(part));
  const matches = products.filter((part) =>
    lane === "oral" ? ORAL_PRODUCT.test(part) : INJECTABLE_PRODUCT.test(part),
  );
  if (matches.length > 0) return matches.join("、");
  return classified.length > 0 ? null : label;
}

function DoseRow({
  dose,
  patient,
  mode,
}: {
  dose: Dose;
  patient: PatientState;
  mode: PatientMode;
}) {
  const conv = dose.perKg ? convertPerKg(dose.perKg, patient) : null;
  const showPerKgOnly = mode === "pediatric" && patient.weight == null;

  return (
    <div className="dose-row">
      {dose.indication && <div className="dose-ind">{dose.indication}</div>}
      <div className="dose-text">
        {dose.text}
        {dose.offLabel && (
          <>
            {" "}
            <span className="badge offlabel">適応外</span>
          </>
        )}
      </div>
      {conv && !showPerKgOnly && (
        // 小児は体重から換算した1日投与量が主役になるため大きく出す
        <div className={`dose-conv mono${mode === "pediatric" ? " strong" : ""}`}>
          → {conv.text}
          <span style={{ opacity: 0.75 }}>（{conv.basisLabel}）</span>
          {conv.clipped && <b>　※上限でクリップ</b>}
        </div>
      )}
      {conv && !showPerKgOnly && conv.perDose && (
        <div className="dose-conv mono" style={{ marginTop: 3 }}>
          　{conv.perDose.text}
          {conv.perDose.clipped && <b>　※1回量の上限でクリップ</b>}
        </div>
      )}
      {conv && !showPerKgOnly && conv.uncappedNote && (
        <div className="dose-note">
          <b>{conv.uncappedNote}</b>（1日量からの自動計算には反映されていません）
        </div>
      )}
      {showPerKgOnly && dose.perKg && (
        <div className="dose-note">体重を入力すると1日投与量（mg）に換算します。</div>
      )}
      {dose.note && <div className="dose-note">{dose.note}</div>}
    </div>
  );
}

export function DrugDetail({
  drug,
  lane,
  mode,
  patient,
  onOpenDesigner,
  onOpenPage,
  onSwitchMode,
}: Props) {
  const relatedPage = lane === "oral" ? undefined : RELATED_PAGES[drug.id];
  const allDosing = mode === "adult" ? drug.adult : drug.pediatric;
  const visibleRoutes: Route[] = lane === "oral"
    ? ["po"]
    : lane === "injectable"
      ? ["iv", "im", "inhalation"]
      : allDosing
        ? (Object.keys(allDosing) as Route[])
        : [];
  const dosing = allDosing
    ? Object.fromEntries(
        visibleRoutes.filter((route) => (allDosing[route]?.length ?? 0) > 0).map((route) => [route, allDosing[route]]),
      ) as Partial<Record<Route, Dose[]>>
    : undefined;
  const otherModeLabel = mode === "adult" ? "小児" : "成人";
  const otherModeDosing = mode === "adult" ? drug.pediatric : drug.adult;
  const hasOtherMode = visibleRoutes.some((route) => (otherModeDosing?.[route]?.length ?? 0) > 0);
  const activeBand = resolveRenalBand(patient);
  const showIvRenal = lane !== "oral" && !!drug.renal;
  const showPoRenal = lane !== "injectable" && !!drug.renalPo;
  const activeIvRule = showIvRenal ? renalRuleForPatient(drug, patient, "iv") : null;
  const activePoRule = showPoRenal ? renalRuleForPatient(drug, patient, "po") : null;
  const usesCustomRenalRules =
    (showIvRenal && !!drug.renalRules?.iv) || (showPoRenal && !!drug.renalRules?.po);
  const hasRrt = patient.rrt !== "none";
  const renalInputResolved = hasRrt || usesCustomRenalRules
    ? hasRrt || !!activeIvRule || !!activePoRule
    : activeBand != null;
  const hasRelevantRenal = showIvRenal || showPoRenal || !!drug.renalNote;
  const offLabel = offLabelForDrug(drug.id)
    .filter((use) => (use.populations ?? ["adult"]).includes(mode))
    .flatMap((use) => {
      const productLabel = productLabelForLane(use.productLabel, lane);
      return productLabel ? [{ ...use, productLabel }] : [];
    });

  return (
    <div>
      <div className="detail-head">
        <h2>{drug.genericName.ja}</h2>
        <p className="en">
          {drug.genericName.en}
          {drug.abbr && ` ／ ${drug.abbr}`} ／ {drug.class}
        </p>
        <div className="badges">
          {drug.requiresApplication && <span className="badge app">使用申請書が必要</span>}
          {drug.consultSpecialist && <span className="badge consult">専門家にコンサルテーション</span>}
          {drug.renalAdjustmentNotRequired && (
            <span className="badge renal-ok">腎機能低下時も常用量可</span>
          )}
          {/*
           * TDM対象の薬剤はバッジ自体から投与設計へ飛べるようにする（スクロール不要）。
           * TDMの投与設計表（eGFR区分等）は成人向けのため、小児では出さない。
           */}
          {drug.tdm && mode === "adult" &&
            (drug.tdm.designer ? (
              <button
                className="badge tdm badge-link"
                onClick={() => onOpenDesigner(drug.tdm!.designer!)}
              >
                TDM対象 — 初回投与量と採血タイミングを見る →
              </button>
            ) : (
              <span className="badge tdm">TDM対象</span>
            ))}
          {drug.aware && <span className="badge aware">AWaRe: {drug.aware}</span>}
        </div>
      </div>

      {drug.requiresApplication && (
        <div className="banner warn">
          <b>使用申請書が必要な抗菌薬です。</b>
          該当する患者に初めて使用する場合は「抗菌薬使用申請書」に使用目的を電子カルテ上に記録すること（原典 p.7-8）。
        </div>
      )}
      {drug.consultSpecialist && (
        <div className="banner danger">
          <b>使用にあたり専門家へのコンサルテーションが必要です。</b>
          感染症科及びICT・ASTによる適正使用評価の対象です（原典 p.11, 23-27）。
        </div>
      )}

      {/* ---- 通常量 ---- */}
      <section className="section dosing-primary">
        <h3>通常量（{mode === "adult" ? "成人" : "小児"}）</h3>
        {dosing && Object.keys(dosing).length > 0 ? (
          (Object.keys(dosing) as Route[]).map((route) => (
            <div key={route} style={{ marginBottom: 14 }}>
              <div className="dose-ind" style={{ color: "var(--accent)" }}>
                {ROUTE_LABEL[route]}
              </div>
              {dosing[route]!.map((d, i) => (
                <DoseRow key={i} dose={d} patient={patient} mode={mode} />
              ))}
            </div>
          ))
        ) : (
          <p className="empty">
            {mode === "pediatric"
              ? "原典に小児の用量記載がありません。"
              : "原典に成人の用量記載がありません。"}
          </p>
        )}
        {hasOtherMode && (
          <button className="link-btn" onClick={onSwitchMode}>
            {otherModeLabel}用量を見る →（このレーンの表示が{otherModeLabel}に切り替わります）
          </button>
        )}
        {relatedPage && (
          <button className="tile" style={{ marginTop: 12 }} onClick={() => onOpenPage(relatedPage.key)}>
            <b>{relatedPage.label}</b>
            <span>{relatedPage.sub}</span>
          </button>
        )}
      </section>

      {/* ---- 腎機能（原典の腎機能低下時の表は成人向けのため、小児では表示しない） ---- */}
      {mode === "pediatric" && (showIvRenal || showPoRenal) && (
        <section className="section dosing-primary">
          <h3>腎機能低下時・透析・CHDF</h3>
          <p className="empty" style={{ padding: "12px 0" }}>
            原典の腎機能低下時の投与量表は成人を対象としています。
            小児の腎機能低下例については薬剤部・小児科に相談してください。
          </p>
        </section>
      )}

      {mode === "adult" && hasRelevantRenal && (
        <section className="section dosing-primary">
          <h3>腎機能低下時・透析・CHDF</h3>
          {drug.renalAdjustmentNotRequired && (
            <div className="banner info">
              原典★印：<b>腎機能低下時も常用量投与が可能な薬剤</b>です。
            </div>
          )}
          {!renalInputResolved && (
            <p className="dose-note" style={{ marginBottom: 8 }}>
              患者条件（この薬剤で用いるCCrまたはeGFR）を入力すると、該当区分を自動でハイライトします。
            </p>
          )}

          {showIvRenal && drug.renal && (
            <>
              <div className="dose-ind" style={{ color: "var(--accent)" }}>注射</div>
              <div className="renal-grid" style={{ marginBottom: 14 }}>
                {drug.renalRules?.iv ? drug.renalRules.iv.rules.map((rule) => {
                  return (
                    <div key={rule.label} className={`renal-row ${activeIvRule == null ? "" : activeIvRule === rule ? "active" : "dim"}`}>
                      <div className="band">{rule.label}</div>
                      <div>{rule.dose}</div>
                    </div>
                  );
                }) : BAND_ORDER.filter((b) => drug.renal![b]).map((band) => (
                  <div
                    key={band}
                    className={
                      "renal-row " +
                      (activeBand == null ? "" : activeBand === band ? "active" : "dim")
                    }
                  >
                    <div className="band">{RENAL_BAND_LABEL[band]}</div>
                    <div>{drug.renal![band]}</div>
                  </div>
                ))}
                {drug.renalRules?.iv && (["hd", "chdf"] as RenalBand[])
                  .filter((band) => drug.renal![band])
                  .map((band) => (
                    <div key={band} className={`renal-row ${activeBand == null ? "" : activeBand === band ? "active" : "dim"}`}>
                      <div className="band">{RENAL_BAND_LABEL[band]}</div>
                      <div>{drug.renal![band]}</div>
                    </div>
                  ))}
              </div>
            </>
          )}

          {showPoRenal && drug.renalPo && (
            <>
              <div className="dose-ind" style={{ color: "var(--accent)" }}>経口</div>
              <div className="renal-grid" style={{ marginBottom: 14 }}>
                {drug.renalRules?.po ? drug.renalRules.po.rules.map((rule) => {
                  return (
                    <div key={rule.label} className={`renal-row ${activePoRule == null ? "" : activePoRule === rule ? "active" : "dim"}`}>
                      <div className="band">{rule.label}</div>
                      <div>{rule.dose}</div>
                    </div>
                  );
                }) : BAND_ORDER.filter((b) => drug.renalPo![b]).map((band) => (
                  <div
                    key={band}
                    className={
                      "renal-row " +
                      (activeBand == null ? "" : activeBand === band ? "active" : "dim")
                    }
                  >
                    <div className="band">{RENAL_BAND_LABEL[band]}</div>
                    <div>{drug.renalPo![band]}</div>
                  </div>
                ))}
                {drug.renalRules?.po && (["hd", "chdf"] as RenalBand[])
                  .filter((band) => drug.renalPo![band])
                  .map((band) => (
                    <div key={band} className={`renal-row ${activeBand == null ? "" : activeBand === band ? "active" : "dim"}`}>
                      <div className="band">{RENAL_BAND_LABEL[band]}</div>
                      <div>{drug.renalPo![band]}</div>
                    </div>
                  ))}
              </div>
            </>
          )}

          {activeBand &&
            !(showIvRenal && drug.renal?.[activeBand]) &&
            !(showPoRenal && drug.renalPo?.[activeBand]) && (
            <div className="banner warn">
              この患者の腎機能区分（{RENAL_BAND_LABEL[activeBand]}）について、
              <b>原典に記載がありません</b>。専門家へ相談してください。
            </div>
          )}

          {drug.renalNote && <ul className="notes"><li>{drug.renalNote}</li></ul>}
        </section>
      )}

      {/* ---- TDM（成人向けの表のため小児では表示しない） ---- */}
      {mode === "pediatric" && drug.tdm && (
        <section className="section">
          <h3>TDM</h3>
          <p className="empty" style={{ padding: "12px 0" }}>
            原典のTDM投与設計は成人を対象としています。小児のTDMは薬剤部（TDM担当者）に相談してください。
          </p>
        </section>
      )}

      {mode === "adult" && drug.tdm && (
        <section className="section">
          <h3>TDM</h3>
          <dl className="kv tdm-kv">
            {drug.tdm.targets.map((t, i) => (
              <div key={i} style={{ display: "contents" }}>
                <dt className="tdm-target-label">
                  <span>{t.type === "trough" ? "トラフ" : t.type === "peak" ? "ピーク" : "AUC"}</span>
                  {t.condition && <span className="tdm-condition">（{t.condition}）</span>}
                </dt>
                <dd className="mono tdm-target-value">
                  {t.value} {t.unit}
                </dd>
              </div>
            ))}
            {drug.tdm.sampling.trough && (
              <>
                <dt>採血（トラフ）</dt>
                <dd>{drug.tdm.sampling.trough}</dd>
              </>
            )}
            {drug.tdm.sampling.peak && (
              <>
                <dt>採血（ピーク）</dt>
                <dd>{drug.tdm.sampling.peak}</dd>
              </>
            )}
            {drug.tdm.firstTdmDose && (
              <>
                <dt>実施時期</dt>
                <dd>{drug.tdm.firstTdmDose}</dd>
              </>
            )}
            {drug.tdm.loadingDose && (
              <>
                <dt>ローディング</dt>
                <dd>{drug.tdm.loadingDose}</dd>
              </>
            )}
          </dl>
          {drug.tdm.cautions && (
            <ul className="notes">
              {drug.tdm.cautions.map((c, i) => (
                <li key={i}>{c}</li>
              ))}
            </ul>
          )}
          {drug.tdm.designer && (
            <button
              className="tile"
              style={{ marginTop: 12 }}
              onClick={() => onOpenDesigner(drug.tdm!.designer!)}
            >
              <b>投与設計ツールを開く →</b>
              <span>初回投与量・採血のタイミング・目標血中濃度を確認できます</span>
            </button>
          )}
          <p className="source-line">原典 p.{drug.tdm.source.pages.join(", ")}</p>
        </section>
      )}

      {/* ---- 適応外使用 ---- */}
      {offLabel.length > 0 && (
        <details className="section offlabel-details" key={`${drug.id}-${mode}-offlabel`}>
          <summary>適応外使用（院内承認済み・{offLabel.length}件）</summary>
          <div className="offlabel-body">
            <div className="banner danger">
              適応外使用は薬機法上、<b>患者への十分な説明と文書での同意</b>が必要です。
              「適応症及び用法・用量に関する使用」「用法・用量に関する使用」は
              <b>重症例での使用に限り検討</b>し、通常の感染症治療では適応範囲内で治療すること（原典 p.52）。
            </div>
            {offLabel.map((use) => (
              <div className="dose-row" key={use.id}>
                <div className="dose-ind">{OFFLABEL_CATEGORY_LABEL[use.category]}</div>
                <div className="dose-text">
                  {use.diseaseIds
                    .map((id) => DISEASE_BY_ID.get(id)?.name ?? id)
                    .join("、")}
                </div>
                {use.dosageText && <div className="offlabel-dose">{use.dosageText}</div>}
                <div className="dose-note">
                  {use.productLabel}　／　原典 p.{use.source.pages.join(", ")}
                </div>
              </div>
            ))}
          </div>
        </details>
      )}

      {/* ---- 製剤情報 ---- */}
      {lane !== "oral" && drug.formulations && drug.formulations.length > 0 && (
        <section className="section">
          <h3>製剤情報</h3>
          <button className="tile" style={{ marginBottom: 12 }} onClick={() => onOpenPage("formulary")}>
            <b>当院採用注射抗菌薬一覧 →</b>
            <span>他剤も含めた規格・薬価・投与時間・配合変化の一覧</span>
          </button>
          {drug.formulations.map((f, i) => (
            <div className="dose-row" key={i}>
              <div className="dose-text">
                <b>{f.brandName}</b>
              </div>
              <dl className="kv" style={{ marginTop: 4 }}>
                <dt>規格</dt>
                <dd>{f.strength}</dd>
                {f.price != null && (
                  <>
                    <dt>薬価</dt>
                    <dd className="mono">{f.price.toLocaleString()} 円</dd>
                  </>
                )}
                <dt>投与</dt>
                <dd>
                  静注 {f.ivPush ? "可" : "×"} ／ 点滴{" "}
                  {f.drip === false ? "×" : f.drip} ／ 筋注 {f.im ? "可" : "×"}
                </dd>
                {f.incompatibleWith && f.incompatibleWith.length > 0 && (
                  <>
                    <dt>配合変化</dt>
                    <dd>{f.incompatibleWith.join("、")}</dd>
                  </>
                )}
              </dl>
              {f.notes && (
                <ul className="notes">
                  {f.notes.map((n, j) => (
                    <li key={j}>{n}</li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </section>
      )}

      <p className="source-line">
        出典：抗菌薬投与マニュアル 第9版 p.{drug.source.pages.join(", ")}
      </p>
    </div>
  );
}

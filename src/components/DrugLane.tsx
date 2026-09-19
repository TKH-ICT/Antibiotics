import { useMemo, useState } from "react";
import type { Drug, PatientMode, PatientState } from "../types";
import { REFERENCE } from "../data";
import { searchDrugs, drugSuggestions } from "../lib/search";
import { convertPerKg, renalDoseForPatient } from "../lib/calc";
import type { DrugCategory } from "../types";
import { PatientPanel } from "./PatientPanel";
import {
  AWARE_BUCKETS,
  classesInLane,
  countByBucket,
  drugsInLane,
  isInLane,
  otherGenresInLane,
  primaryDoseOf,
  awareBucketOf,
  type AwareBucket,
  type DrugLane as Lane,
} from "../lib/lanes";

/* ---------------- 成人／小児の選択（余計な説明は置かない） ---------------- */

export function ModePicker({ onPick }: { onPick: (m: PatientMode) => void }) {
  return (
    <section className="flow-shell">
      <p className="flow-step">1 / 2　対象を選択</p>
      <h3 className="flow-title">成人または小児を選んでください</h3>
      <div className="top-grid two mode-choices">
        <button className="top-btn adult mode-choice" onClick={() => onPick("adult")}>
          <span><b>成人</b><small>成人用量を表示</small></span>
          <span className="mode-choice-arrow" aria-hidden="true">→</span>
        </button>
        <button className="top-btn paed mode-choice" onClick={() => onPick("pediatric")}>
          <span><b>小児</b><small>小児用量を表示</small></span>
          <span className="mode-choice-arrow" aria-hidden="true">→</span>
        </button>
      </div>
    </section>
  );
}

export function PatientStep({
  lane,
  mode,
  patient,
  onChange,
  onContinue,
}: {
  lane: Lane;
  mode: PatientMode;
  patient: PatientState;
  onChange: (patient: PatientState) => void;
  onContinue: () => void;
}) {
  return (
    <section className={`flow-shell patient-step ${mode}`}>
      <p className="flow-step">2 / 2　患者条件</p>
      <div className="flow-heading">
        <div>
          <h2>{mode === "adult" ? "成人" : "小児"}の患者条件</h2>
          <p>{lane === "oral" ? "内服薬" : "注射薬"}の用量表示に使用します。</p>
        </div>
      </div>
      <PatientPanel mode={mode} patient={patient} onChange={onChange} />
      <p className="flow-note">必要な項目だけ入力できます。未入力でも原典の用量表は確認できます。</p>
      <button className="flow-primary" onClick={onContinue}>この条件で薬剤を選ぶ</button>
    </section>
  );
}

/* ---------------- 薬剤カード ---------------- */

function DrugCard({
  drug,
  lane,
  mode,
  patient,
  onOpen,
}: {
  drug: Drug;
  lane: Lane;
  mode: PatientMode;
  patient: PatientState;
  onOpen: () => void;
}) {
  const primary = primaryDoseOf(drug, lane, mode);
  // 腎機能低下時の表は成人向けのため、小児では出さない
  const renalDose =
    mode === "adult"
      ? renalDoseForPatient(drug, patient, lane === "oral" ? "po" : "iv") ??
        renalDoseForPatient(drug, patient, lane === "oral" ? "iv" : "po")
      : undefined;
  const conv =
    primary?.perKg && !(mode === "pediatric" && patient.weight == null)
      ? convertPerKg(primary.perKg, patient)
      : null;

  return (
    <button className="result" onClick={onOpen}>
      <div className="result-head">
        <span className="result-name">{drug.genericName.ja}</span>
        {drug.abbr && <span className="result-sub mono">{drug.abbr}</span>}
      </div>
      <div className="result-dose">
        通常量：<b>{primary ? primary.text : "原典に記載なし"}</b>
        {conv && <span className="mono">　→ {conv.text}</span>}
      </div>
      {renalDose && (
        <div className="result-dose" style={{ color: "var(--accent)" }}>
          この患者の腎機能では：<b>{renalDose}</b>
        </div>
      )}
      {/* TDMの投与設計は成人向けの表のため、小児ではバッジ自体を出さない */}
      {(drug.requiresApplication || drug.consultSpecialist || (drug.tdm && mode === "adult")) && (
        <div className="badges">
          {drug.requiresApplication && <span className="badge app">要申請</span>}
          {drug.consultSpecialist && <span className="badge consult">要コンサルト</span>}
          {drug.tdm && mode === "adult" && <span className="badge tdm">TDM対象</span>}
        </div>
      )}
    </button>
  );
}

/* ---------------- 分類の選択画面（内服＝AWaRe／注射＝系統） ---------------- */

export function LanePicker({
  lane,
  mode,
  patient,
  onOpenDrug,
  onPickBucket,
  onPickOtherGenre,
  onPickClass,
  onOpenPage,
}: {
  lane: Lane;
  mode: PatientMode;
  patient: PatientState;
  onOpenDrug: (id: string) => void;
  onPickBucket: (b: AwareBucket) => void;
  onPickOtherGenre: () => void;
  onPickClass: (c: string) => void;
  onOpenPage: (key: string) => void;
}) {
  const [query, setQuery] = useState("");

  const laneDrugs = useMemo(() => drugsInLane(lane, mode), [lane, mode]);
  const counts = useMemo(() => countByBucket(laneDrugs), [laneDrugs]);
  const classes = useMemo(() => classesInLane(laneDrugs), [laneDrugs]);

  const results = useMemo(
    () => (query ? searchDrugs(query).filter((d) => isInLane(d, lane, mode)) : []),
    [query, lane, mode],
  );

  const card = (d: Drug) => (
    <DrugCard
      key={d.id}
      drug={d}
      lane={lane}
      mode={mode}
      patient={patient}
      onOpen={() => onOpenDrug(d.id)}
    />
  );

  return (
    <>
      {/* 薬剤名の入力欄。入力中は検索結果だけを出す */}
      <div className="searchbox">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="薬剤名を入力（商品名・一般名・略語）"
          aria-label="薬剤名を入力"
        />
      </div>

      {query ? (
        <div className="list">
          {results.map(card)}
          {results.length === 0 && (
            <>
              <p className="empty">「{query}」に一致する薬剤はありません。</p>
              {drugSuggestions(query)
                .filter((d) => isInLane(d, lane, mode))
                .map(card)}
            </>
          )}
        </div>
      ) : lane === "oral" ? (
        <>
          <div className="aware-lead">
            <p>
              WHOは抗菌薬を <b>Access</b>・<b>Watch</b>・<b>Reserve</b> の3つに分類しています
              （AWaRe分類）。Watch・Reserve は耐性化の懸念が大きく、使用をなるべく減らすことが
              WHOの方針です。使用する抗菌薬全体のうち Access の割合を60%以上にすることが目標とされています。
            </p>
            <p className="aware-lead-strong">
              特別な理由がなければ <b>Access</b> から選択してください。
            </p>
          </div>

          <div className="top-grid">
            {AWARE_BUCKETS.filter((b) => b.key !== "other").map((b) => (
              <button
                key={b.key}
                className={`top-btn aware-${b.key.toLowerCase()}`}
                disabled={counts[b.key] === 0}
                onClick={() => onPickBucket(b.key)}
              >
                {b.label}
                <span className="top-btn-count">{counts[b.key]}</span>
              </button>
            ))}
            <button
              className="top-btn aware-other"
              disabled={counts.other === 0}
              onClick={onPickOtherGenre}
            >
              その他
              <span className="top-btn-count">{counts.other}</span>
            </button>
          </div>

          <div className="sub-actions">
            <p className="dose-note">
              抗真菌薬・抗ウイルス薬・抗結核薬・駆虫薬などはWHOのAWaRe分類の対象外です。
              ジャンルを選ぶと薬剤名が一覧できます。
            </p>
          </div>

          <p className="source-line">原典 p.{REFERENCE.aware.source.pages.join(", ")}</p>

          <div className="sub-actions">
            <button className="sub-btn" onClick={() => onOpenPage("stewardship")}>
              適正使用指針・AWaRe分類の全文 →
            </button>
            <button className="sub-btn" onClick={() => onOpenPage("offlabel")}>
              適応外使用を疾患名から検索 →
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="top-grid">
            {classes.map((c) => (
              <button key={c.name} className="top-btn compact" onClick={() => onPickClass(c.name)}>
                {c.name}
                <span className="top-btn-count">{c.count}</span>
              </button>
            ))}
          </div>

          <div className="sub-actions">
            <button className="sub-btn" onClick={() => onOpenPage("formulary")}>
              当院採用注射抗菌薬一覧 →
            </button>
            <button className="sub-btn" onClick={() => onOpenPage("offlabel")}>
              適応外使用を疾患名から検索 →
            </button>
          </div>
        </>
      )}
    </>
  );
}

/* ---------------- 「その他」のジャンル選択 ---------------- */

export function OtherGenreMenu({
  lane,
  mode,
  onPick,
}: {
  lane: Lane;
  mode: PatientMode;
  onPick: (category: DrugCategory) => void;
}) {
  const genres = useMemo(
    () => otherGenresInLane(drugsInLane(lane, mode)),
    [lane, mode],
  );

  return (
    <>
      <p className="dose-note" style={{ marginBottom: 12 }}>
        WHOのAWaRe分類は抗菌薬を対象とするため、これらのジャンルは分類の対象外です。
      </p>
      <div className="top-grid">
        {genres.map((g) => (
          <button key={g.category} className="top-btn compact" onClick={() => onPick(g.category)}>
            {g.label}
            <span className="top-btn-count">{g.count}</span>
          </button>
        ))}
      </div>
      {genres.length === 0 && <p className="empty">該当する薬剤がありません。</p>}
    </>
  );
}

/* ---------------- 薬剤名を選ぶ画面 ---------------- */

export function DrugList({
  lane,
  mode,
  patient,
  bucket,
  drugClass,
  otherCategory,
  onOpenDrug,
}: {
  lane: Lane;
  mode: PatientMode;
  patient: PatientState;
  bucket?: AwareBucket;
  drugClass?: string;
  otherCategory?: DrugCategory;
  onOpenDrug: (id: string) => void;
}) {
  const drugs = useMemo(() => {
    const all = drugsInLane(lane, mode);
    if (otherCategory) {
      return all.filter((d) => awareBucketOf(d) === "other" && d.category === otherCategory);
    }
    if (bucket) return all.filter((d) => awareBucketOf(d) === bucket);
    if (drugClass) return all.filter((d) => d.class === drugClass);
    return all;
  }, [lane, mode, bucket, drugClass, otherCategory]);

  return (
    <div className="list">
      {drugs.map((d) => (
        <DrugCard
          key={d.id}
          drug={d}
          lane={lane}
          mode={mode}
          patient={patient}
          onOpen={() => onOpenDrug(d.id)}
        />
      ))}
      {drugs.length === 0 && <p className="empty">該当する薬剤がありません。</p>}
    </div>
  );
}

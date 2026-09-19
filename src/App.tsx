import { useEffect, useState } from "react";
import type { PatientMode, PatientState } from "./types";
import { DRUG_BY_ID, ORGANISM_BY_ID, MANUAL_EDITION } from "./data";
import { searchOrganisms } from "./lib/search";
import { LANE_LABEL, OTHER_GENRE_LABEL, type AwareBucket, type DrugLane } from "./lib/lanes";
import { PatientPanel, emptyPatient } from "./components/PatientPanel";
import { DrugDetail } from "./components/DrugDetail";
import { DrugList, LanePicker, ModePicker, OtherGenreMenu, PatientStep } from "./components/DrugLane";
import type { DrugCategory } from "./types";
import {
  Opening,
  OtherMenu,
  APP_TITLE,
  APP_EDITION,
  type OtherKey,
  type TopCategory,
} from "./components/Opening";
import { OrganismDetail } from "./components/OrganismDetail";
import {
  InfectionPicker,
  InfectionList,
  InfectionDetail,
  StewardshipTopics,
  StewardshipTopicDetail,
} from "./components/InfectionLane";
import { INFECTION_CATEGORY_LABEL, type InfectionCategory } from "./types";
import { OffLabelSearch } from "./components/OffLabelSearch";
import { Designer } from "./components/Designer";
import { SurgicalProphylaxis } from "./components/SurgicalProphylaxis";
import { Formulary } from "./components/Formulary";
import {
  PostExposureProphylaxis,
  PediatricWeight,
  PcgContinuousInfusion,
  Stewardship,
  Amr,
} from "./components/Reference";
import { About, DisclaimerGate } from "./components/About";
import { InstallGuide } from "./components/InstallGuide";
import {
  getFavorites,
  getHistory,
  toggleFavorite,
  pushHistory,
  hasAcknowledgedDisclaimer,
  acknowledgeDisclaimer,
  type ItemRef,
} from "./lib/storage";
import { subscribeSwStatus, getSwStatus, applyUpdate, type SwStatus } from "./lib/sw";

type PageKey =
  | "prophylaxis"
  | "formulary"
  | "postexposure"
  | "pediatric-weight"
  | "pcg"
  | "stewardship"
  | "amr"
  | "offlabel"
  | "stewardship-topics";

type View =
  | { type: "opening" }
  | { type: "other" }
  /** 内服薬・注射薬・感染症別を選んだ直後の 成人／小児 */
  | { type: "mode"; lane: DrugLane | "infection" }
  /** 内服薬・注射薬で集団を選んだ直後の患者条件 */
  | { type: "patient"; lane: DrugLane }
  /** 薬剤名の入力欄と分類ボタン */
  | { type: "picker"; lane: DrugLane }
  /** AWaRe分類対象外のジャンル選択（内服薬レーンの「その他」） */
  | { type: "other-genre"; lane: DrugLane }
  /** 分類を選んだ後の薬剤一覧 */
  | {
      type: "drugs";
      lane: DrugLane;
      bucket?: AwareBucket;
      drugClass?: string;
      otherCategory?: DrugCategory;
    }
  | { type: "organisms" }
  /** 感染症別：検索欄＋部位カテゴリ */
  | { type: "infections" }
  /** 部位カテゴリ内の感染症一覧 */
  | { type: "infection-list"; category: InfectionCategory }
  | { type: "infection"; id: string }
  /** 適正使用の手引き（その他から開く） */
  | { type: "topic"; id: string }
  | { type: "drug"; id: string; lane?: DrugLane }
  | { type: "organism"; id: string }
  | { type: "designer"; key: string; fromDrugId?: string }
  | { type: "about" }
  | { type: "page"; key: PageKey };

const MODE_LABEL: Record<PatientMode, string> = { adult: "成人", pediatric: "小児" };

/** 感染症別レーンの中か。集団バッジと切替の出し分けに使う */
const isInfectionView = (v: View) =>
  v.type === "infections" || v.type === "infection-list" || v.type === "infection";

export default function App() {
  const [patient, setPatient] = useState<PatientState>(emptyPatient);
  const [view, setView] = useState<View>({ type: "opening" });
  /** 「戻る」で辿る履歴。読み出しは goBack の更新関数内で行う */
  const [, setStack] = useState<View[]>([]);
  const [mode, setMode] = useState<PatientMode | null>(null);
  const [organismQuery, setOrganismQuery] = useState("");
  const [showPatient, setShowPatient] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [favorites, setFavorites] = useState<ItemRef[]>(getFavorites);
  const [, setHistory] = useState<ItemRef[]>(getHistory);
  const [swStatus, setSwStatus] = useState<SwStatus>(getSwStatus);
  const [agreed, setAgreed] = useState(hasAcknowledgedDisclaimer);

  useEffect(() => subscribeSwStatus(setSwStatus), []);

  // 免責事項を読ませないまま使わせない（初回のみ）
  if (!agreed) {
    return (
      <DisclaimerGate
        onAgree={() => {
          acknowledgeDisclaimer();
          setAgreed(true);
        }}
      />
    );
  }

  const go = (v: View) => {
    setStack((s) => (view.type === "opening" ? [] : [...s, view]));
    setView(v);
    setNotice(null);
    if (v.type === "drug") setHistory(pushHistory({ kind: "drug", id: v.id }));
    if (v.type === "organism") setHistory(pushHistory({ kind: "organism", id: v.id }));
    window.scrollTo({ top: 0 });
  };

  /** 1つ前の画面へ。履歴が尽きたらオープニングへ戻る */
  const goBack = () => {
    setNotice(null);
    setStack((s) => {
      setView(s.length > 0 ? s[s.length - 1] : { type: "opening" });
      return s.slice(0, -1);
    });
    window.scrollTo({ top: 0 });
  };

  const openTop = (key: TopCategory) => {
    if (key === "organism") {
      setOrganismQuery("");
      go({ type: "organisms" });
    } else if (key === "other") {
      go({ type: "other" });
    } else if (key === "stewardship") {
      // 感染症別は手引きの一項目。出典が当院マニュアルでないことを階層で示す（FR-017）
      go({ type: "page", key: "stewardship-topics" });
    } else {
      // 内服薬・注射薬は、いずれも必ず成人／小児の選択を挟む（感染症別も同様に mode を挟む）。
      // 前回の選択のまま別のレーンに入って誤参照することを防ぐ（FR-000-4）。
      go({ type: "mode", lane: key });
    }
  };

  const openOther = (key: OtherKey) => go({ type: "page", key: key as PageKey });

  const pickMode = (lane: DrugLane | "infection", m: PatientMode) => {
    setMode(m);
    setShowPatient(false);
    go(lane === "infection" ? { type: "infections" } : { type: "patient", lane });
  };

  /** 薬剤レーン・感染症別レーン内でのみ集団を切り替える */
  const switchMode = () => {
    if (!mode) return;
    const next: PatientMode = mode === "adult" ? "pediatric" : "adult";
    setMode(next);
    setNotice(
      isInfectionView(view)
        ? `${MODE_LABEL[next]}の記載に切り替わりました。`
        : `${MODE_LABEL[next]}の用量に切り替わりました。`,
    );
    window.scrollTo({ top: 0 });
  };

  const goHome = () => {
    setOrganismQuery("");
    setStack([]);
    setView({ type: "opening" });
    setNotice(null);
    window.scrollTo({ top: 0 });
  };

  const openPage = (key: string) => go({ type: "page", key: key as PageKey });

  /** その画面が薬剤レーンの中か（集団バッジを出すか） */
  const laneOf = (): DrugLane | null => {
    if (
      view.type === "patient" ||
      view.type === "picker" ||
      view.type === "drugs" ||
      view.type === "other-genre"
    )
      return view.lane;
    if (view.type === "drug") {
      if (view.lane) return view.lane;
      const d = DRUG_BY_ID.get(view.id);
      if (!d) return null;
      return d.adult?.po || d.pediatric?.po ? "oral" : "injectable";
    }
    if (view.type === "designer") return "injectable";
    return null;
  };
  const lane = laneOf();
  /** 感染症別も成人／小児で記載が変わるため、同じバッジと切替を出す */
  const showModeBadge = mode != null && (lane != null || isInfectionView(view));
  const laneLabel = lane != null ? LANE_LABEL[lane] : "感染症別";

  /** 患者条件が1つでも入力されているか。ボタンの見た目を変えて気づきやすくする */
  const hasPatientInput =
    patient.age != null ||
    patient.sex != null ||
    patient.weight != null ||
    patient.height != null ||
    patient.scr != null ||
    patient.egfr != null ||
    patient.rrt !== "none";

  /**
   * 患者条件フォームを出す画面。
   * 用量が患者条件で変わる画面に限る。菌種別は菌側の情報、
   * 「その他」の各項目も患者条件に依存しない（周術期だけは体重で1回量が決まる）。
   */
  const needsPatient =
    view.type === "picker" ||
    view.type === "other-genre" ||
    view.type === "drugs" ||
    view.type === "drug" ||
    view.type === "designer" ||
    (view.type === "page" && view.key === "prophylaxis");

  const currentItem: ItemRef | null =
    view.type === "drug"
      ? { kind: "drug", id: view.id }
      : view.type === "organism"
        ? { kind: "organism", id: view.id }
        : null;
  const isFav = (item: ItemRef) => favorites.some((f) => f.kind === item.kind && f.id === item.id);

  /* ---------------- オープニングは単独画面 ---------------- */
  if (view.type === "opening") {
    return (
      <>
        <InstallGuide />
        <header className="topbar minimal">
          <span className="spacer" />
          <button className="link-btn" onClick={() => go({ type: "about" })}>
            アプリの説明
          </button>
        </header>
        {swStatus === "update-available" && (
          <div className="wrap" style={{ paddingBottom: 0 }}>
            <div className="banner warn">
              <b>新しいデータ版が利用できます。</b>
              <button className="link-btn" onClick={() => void applyUpdate()}>
                今すぐ更新する
              </button>
            </div>
          </div>
        )}
        <Opening onPick={openTop} />
        <footer className="foot opening-foot">
          {MANUAL_EDITION.facility}の院内利用を想定したアプリです。
          最終的な投与判断は主治医が行います。
          <button className="link-btn" onClick={() => go({ type: "about" })}>
            免責事項 →
          </button>
        </footer>
      </>
    );
  }

  return (
    <>
      <header className={`topbar${showModeBadge ? ` mode-${mode}` : ""}`}>
        <button className="brand link-btn" style={{ textDecoration: "none" }} onClick={goHome}>
          {APP_TITLE}
        </button>
        <span className="spacer" />
        <button className="link-btn" onClick={() => go({ type: "about" })}>
          アプリの説明
        </button>
      </header>

      {/*
        成人／小児の切替と患者条件は、以前ヘッダー内の小さな文字リンクだったため
        気づかれにくかった。誤参照に直結する操作なので、独立した帯に大きく置く。
      */}
      {(showModeBadge || needsPatient) && (
        <div className={`contextbar${showModeBadge ? ` mode-${mode}` : ""}`}>
          {showModeBadge && (
            <>
              <span className={`ctx-current ${mode}`}>
                <span className="ctx-lane">{laneLabel}</span>
                <b>{MODE_LABEL[mode!]}</b>
              </span>
              <button className={`ctx-btn switch ${mode}`} onClick={switchMode}>
                {MODE_LABEL[mode === "adult" ? "pediatric" : "adult"]}に切替
              </button>
            </>
          )}
          {needsPatient && (
            <button
              className={`ctx-btn patient${showPatient ? " open" : ""}${
                hasPatientInput ? " filled" : ""
              }`}
              aria-expanded={showPatient}
              onClick={() => setShowPatient((v) => !v)}
            >
              {showPatient ? "患者条件を閉じる" : hasPatientInput ? "患者条件（入力済み）" : "患者条件を入力"}
            </button>
          )}
        </div>
      )}

      <main className="wrap">
        {swStatus === "update-available" && (
          <div className="banner warn">
            <b>新しいデータ版が利用できます。</b>
            表示中の内容は古い可能性があります。
            <button className="link-btn" onClick={() => void applyUpdate()}>
              今すぐ更新する
            </button>
          </div>
        )}
        {notice && <div className="banner info">{notice}</div>}

        {showPatient && needsPatient && (
          <div style={{ marginBottom: 18 }}>
            <PatientPanel
              // 周術期は体重帯で1回量が決まるため、集団によらず成人と同じ入力欄を出す
              mode={view.type === "page" ? "adult" : (mode ?? "adult")}
              patient={patient}
              onChange={setPatient}
            />
          </div>
        )}

        <div className="crumbs">
          <button className="navkey" onClick={goBack}>
            ← 戻る
          </button>
          <button className="navkey" onClick={goHome}>
            ⌂ ホーム
          </button>
          {currentItem && (
            <button
              className="tab"
              aria-pressed={isFav(currentItem)}
              onClick={() => setFavorites(toggleFavorite(currentItem))}
            >
              {isFav(currentItem) ? "★ お気に入り登録済み" : "☆ お気に入りに追加"}
            </button>
          )}
        </div>

        {/* ---------------- その他 ---------------- */}
        {view.type === "other" && (
          <>
            <div className="detail-head">
              <h2>その他</h2>
            </div>
            <OtherMenu onPick={openOther} />
          </>
        )}

        {/* ---------------- 成人／小児 ---------------- */}
        {view.type === "mode" && (
          <>
            <div className="detail-head">
              <h2>{view.lane === "infection" ? "感染症別" : LANE_LABEL[view.lane]}</h2>
            </div>
            <ModePicker onPick={(m) => pickMode(view.lane, m)} />
          </>
        )}

        {/* ---------------- 患者条件 ---------------- */}
        {view.type === "patient" && mode && (
          <PatientStep
            lane={view.lane}
            mode={mode}
            patient={patient}
            onChange={setPatient}
            onContinue={() => go({ type: "picker", lane: view.lane })}
          />
        )}

        {/* ---------------- 感染症別（FR-017） ---------------- */}
        {view.type === "infections" && mode && (
          <>
            <div className="detail-head">
              <h2>感染症別</h2>
            </div>
            <InfectionPicker
              mode={mode}
              onPickCategory={(category) => go({ type: "infection-list", category })}
              onOpenInfection={(id) => go({ type: "infection", id })}
            />
          </>
        )}

        {view.type === "infection-list" && mode && (
          <>
            <div className="detail-head">
              <h2>{INFECTION_CATEGORY_LABEL[view.category]}</h2>
            </div>
            <InfectionList
              category={view.category}
              mode={mode}
              onOpen={(id) => go({ type: "infection", id })}
            />
          </>
        )}

        {view.type === "infection" && (
          <InfectionDetail
            id={view.id}
            mode={mode ?? "adult"}
            onOpenDrug={(id) => go({ type: "drug", id })}
            onOpenOrganism={(id) => go({ type: "organism", id })}
            onOpenTopics={() => go({ type: "page", key: "stewardship-topics" })}
          />
        )}

        {view.type === "topic" && <StewardshipTopicDetail id={view.id} />}
        {/* ---------------- 薬剤名入力＋分類 ---------------- */}
        {view.type === "picker" && mode && (
          <LanePicker
            lane={view.lane}
            mode={mode}
            patient={patient}
            onOpenDrug={(id) => go({ type: "drug", id, lane: view.lane })}
            onPickBucket={(bucket) => go({ type: "drugs", lane: view.lane, bucket })}
            onPickOtherGenre={() => go({ type: "other-genre", lane: view.lane })}
            onPickClass={(drugClass) => go({ type: "drugs", lane: view.lane, drugClass })}
            onOpenPage={openPage}
          />
        )}

        {/* ---------------- その他（AWaRe分類対象外）のジャンル選択 ---------------- */}
        {view.type === "other-genre" && mode && (
          <>
            <div className="detail-head">
              <h2>その他</h2>
            </div>
            <OtherGenreMenu
              lane={view.lane}
              mode={mode}
              onPick={(category) =>
                go({ type: "drugs", lane: view.lane, otherCategory: category })
              }
            />
          </>
        )}

        {/* ---------------- 薬剤一覧 ---------------- */}
        {view.type === "drugs" && mode && (
          <>
            <div className="detail-head">
              <h2>{view.bucket ?? view.drugClass ?? OTHER_GENRE_LABEL[view.otherCategory!]}</h2>
            </div>
            <DrugList
              lane={view.lane}
              mode={mode}
              patient={patient}
              bucket={view.bucket}
              drugClass={view.drugClass}
              otherCategory={view.otherCategory}
              onOpenDrug={(id) => go({ type: "drug", id, lane: view.lane })}
            />
          </>
        )}

        {/* ---------------- 菌種別 ---------------- */}
        {view.type === "organisms" && (
          <>
            <div className="detail-head">
              <h2>菌種別</h2>
            </div>
            <div className="searchbox">
              <input
                value={organismQuery}
                onChange={(e) => setOrganismQuery(e.target.value)}
                placeholder="菌名を入力（学名・日本語名・略号）"
                aria-label="菌名を入力"
              />
            </div>
            <div className="list">
              {searchOrganisms(organismQuery).map((o) => (
                <button
                  key={o.id}
                  className="result"
                  onClick={() => go({ type: "organism", id: o.id })}
                >
                  <div className="result-head">
                    <span className="result-name">{o.japaneseName}</span>
                    <span className="result-sub">{o.scientificName}</span>
                  </div>
                </button>
              ))}
              {organismQuery && searchOrganisms(organismQuery).length === 0 && (
                <p className="empty">「{organismQuery}」に一致する菌はありません。</p>
              )}
              {!organismQuery && (
                <p className="empty">
                  学名（Escherichia coli）、日本語名（大腸菌）、略号（MRSA・GBS）、
                  通称（緑膿菌）のいずれでも検索できます。
                </p>
              )}
            </div>
          </>
        )}

        {/* ---------------- 詳細・ツール ---------------- */}
        {view.type === "drug" &&
          (() => {
            const drug = DRUG_BY_ID.get(view.id);
            if (!drug) return <p className="empty">薬剤が見つかりません。</p>;
            return (
              <DrugDetail
                drug={drug}
                lane={view.lane}
                mode={mode ?? "adult"}
                patient={patient}
                onOpenDesigner={(key) => go({ type: "designer", key, fromDrugId: drug.id })}
                onOpenPage={openPage}
                onSwitchMode={switchMode}
              />
            );
          })()}

        {view.type === "organism" &&
          (() => {
            const organism = ORGANISM_BY_ID.get(view.id);
            if (!organism) return <p className="empty">菌が見つかりません。</p>;
            return (
              <OrganismDetail
                organism={organism}
                onOpenDrug={(id) => go({ type: "drug", id })}
              />
            );
          })()}

        {/*
         * TDMの投与設計は成人向けの表のため小児では扱わない。
         * ヘッダーの「小児に切替」でこの画面のまま集団が変わりうるため、その場合はここで止める
         * （薬剤詳細からの入口は既に mode==="adult" のときしか出さない）。
         */}
        {view.type === "designer" && mode === "pediatric" && (
          <>
            <div className="detail-head">
              <h2>投与設計（TDM）</h2>
            </div>
            <p className="empty" style={{ padding: "12px 0" }}>
              原典のTDM投与設計は成人を対象としています。小児のTDMは薬剤部（TDM担当者）に相談してください。
            </p>
          </>
        )}
        {view.type === "designer" && mode === "adult" && (
          <Designer
            designerKey={view.key}
            patient={patient}
            fromDrugId={view.fromDrugId}
            onOpenPatient={() => setShowPatient(true)}
            onOpenDrug={(id) => go({ type: "drug", id })}
          />
        )}

        {view.type === "about" && (
          <About swStatus={swStatus} onApplyUpdate={() => void applyUpdate()} />
        )}

        {view.type === "page" && view.key === "prophylaxis" && (
          <SurgicalProphylaxis patient={patient} onOpenDrug={(id) => go({ type: "drug", id })} />
        )}
        {view.type === "page" && view.key === "formulary" && (
          <Formulary onOpenDrug={(id) => go({ type: "drug", id })} />
        )}
        {view.type === "page" && view.key === "offlabel" && (
          <OffLabelSearch
            mode={mode ?? "adult"}
            onOpenDrug={(id) => go({ type: "drug", id })}
          />
        )}
        {view.type === "page" && view.key === "postexposure" && <PostExposureProphylaxis />}
        {view.type === "page" && view.key === "pediatric-weight" && <PediatricWeight />}
        {view.type === "page" && view.key === "pcg" && <PcgContinuousInfusion />}
        {view.type === "page" && view.key === "stewardship" && <Stewardship />}
        {view.type === "page" && view.key === "amr" && <Amr />}
        {view.type === "page" && view.key === "stewardship-topics" && (
          <StewardshipTopics
            onOpenInfections={() => go({ type: "mode", lane: "infection" })}
            onOpenTopic={(id) => go({ type: "topic", id })}
          />
        )}

        <footer className="foot">
          データ版：{APP_TITLE} {APP_EDITION}（{MANUAL_EDITION.issuedOn} ／{" "}
          {MANUAL_EDITION.facility} {MANUAL_EDITION.author}）
          <br />
          {swStatus === "ready" && (
            <>
              オフライン利用可（端末に保存済み）
              <br />
            </>
          )}
          <b>{MANUAL_EDITION.facility}の院内利用を想定したアプリです。</b>
          適応外使用・採用薬・使用申請のルール・アンチバイオグラムは当院の取り決めまたは当院のデータであり、
          他施設ではそのまま当てはまりません。
          示される投与量は当院でコンセンサスの得られた標準的な投与量であり、最終的な投与判断は主治医が行います。
          大項目「適正使用の手引き」（感染症別を含む）は、
          厚生労働省『抗微生物薬適正使用の手引き 第四版』の情報を採用しており、当院マニュアルとは出典が異なります。
          使用時は添付文書を改めて精読してください。入力した患者条件は端末内にのみ保持され、外部に送信されません。
          <br />
          <button className="link-btn" onClick={() => go({ type: "about" })}>
            アプリの説明・免責事項の全文 →
          </button>
        </footer>
      </main>
    </>
  );
}

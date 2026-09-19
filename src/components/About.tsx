import { MANUAL_EDITION, STEWARDSHIP_GUIDE } from "../data";
import type { SwStatus } from "../lib/sw";
import { APP_TITLE, APP_EDITION } from "./Opening";

const FACILITY = MANUAL_EDITION.facility;

/**
 * 適用範囲の宣言（アプリ全体で最も重要な注意書き）
 *
 * 本アプリの内容は主に当院の院内マニュアル、一部は厚労省の適正使用の手引きに由来し、
 * 特に適応外使用・採用薬・申請ルール・アンチバイオグラムは
 * 「当院で決めたこと」「当院で測ったこと」であって一般化できない。
 * 免責画面と説明画面の双方で同じ文面を使うため、ここに1か所だけ定義する。
 */
export function ScopeNotice() {
  return (
    <div className="banner danger">
      <b>{FACILITY}の院内利用を想定したアプリです。</b>
      <br />
      内容は主に当院の『{MANUAL_EDITION.title}』{MANUAL_EDITION.label}、
      大項目「適正使用の手引き」（感染症別を含む）は
      厚生労働省『抗微生物薬適正使用の手引き 第四版』に基づいています。
      <b>適応外使用の可否・採用薬・使用申請のルール・アンチバイオグラム（感受性率）は、
      いずれも当院の取り決めまたは当院で検出された菌のデータ</b>です。
      他施設ではそのまま当てはまりません。院外の方や他施設での診療にはご利用にならないでください。
    </div>
  );
}

/* ---------------- 初回起動時の確認 ---------------- */

export function DisclaimerGate({ onAgree }: { onAgree: () => void }) {
  return (
    <div className="gate">
      <div className="gate-inner">
        <h1>{APP_TITLE}</h1>
        <p className="opening-edition" style={{ marginBottom: 10 }}>
          {APP_EDITION}
        </p>
        <p className="sub">
          {FACILITY}『{MANUAL_EDITION.title}』{MANUAL_EDITION.label}（{MANUAL_EDITION.issuedOn}）
        </p>

        <ScopeNotice />

        <ul className="notes" style={{ fontSize: 13.5, marginTop: 14 }}>
          <li>
            本アプリは院内マニュアルの<b>閲覧を支援する</b>ものであり、診断や治療方針の提示は行いません。
          </li>
          <li>
            示される投与量は当院でコンセンサスの得られた標準的な投与量であり、
            <b>最終的な投与判断は主治医が行います</b>。使用時は添付文書を改めて精読してください。
          </li>
          <li>
            入力した患者条件（年齢・体重・Cr等）は<b>端末内にのみ保持され、外部に送信されません</b>。
          </li>
        </ul>

        <button className="agree-btn" onClick={onAgree}>
          確認しました
        </button>
        <p className="disclaimer">
          この確認は初回のみ表示されます。全文は画面上部の「アプリの説明」からいつでも読めます。
        </p>
      </div>
    </div>
  );
}

/* ---------------- アプリの説明 ---------------- */

const HOW_TO: { title: string; items: string[] }[] = [
  {
    title: "1. 調べたいものを選ぶ",
    items: [
      "最初の画面で「内服薬／注射薬／適正使用の手引き／菌種別／その他」から選びます。",
      "「適正使用の手引き」は厚生労働省の手引きをまとめた項目です。当院マニュアルとは出典が異なるため、独立した項目にしています。",
      "「適正使用の手引き」の中に 感染症別・血液培養の解釈・治療期間の早見表・経口薬への切り替え が入っています。",
      "「その他」には 周術期・暴露後予防投与・小児体重服用量簡易表・AMR対策 が入っています。",
    ],
  },
  {
    title: "2. 成人か小児かを選ぶ",
    items: [
      "内服薬・注射薬・感染症別を選ぶと、次に成人／小児を選びます。以降は選んだ側の情報だけが表示されます。",
      "感染症別は「適正使用の手引き」→「感染症別」→ 成人／小児 の順に進みます。",
      "菌種別は成人／小児を選びません。菌の感受性率は患者の年齢によらないためです。",
      "小児では、成人向けの情報（腎機能低下時の投与量表など）は表示しません。",
    ],
  },
  {
    title: "3. 患者条件を入力する",
    items: [
      "内服薬・注射薬では、成人／小児を選んだ次に患者条件を入力します。",
      "成人は年齢・性別・体重・身長・血清Cr・eGFR・腎代替療法、小児は体重を入力できます。必要な項目だけで構いません。",
      "CCr（Cockcroft-Gault）・理想体重・補正体重を自動計算し、該当する腎機能区分を強調表示します。",
      "条件が未入力でも、原典の用量表は確認できます。",
    ],
  },
  {
    title: "4. 薬剤を探す",
    items: [
      "薬剤名の入力欄は、一般名・商品名・略語・カナのどれでも検索できます（例：クラビット／レボフロキサシン／LVFX）。",
      "内服薬は AWaRe分類（Access・Watch・Reserve）のボタンからも選べます。特別な理由がなければ Access から選択してください。",
      "抗真菌薬・抗ウイルス薬・抗結核薬などはAWaRe分類の対象外のため「その他」に入っています。",
      "注射薬は系統（β-ラクタム系・キノロン系など）から選べます。",
    ],
  },
  {
    title: "5. 患者条件を変更する",
    items: [
      "薬剤選択後も、画面上部の「患者条件」から入力内容を変更できます。",
      "透析（HD）・CHDF を選んでいる場合は、CCr の区分より透析時の用量が優先されます。",
      "小児で体重が未入力のときは mg/kg 表記のみを表示し、絶対量（mg）は表示しません。",
    ],
  },
  {
    title: "6. 薬剤ごとの詳しい情報を見る",
    items: [
      "投与設計（TDM）・ペニシリンG持続静注・当院採用注射抗菌薬一覧は、それぞれの薬剤の説明ページから開きます。",
      "TDM対象はバンコマイシン・テイコプラニン・ゲンタマイシン・アミカシン・ボリコナゾールです。薬剤ページの「TDM対象」を押すと開きます。",
      "投与設計では、初回・維持投与量 → 採血のタイミング → 目標血中濃度 の順に表示します。",
      "初回投与の日時と投与間隔を入れると、何ドーズ目の直前に採血すればよいかを日時で示します。",
    ],
  },
];

const CAUTIONS: { heading: string; body: string }[] = [
  {
    heading: "投与量は必ず添付文書と照合してください",
    body: "本アプリが示す投与量は当院でコンセンサスの得られた標準的な投与量です。最終的な投与判断は主治医が行います。使用時は添付文書を改めて精読し、必要に応じて感染症科・ICT／ASTへコンサルテーションしてください。",
  },
  {
    heading: "適応外使用は当院の取り決めです",
    body: "収載している適応外使用は、当院で承認された範囲を原典から転記したものです。薬機法上、適応外使用には患者への十分な説明と文書での同意が必要です。「適応症及び用法・用量に関する使用」「用法・用量に関する使用」は重症例での使用に限り検討し、通常の感染症治療では適応範囲内で治療してください。",
  },
  {
    heading: "アンチバイオグラムは当院で検出された菌のデータです",
    body: "感受性率は当院の検査部で検出された菌株に基づく集計であり、他施設や地域全体の傾向とは異なります。検出株数が30株未満の菌については、率の解釈に注意が必要である旨を画面に表示しています。",
  },
  {
    heading: "採用薬・使用申請のルールは当院のものです",
    body: "採用注射抗菌薬一覧、使用申請書が必要な薬剤、専門家へのコンサルテーションが必要な薬剤は、いずれも当院の運用です。",
  },
  {
    heading: "原典に記載のない事項は補完していません",
    body: "腎機能区分や小児用量など、原典に記載のない項目は「原典に記載なし」と表示し、推定値は出しません。投与設計ツールも原典に記載された表・式のみを実装しており、血中濃度の実測値からの薬物動態推定は行いません。",
  },
  {
    heading: "TDMの投与設計表は成人を対象としています",
    body: "小児のTDMについては薬剤部（TDM担当者）にご相談ください。小児を選択した状態で投与設計を開いた場合は画面上に注意を表示します。",
  },
];

export function About({
  swStatus,
  onApplyUpdate,
}: {
  swStatus: SwStatus;
  onApplyUpdate: () => void;
}) {
  return (
    <div>
      <div className="detail-head">
        <h2>このアプリについて</h2>
        <p className="en">使い方・注意事項・更新・免責事項</p>
      </div>

      <ScopeNotice />

      <section className="section">
        <h3>このアプリは何か</h3>
        <p className="lane-intro" style={{ marginBottom: 0 }}>
          {FACILITY}『{MANUAL_EDITION.title}』{MANUAL_EDITION.label}（{MANUAL_EDITION.issuedOn}発行、
          {MANUAL_EDITION.author}）の内容を、患者条件（成人／小児・腎機能・体重）で
          解決した形で引けるようにした<b>院内向けの参照アプリ</b>です。
          紙・PDFのマニュアルを置き換えるものではなく、その閲覧を速くするためのものです。
          全ての画面に原典のページ番号を併記しているので、原典に戻って確認できます。
        </p>
        <p className="lane-intro" style={{ marginBottom: 0, marginTop: 12 }}>
          あわせて大項目「適正使用の手引き」（その中の「感染症別」を含む）では、
          <b>
            厚生労働省『{STEWARDSHIP_GUIDE.title} {STEWARDSHIP_GUIDE.edition}』
            （医科・外来編／医科・入院編）
          </b>
          の内容を一部採用しています。こちらも要約であり、該当する画面には
          「適正使用の手引き」からの引用である旨と、手引きのページ番号を明示しています。
          感染症別は手引きに記載のある感染症のみを扱い、当院マニュアルの疾患別の記載ではありません。
          抗菌薬の用量・当院の採用状況・使用申請のルールは、
          当院マニュアルに基づく薬剤ページを正とします。
        </p>
      </section>

      <section className="section">
        <h3>情報源</h3>
        <ul className="notes" style={{ fontSize: 13.5 }}>
          <li>{FACILITY}『{MANUAL_EDITION.title}』{MANUAL_EDITION.label}</li>
          <li>厚生労働省『{STEWARDSHIP_GUIDE.title} {STEWARDSHIP_GUIDE.edition}』（医科・外来編／医科・入院編）</li>
        </ul>
      </section>

      <section className="section">
        <h3>使い方</h3>
        {HOW_TO.map((block) => (
          <div className="dose-row" key={block.title}>
            <div className="dose-ind">{block.title}</div>
            <ul className="notes">
              {block.items.map((it, i) => (
                <li key={i}>{it}</li>
              ))}
            </ul>
          </div>
        ))}
      </section>

      <section className="section">
        <h3>注意事項</h3>
        {CAUTIONS.map((c) => (
          <div className="dose-row" key={c.heading}>
            <div className="dose-text">
              <b>{c.heading}</b>
            </div>
            <p className="lane-intro" style={{ margin: "4px 0 0" }}>
              {c.body}
            </p>
          </div>
        ))}
      </section>

      <section className="section">
        <h3>アップデートとオフライン利用</h3>
        <ul className="notes" style={{ fontSize: 13.5 }}>
          <li>
            初回にアクセスした時点で全データを端末に保存するため、以降は<b>ネットワークがなくても</b>
            起動・検索・閲覧ができます。
          </li>
          <li>
            ホーム画面に追加するとアプリとして起動できます（iOS Safari は「共有 → ホーム画面に追加」、
            Android Chrome はメニューの「アプリをインストール」）。
          </li>
          <li>
            新しいデータ版が配信されると画面上部に<b>更新バナー</b>が出ます。ボタンを押すと最新版に切り替わります。
            バナーが出ている間、表示中の内容は古い可能性があります。
          </li>
          <li>
            原典が改訂された場合は、データを差し替えて配信します。現在表示中のデータ版は画面下部に常時表示しています。
          </li>
        </ul>
        <div className={`banner ${swStatus === "update-available" ? "warn" : "info"}`}>
          {swStatus === "update-available" ? (
            <>
              <b>新しいデータ版が利用できます。</b>
              <button className="link-btn" onClick={onApplyUpdate}>
                今すぐ更新する
              </button>
            </>
          ) : swStatus === "ready" ? (
            <>
              <b>オフラインで利用できます。</b>データは端末に保存済みで、最新版です。
            </>
          ) : swStatus === "unsupported" ? (
            <>
              このブラウザではオフライン保存が有効になっていません。ネットワークに接続してご利用ください。
            </>
          ) : (
            <>オフライン利用の準備中です。</>
          )}
        </div>
      </section>

      <section className="section">
        <h3>入力した患者情報の扱い</h3>
        <ul className="notes" style={{ fontSize: 13.5 }}>
          <li>
            患者条件（年齢・性別・体重・身長・血清Cr・eGFR・腎代替療法）は
            <b>端末内でのみ計算に使われ、外部に送信されません</b>。サーバへの通信は行いません。
          </li>
          <li>
            患者条件は保存されず、アプリを閉じると消えます。「クリア」でいつでも消去できます。
          </li>
          <li>
            端末に保存されるのは、お気に入りと閲覧履歴の<b>薬剤ID・菌IDのみ</b>です。患者情報は保存しません。
          </li>
          <li>共用端末で使用した場合は、使用後に患者条件をクリアしてください。</li>
        </ul>
      </section>

      <section className="section">
        <h3>免責事項</h3>
        <div className="card">
          <ul className="notes" style={{ fontSize: 13.5, margin: 0 }}>
            <li>
              本アプリは<b>{FACILITY}の院内利用を想定</b>して作成されたものです。
              収載内容は当院の院内マニュアル、院内の取り決め、および感染症別で明示した
              厚生労働省『抗微生物薬適正使用の手引き 第四版』の一部に基づいており、
              他施設・院外での診療に用いることを想定していません。
            </li>
            <li>
              本アプリは院内マニュアルの<b>電子的な閲覧支援</b>を目的としており、
              診断・治療方針の提示、個々の患者に対する投与設計の決定は行いません。
            </li>
            <li>
              表示される投与量・投与方法は原典の記載を転記・整形したものであり、
              <b>最終的な投与判断は主治医の責任において行われます</b>。
              実際の投与にあたっては添付文書を必ず確認してください。
            </li>
            <li>
              データの正確性には原典との突合により努めていますが、
              転記の誤り・原典の改訂に伴うずれの可能性を完全には排除できません。
              内容に疑義がある場合は原典および添付文書を優先し、
              {MANUAL_EDITION.author}または薬剤部へご連絡ください。
            </li>
            <li>
              本アプリの利用によって生じたいかなる結果についても、
              作成者および当院は責任を負いかねます。
            </li>
          </ul>
        </div>
      </section>

      <section className="section">
        <h3>原典・問い合わせ</h3>
        <dl className="kv">
          <dt>原典</dt>
          <dd>
            {MANUAL_EDITION.title} {MANUAL_EDITION.label}
          </dd>
          <dt>発行</dt>
          <dd>
            {MANUAL_EDITION.issuedOn}　{FACILITY} {MANUAL_EDITION.author}
          </dd>
          <dt>「適正使用の手引き」の出典</dt>
          <dd>
            {STEWARDSHIP_GUIDE.title} {STEWARDSHIP_GUIDE.edition}
            （医科・外来編／医科・入院編）
            <br />
            {STEWARDSHIP_GUIDE.publisher}
          </dd>
          <dt>内容の照会</dt>
          <dd>{MANUAL_EDITION.author}／薬剤部</dd>
          <dt>感染症の相談</dt>
          <dd>感染症科・ICT／AST</dd>
        </dl>
        <p className="source-line">
          データ版：{MANUAL_EDITION.title} {MANUAL_EDITION.label}（{MANUAL_EDITION.issuedOn}）
        </p>
      </section>
    </div>
  );
}

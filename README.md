# MoMaJohnPlus

MoMaJohnPlus 是由原始 [MoMaJohn](https://github.com/Kriskuo1129/MoMaJohn) 演進而來的加強版「台灣夜市摸麻將」瀏覽器遊戲。專案採純 HTML、CSS、JavaScript 製作，不需後端或建置工具即可執行。

## Repository 狀態

- 已建立 MoMaJohnPlus 專案身份與文件基線。
- Phase 1-A 已完成單一遊戲模式、15 張正式牌基準、分數用語與基礎規則轉換。
- Phase 1-B 已完成每局 PRE_ROUND 開局準備、場中事件三選一框架、槓桿整合與一次性 Commit 流程。
- Phase 1-C 已完成 9 個場中下注、6 個場中特殊、正式隨機三選一 Pool、14／15／16 張動態牌數及 committed round config。
- Phase 1-D 已完成 10 個 Item、三格 Item inventory、取得／強制替換流程、嗆司Maker、口袋系列主動使用，以及按住查看牌型。
- Phase 1-E 已完成 PRE_ROUND 加權抽取、四種籤運勢與免洗護身符負面事件攔截（包含瓦斯桶爆炸、停電）。
- PRE_ROUND 每局皆可主動選擇「這局不選事件」，放棄事件後仍可使用 ×1／×2／×3 槓桿。
- 摸牌、連線、聽牌、局中事件、補牌及結算仍延續原始 Gameplay baseline；舊 Checkbox 下注 Gameplay 已正式退休。
- Plus 新功能將依開發計畫分階段導入。
- 原始 MoMaJohn Repository 仍獨立保留，不受本專案後續開發影響。

## Plus 核心方向

以下項目仍為 **Planned / 尚未實作**：

- 建立「場」與「局」的完整遊戲結構。
- 重新整理局中事件分類與效果。
- 在正式牌第 8、13 張加入小遊戲節點。
- 未來加入七款可操作小遊戲、大頭貼與相關互動。

完整設計與階段規劃請參閱 [GAME_SPEC.md](GAME_SPEC.md) 及 [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md)。

目前 PRE_ROUND 每局會從正式 Pool 隨機抽出三個不重複選項，玩家也可明確放棄事件；兩種選擇都能搭配合法槓桿。場中下注於局末獨立結算且不乘倍率；場中特殊可調整倍率、正式牌數或本局規則；選擇「神秘禮物到來」並 Commit 後才會抽取 Item，先揭曉內容，再由玩家收下；Item 欄滿三格時則由揭曉進入強制替換。「珠珠寶貝」與「當地球隊贏球」目前只 Commit Phase 2 所需的小遊戲 Constraint，尚未執行小遊戲。

## 本機執行

直接以瀏覽器開啟 `index.html` 即可遊玩。若瀏覽器對本機檔案有限制，也可在專案根目錄啟動靜態伺服器，例如：

```powershell
python -m http.server 8000
```

再開啟 `http://localhost:8000/`。

## 專案檔案

- `index.html`：遊戲頁面與 Modal 結構。
- `style.css`：桌面、手機、棋盤、事件及動畫樣式。
- `game-config.js`：Gameplay 的分數、局中事件、正式場中事件與 Item 設定。
- `game.js`：牌組、狀態機、分數結算、事件、Item、補牌及統計邏輯。
- `GAME_SPEC.md`：MoMaJohnPlus 最新遊戲設計規格與各階段邊界。
- `IMPLEMENTATION_PLAN.md`：MoMaJohnPlus 分階段開發計畫。
- [`docs/legacy/`](docs/legacy/)：完整保留的原始 MoMaJohn 規格、數值、更新與工作紀錄。

## Legacy Gameplay baseline

目前可執行版本已完成 Phase 1-A～1-E：玩家每局先從三張正式場中事件選一張並選擇槓桿，按下「開牌局」後才 Commit、扣除局數，依 committed config 進行 14／15／16 張正式摸牌。PRE_ROUND 神秘禮物權重依 Item Pool 大小（目前 10）；局中事件依目前持有籤計算 effectiveWeight，護身符在第一個 NEGATIVE handler 前消耗並攔截；Mini-game Skeleton 仍屬 Phase 2。

原始文件：

- [技術與功能規格](docs/legacy/TECHNICAL_FUNCTIONAL_SPEC.md)
- [事件、下注與點數討論稿](docs/legacy/EVENTS_BETS_SCORING.md)
- [更新說明](docs/legacy/RELEASE_NOTES.md)
- [工作報告](docs/legacy/WORK_REPORT.md)

## 部署

本專案可直接使用 GitHub Pages：Repository 的 **Settings → Pages**，將來源設為 **Deploy from a branch**，選擇 `main` 與根目錄 `/ (root)` 後儲存。

## Phase 1-E 規則與驗證

場中三選一採不放回加權抽取：9 個 BET、6 個 SPECIAL 各權重 1，唯一 ITEM 事件權重為 `ITEM_DEFINITIONS.length = 10`，總權重 25；每組 Event ID 唯一，Skip 不入池。

大吉 +2、小吉 +1、小凶 -1、大凶 -2 相加為 fortuneScore，可抵銷與疊加；套用倍率時 Clamp 到 ±3。每次局中抽取使用 `baseWeight × fortuneModifier`，不改寫 base weight；NEUTRAL 倍率永遠為 1。完整 V1 表見 GAME_SPEC。護身符只阻擋第一個 NEGATIVE 局中事件並消耗一個，包含爆炸、停電；不影響 BET、槓桿或場中特殊。Restart 依目前 inventory 重算運勢，已消耗護身符不恢復。

```powershell
node tests/phase1c.test.js
node tests/phase1d.test.js
node tests/phase1e.test.js
```

Phase 1-E 測試使用固定 RNG、權重區間與受控事件，不以真正亂數統計決定 PASS。

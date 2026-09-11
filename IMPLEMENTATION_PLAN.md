# MoMaJohnPlus Implementation Plan

本計畫描述 MoMaJohnPlus 的分階段導入順序。Phase 0、Phase 1-A、Phase 1-B、Phase 1-C、Phase 1-D 與 Phase 1-E 已完成；Phase 2 以後均為 **Planned / 尚未實作**。

## Phase 0 — Project Identity & Documentation Baseline

本輪工作，只建立新專案身份與文件：

- 將專案對外身份改為 MoMaJohnPlus。
- 保留原始 MoMaJohn Gameplay 作為可執行 baseline。
- 將原始規格、更新與工作紀錄移至 `docs/legacy/` 完整保存。
- 建立最新遊戲規格與分階段開發計畫。
- 將 Git remote 切換到新的 MoMaJohnPlus Repository。

Phase 0 不修改 Gameplay 行為。

## Phase 1 — MoMaJohnPlus Core Gameplay Framework

### Phase 1-A — Plus 基礎規則轉換（已完成）

- 將玩家可見的「點數」統一為「分數」。
- 移除標準／狂歡模式選擇，改為單一 MoMaJohnPlus 模式。
- 建立每局 `formalDrawCount = 15` 的正式牌數來源。
- 讓海底撈月依本局最後一張正式牌判定。
- 移除 `TEST1129` 特殊名稱及 deterministic 測試劇本。
- 保留原始摸牌、連線、聽牌、事件、槓桿、下注、補牌與結算流程。

### Phase 1-B — 開局準備與 Commit Framework（已完成）

- 新增每局必經的 `PRE_ROUND`。
- 建立場中事件三選一 Framework；目前三張事件皆為 Temporary / Phase 1-B only Placeholder。
- 將 ×1／×2／×3 槓桿移入開局準備畫面。
- 分離 temporary selection 與 committed `round.config`。
- 將局數消耗移至「開牌局」Commit Point，並防止 double commit。
- 讓 Restart Current Round 沿用 committed config 且不重扣局數。
- 將舊下注 UI 移出正常 Gameplay；暫時保留未使用的 settlement helper。

### Phase 1-C — 正式場中事件與動態牌數（已完成）

- 導入正式場中下注事件。
- 導入正式場中特殊事件。
- 將「老闆加碼」移出局中事件並納入場中特殊事件。
- 支援 14～16 張動態牌數。
- 接入正式場中事件 Pool 抽取與效果 Commit。
- 「珠珠寶貝」與「當地球隊贏球」只 Commit Phase 2 所需 Constraint；Mini-game 尚未實作。
- 舊 Checkbox 多重下注及其專用 helper 已退休，統計概念由單一場中下注事件延續。

### Phase 1-D — Item 系統（已完成）

- 建立三格 Item inventory、Commit 後抽取與滿格強制替換流程。
- 加入專屬 Item Reveal，滿格時依序執行 Reveal → 強制 Replacement。
- 導入 10 個既定 Item，並完成跨局保留與新場重置。
- 接入嗆司Maker每局首次聽牌效果與三個口袋系列主動替換效果。
- 建立「道具 / 狀態」入口及按住「已抽牌型」即時總覽。
- PRE_ROUND 可明確放棄場中事件，仍能獨立選擇合法槓桿，並建立 `NONE` config snapshot。
- 籤詩局中事件機率及免洗護身符抵銷已於 Phase 1-E 完成。

### Phase 1-E — 局中事件重整與 Regression（已完成，待人工 Playtest）

- PRE_ROUND 採不放回加權抽取：BET 9、SPECIAL 6 各權重 1，唯一 ITEM 虛擬權重為 `ITEM_DEFINITIONS.length`（目前 10），Skip 不入池。
- Fortune score：大吉 +2、小吉 +1、小凶 −1、大凶 −2，可抵銷與疊加；V1 倍率查表時 Clamp 到 ±3。
- 每次局中事件抽取都從目前 inventory 計算 effectiveWeight；base weight 保持不變，NEUTRAL modifier 永遠為 1。
- 免洗護身符在第一個 NEGATIVE handler 前攔截並消耗一個，包含瓦斯桶爆炸；停電歸為 NEGATIVE 並可攔截。
- Restart 保留目前 inventory，不恢復已消耗護身符，運勢在下一次抽取時重新計算。
- 完成局中事件、Restart、BONUS、GAME OVER 與 Item 交互 Regression，並新增固定 RNG 的 `tests/phase1e.test.js`。

## Phase 2 — Mini-game Framework & Integration

Completed：

- 每局只在正式第 13 張建立一次 Mini-game Opportunity。
- 建立彈珠台、棒球九宮格、記憶大師三款 Registry Definition。
- Placeholder 只回傳可測試的 `{ success }` Challenge Result；直接摸牌立即執行普通隨機摸牌，失敗則先顯示不可關閉的 Result Card，待玩家按「摸牌」才執行普通隨機摸牌。
- 成功時使用 Shared Tile Picker 從合法 `remainingTiles` 自選牌；Picker Overview 以目前 Round State 渲染唯讀 6×6 小棋盤與 34 張普通牌，三條取得路徑最後都串接共用正式取得牌 Pipeline。
- 小遊戲不提供分數、局數、倍率、道具或其他 Reward；真正玩法留待 Phase 3。

## Phase 3 — Real Mini-games & Avatar

Phase 3-A Completed：

- 正式完成「記憶大師」：4 個等權主題、中文／English 50／50、每類 12 抽 4、4 張牌及 5 秒記憶倒數。
- 題目採 Instruction、大型 Emoji 與在地化名稱；猜錯先揭所選牌，1 秒後才揭正解，再依既有 Contract 回傳 FAILURE。
- 玩家蓋牌後只猜一次；正確／錯誤只回傳 `{ success }`，由 Phase 2 Main Game Contract 接續 Shared Tile Picker 或 Failure Result Card。
- 集中可注入 RNG、一次判定鎖及可清除 countdown/result timers；彈珠台與棒球九宮格仍保持 Placeholder。

Settlement & Achievement Update Completed：

- 建立 Round Score Breakdown，在正式得失分入口紀錄、同來源合併，並區分倍率項目與不吃倍率的 BET。
- Round Result 改為固定最終變化、可捲動分數明細、固定目前總分與操作列；總分 floor 0 顯示實際變化。
- 建立正式完成局快照、15 個 Achievement Definitions 與獨立 evaluator；GAME OVER 改為最終分數與可捲動稱號列表。
- Restart 不寫入未完成局快照；新遊戲完整 reset Breakdown、完成局統計與當場稱號。

Planned / 尚未實作：

- 大頭貼上傳與結算大頭貼。
- 小遊戲大頭貼 Easter Egg。
- 彈珠台與棒球九宮格真正玩法，僅需向 Main Game 回傳 success／failure。
- 小遊戲輔助 Item。
- 玩家操作取得麻將牌。
- Playtest。
- 依實際成功率重新平衡下注與事件。

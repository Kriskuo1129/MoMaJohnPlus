# MoMaJohnPlus 實作沿革與維護計畫

> 封存日期：2026-09-30
> 狀態：本階段開發完成。本文件保留已落地的工程順序、決策與後續維護界線，不作為待辦清單。

## 1. 基線建立

### Phase 0 — Repository Baseline

- 從原始 MoMaJohn 建立獨立的 MoMaJohnPlus Repository。
- 保留原始 Repository，不回寫舊專案。
- 建立本機與 GitHub `main` 同步基線。

### Phase 1-A — Plus 基礎規則

- 收斂為單一 MoMaJohnPlus 模式。
- 以 15 張作為標準正式牌數。
- 統一玩家可見「分數」用語。
- 移除正式玩法中的測試姓名與固定作弊流程。
- 海底撈月改由本局動態最後一張判定。

### Phase 1-B — 開局 Commit Transaction

- 建立 `PRE_ROUND`、temporary selection 與一次性 Commit。
- 將場中事件與槓桿鎖入 immutable `round.config`。
- 消耗機會從第一次摸牌移到 Commit。
- Restart 保留已 Commit 設定且不重複扣機會。

### Phase 1-C — 正式事件框架

- 建立 9 個 BET 與正式 SPECIAL 定義。
- 以 Event A／B 驅動局中事件。
- 支援 14／15／16 張動態正式牌數。
- 建立安全總分更新入口，允許本局負分但總分 floor 0。
- 將下注改為單一場中事件，局末獨立結算且不乘倍率。

### Phase 1-D — 道具系統

- 建立 3 格 inventory 與 10 個道具。
- 完成神秘禮物 Reveal、滿格強制替換、跨局保留與新場重置。
- 完成嗆司Maker、免洗護身符與口袋中／發／白。
- 口袋系列最終規則為直接額外正式取得指定國字牌，同局可使用多件。
- 建立道具／狀態視窗與已抽牌型 Quick Overview。

### Phase 1-E — 加權事件與防護

- 場中事件採不放回加權抽取。
- 籤運勢按每次局中事件抽取時的當前 inventory 動態計算。
- 正面、負面與中立事件分流；中立權重不受籤影響。
- 免洗護身符在負面 handler 前攔截並消耗。
- 補齊 deterministic weighted-selection 與 Restart regression。

## 2. 小遊戲框架與正式玩法

### Phase 2 — Challenge Contract

- 在每局正式第 13 張建立唯一小遊戲 Opportunity。
- 定義 DIRECT、SUCCESS、FAILURE 三條路徑並統一回到正式取得牌 pipeline。
- SUCCESS 使用 Shared Tile Picker；可選普通牌及 Event A／B。
- 自選事件牌只正式取得、不觸發局中事件；正常 RNG 事件牌維持原行為。
- FAILURE 由玩家在結果卡確認後才普通 RNG 摸牌。
- 建立唯讀棋盤／牌型 Overview 與完整 lifecycle cleanup。

### Phase 3-A — 記憶大師

- 完成四主題、雙語、每主題 12 抽 4、5 秒揭示與一次猜牌。
- 完成答錯分段揭示與可清理 Timer。
- 將玩法抽成 `MemoryMaster` Module，主程式與 Standalone 共用同一來源。

### PaJuR — 彈珠台

- 完成 12 槽、5 GREEN／7 RED 的可注入隨機配置。
- 完成 Pointer 蓄力、導引發射軌、物理碰撞、Anti-stuck 與真實落槽判定。
- 完成 Standalone、Module、主程式 Integration 與 forced selection。
- 封存經手機實機驗證的尺寸、軌道與 Power Indicator。

### Baseball9 — 棒球九宮格

- 完成九宮格 5 GREEN／4 RED 隨機配置。
- 完成 Pointer 投球、方向／距離／速度模型、2.5D 飛行與實際落點判定。
- 完成棒球視覺、板面破裂／穿透效果、Outside miss 與 one-ball lock。
- 完成 Standalone、Module、主程式 Integration 與 forced selection。

## 3. 結算、稱號與 UI 完整化

### Settlement & Achievement V1

- 建立 Round Score Breakdown，區分受倍率與不受倍率來源。
- 單局結果固定顯示本局實際變化、可捲動明細與目前總分。
- 下注在 multiplier settlement 後獨立結算。
- 建立正式完成局快照、15 個稱號定義、statistics builder 與 evaluator。
- GAME OVER 改為最終分數與本場稱號。

### Mobile / Gameplay Polish

- 已抽牌型改為可捲動的 click-to-open overview。
- 精簡開局準備資訊與事件卡層級。
- 補牌結果移到牌堆上方並精簡文字。
- 主操作、Modal、姓名輸入與手機資訊密度完成實機調整。
- PaJuR 與 Baseball9 以 375×667 為主要手機驗收尺寸。

### Finalization — Documentation / Archive

- 狀態：COMPLETED。
- 以現行程式與 regression tests 重新核對 README、遊戲規格與實作歷史。
- 建立 Final Architecture、Reuse Guide 與 Final Status。
- 將早期構想分類為已完成、被取代或未採用，不再表達成進行中的工作。
- 保留 `docs/legacy/` 原貌，並明確降級為歷史參考。

## 4. 測試演進

正式 regression 分層如下：

| 測試 | 保護範圍 |
|---|---|
| `phase1c.test.js` | 事件、下注、分數 floor、動態牌數與 Restart |
| `phase1d.test.js` | inventory、道具、Quick Overview、口袋系列 |
| `phase1e.test.js` | 加權抽取、籤、護身符與 Restart |
| `phase2.test.js` | 第 13 張 contract、Shared Tile Picker 與三款 registry |
| `phase3a.test.js` | 記憶大師玩法與 lifecycle |
| `settlement-achievements.test.js` | 分數明細、結算與 15 個稱號 |
| `pajur.test.js` | 彈珠台配置、物理 helpers、結果與 cleanup |
| `baseball9.test.js` | 九宮格配置、投球、落點、結果與 cleanup |

測試採可注入 RNG／scheduler 與 deterministic assertions，避免以機率統計作為 PASS 條件。UI 細節由 Browser QA 與手機 Playtest 補足。

## 5. 已確立的維護原則

1. `game-config.js` 保存資料定義；`game.js` 保存主遊戲 orchestration。
2. 正式取得牌必須經共用 pipeline，不能由小遊戲或道具任意改寫總分與摸牌數。
3. 總分變動统一經 floor-safe helper；BET 不可繞過 floor。
4. 小遊戲只回傳 `{ success }`，不得直接給牌、分數、倍率、機會或道具。
5. 新小遊戲先以正式 Module 建立 Standalone，再接入 Registry；禁止複製第二套玩法。
6. Restart、離開 Modal、返回主選單及 GAME OVER 必須清理 Timer、RAF 與 Pointer listeners。
7. 與行為相關的修改必須同步 deterministic test；純視覺修改至少執行 syntax 與直接相關 regression。
8. 手機正式基準不可因局部修正而任意改動 PaJuR／Baseball9 host 尺寸。
9. `docs/legacy/` 僅保存歷史，現行規格以 `GAME_SPEC.md` 與可執行 tests 為準。

## 6. 封存後變更流程

若未來重新啟動開發：

1. 先讀 `docs/FINAL_STATUS.md`、`GAME_SPEC.md` 與 `docs/FINAL_ARCHITECTURE.md`。
2. 為變更建立清楚的規則邊界與相容性目標。
3. 先補或調整 deterministic test，再作最小實作。
4. 對 375×667 與 Desktop 做與變更範圍相稱的 Browser QA。
5. 更新正式規格與架構文件；不要修改 legacy 封存來「修正」現況。
6. 完成全套 regression、syntax checks 與 `git diff --check` 後再提交。

## 7. 非承諾項目

大頭貼、小遊戲大頭貼彩蛋、小遊戲專用輔助道具及其他擴充構想未納入本封存版本的正式範圍。它們不是既有系統的缺口，也不代表排定中的交付承諾；若未來採用，應以新的設計與測試週期處理。

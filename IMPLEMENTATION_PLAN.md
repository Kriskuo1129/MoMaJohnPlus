# MoMaJohnPlus Implementation Plan

本計畫描述 MoMaJohnPlus 的分階段導入順序。Phase 0、Phase 1-A、Phase 1-B 與 Phase 1-C 已完成；Phase 1-D 以後均為 **Planned / 尚未實作**。

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

### Phase 1-D — 裝備系統（Planned / 尚未實作）

- 建立三格裝備欄與裝備 inventory。
- 建立裝備抽取、替換、持續型、自動消耗型及主動消耗型流程。
- 導入既定裝備池；不包含局中事件機率調整的最終整合。

### Phase 1-E — 局中事件重整與 Regression（Planned / 尚未實作）

- 重新分類局中事件。
- 將籤詩效果接入好／壞局中事件機率。
- 接入免洗護身符及瓦斯桶爆炸抵銷。
- 完成局中事件、Restart、BONUS、GAME OVER 與裝備交互 Regression。

## Phase 2 — Mini-game Integration Skeleton

Planned / 尚未實作：

- 建立第 8、13 張小遊戲節點。
- 建立七款小遊戲 Registry。
- 建立進場動畫、Placeholder、獲得牌動畫與返回牌局流程。
- 接入「珠珠寶貝」與「當地球隊贏球」。
- 確保第 8、13 張小遊戲不重複。

## Phase 3 — Real Mini-games & Avatar

Planned / 尚未實作：

- 大頭貼上傳與結算大頭貼。
- 小遊戲大頭貼 Easter Egg。
- 七款真正小遊戲逐步實作。
- 小遊戲輔助裝備。
- 玩家操作取得麻將牌。
- Playtest。
- 依實際成功率重新平衡下注與事件。

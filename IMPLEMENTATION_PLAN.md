# MoMaJohnPlus Implementation Plan

本計畫描述 MoMaJohnPlus 的分階段導入順序。除 Phase 0 文件與專案身份工作外，後續項目均為 **Planned / 尚未實作**。

## Phase 0 — Project Identity & Documentation Baseline

本輪工作，只建立新專案身份與文件：

- 將專案對外身份改為 MoMaJohnPlus。
- 保留原始 MoMaJohn Gameplay 作為可執行 baseline。
- 將原始規格、更新與工作紀錄移至 `docs/legacy/` 完整保存。
- 建立最新遊戲規格與分階段開發計畫。
- 將 Git remote 切換到新的 MoMaJohnPlus Repository。

Phase 0 不修改 Gameplay 行為。

## Phase 1 — MoMaJohnPlus Core Gameplay Framework

Planned / 尚未實作：

- 將「點數」對外文字統一為「分數」。
- 移除舊版模式選擇。
- 移除舊版下注流程。
- 建立場／局模型。
- 建立場中事件三選一。
- 將槓桿整合到同一開局畫面。
- 建立三格裝備與裝備池。
- 建立裝備池、場中下注事件池與場中特殊事件池。
- 重新分類局中事件。
- 將「老闆加碼」移出局中事件。
- 支援 14～16 張動態牌數。
- 讓海底撈月相容動態牌數。

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

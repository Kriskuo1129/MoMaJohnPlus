# MoMaJohnPlus Final Status

## 封存資訊

- Project：MoMaJohnPlus
- Status：Finalized Stable Baseline
- Finalization Date：2026-09-30
- Branch：`main`
- 封存基準前一版本：`bb0659e Complete Baseball9 mini-game integration`
- 產品狀態：本階段功能完成，正式文件與程式行為已重新對齊。

## 正式交付範圍

- 開局三選一／略過、槓桿與 immutable Commit。
- 9 個下注、6 個特殊定義、10 個道具、24 個局中事件。
- 14／15／16 張正式牌與第 13 張小遊戲合約。
- 記憶大師、彈珠台、棒球九宮格三款正式 Module、Standalone 與 Main Integration。
- Shared Tile Picker、正常 RNG 事件牌與自選事件牌的分流。
- 聽牌、補牌、連線、牌型、倍率、總分 floor 與獨立 BET settlement。
- Round Score Breakdown、GAME OVER 與 15 個稱號。
- Desktop、375×667 Browser QA 與實際手機 Playtest 涵蓋的主要流程。

## 驗證基線

正式測試：

- Phase 1-C、1-D、1-E
- Phase 2、Phase 3-A
- Settlement & Achievement V1
- PaJuR
- Baseball9

此外包含 `game.js`、`game-config.js`、三個小遊戲 Module、全部測試檔的 JavaScript syntax checks，以及 `git diff --check`。

## 已知邊界

- 專案使用 global script 與單頁記憶體狀態，沒有 package manager、bundler、後端、帳號或雲端存檔。
- 玩家名稱保存在 local storage；遊戲進度重新整理後不保留。
- Canvas 小遊戲以既有 logical board 與手機 host 尺寸為正式視覺基準。
- 隨機結果可在 tests 注入控制；正式遊戲使用瀏覽器 `Math.random`。
- 大頭貼、彩蛋與小遊戲專用輔助道具未納入封存版本範圍。

## Known Design Limitation

反覆正式摸牌的核心 Mahjong draw loop 主要是「摸牌 → 觀察結果 → 再摸牌」，相較 PRE_ROUND、BET、Items 與 Mini-games，玩家在此區段的 agency 較低。這是已確認的核心設計觀察，不是功能 Bug，也不影響目前版本的穩定性。

## Future Direction

MoMaJohnPlus 沒有進行中的 feature roadmap。未來專案可重用 PRE_ROUND transaction、Event／BET／Item 資料模式、Mini-game contract、Mobile UI 與 state management；新的核心循環與題材可重新設計，不預設一定延續麻將。

## 文件權威

- 現行玩家規則：`GAME_SPEC.md`
- 技術責任與資料流：`docs/FINAL_ARCHITECTURE.md`
- 擴充方式：`docs/REUSE_GUIDE.md`
- 歷史實作順序：`IMPLEMENTATION_PLAN.md`
- 原始 MoMaJohn 歷史：`docs/legacy/`

`docs/legacy/` 未被改寫，且不是目前版本的 source of truth。

## 恢復開發前檢查

1. 確認 `main` 與 upstream 同步且 working tree clean。
2. 閱讀正式規格、架構與重用指南。
3. 執行全套 tests 與 syntax checks，建立乾淨基線。
4. 將新需求定義為獨立、可測的變更，不以 legacy 文件推測現況。
5. 完成後同步程式、tests 與正式文件。

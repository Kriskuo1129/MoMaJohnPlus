# MoMaJohnPlus

MoMaJohnPlus 是由原始 [MoMaJohn](https://github.com/Kriskuo1129/MoMaJohn) 演進而來的加強版「台灣夜市摸麻將」瀏覽器遊戲。專案採純 HTML、CSS、JavaScript 製作，不需後端或建置工具即可執行。

## Repository 狀態

- 已建立 MoMaJohnPlus 專案身份與文件基線。
- Phase 1-A 已完成單一遊戲模式、15 張正式牌基準、分數用語與基礎規則轉換。
- Phase 1-B 已完成每局 PRE_ROUND 開局準備、場中事件三選一框架、槓桿整合與一次性 Commit 流程。
- 摸牌、連線、聽牌、事件、補牌及結算仍延續原始 Gameplay baseline；舊下注 UI 已退出正常 Gameplay，舊 settlement helper 暫時保留。
- Plus 新功能將依開發計畫分階段導入。
- 原始 MoMaJohn Repository 仍獨立保留，不受本專案後續開發影響。

## Plus 核心方向

以下項目皆為 **Planned / 尚未實作**：

- 建立「場」與「局」的完整遊戲結構。
- 加入三格裝備與裝備池。
- 加入場中下注事件與場中特殊事件。
- 重新整理局中事件分類與效果。
- 在正式牌第 8、13 張加入小遊戲節點。
- 未來加入七款可操作小遊戲、大頭貼與相關互動。

完整設計與階段規劃請參閱 [GAME_SPEC.md](GAME_SPEC.md) 及 [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md)。

目前 PRE_ROUND 顯示的三張場中事件皆為 **Temporary / Phase 1-B only** Placeholder，選擇後不會改變分數、牌數、倍率、牌池或任何 Gameplay 效果。正式場中事件預定於 Phase 1-C 導入。

## 本機執行

直接以瀏覽器開啟 `index.html` 即可遊玩。若瀏覽器對本機檔案有限制，也可在專案根目錄啟動靜態伺服器，例如：

```powershell
python -m http.server 8000
```

再開啟 `http://localhost:8000/`。

## 專案檔案

- `index.html`：遊戲頁面與 Modal 結構。
- `style.css`：桌面、手機、棋盤、事件及動畫樣式。
- `game-config.js`：Gameplay 的分數、事件權重與額外下注設定。
- `game.js`：牌組、狀態機、分數結算、事件、補牌及統計邏輯。
- `GAME_SPEC.md`：MoMaJohnPlus 最新遊戲設計規格；其中 Plus 功能目前均為規劃內容。
- `IMPLEMENTATION_PLAN.md`：MoMaJohnPlus 分階段開發計畫。
- [`docs/legacy/`](docs/legacy/)：完整保留的原始 MoMaJohn 規格、數值、更新與工作紀錄。

## Legacy Gameplay baseline

目前可執行版本已完成 Phase 1-A 與 Phase 1-B：玩家輸入名稱後進入單一 MoMaJohnPlus 模式，每局先完成場中事件與槓桿的 temporary selection，按下「開牌局」後才 Commit、扣除局數並進入 15 張正式摸牌。正式場中事件、裝備與其他 Plus 系統仍為 Planned / 尚未實作。

原始文件：

- [技術與功能規格](docs/legacy/TECHNICAL_FUNCTIONAL_SPEC.md)
- [事件、下注與點數討論稿](docs/legacy/EVENTS_BETS_SCORING.md)
- [更新說明](docs/legacy/RELEASE_NOTES.md)
- [工作報告](docs/legacy/WORK_REPORT.md)

## 部署

本專案可直接使用 GitHub Pages：Repository 的 **Settings → Pages**，將來源設為 **Deploy from a branch**，選擇 `main` 與根目錄 `/ (root)` 後儲存。

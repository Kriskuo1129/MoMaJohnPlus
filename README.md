# MoMaJohnPlus

MoMaJohnPlus 是由原始 [MoMaJohn](https://github.com/Kriskuo1129/MoMaJohn) 演進而來的加強版「台灣夜市摸麻將」瀏覽器遊戲。專案採純 HTML、CSS、JavaScript 製作，不需後端或建置工具即可執行。

## Repository 狀態

- 已建立 MoMaJohnPlus 專案身份與文件基線。
- Gameplay 仍維持原始 MoMaJohn baseline，Phase 0 沒有改變遊戲行為。
- Plus 新功能將依開發計畫分階段導入。
- 原始 MoMaJohn Repository 仍獨立保留，不受本專案後續開發影響。

## Plus 核心方向

以下項目皆為 **Planned / 尚未實作**：

- 建立「場」與「局」的完整遊戲結構。
- 每局開始前提供場中事件三選一。
- 加入三格裝備與裝備池。
- 加入場中下注事件與場中特殊事件。
- 重新整理局中事件分類與效果。
- 將槓桿整合進開局準備流程。
- 在正式牌第 8、13 張加入小遊戲節點。
- 未來加入七款可操作小遊戲、大頭貼與相關互動。

完整設計與階段規劃請參閱 [GAME_SPEC.md](GAME_SPEC.md) 及 [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md)。

## 本機執行

直接以瀏覽器開啟 `index.html` 即可遊玩。若瀏覽器對本機檔案有限制，也可在專案根目錄啟動靜態伺服器，例如：

```powershell
python -m http.server 8000
```

再開啟 `http://localhost:8000/`。

## 專案檔案

- `index.html`：遊戲頁面與 Modal 結構。
- `style.css`：桌面、手機、棋盤、事件及動畫樣式。
- `game-config.js`：原始 Gameplay 的點數、事件權重與額外下注設定。
- `game.js`：原始 Gameplay 的牌組、狀態機、點數結算、事件、補牌及統計邏輯。
- `GAME_SPEC.md`：MoMaJohnPlus 最新遊戲設計規格；其中 Plus 功能目前均為規劃內容。
- `IMPLEMENTATION_PLAN.md`：MoMaJohnPlus 分階段開發計畫。
- [`docs/legacy/`](docs/legacy/)：完整保留的原始 MoMaJohn 規格、數值、更新與工作紀錄。

## Legacy Gameplay baseline

目前可執行版本仍使用原始 MoMaJohn 規則，包括原有模式、牌數、下注、事件、計分與 State Machine。Phase 0 只建立新專案身份和文件，不把任何 Plus 規劃描述為已完成。

原始文件：

- [技術與功能規格](docs/legacy/TECHNICAL_FUNCTIONAL_SPEC.md)
- [事件、下注與點數討論稿](docs/legacy/EVENTS_BETS_SCORING.md)
- [更新說明](docs/legacy/RELEASE_NOTES.md)
- [工作報告](docs/legacy/WORK_REPORT.md)

## 部署

本專案可直接使用 GitHub Pages：Repository 的 **Settings → Pages**，將來源設為 **Deploy from a branch**，選擇 `main` 與根目錄 `/ (root)` 後儲存。

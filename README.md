# MoMaJohnPlus

MoMaJohnPlus 是由 [MoMaJohn](https://github.com/Kriskuo1129/MoMaJohn) 演進而來的台灣夜市摸麻將瀏覽器遊戲。專案以原生 HTML、CSS、JavaScript 製作，不需建置工具或後端服務；正式版本已完成手機實機驗證，主程式與三款小遊戲皆可直接由靜態檔案執行。

## Project Status

**Finalized / Archived Stable Baseline**

目前版本的 Gameplay、Mobile UI、三款小遊戲、測試與正式文件均已完成並封板。這不表示所有曾討論的構想都已採用；封存範圍只涵蓋實際落地且通過驗證的系統。Repository 可長期保存，也可作為後續實驗、衍生遊戲與系統重用的基底，目前沒有進行中的功能 Roadmap。

## What is MoMaJohnPlus

核心玩法由摸麻將、高分挑戰、PRE_ROUND 策略、BET、Items、Events 與 Mini-games 組成。玩家在每局開始前承擔機會成本與倍率風險，再以正式摸牌、事件、小遊戲、補牌與結算累積整場分數。

遊戲提供長期並存的兩種玩法：**經典模式**保留原汁原味、規則直接的摸麻將高分挑戰；**進階模式**加入小任務挑戰、局間小遊戲、票券與資源管理，提供更多策略與取捨。程式內部仍沿用 `PRODUCTION`／`EXPERIMENTAL` mode identifiers；玩家可見名稱則統一為經典／進階模式。兩種模式皆可在開局準備查看唯讀的 3 格道具欄；倍率券以「倍」為圖示，開始本局的主按鈕統一顯示「開始摸牌」。

## 正式版本摘要

- 每場初始 6 次機會；經典模式在開局準備選擇三張隨機具體事件之一或略過，進階模式則從固定的「獲得道具／機會／命運」類別自由選擇，開始本局 Commit 後才抽出並鎖定結果。
- 正式牌數依特殊事件為 14、15 或 16 張；第 13 張提供一次小遊戲機會。
- 場中事件池包含 9 個下注、5 個可抽取的特殊事件與「神秘禮物到來」；另保留 1 個停用中的特殊定義。
- 道具系統包含 3 格欄位與 10 個道具；籤影響局中事件權重，免洗護身符攔截負面事件，口袋系列可直接取得中、發、白。
- 局中事件池共有 24 個事件：12 個正面、9 個負面、3 個中立事件。
- 三款正式小遊戲為記憶大師、彈珠台、棒球九宮格；皆共用 `{ success: boolean }` 合約與正式第 13 張取得牌流程。
- 單局結算提供倍率前分數明細、下注結果與實際總分變化；總分最低為 0。
- GAME OVER 顯示最終分數與 15 個可取得稱號。

完整規則以 [GAME_SPEC.md](GAME_SPEC.md) 為準，程式結構見 [docs/FINAL_ARCHITECTURE.md](docs/FINAL_ARCHITECTURE.md)，封存狀態見 [docs/FINAL_STATUS.md](docs/FINAL_STATUS.md)。

## 執行方式

直接以瀏覽器開啟 `index.html` 即可。若瀏覽器限制本機資源載入，可在專案根目錄啟動靜態伺服器：

```powershell
python -m http.server 8000
```

再開啟 `http://localhost:8000/`。

## 遊戲流程

1. 輸入姓名並開始遊戲。
2. 在開局準備選擇具體事件／固定類別或略過，再配置本局倍率。
3. Commit 後消耗對應機會，依固定的本局設定進入摸牌。
4. 第 13 張可挑戰小遊戲或直接摸牌；成功可從合法剩餘牌自選，失敗則回到普通隨機摸牌。
5. 正常 RNG 抽到 Event A／B 時觸發局中事件；小遊戲獎勵自選 Event A／B 則只作為正式取得牌，不觸發事件。
6. 正式摸牌結束時若仍聽牌，進入三選補牌；命中可增加 1 次機會，上限仍為 6。
7. 單局結算後進入下一局；機會耗盡或事件提前結束全場時顯示最終分數與稱號。

## 專案結構

| 路徑 | 用途 |
|---|---|
| `index.html` | 主遊戲 DOM、Modal 與腳本載入順序 |
| `style.css` | 主遊戲桌面／手機版面、棋盤與互動樣式 |
| `game-config.js` | 場中事件、道具、運勢倍率與局中事件定義 |
| `game.js` | 狀態機、正式取得牌、計分、事件、道具、補牌、結算與稱號 |
| `minigames/` | 三款小遊戲的正式 Module、共用 CSS 與獨立 Playground |
| `tests/` | 各階段規則、結算與三款小遊戲的 deterministic regression tests |
| `GAME_SPEC.md` | 現行遊戲規格唯一文件來源 |
| `IMPLEMENTATION_PLAN.md` | 已完成的實作沿革與維護原則 |
| `docs/FINAL_ARCHITECTURE.md` | 主程式與小遊戲的最終技術架構 |
| `docs/REUSE_GUIDE.md` | 擴充、抽取與重用指引 |
| `docs/FINAL_STATUS.md` | 封存版本範圍、驗證與限制 |
| `docs/legacy/` | 原始 MoMaJohn 歷史文件，僅供考古，不是現行規格來源 |

## 小遊戲開發模式

每款小遊戲採 `Module + Standalone Playground + Main Integration`：

- `minigames/<name>.js` 是玩法與 lifecycle 的唯一正式來源。
- `minigames/<name>.html` 只提供反覆測試的獨立外殼，不複製玩法。
- 主程式呼叫 `start({ container, onComplete, random, scheduler })`，小遊戲只回傳 `{ success }`。
- SUCCESS、FAILURE、Shared Tile Picker 與正式第 13 張取得牌均由主程式負責。
- Controller 必須提供 `destroy()`，清理 Pointer listeners、Timer、RAF 與執行狀態。

既有 Module：

- `MemoryMaster`：四主題、中文／English 50／50、每主題 12 抽 4、5 秒記憶、一次猜牌。
- `PaJuR`：12 槽、5 GREEN／7 RED、Pointer 下拉蓄力、導引發射軌與真實落槽判定。
- `Baseball9`：九宮格 5 GREEN／4 RED、Pointer 投球、2.5D 飛行、實際落點與破板效果。

## 測試

```powershell
node tests/phase1c.test.js
node tests/phase1d.test.js
node tests/phase1e.test.js
node tests/phase2.test.js
node tests/phase3a.test.js
node tests/settlement-achievements.test.js
node tests/pajur.test.js
node tests/baseball9.test.js
```

語法檢查可對 `game.js`、`game-config.js`、三個小遊戲 Module 與所有測試檔執行 `node --check`。提交前另執行 `git diff --check`。

## 部署

本專案為純靜態網站，可由任意靜態主機部署。使用 GitHub Pages 時，在 Repository 的 **Settings → Pages** 選擇 **Deploy from a branch**、`main` 與 `/ (root)`。

## Development Status

Gameplay development 已封板。後續若重啟開發，應視為新的衍生週期：先建立測試基線，再以最小變更調整，不把過去未採用的構想當成欠缺功能。本 Repository 特別適合參考 PRE_ROUND transaction、資料驅動事件池、三格 Item inventory、小遊戲 Contract、Shared Tile Picker、Mobile overlay 與 deterministic testing。

## 文件優先順序

現行規則與程式碼衝突時，先以可執行程式與 regression tests 判定，再同步修正 `GAME_SPEC.md`。`docs/legacy/` 完整保留原始 MoMaJohn 的歷史討論、舊數值與舊工作紀錄，不應用來推導 MoMaJohnPlus 的現行行為。

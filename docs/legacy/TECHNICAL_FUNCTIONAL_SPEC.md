# 《台灣夜市摸麻將》（MoMaJohn）技術與功能規格

- 本文件為專案唯一的技術與功能規格，後續更新直接修改本檔，不再建立日期或版本副本。
- 實作型態：純前端 HTML / CSS / JavaScript，無框架、無後端、無圖片素材。

## 1. 系統組成

| 檔案 | 責任 |
|---|---|
| `index.html` | 畫面結構、HUD、棋盤、操作列與共用 Modal 容器 |
| `style.css` | Responsive 排版、牌面、倍率光效、事件與結算動畫 |
| `game-config.js` | `SCORE_CONFIG`、`EVENT_DEFINITIONS`、`BET_DEFINITIONS` |
| `game.js` | 牌組、回合狀態、判定、事件 handler、結算、統計與渲染 |

程式以 `TILE_DATA` 保持 36 張牌的唯一 ID，普通牌使用 Unicode Mahjong Tile 字元；特殊牌使用文字與 CSS 呈現。

標準模式的 `event-1` 與 `event-2` 在盤面分別顯示「事件 A」與「事件 B」，以獨立 tile ID 維持唯一性，但兩者仍呼叫同一個 weighted event pool。事件 Modal 的 kicker 會保留觸發來源標記。

## 2. 核心遊戲流程

1. 主選單設定玩家、模式後建立遊戲。
2. 每局選擇 1x／2x／3x 槓桿與可選額外下注。
3. 首次正式摸牌時扣除對應遊玩次數。
4. 建立隨機 6×6 棋盤、15 張正式手牌及其餘牌。
5. 逐張摸牌，更新正式取得集合、盤面、連線、聽牌與成就。
6. 事件牌直接抽取 weighted random 事件並執行。
7. 正式牌結束後，若仍聽牌則經 `BONUS_PENDING` 提示進入補牌三選；否則結束該局。
8. `ROUND_END` 依「倍率前數值 → 倍率 → 額外下注」結算。
9. 顯示獨立單局結果；玩家繼續下一局，或在無剩餘次數時進入 `GAME_OVER`。

主要狀態包含 `READY`、`DRAWING`、`EVENT_REVEAL`、`BONUS_PENDING`、`BONUS_DRAW`、`ROUND_END`、`GAME_OVER`。`busy` 與 `uiOverlayOpen` 額外避免快速連點、Modal 重疊及重複結算。

## 3. 點數資料模型

每局維護：

- `rawPoints`：所有局內點數效果的原始淨值，可為負數。
- `roundMultiplier`：玩家開局選擇的 1／2／3 倍率。
- `finalMultiplier`：實際局末倍率；特殊事件可改為 2／4／6。
- `multipliedPoints`：`rawPoints × finalMultiplier`。
- `betDelta`：額外下注的獨立結算值。
- `finalRoundDelta`：倍率點數與下注合計後，實際對總點數造成的變化。

局內所有正式連線、牌型、特殊成就及一般事件點數只呼叫倍率前數值累加流程，不立即修改總點數。局末才將 `rawPoints × finalMultiplier` 加入總點數，之後再結算下注。總點數以 0 為下限。

HUD 即時顯示：

- 本局點數：`rawPoints × finalMultiplier`（僅顯示公式改變，內部資料不預乘）
- 總點數：已完成局的累積結果

倍率不在頂部 HUD 重複顯示，由下注狀態按鈕與棋盤光效表現。局數使用既有 `attemptDisplay()` 移至摸牌操作列。

## 4. 點數規則

### 4.1 正式連線

共 14 條：6 橫、6 直、2 斜。每條由固定 line ID 管理，`completedLines` 防止重複領點。

- 同局第一條：+30 倍率前點
- 同局第二條：+60 倍率前點
- 同局第三條：+90 倍率前點
- 同局第四條及之後：每條 +90 倍率前點

### 4.2 收集牌型

- 萬／筒／條各自計算：第 5 張 +5、第 7 張再 +4、第 9 張再 +6。
- 四風（東南西北）：+5。
- 三元（中發白）：+5。
- 梅蘭：+3。

各門檻與成就每局只發放一次。

### 4.3 特殊成就

- 天聽：正式摸牌前 5 張內首次形成任何 5/6 聽牌，+5；以正式摸牌序號判斷，每局一次。
- 海底撈月：當前模式最後一張正式牌完成本局第一條正式連線，+5；若先前已有連線則不成立。標準模式為第 15 張，狂歡模式為第 18 張，實作依模式 `handSize` 判斷。

## 5. 倍率與下注

1x、2x、3x 分別消耗相應遊玩次數。倍率只在局末套用一次，不對個別點數項目即時相乘。

「老闆突然加碼」將整局 `finalMultiplier` 乘 2，結果限定為 2x、4x 或 6x，並立即更新 HUD 與棋盤光效。

額外下注：

| ID | 條件 | 成功 | 失敗 |
|---|---|---:|---:|
| `believe-guoju` | 東、南、西、北、中、發、白中正式取得任意 5 張 | +30 | -30 |
| `one-line` | 至少 1 線 | +15 | -10 |
| `waiting` | 曾形成 5/6 | +5 | -5 |
| `three-lines` | 至少 3 線 | +50 | -20 |

選擇下注前檢查總點數能否承擔所選項目的最大損失總和。下注於倍率結算後執行且不乘倍率，每局只結算一次。

## 6. 事件架構

`EVENT_DEFINITIONS` 的核心欄位：

- `id`、`title`、`story`
- `category`：`NORMAL` 或 `SPECIAL`
- `sentiment`：`POSITIVE`、`NEGATIVE`、`NEUTRAL`
- `effectType`、`value`
- `weight`、`displayEffect`、`enabled`

抽取時只納入 `enabled` 事件，再以通用 weighted random 依 `weight` 選擇。所有事件直接執行，不使用 `CHOICE` 或 options。

### 6.1 分類與 UI

- 一般事件：只處理點數；結果正值使用綠色、負值使用紅色，Modal 保持簡潔。
- 特殊事件：處理次數、倍率、棋盤或流程；Modal 加上特殊標記、紫色邊框與柔和光暈。

### 6.2 Effect handlers

- 點數：`ADD_SCORE`、`SUB_SCORE`、`RANDOM_SCORE`、`HALVE_ROUND_SCORE`
- 次數：`ADD_ROUNDS`、`SUB_ROUNDS`
- 倍率：`DOUBLE_FINAL_MULTIPLIER`
- 棋盤：`REPLACE_DRAWN_TILE`、`REMOVE_DRAWN_TILE`、`SWAP_DRAWN_TILE`
- 流程：`END_ROUND`、`END_GAME`、`RESTART_ROUND`

`DOUBLE_NEXT_LINE`、`DOUBLE_FUTURE_LINES` 與選擇型事件流程已移除。

### 6.3 特殊行為

- 偷天換日：從已正式取得與尚未取得的普通牌各取一張交換狀態；特殊牌不列入。交換後重新判定線、牌型與聽牌，但歷史已發點數不倒扣，已完成 line ID 不重複領取。
- 棒球攤重開：回復該局有效成果與事件造成的次數變化，建立全新牌序；保留倍率、下注及已消耗次數，不再次收取成本。實際觸發過的事件統計保留。
- 停電：直接進入正常局末結算。
- 瓦斯桶爆炸：完成當局倍率與下注結算後進入 GAME OVER。

完整事件及權重表見 `EVENTS_BETS_SCORING.md`。目前權重為正面 109／56.8%、負面 65／33.9%、中性 18／9.4%。

## 7. 聽牌與補牌

每次普通正式牌狀態變更後，重新檢查 14 條線。線上已有 5 個正式取得牌且缺 1 個時，加入 `activeWaiting`，缺牌 ID 加入 `bonusMissing`。一般聽牌 toast 以已公告 line ID 防止重複。

第 15 張完成後若仍有有效聽牌：

1. 進入 `BONUS_PENDING`，鎖定遊戲操作。
2. 再次高亮有效聽牌線與缺牌格，顯示最終聽牌確認。
3. 提示結束後只進入一次 `BONUS_DRAW`。
4. 顯示剩餘牌背，由玩家選滿 3 張。
5. 每次選牌立即比對 `bonusMissing`；第一或第二張命中時立即鎖定其他牌並成功，不必選滿三張。只有三張皆未命中才失敗。成功 +1 次，每局最多一次。

補牌不修改正式 drawn、連線、牌型、點數或中央棋盤狀態，抽到事件牌也不觸發事件。

## 8. 單局結算

`ROUND_END` 順序固定：

1. 凍結本局倍率前數值與最終倍率。
2. 計算並套用倍率點數。
3. 結算各額外下注。
4. 計算本局最終變化與總點數（最低 0）。
5. Modal 只向玩家顯示倍率後本局點數、下注損益（若有）、最終變化與總點數，不顯示內部 rawPoints 或乘法公式。
6. 使用 count-up／count-down 呈現結算前後總點數。

提前結束本局或整場也共用相同流程，避免漏算或重複算下注。

## 9. 統計

成績單記錄包括：總連線、成就、事件倍率前數值 gain/loss、一般／特殊事件數、正／負／中性事件數、天聽、海底撈月、最高本局倍率前數值、最高本局結算點數、最高倍率、加碼、重開與偷天換日次數，以及下注成功／失敗與淨結果。

## 10. Responsive 與視覺

- 桌面：HUD 與主棋盤在主要 viewport 內保持可見，操作區維持緊湊。
- 手機：在 375×667 等短 viewport 中縮減 HUD 間距與字級，但保留本局點數最高視覺層級；Modal 主體可捲動，操作按鈕不超出畫面。
- 主要遊戲容器、摸牌按鈕、棋盤牌格、補牌牌背、下注／說明按鈕及 Modal 主要操作按鈕使用 `touch-action: manipulation`，避免快速連點觸發 double-tap zoom；Modal 捲動與使用者主動雙指縮放維持可用。
- 1x 無特殊光效；2x 使用金黃環境光、3x 使用更強烈的紅橘 On Fire 氣氛、4x 使用紫色高倍率光效、6x 使用範圍與亮度更高的強紫光。光效同時作用於主要遊戲容器與棋盤，並以 CSS 外框、漸層、陰影與低頻呼吸動畫完成，不使用圖片。

## 11. 維護原則

- 數值與事件資料優先放在 `game-config.js`，避免散落於 UI handler。
- 新事件優先沿用既有 `effectType`；只有新效果才新增 handler。
- 所有得點必須經過倍率前數值入口，總點數只在局末倍率結算與獨立下注結算時改變。
- 所有局末入口應保持冪等，避免快速連點造成重複結算。
- 玩家可見內容一律使用繁體中文與「點數」用語。

## 12. 整合式下注、狀態與說明

- 桌機與手機共用棋盤下方同一個下注入口；它與「摸牌 (N)」組成 1:1 等寬主要操作列，沿用 `openLeverage()` 與相同 round state。
- 第一張牌前，下注視窗提供倍率 radio 與額外下注 checkbox；確認後設定 `leverageConfigured`。第一張牌後仍可開啟同一視窗，但只 render `finalMultiplier`、已鎖定下注與狀態，不建立可修改 input。
- 本局狀態直接沿用 `roundLines`、`activeWaiting`、`everWaited`、`achievements` 與既有 `renderProgress()`，沒有建立第二套判定。
- 說明視窗使用 `SCORE_CONFIG`、`BET_DEFINITIONS` 與 `EVENT_DEFINITIONS` 動態 render。標準模式顯示點數與事件；狂歡模式只顯示適用的點數規則。
- 手機下注與說明使用底部滑入的 sheet；header、footer 固定，`.modal-scroll-content` 使用 `min-height: 0` 與 `overflow-y: auto`。

## 13. 內部測試模式

- 玩家名稱經 `trim()` 後精確等於 `TEST1129`，且選擇標準模式時，啟用內部 deterministic scenario；大小寫不同或狂歡模式均不啟用。
- `testScenarioRoundIndex` 只追蹤當次遊戲實際建立的牌局。前六局依序驗證三門九張成就、補牌成功／失敗、天聽、海底撈月、三線及瓦斯桶爆炸；第七局起回到正式亂數。
- 每個劇本在 `createRound()` 階段建立合法且唯一的 `board`、`hand`、`remaining`，正式摸牌仍走 `drawTile()`、連線、聽牌、成就、補牌與結算流程。
- 前五局手牌不包含事件牌。第一、三局將有效缺牌排在補牌第一格；第二局只將非缺牌排在前三格，牌都仍取自該局 `remaining`。
- 第六局第八張為事件 A，僅該劇本略過 weighted random 並指定既有 `explosion` 事件；事件資料、權重與正式 handler 均未修改。
- 測試模式會在前六局需要時補足高倍率的可消耗次數，避免 2x／3x 提前中斷劇本；倍率、下注與結算仍使用正式流程。第六局固定事件仍會正式結束整場。
- 「再玩一次」或回到主選單重新開始會建立新的 game state，因此劇本回到第一局；測試進度不寫入 localStorage。

## 14. 正式抽牌隨機性

除玩家名稱精確為 `TEST1129` 且進入標準模式的開發測試劇本外，正式遊戲的 `board`、`hand`、`remaining` 與正式抽牌順序一律由正常隨機洗牌建立。

禁止依據總點數、本局點數、是否接近 300 點、目前倍率、玩家下注、前幾局表現、已完成連線數或運氣好壞，動態修改抽牌機率或牌序。300 點只作為平衡與成績評價基準，不得成為 RNG 控分條件。若需調整整體平均點數，應修改公開的點數數值、事件 Weight、下注數值、遊玩局數或其他公開規則，不得暗中調整抽牌機率。

## 15. HUD 與主要操作列

- HUD 採 mobile-first：左側約占 70%、右側約占 30%。左側第一列只顯示置中的玩家名稱，第二列固定為左側總點數、右側本局點數；兩欄嚴格各占 50%，使用相同 font-size、font-weight、line-height、padding 與可用空間，只顯示數字且不顯示模式。桌面沿用相同資訊結構。本局點數以正負號及動態顏色與固定色彩的總點數區分。
- 右側跨越 HUD 全高，垂直置中顯示小型「局數」標籤與大型 `X/Y`；資料直接使用既有 `attemptDisplay()`，只移除顯示用空白，不建立新的局數計算。
- 本局點數仍直接顯示 `rawPoints × finalMultiplier`。負數為柔和淡藍；0～19 為暖金；20～49 為暖橘；50～69 為橘紅；70 以上為紫色。`updateHUD()` 每次 render 都同步更新數字與顏色 class，因此倍率加碼會立即反映。
- HUD 欄位使用 `minmax()`、`min-width: 0`、ellipsis、nowrap、`clamp()` 與 tabular numbers，12 字元玩家名稱及四位以上點數不會改變 HUD 高度或造成水平溢位。
- 玩家名稱為選填，輸入值會先經過 `trim()` 並限制為 12 字元。實際輸入為空時仍允許開始遊戲，該次 game session 的顯示名稱使用「-沒輸入名稱-」。此 fallback 不是使用者輸入值，不寫回名稱欄位或 `localStorage`；只有非空的實際名稱沿用既有保存行為。`TEST1129` 僅在實際輸入精確符合該字串時啟用，空名稱不會啟用測試劇本。
- 棋盤下方主要操作列固定為「下注｜摸牌 (N)」，兩欄各占 50%，同高、同圓角、同字級與同邊框厚度；按鈕保留各自角色配色與 `touch-action: manipulation`。
- N 由目前模式 `handSize - drawIndex` 計算，只代表正式摸牌剩餘數量。標準／狂歡新局分別顯示 15／18，正式牌歸零後維持「摸牌 (0)」及既有 disabled 流程，不讀取補牌數量。
- 下注摘要仍直接讀取 `finalMultiplier` 與 `activeBets`；第一張牌後仍可開啟既有唯讀視窗，老闆加碼後會立即反映 4x／6x。

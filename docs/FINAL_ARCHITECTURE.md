# MoMaJohnPlus Final Architecture

## 1. 系統概要

MoMaJohnPlus 是無 build step、無後端依賴的單頁靜態遊戲。瀏覽器依序載入三款小遊戲 Module、`game-config.js` 與 `game.js`；所有正式狀態只存在目前頁面的 JavaScript memory，玩家名稱另以 local storage 保存。

```text
index.html
├─ style.css
├─ minigames/*.{css,js}
├─ game-config.js       資料定義
└─ game.js              主狀態機與 orchestration
   ├─ PRE_ROUND / Commit
   ├─ Formal Tile Acquisition
   ├─ Mini-game Contract
   ├─ In-round Events / Items
   ├─ Scoring / Bonus / Settlement
   └─ GAME OVER / Achievements
```

## 2. 載入與依賴方向

`index.html` 的正式腳本順序：

1. `minigames/memory-master.js`
2. `minigames/pajur.js`
3. `minigames/baseball9.js`
4. `game-config.js`
5. `game.js`

三個 Module 將 frozen API 暴露為 `globalThis.MemoryMaster`、`globalThis.PaJuR`、`globalThis.Baseball9`。它們不依賴 `game.js`；主程式單向呼叫 Module。Standalone HTML 也載入相同 Module，因此不存在第二套小遊戲玩法。

## 3. 設定層

`game-config.js` 保存四類資料：

- `SCORE_CONFIG`：連線、牌型與特殊得分。
- `PRE_ROUND_EVENT_DEFINITIONS`：ITEM、BET、SPECIAL。
- `ITEM_DEFINITIONS` 與 `FORTUNE_MODIFIERS`。
- `EVENT_DEFINITIONS`：局中事件、情緒、基礎權重與 effect handler key。

設定物件由 `Object.freeze` 保護。主程式透過 effect key dispatch 行為，不在定義內保存 callback。

## 4. 主狀態機

主狀態：

- `READY`
- `PRE_ROUND`
- `COMMITTING`
- `DRAWING`
- `MINIGAME_OFFER`
- `MINIGAME_ACTIVE`
- `MINIGAME_REWARD`
- `EVENT_REVEAL`
- `BONUS_PENDING`
- `BONUS_DRAW`
- `ROUND_END`
- `GAME_OVER`

`game` 保存整場權威狀態；`game.round` 保存單局狀態。跨局資料包括總分、機會、inventory 與整場 statistics。單局資料包括牌序、正式取得集合、Commit snapshot、連線、聽牌、rawPoints、breakdown、mini-game lifecycle 與 bonus lifecycle。

```text
READY
  → PRE_ROUND
  → COMMITTING
  → DRAWING
      ├─ #13 → MINIGAME_OFFER → MINIGAME_ACTIVE → MINIGAME_REWARD
      ├─ Event tile → EVENT_REVEAL → DRAWING
      └─ draws complete → BONUS_PENDING → BONUS_DRAW
  → ROUND_END
      ├─ next round → PRE_ROUND
      └─ no attempts → GAME_OVER
```

### Commit boundary

`round.preRound` 是可修改的暫時選擇；`round.config` 只在正式 Commit 後建立並 freeze。猜拳與 Item Reveal 在 `COMMITTING` 完成，之後才消耗機會並進入 `DRAWING`。這個邊界避免 UI preview 提前污染正式狀態。

Restart 不重新執行 transaction：它重建局內 mutable state，沿用原本 `preRound` 與 frozen `config`，並保留 `attemptStart`，因此不會重抽開局選項、重做 Item／猜拳或重複消耗機會。

## 5. 正式取得牌 pipeline

正式牌由共用流程負責：

1. 決定牌來源：普通 RNG、mini-game reward picker 或主動口袋道具。
2. 更新牌池、`drawn`／`discarded` 與必要的 `drawIndex`。
3. 更新棋盤。
4. `scoreLines()`。
5. `scoreCollections()`。
6. `updateWaitingLines()`。
7. 依來源決定是否進入局中事件或後續流程。

普通 RNG 的 Event A／B 進入 `EVENT_REVEAL`。Mini-game reward picker 以明確 option suppress 事件，只改變該次 acquisition；一般 `acquireFormalTile()` 的事件行為不被削弱。口袋系列不增加 `drawIndex`，但仍呼叫正式牌效果更新。

## 6. 小遊戲邊界

共用呼叫合約：

```js
const controller = MiniGame.start({
  container,
  onComplete: ({ success }) => {},
  random,
  scheduler
});
```

責任分工：

| Module 負責 | 主程式負責 |
|---|---|
| 玩法狀態與畫面 | 第 13 張 opportunity |
| 玩家輸入 | 進入／直接摸牌 |
| 自身 RNG 與可測 helper | SUCCESS Shared Tile Picker |
| Timer／RAF／Pointer cleanup | FAILURE Result 與普通 RNG |
| 回傳 `{ success }` | 正式取得牌、事件、分數、機會、道具 |

Controller 必須提供 idempotent `destroy()`。主程式的 `clearMiniGameLifecycle()` 在結果、Restart、結算、GAME OVER 與離開流程清理活躍 controller。

## 7. 各 Module

### MemoryMaster

- DOM renderer。
- `createRound(random)` 集中主題、語言、抽樣與 Target。
- 內部分離 countdown、correct reveal、result timers。
- 可測 API 包含 constants、themes 與 round creation。

### PaJuR

- Canvas renderer 與固定 720×1000 logical board。
- Pointer capture 驅動蓄力；physics loop 由 RAF + substeps 執行。
- 導引軌 geometry、slot layout、collision 與 anti-stuck helper 可獨立測試。
- 結果只取決於實際 landed slot。

### Baseball9

- Canvas renderer 與固定 720×1000 logical board。
- Pointer gesture 轉換為可重現的 target point。
- 2.5D flight、hit plane、cell lookup、break animation 分離。
- 結果只取決於 target point 所在 cell；outside 為 failure。

## 8. 事件架構

四類資料各自負責不同時間點：

| 類型 | 發生時機 | 責任 |
|---|---|---|
| BET | PRE_ROUND 選擇，局末判定 | 用正式局結果換取固定得失分 |
| SPECIAL | PRE_ROUND 選擇，Commit 時快照 | 改變倍率、正式牌數或指定小遊戲 |
| ITEM | PRE_ROUND 選擇，Commit 時取得 | 改變 inventory，效果可為被動、自動消耗或主動消耗 |
| IN-ROUND EVENT | 正常 RNG 取得 Event A／B | 以情緒加權後執行一次 effect handler |

### 場中事件

`drawPreRoundEvents()` 對啟用定義作不放回加權抽取。ITEM 定義的權重等於道具池大小；抽到後仍只生成一張「神秘禮物到來」卡。BET 與 SPECIAL 的資料被快照進 `round.config`。

### 局中事件

`drawInRoundEvent()` 對啟用事件使用 `baseWeight × fortuneModifier`。事件只提供 `effectType`；`EVENT_EFFECT_HANDLERS` 統一處理得分、機會、提早結束、牌面替換與 Restart。

免洗護身符位於 dispatcher 與 handler 之間，只攔截 NEGATIVE 事件。此位置保證所有負面 effect type 一致受保護。

## 9. 計分與結算

- `addRoundPoints()` 修改可正可負的 `round.rawPoints`，並寫入倍率項目 breakdown。
- `settleRoundPoints()` 計算 `rawPoints × finalMultiplier`。
- `addTotalPoints()` 是安全總分入口，以 `Math.max(0, ...)` 保證 floor。
- `settleBets()` 在倍率分數後執行，寫入不受倍率的 breakdown，同樣經安全入口。
- `finalRoundChange` 以總分實際前後差計算。

稱號由三個部分分離：

1. `recordCompletedRoundStats()` 寫入正式完成局快照。
2. `buildAchievementStats()` 建立 evaluator input。
3. `evaluateAchievements()` 對 15 個 frozen definitions 執行純條件判斷。

## 10. UI 與手機版面

- 主遊戲 DOM 留在 `index.html`，動態卡片與 Modal body 由 `game.js` renderer 建立。
- 主遊戲樣式集中在 `style.css`。
- 小遊戲只使用各自 namespace class 與 CSS。
- PaJuR／Baseball9 host 的手機正式高度為 `min(68dvh, 650px)`；board 最大寬 400px、比例 720/1000。
- 已抽牌型卡以 viewport max-height 與 vertical scroll 保護手機可操作性。

Shared Tile Picker 是可重用的 reward pattern：主程式從 authoritative remaining tiles 建立候選、提供目前棋盤唯讀 Overview、等待單一明確選擇，再由 acquisition pipeline Commit。Picker 本身不預先改寫棋盤，也不負責事件、計分或正式牌數。

## 11. 測試架構

Tests 以 Node `vm`、受控 DOM／Canvas doubles、注入 RNG 與 scheduler 驗證 browser code。核心原則：

- 亂數結果以 deterministic sequence 驗證。
- Timer／RAF 以 fake scheduler 驗證一次完成與 cleanup。
- 規則測試不綁定易碎的像素 snapshot。
- 視覺與觸控體驗另外以 Desktop、375×667 Browser QA 與實機 Playtest 驗證。

## 12. Source of truth

優先順序：

1. 可執行程式與 tests。
2. `GAME_SPEC.md`。
3. 本架構文件與 `README.md`。
4. `IMPLEMENTATION_PLAN.md` 的歷史脈絡。
5. `docs/legacy/` 僅供原始專案考古。

## 13. Design Retrospective

MoMaJohnPlus 的 UI、動畫、控制、事件、BET、Items 與 Mini-games 已形成品質一致、可測且可重用的外圍系統。長時間 Playtest 同時顯示，連續正式摸牌的核心循環多為「Draw → Observe Result → Draw」，玩家在此區段的主動決策相對有限；PRE_ROUND、BET、Items 與 Mini-games 則提供明顯較強的 decision making、interaction 與 agency。

因此專案選擇在功能與視覺成熟時封板，而不是把更多系統堆疊在既有核心循環上。未來衍生遊戲可優先重用 transaction、event pool、inventory、mini-game contract、mobile overlays 與 testing pattern，同時重新設計更具玩家主動性的核心循環；衍生方向不必繼續使用麻將題材。

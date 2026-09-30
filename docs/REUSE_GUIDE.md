# MoMaJohnPlus Reuse Guide

## 1. 建議先讀

1. `docs/FINAL_STATUS.md`：確認封存範圍與驗證狀態。
2. `GAME_SPEC.md`：了解玩家規則與數值。
3. `docs/FINAL_ARCHITECTURE.md`：了解狀態、責任與資料流。
4. 相關 `tests/*.test.js`：取得可執行的行為範例。
5. 最後才深入 `game.js` 或小遊戲 Module。

## 2. 重用整個遊戲

此專案無 package install 或 build step。保留根目錄 HTML／CSS／JS、`minigames/` 與資源相對路徑，即可部署到一般靜態主機。

若要換品牌、色彩或文字，先限定在 HTML／CSS／玩家文案；避免同時調整狀態機與規則。任何規則變更都應同步修改 `GAME_SPEC.md` 與相應 regression。

## 3. 重用單一小遊戲

每款小遊戲可獨立抽取：

| 遊戲 | 必要檔案 | Global API |
|---|---|---|
| 記憶大師 | `memory-master.js`、`memory-master.css` | `MemoryMaster` |
| 彈珠台 | `pajur.js`、`pajur.css` | `PaJuR` |
| 棒球九宮格 | `baseball9.js`、`baseball9.css` | `Baseball9` |

Standalone HTML 是最小接法示例。Host 必須提供 Module 期待的 container markup，並呼叫：

```js
const controller = MiniGame.start({
  container,
  onComplete(result) {
    // result === { success: boolean }
  },
  random: Math.random,
  scheduler: window
});
```

離開頁面、重開遊戲或 host 被移除前呼叫：

```js
controller.destroy();
```

不要從 Module 內直接修改宿主的分數、獎勵或流程；由 `onComplete` 後的宿主層決定。

### Memory Master

- Source：`minigames/memory-master.js`
- Style：`minigames/memory-master.css`
- Playground：`minigames/memory-master.html`
- Tests：`tests/phase3a.test.js`
- 注意：Host 必須保留 Timer cleanup；結果後的獎勵不屬於 Module。

### PaJuR

- Source：`minigames/pajur.js`
- Style：`minigames/pajur.css`
- Playground：`minigames/pajur.html`
- Tests：`tests/pajur.test.js`
- 注意：Canvas logical size、host ratio、Pointer capture、RAF 與 physics helpers 是一組依賴，不要只複製 renderer。

### Baseball9

- Source：`minigames/baseball9.js`
- Style：`minigames/baseball9.css`
- Playground：`minigames/baseball9.html`
- Tests：`tests/baseball9.test.js`
- 注意：視覺球尺寸與 hit calculation 刻意分離；整合時不要把 DOM／Canvas 顯示尺寸帶入結果計算。

## 4. 重用 PRE_ROUND

- 設定：`game-config.js` 的 `PRE_ROUND_EVENT_DEFINITIONS`。
- Runtime：`game.js` 的 draw、render、selection、validation、Commit 與 Restart functions。
- Markup／Style：`index.html` 的 pre-round panel 與 `style.css` 的 `pre-round-*` selectors。
- Tests：`phase1c.test.js`、`phase1d.test.js`、`phase1e.test.js`。
- 注意：暫時選擇與 frozen config 是 transaction 的核心；不可在 UI click 時提前扣資源或產生正式效果。

## 5. 建立新小遊戲

沿用既有模式而不建立大型框架：

1. 在 `minigames/` 建立 JS、CSS、Standalone HTML。
2. Module 暴露 frozen object，至少包含 `start`。
3. `start` 接受 `container`、`onComplete`、可注入 `random`、可注入 `scheduler`。
4. 回傳 controller，至少包含 idempotent `destroy()`。
5. 確保 `onComplete` 最多呼叫一次。
6. 將核心 random selection、geometry 或 hit calculation 抽成可直接測試的純 helper。
7. 先在 Standalone 完成操作與手機 Playtest。
8. 再加入主程式 Registry、HTML/CSS 載入與 controller cleanup。
9. 第 13 張結果仍只使用 `{ success }`，不讓小遊戲直接給牌。

## 6. 重用 Items 與 Event Pools

- Definitions：`game-config.js`。
- Inventory、Reveal、Replacement、active use：`game.js`。
- Event weighting、shield dispatcher、effect handlers：`game.js`。
- UI：`index.html` 的共用 Modal 與 `style.css` 的 item／event selectors。
- 注意：設定層只描述資料與 effect key；runtime 統一執行副作用。不要將 DOM callback 寫回 config。

## 7. 重用 Mobile UI Patterns

- 共用 Modal／overlay、Quick Overview、Bonus Draw 與 PRE_ROUND responsive rules 位於 `index.html`、`style.css`。
- PaJuR／Baseball9 的 host 與 board footprint 位於各自 CSS；兩者已按 375×667 驗證。
- 注意：overlay 必須考慮 `100dvh`、vertical scroll、固定操作列與 touch target。不要用全域 overflow 修補單一 Modal。

## 8. 擴充事件

### 新增局中事件

- 在 `EVENT_DEFINITIONS` 新增唯一 ID、情緒、權重與 effect type。
- 能由既有 handler 表達時不要新增特殊分支。
- 新 effect type 才加入 `EVENT_EFFECT_HANDLERS`。
- 明確分類 POSITIVE／NEGATIVE／NEUTRAL，以免破壞籤與護身符語意。
- 對 selection boundary、handler effect、Restart／GAME OVER 交互補 deterministic test。

### 新增場中事件

- BET 必須用現有 condition handler 或新增明確 condition key。
- SPECIAL 必須能完整快照到 `round.config`。
- ITEM Event 本身代表整個道具池，不為每件道具建立卡片。
- 確認槓桿可用性、Commit 一次性與 Restart preservation。

## 9. 擴充道具

- 在 `ITEM_DEFINITIONS` 新增唯一 ID。
- 被動道具應從 authoritative inventory 即時計算。
- 自動消耗道具應在共用 dispatcher 邊界處理。
- 主動道具只在合法主狀態開放，成功後立即消耗。
- 若會正式取得牌，重用 official tile effect pipeline，不直接複製連線／聽牌更新。
- 三格滿格 replacement 與新場 reset 必須保持成立。

## 10. 修改計分

- 本局可負分項經 `addRoundPoints()`。
- 所有總分變動經 `addTotalPoints()`，不可直接繞過 floor。
- 是否受倍率必須在 breakdown 明確標示。
- BET 保持在 multiplier settlement 後獨立處理。
- 同時更新數值定義、玩家文案、結算 test 與本規格。

## 11. 測試策略

- 用注入 RNG 指定邊界，不以大量隨機抽樣猜測分布。
- 用 fake scheduler 驗證 Timer、RAF、delay、cleanup。
- Hit detection 測 logic coordinates，不綁畫面像素。
- 主流程變更至少跑 phase1c～phase3a、settlement、PaJuR、Baseball9 全套。
- 提交前跑所有相關 `node --check` 與 `git diff --check`。

## 12. 不應重用的歷史內容

`docs/legacy/` 包含原始 MoMaJohn 的舊下注入口、舊數值與過去工作報告。它適合了解演進背景，不適合作為新功能範本或現行規則依據。

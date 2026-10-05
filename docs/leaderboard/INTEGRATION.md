# Leaderboard Phase 2 Integration

## API

正式 Web App URL 集中設定於 `game-config.js` 的 `LEADERBOARD_API_URL`。GET 與 POST 共用 `leaderboardRequest()`，逾時時間由 `LEADERBOARD_REQUEST_TIMEOUT_MS` 控制。

## GAME OVER 提交生命週期

`showGameOver()` 先照常顯示最終成績 Modal，再以背景 Promise 呼叫 `submitGameOverScore()`。玩家名稱直接使用 `game.playerName`，最終分數直接使用 `game.score`。現有 `startGame()` 已將空白名稱正規化為 `-沒輸入名稱-`。

每個 `freshGameState()` 都包含 `leaderboardSubmitted: false`。第一次進入 GAME OVER 時，提交函式會先把它設為 `true` 再開始 POST，所以 render、重新開啟 GAME OVER 或網路失敗都不會讓同一場重複提交。`startGame()`、`resetGame()` 與 `returnToMainMenu()` 建立新 game state 時會自然重置旗標。

POST 狀態顯示在最終分數下方：`成績登錄中…`、`成績已登錄排行榜！` 或 `排行榜上傳失敗`。失敗只更新狀態並寫入簡短 console warning，不阻塞 GAME OVER 操作。

## Top 20 UI

READY 主選單與 GAME OVER 共用同一個 `leaderboard-overlay`。Overlay 開啟後立即顯示載入狀態，再以 GET 取得後端已排序的 Top 20；前端只限制最多顯示 20 筆，不重新排序。同名紀錄逐筆顯示，前三名分別使用金、銀、銅牌符號。

外部名稱使用 `textContent` 寫入 DOM，不使用未 escape 的 HTML。空資料顯示 `目前還沒有排行榜紀錄`；讀取失敗顯示 `排行榜讀取失敗` 並提供 `重新整理`。

## Mobile behavior

排行榜 Overlay 固定為 viewport 高度且本身 `overflow: hidden`。Header 與 Footer 固定在卡片內，只有 `.leaderboard-content` 使用 `overflow-y: auto` 與 `overscroll-behavior: contain`。在 375×667 viewport 下，排行榜不增加 Browser Page 高度，Top 20 由內容區內部捲動。

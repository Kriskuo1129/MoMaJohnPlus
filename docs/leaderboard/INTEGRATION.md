# Dual Leaderboard Integration

## Storage architecture

Google Spreadsheet 使用三張相同 header（`timestamp | name | score`）的工作表：

- `Ranking`：既有歷史紀錄，只作 Legacy／Seed Data。初始化後正式 GET／POST 均不再讀寫。
- `HighestRanking`：正式最高 TOP 20，最多 20 筆，score 降冪、同分 timestamp 新到舊。
- `LowestRanking`：正式最低 TOP 20，最多 20 筆，score 升冪、同分 timestamp 新到舊。

兩張正式榜完全獨立，同一筆 Seed Record 可以同時存在兩榜，不跨榜去重。

## API

正式 Web App URL 集中於 `game-config.js` 的 `LEADERBOARD_API_URL`。所有 GET／POST 皆經 `leaderboardRequest()`，並受 timeout 限制。

- `GET ?mode=highest`：直接讀 `HighestRanking`。
- `GET ?mode=lowest`：直接讀 `LowestRanking`。
- GET 未提供 mode 時預設 highest。
- POST highest：`{ mode: "highest", name, score }`。
- POST lowest：`{ mode: "lowest", name, score }`。

POST 依 mode 只寫指定工作表，在同一個 Script Lock transaction 內 append、排序並裁切至 20 筆。Invalid mode 不寫入任何工作表。

## 開局 Snapshot 與 Qualification

玩家開始或「再玩一場」時先顯示「遊戲讀取中…」，平行取得兩張正式榜 Snapshot，完成後才進入 `PRE_ROUND`。任一 GET offline、timeout、API failure 或 malformed response 時，遊戲仍開始，但本局 Snapshot invalid、不 qualification、不 POST、不宣稱進榜。Gameplay 與 GAME OVER 不重新 GET 門檻。

GAME OVER 採 Highest 優先且互斥：

1. Highest 少於 20 筆，或 `finalScore >= highest rank 20 score`：mode 為 highest。
2. 只有不符合 Highest 時才判斷 Lowest；Lowest 少於 20 筆，或 `finalScore <= lowest rank 20 score`：mode 為 lowest。
3. 否則 mode 為 null，不 POST。

一局最多只有一個 mode、最多 POST 一次。Highest waiting 為「有不得了的事正在發生...」，成功顯示 `🏆 本次成績進入最高 TOP 20！`；Lowest waiting 為「欸你好像....」，成功顯示 `💀 本次成績進入最低 TOP 20！`。POST failure／timeout 仍進 GAME OVER，且不顯示成功 badge。

## Ranking Overlay

READY 與 GAME OVER 共用單一 Overlay，固定顯示「最高 TOP 20／最低 TOP 20」切換。切換只更新同一個 internal scroll list，Retry 使用當前 mode。Highest 前三名使用獎牌；Lowest 使用數字排名。Overlay 為 `100dvh`、Browser Page 不垂直捲動，僅 list 內部捲動。

## Migration 與 Deployment

`initializeDualLeaderboards()` 只能由管理者在 Apps Script Editor 手動執行，GET／POST 不會觸發。它在 Script Lock 內讀取 `Ranking` 全部有效紀錄，保留原 timestamp，分別重建最高與最低 TOP 20；不修改 `Ranking`，且可安全重跑。

Repository 中修改腳本不等於線上 Web App 已更新。先更新 Code.gs、手動執行 migration 並檢查兩張正式榜，再於「管理部署作業」建立新版本。正式 `/exec` URL 維持不變。

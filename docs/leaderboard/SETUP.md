# Google Apps Script 雙排行榜設定

## 工作表架構

同一份 Spreadsheet 使用三張工作表，header 均為：

| timestamp | name | score |
| --- | --- | --- |
| Apps Script 寫入時間 | 玩家名稱 | 最終總分 |

- `Ranking`：既有 Legacy／Seed Data，完整保留，正式 API 不再讀寫。
- `HighestRanking`：正式最高 TOP 20。
- `LowestRanking`：正式最低 TOP 20。

若是既有正式環境，請勿刪除或修改 `Ranking` 歷史資料。

## 更新 Apps Script

1. 在試算表選擇「擴充功能」→「Apps Script」。
2. 以 [`google-apps-script.js`](./google-apps-script.js) 完整內容更新 `Code.gs`。
3. 確認 `SPREADSHEET_ID` 指向目前正式 Spreadsheet。
4. 儲存腳本；此時先不要透過 GET／POST 初始化。

## 一次性 Migration

1. 在 Apps Script Editor 的 function 選單選取 `initializeDualLeaderboards`。
2. 按「執行」，首次執行時完成 Google 授權。
3. 確認 `HighestRanking` 與 `LowestRanking` 已建立，header 正確且各不超過 20 筆。
4. Highest 應為 score 高到低，Lowest 應為 score 低到高；同分皆為 timestamp 新到舊。
5. 確認 `Ranking` 原始資料完全未變。

Migration 會讀取 `Ranking` 所有有效列並保留原 timestamp，分別重建兩張正式榜；兩榜可包含相同 Seed Record。它不是 append，可安全重跑且不產生 duplicate。Migration 使用 Script Lock，避免與 POST 同時寫榜。

## 更新 Web App Deployment

Migration 驗證完成後：

1. 選擇「部署」→「管理部署作業」。
2. 編輯既有 Web App deployment。
3. 選擇「新版本」並部署。
4. 保持「執行身分：我」及公開存取設定。
5. 繼續使用原本 `/exec` URL，不需變更前端 endpoint。

## 測試 GET

```text
PASTE_YOUR_EXEC_URL_HERE?mode=highest
PASTE_YOUR_EXEC_URL_HERE?mode=lowest
```

未提供 mode 時預設 highest。GET 直接讀對應正式 Sheet，各最多回傳 20 筆，不再依賴 `Ranking`。

## 測試 POST

Highest：

```powershell
$webAppUrl = 'PASTE_YOUR_EXEC_URL_HERE'
$body = @{ mode = 'highest'; name = 'Kris'; score = 500 } | ConvertTo-Json
Invoke-RestMethod -Uri $webAppUrl -Method Post -ContentType 'application/json' -Body $body
```

Lowest：

```powershell
$body = @{ mode = 'lowest'; name = 'Kris'; score = -50 } | ConvertTo-Json
Invoke-RestMethod -Uri $webAppUrl -Method Post -ContentType 'application/json' -Body $body
```

POST 只接受 `highest`／`lowest`；invalid mode 不會寫入。`name` 去除頭尾空白後需為 1–12 個 Unicode 字元，`score` 必須是 finite JSON number。Timestamp 由 Apps Script 建立。

每次有效 POST 都在同一 Script Lock transaction 內 append、排序、裁切，指定正式榜正常狀態最多 20 筆；`Ranking` 永遠不受 POST 影響。前端採 Highest 優先且互斥，一局最多 POST 一次。

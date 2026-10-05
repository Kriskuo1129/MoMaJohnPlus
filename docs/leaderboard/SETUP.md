# Google Apps Script 排行榜設定

這份後端使用一份 Google 試算表保存每場遊戲的獨立紀錄，並以 Google Apps Script Web App 提供 GET 與 POST API。

## 1. 建立 Google Sheet

1. 登入 Google 帳號並前往 [Google Sheets](https://sheets.google.com/)。
2. 建立一份空白試算表，例如命名為 `MoMaJohnPlus Ranking`。
3. 不必手動建立工作表或表頭。第一次呼叫 API 時，程式會自動建立名為 `Ranking` 的工作表，並在空白工作表加入以下表頭：

   | timestamp | name | score |
   | --- | --- | --- |
   | Apps Script 寫入時間 | 玩家名稱 | 最終總分 |

若已經手動建立 `Ranking` 工作表，第一列必須完全使用上述三個英文欄位名稱與順序。

## 2. 開啟 Apps Script 並貼上程式

1. 在試算表上方選單選擇「擴充功能」>「Apps Script」。
2. 在 Apps Script 編輯器開啟預設的 `Code.gs`。
3. 刪除 `Code.gs` 內的範例內容。
4. 複製 [`google-apps-script.js`](./google-apps-script.js) 的完整內容並貼入 `Code.gs`。

檔名使用 `Code.gs` 即可；Repository 內的 `.js` 副檔名只是為了方便閱讀與版本管理。

## 3. 設定 Spreadsheet ID

需要設定 Spreadsheet ID，不需要設定數字形式的 Sheet ID（`gid`）。

試算表網址格式如下：

```text
https://docs.google.com/spreadsheets/d/SPREADSHEET_ID/edit#gid=0
```

複製 `/d/` 與 `/edit` 之間的字串，替換 `Code.gs` 第一行的預留值：

```javascript
const SPREADSHEET_ID = 'PASTE_YOUR_SPREADSHEET_ID_HERE';
```

儲存 Apps Script 專案。程式會依名稱尋找或建立 `Ranking` 工作表，因此不需要 `gid`。

## 4. 部署 Web App

1. 在 Apps Script 編輯器右上角選擇「部署」>「新增部署作業」。
2. 在「選取類型」旁按齒輪圖示，選擇「網頁應用程式」。
3. 說明可填入 `MoMaJohnPlus leaderboard v1`。
4. 「執行身分」選擇「我」。這讓所有請求都以部署者權限讀寫指定的試算表。
5. 「誰可以存取」選擇「任何人」。介面文字可能依帳號類型顯示為「任何人」或包含匿名使用者的選項；本專案需要不登入也能呼叫 API。
6. 按「部署」。首次部署時，依畫面選擇 Google 帳號並授權 Apps Script 存取試算表。
7. 部署完成後，複製以 `/exec` 結尾的「網頁應用程式網址」。這就是正式 API URL。

Google 官方流程可參考 [Deploy a script as a web app](https://developers.google.com/apps-script/guides/web#deploy_a_script_as_a_web_app)。

若使用 Google Workspace 管理帳號而看不到匿名公開選項，代表網域管理政策限制公開 Web App。此時需改用允許公開部署的帳號，或請管理員調整政策。

程式更新後，請到「部署」>「管理部署作業」，編輯既有部署並建立新版本；正式 `/exec` URL 才會執行更新後的版本。「測試部署作業」提供的 `/dev` URL 只供有腳本編輯權限的人使用，且會執行最近儲存的程式。

## 5. 手動測試 GET

將正式 `/exec` URL 貼到瀏覽器網址列並開啟。尚無成績時應看到：

```json
{"success":true,"ranking":[]}
```

有成績時會回傳依 `score` 由高到低排序的前 20 筆；同分時較早的 `timestamp` 在前。每筆包含 `rank`、`name`、`score` 與 ISO 8601 格式的 `timestamp`。

## 6. 手動測試 POST

瀏覽器網址列只能方便測試 GET。POST 可在 PowerShell 執行：

```powershell
$webAppUrl = 'PASTE_YOUR_EXEC_URL_HERE'
$body = @{ name = 'Kris'; score = 500 } | ConvertTo-Json
Invoke-RestMethod -Uri $webAppUrl -Method Post -ContentType 'application/json' -Body $body
```

成功時應得到：

```json
{"success":true}
```

重新在瀏覽器開啟 GET URL，應可在排行榜中看到新紀錄；試算表的 `Ranking` 工作表也會新增一列。每次 POST 都會 append 新列，同名玩家不會被覆蓋或合併。

可用下列請求確認驗證錯誤：

```powershell
$webAppUrl = 'PASTE_YOUR_EXEC_URL_HERE'
$body = @{ name = ''; score = 'not-a-number' } | ConvertTo-Json
Invoke-RestMethod -Uri $webAppUrl -Method Post -ContentType 'application/json' -Body $body
```

Apps Script Web App 對應用程式層級錯誤仍會回傳 JSON，例如：

```json
{"success":false,"error":"name must not be empty."}
```

## API 規格摘要

### GET

- 不需要 query parameter。
- 回傳最多 20 筆資料。
- 先依分數由高到低排序，再依 Apps Script 寫入時間由早到晚排序。
- 同一個名稱可以出現多次。

### POST

- `Content-Type` 使用 `application/json`。
- Body 格式為 `{"name":"Kris","score":500}`。
- `name` 必須是非空字串；去除頭尾空白後最多 12 個 Unicode 字元。
- `score` 必須是 JSON number，且為有限數值；數字字串不接受。
- `timestamp` 一律由 Apps Script 在寫入時建立；請求內即使帶入 `timestamp` 也不採用。
- 每個成功請求都新增一列，完整歷史紀錄會保留在試算表。

# ECPay 綠界金流串接

## User Story

身為花卉電商的顧客，我在結帳建立訂單後，希望能在「訂單詳情頁」透過真正的綠界（ECPay）
付款頁完成付款，而不是目前只靠「付款成功／付款失敗」兩顆按鈕直接竄改訂單狀態的模擬付款。

身為開發者，`.env` 中已預留 `ECPAY_MERCHANT_ID`/`ECPAY_HASH_KEY`/`ECPAY_HASH_IV`/`ECPAY_ENV`
四個變數多時卻從未被程式碼讀取（`docs/ARCHITECTURE.md` 明確記錄這是空白區塊），需要把它們接上，
並且要符合本專案「僅在本機執行、無法對外公開」的限制：綠界的 Server-to-Server `ReturnURL`
callback 永遠打不到 `localhost`，因此付款結果的確認流程必須改由**本地端主動呼叫綠界查詢 API**
驗證，而不是被動等待 callback。

## Spec

採用綠界 AIO 全方位金流（CMV-SHA256，官方文件中最簡單、最常用的方案）。

**架構取捨（因無法接收 Server Notify）**：

1. 建單時仍照規格帶 `ReturnURL`（供未來部署到公開網址時使用；本機測試時綠界呼叫得到，也回應
   `1|OK`，但因為本機無法從外部連入，這支路由在本機環境下不會真的被觸發，不影響流程，因為主線
   流程不依賴它）。
2. `ClientBackURL` 是**消費者瀏覽器**的重導向（不是 server-to-server），本機 `localhost`
   完全可行，用來把使用者導回「訂單詳情頁」。
3. 回到訂單詳情頁後，前端呼叫後端新端點，由**後端主動呼叫綠界 `QueryTradeInfo` API**
   查詢真實付款狀態並更新訂單——這就是「本地端主動查詢驗證」的落地方式。

**資料庫變更（`src/database.js`）**：`orders` 表新增 `merchant_trade_no`、`ecpay_trade_no`、
`payment_method`、`paid_at` 四個欄位（`status` 的 CHECK 仍維持 `pending/paid/failed` 三態）。
因專案無 migration 工具，改 DDL 後需刪除 `database.sqlite`（含 `-shm`/`-wal`）讓下次啟動重建。

**新增檔案**：

- `src/utils/ecpayCrypto.js` — CheckMacValue 加解密（`ecpayUrlEncode` / `generateCheckMacValue` /
  `verifyCheckMacValue`），純用內建 `crypto`，不加新依賴
- `src/services/ecpayService.js` — `buildCheckoutParams(order, orderItems)` 產生導向綠界的
  表單參數；`queryTradeInfo(merchantTradeNo)` 用內建 `fetch` 呼叫 `QueryTradeInfo/V5` 並驗證回應
  CheckMacValue
- `src/routes/ecpayRoutes.js` — `POST /api/ecpay/notify`，不掛 `authMiddleware`，接收綠界
  Server Notify（本機用不到，僅為未來部署到公開網域時的完整實作）

**修改檔案**：

- `src/routes/orderRoutes.js` — 新增 `POST /api/orders/:id/checkout`（建立/更新
  `merchant_trade_no`，回傳 `{ actionUrl, params }` 供前端組表單）與
  `POST /api/orders/:id/confirm-payment`（呼叫 `queryTradeInfo`，依 `TradeStatus`
  更新訂單為 `paid`/`failed`，或維持 `pending`）
- `app.js` — 掛載 `app.use('/api/ecpay', require('./src/routes/ecpayRoutes'))`
- `views/pages/order-detail.ejs` / `public/js/pages/order-detail.js` — 「付款成功／付款失敗」
  模擬按鈕改為「前往綠界付款」（整頁 `form.submit()` 跳轉，不可用 `fetch`/`iframe`）與
  「重新查詢付款狀態」，頁面載入時若訂單為 `pending` 且已有 `merchant_trade_no` 則自動查詢一次

**與原計畫的落地偏差（重要）**：原計畫依官方文件在測試環境參數帶 `SimulatePaid=1`
以便本機免刷卡完成付款。但實測發現**共用測試帳號 `3002607` 送出 `SimulatePaid=1`
會被綠界正式伺服器拒絕**（回應 `10100050 Parameter Error`），推測該公開帳號未開通此功能。
因此最終實作**移除了 `SimulatePaid`**，改為導向真實付款收銀台，測試時使用官方測試卡
`4311-9522-2222-2222`（任意 3 碼安全碼、未來到期日）＋ 3D 驗證碼 `1234` 完成付款。

## Tasks

- [x] `src/database.js`：`orders` 表新增 `merchant_trade_no`/`ecpay_trade_no`/`payment_method`/`paid_at`，刪除舊 `database.sqlite` 重建
- [x] `src/utils/ecpayCrypto.js`：實作 CheckMacValue 加解密，並以官方測試向量驗證輸出正確
- [x] `src/services/ecpayService.js`：`buildCheckoutParams` + `queryTradeInfo`
- [x] `src/routes/orderRoutes.js`：新增 `POST /:id/checkout`、`POST /:id/confirm-payment`
- [x] `src/routes/ecpayRoutes.js` + `app.js`：新增 `POST /api/ecpay/notify`（供未來公開部署使用）
- [x] `views/pages/order-detail.ejs`、`public/js/pages/order-detail.js`：前端改走真實付款流程
- [x] `tests/ecpayCrypto.test.js`：CheckMacValue 單元測試（含官方測試向量），`npm test` 35 個測試全數通過
- [x] 對真實 ECPay stage API 端對端驗證：`checkout` 產生的參數被綠界正常接受（回傳真實信用卡收銀台頁）；`confirm-payment` 對真實交易查詢，`CheckMacValue` 驗證通過且 `TradeStatus` 正確對應訂單狀態（含未付款維持 `pending`、交易未成立正確標記 `failed` 兩種情境）
- [x] 手動瀏覽器驗證：使用者實際用測試卡＋3D 驗證碼 `1234` 完整刷一次卡，確認導回訂單詳情頁後自動顯示「付款成功」畫面
- [x] 依使用者回饋，付款方式新增網路 ATM（WebATM）：`ChoosePayment` 改為 `'ALL'` + `IgnorePayment: 'ATM#CVS#BARCODE#ApplePay#TWQR#BNPL#WeiXin'`，只保留信用卡與網路 ATM 給消費者選；已用真實 ECPay stage API 驗證參數被正常接受（回傳付款方式選擇頁，非錯誤頁）

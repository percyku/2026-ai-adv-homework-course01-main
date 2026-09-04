# 更新日誌

本檔案記錄專案的重大變更。新增條目請放在最上方（新到舊），並在對應的開發計畫完成、從 `docs/plans/` 移至 `docs/plans/archive/` 時一併更新。

## [Unreleased]

### Added

- 串接綠界 ECPay AIO 全方位金流，取代原本 `PATCH /api/orders/:id/pay` 的模擬付款；訂單詳情頁新增「前往綠界付款」與「重新查詢付款狀態」按鈕（模擬付款端點仍保留在後端作為開發工具，前端已不再呼叫）。
  - 新增 `POST /api/orders/:id/checkout`（產生 ECPay AIO 付款表單參數，允許 `pending`/`failed` 訂單重新結帳）與 `POST /api/orders/:id/confirm-payment`（本地端主動呼叫綠界 `QueryTradeInfo` API 查詢付款狀態並更新訂單）。因本專案僅在本機執行、無法接收綠界的 Server-to-Server `ReturnURL` 通知，付款結果改由此端點主動查詢確認。
  - 新增 `POST /api/ecpay/notify`（`src/routes/ecpayRoutes.js`），供未來部署到可公開存取網域時接收綠界付款結果通知；本機開發環境無法被觸及。
  - 新增 `src/utils/ecpayCrypto.js`（CheckMacValue SHA256 簽章產生／驗證）與 `src/services/ecpayService.js`（組裝付款參數、查詢交易狀態）。
  - `orders` 表新增 `merchant_trade_no`／`ecpay_trade_no`／`payment_method`／`paid_at` 四個欄位。
  - 付款方式設定為 `ChoosePayment=ALL` + `IgnorePayment` 排除超商代碼／條碼／ATM 取號／Apple Pay／TWQR／BNPL／微信，讓消費者可自選信用卡或網路 ATM（WebATM）。
  - 新增 `tests/ecpayCrypto.test.js`，以 ECPay 官方公開測試向量驗證 CheckMacValue 簽章邏輯正確性；`checkout`／`confirm-payment`／`notify` 三個端點本身尚無自動化測試，待辦見 TESTING.md。

### 已知限制

- 官方文件記載測試環境可在建單參數加 `SimulatePaid=1` 略過刷卡直接完成模擬付款，但實測共用測試帳號 `3002607` 對此參數回傳 `10100050 Parameter Error`（該帳號未開通此功能），因此未採用；本機測試需用官方測試卡 `4311-9522-2222-2222` 走完整刷卡流程。

### 文件

- 建立完整專案文件體系：`CLAUDE.md` 及 `docs/README.md`、`docs/ARCHITECTURE.md`、`docs/DEVELOPMENT.md`、`docs/FEATURES.md`、`docs/TESTING.md`、`docs/CHANGELOG.md`，以及 `docs/plans/`（含 `archive/`）目錄。
  - 內容基於實際原始碼逐檔閱讀整理，記錄了目前系統的既有行為、設計取捨與已知限制（如購物車雙模式不合併、模擬付款無法從 failed 轉回 paid、`.env.example` 中的 ECPay 變數尚未串接等）。

## 初始版本

- 專案既有功能（本文件建立前已完成，回溯記錄於此，無精確日期）：
  - 會員系統：註冊、登入、JWT 認證、個人資料查詢。
  - 商品瀏覽：分頁清單、商品詳情（公開）。
  - 購物車：支援訪客（`X-Session-Id`）與會員（JWT）雙模式，增/查/改/刪。
  - 訂單：從購物車建立訂單（交易保護、扣庫存、清購物車）、訂單清單／詳情、模擬付款（`pending → paid/failed`）。
  - 後台管理：商品 CRUD（含刪除保護：有未完成訂單的商品無法刪除）、訂單清單與詳情（唯讀，可依狀態篩選）。
  - 前台頁面（EJS + Vue 3 CDN + Tailwind CSS v4）：首頁、商品詳情、購物車、結帳、登入、我的訂單、訂單詳情、後台商品管理、後台訂單管理。
  - OpenAPI 文件產生（`npm run openapi`，基於路由檔的 `@openapi` JSDoc 註解）。
  - Vitest + Supertest 整合測試套件，涵蓋上述所有 API 模組（模擬付款端點除外，目前無測試覆蓋）。

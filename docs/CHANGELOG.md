# 更新日誌

本檔案記錄專案的重大變更。新增條目請放在最上方（新到舊），並在對應的開發計畫完成、從 `docs/plans/` 移至 `docs/plans/archive/` 時一併更新。

## [Unreleased]

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

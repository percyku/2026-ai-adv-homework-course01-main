# CLAUDE.md

## 專案概述

花卉電商網站（Demo）— Node.js + Express（後端 API）+ EJS + Vue 3（CDN 版，無建置工具）+ Tailwind CSS v4 + SQLite（better-sqlite3）。JWT 認證、購物車支援訪客（`X-Session-Id`）與會員雙模式、訂單建立時以交易保護扣庫存與清購物車、模擬付款（無真實金流串接）。

## 常用指令

| 指令 | 作用 |
|---|---|
| `npm start` | 編譯 Tailwind CSS 後啟動伺服器（正式流程） |
| `npm run dev:server` | 僅啟動 Express（`node server.js`），不編譯 CSS |
| `npm run dev:css` | Watch 模式持續編譯 `input.css → output.css` |
| `npm run openapi` | 掃描路由 `@openapi` JSDoc，產生 `openapi.json` |
| `npm test` | 執行 Vitest 整合測試套件（`vitest run`） |

## 關鍵規則

- **統一 JSON 回應格式**：所有 `/api/*` 回應一律 `{ data, error, message }`；成功 `error: null`，失敗 `data: null` + UPPER_SNAKE_CASE 錯誤碼字串。新端點必須遵循，見 `docs/ARCHITECTURE.md`。
- **請求 body 用 camelCase、回應與資料庫用 snake_case**：例如 request 的 `productId` 對應回應/DB 的 `product_id`。這是既有慣例，新增端點需延續，見 `docs/DEVELOPMENT.md`「命名規則對照表」。
- **`authMiddleware` 之後才能接 `adminMiddleware`**：`adminMiddleware` 依賴 `req.user` 已被前者設定，順序不可顛倒。購物車端點另有本地實作的雙模式 `dualAuth`（`cartRoutes.js` 內），未重用 `authMiddleware`。
- **Schema 變更沒有 migration 工具**：`src/database.js` 用 `CREATE TABLE IF NOT EXISTS`，改 DDL 後既有 `database.sqlite` 不會自動套用，需手動刪除該檔（含 `-shm`/`-wal`）讓下次啟動重建（會清空資料）。
- 功能開發使用 `docs/plans/` 記錄計畫（`User Story → Spec → Tasks`）；完成後移至 `docs/plans/archive/`，並同步更新 `docs/FEATURES.md` 與 `docs/CHANGELOG.md`。

## 詳細文件

- ./docs/README.md — 項目介紹、快速開始、技術棧
- ./docs/ARCHITECTURE.md — 架構、目錄結構、路由總覽、認證機制、資料庫 schema、資料流
- ./docs/DEVELOPMENT.md — 開發規範、命名規則、環境變數表、JSDoc/OpenAPI 格式、計畫歸檔流程
- ./docs/FEATURES.md — 功能列表與完成狀態、各模組詳細行為與業務邏輯
- ./docs/TESTING.md — 測試規範、執行順序依賴、撰寫新測試指南、常見陷阱
- ./docs/CHANGELOG.md — 更新日誌

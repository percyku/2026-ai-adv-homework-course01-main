# 花卉電商網站（Flower E-Commerce Demo）

一個以 Node.js + Express + EJS + Vue 3（CDN 版）打造的花卉電商教學範例專案。後端提供 REST API（JSON），前台頁面以 EJS 伺服器端渲染骨架、頁面內互動邏輯以 Vue 3 `createApp` 掛載在 `#app` 節點上，樣式使用 Tailwind CSS v4。

## 技術棧

| 分類 | 技術 | 版本 | 說明 |
|---|---|---|---|
| Runtime | Node.js + Express | express `~4.16.1` | Web 伺服器與路由框架。**需要 Node.js 18+**：`src/services/ecpayService.js` 呼叫綠界 `QueryTradeInfo` API 時使用 Node 內建全域 `fetch`，未額外安裝 axios/node-fetch 之類依賴 |
| 資料庫 | SQLite (better-sqlite3) | `^12.8.0` | 同步、內嵌式 SQL 資料庫，WAL 模式 |
| 認證 | jsonwebtoken + bcrypt | `^9.0.2` / `^6.0.0` | JWT 簽發驗證、密碼雜湊 |
| 樣板引擎 | EJS | `^5.0.1` | 伺服器端頁面渲染（layout + partials） |
| 前端互動 | Vue 3（CDN, global build） | `vue@3` via unpkg | 免建置，直接在 `<script>` 中掛載 |
| CSS | Tailwind CSS v4 CLI | `^4.2.2` | 透過 `@tailwindcss/cli` 編譯 `input.css → output.css` |
| API 文件 | swagger-jsdoc | `^6.2.8` | 從路由檔的 `@openapi` JSDoc 註解產生 `openapi.json` |
| 測試 | Vitest + Supertest | `^2.1.9` / `^7.2.2` | 對 Express app 發送真實 HTTP 請求做整合測試 |
| ID 產生 | uuid | `^11.1.0` | 所有主鍵（`users`/`products`/`cart_items`/`orders`/`order_items`）皆為 UUID v4 字串 |
| CORS | cors | `^2.8.5` | 允許 `FRONTEND_URL` 來源跨域存取 API |

專案**沒有**前端建置工具（無 Vite/Webpack、無 npm 套件化的 Vue），Vue 直接以 `<script src="https://unpkg.com/vue@3/dist/vue.global.prod.js">` 引入，每個頁面對應一支獨立的 `public/js/pages/*.js` 腳本。

## 快速開始

```bash
# 1. 安裝依賴
npm install

# 2. 設定環境變數
cp .env.example .env
# 編輯 .env，至少要設定 JWT_SECRET（伺服器啟動時強制檢查，未設定會直接 exit(1)）

# 3. 建置 CSS 並啟動伺服器（正式流程）
npm start
# 或開發時分別啟動：
npm run dev:css     # 背景監看並編譯 Tailwind
npm run dev:server  # 啟動 Express（不會自動重新編譯 CSS）

# 4. 開啟瀏覽器
open http://localhost:3001
```

首次啟動時 `src/database.js` 會自動：
1. 以 `CREATE TABLE IF NOT EXISTS` 建立 5 張表（見 [ARCHITECTURE.md](./ARCHITECTURE.md#資料庫-schema)）。
2. 若 `users` 表中沒有 `ADMIN_EMAIL`（預設 `admin@hexschool.com`）帳號，就自動建立一個管理員帳號（密碼取自 `ADMIN_PASSWORD`，預設 `12345678`）。
3. 若 `products` 表是空的，灌入 8 筆花卉商品種子資料。

`database.sqlite`（含 `-shm`/`-wal`）就是實際的資料庫檔案，位於專案根目錄，並未加入版本控制排除機制以外的特殊處理——直接刪除該檔即可重置所有資料，下次啟動會重新建表與種子資料。

## 常用指令

| 指令 | 作用 |
|---|---|
| `npm start` | 編譯 Tailwind CSS（`css:build`）後啟動伺服器（`server.js`），正式環境使用此指令 |
| `npm run dev:server` | 僅啟動 Express 伺服器（`node server.js`），不編譯 CSS，適合後端開發時搭配已編譯好的 CSS |
| `npm run dev:css` | 以 watch 模式持續編譯 `public/css/input.css → public/css/output.css` |
| `npm run css:build` | 一次性編譯並壓縮輸出 CSS（`--minify`） |
| `npm run openapi` | 執行 `generate-openapi.js`，掃描 `src/routes/*.js` 的 `@openapi` JSDoc，輸出 `openapi.json` |
| `npm test` | 執行 `vitest run`，依 `vitest.config.js` 指定的順序跑完整測試套件 |

## 文件索引

| 文件 | 內容 |
|---|---|
| [ARCHITECTURE.md](./ARCHITECTURE.md) | 目錄結構、啟動流程、路由總覽、統一回應格式、認證機制、資料庫 schema |
| [DEVELOPMENT.md](./DEVELOPMENT.md) | 命名規則、模組系統、新增 API/Middleware/DB 表的步驟、環境變數表、JSDoc 規範、計畫歸檔流程 |
| [FEATURES.md](./FEATURES.md) | 各功能模組的詳細行為、參數、業務邏輯、錯誤碼 |
| [TESTING.md](./TESTING.md) | 測試檔案清單、執行順序與依賴、撰寫新測試的步驟、常見陷阱 |
| [CHANGELOG.md](./CHANGELOG.md) | 更新日誌 |
| [plans/](./plans/) | 進行中的開發計畫；完成後移至 `plans/archive/` |

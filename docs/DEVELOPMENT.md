# 開發規範

## 命名規則對照表

| 對象 | 慣例 | 範例 |
|---|---|---|
| 檔案名稱（routes/middleware） | camelCase + 角色後綴 | `authRoutes.js`、`adminProductRoutes.js`、`authMiddleware.js` |
| 資料庫表名 | snake_case、複數 | `users`、`products`、`cart_items`、`order_items` |
| 資料庫欄位 | snake_case | `password_hash`、`recipient_name`、`created_at` |
| JS 變數／函式 | camelCase | `getOwnerCondition`、`generateOrderNo`、`cartItemId` |
| Express router 內的 HTTP handler | 依 REST 動詞對應方法名，直接串在 `router.` 後 | `router.post('/register', ...)` |
| API 回應 JSON 欄位 | 與資料庫欄位一致沿用 snake_case（**不轉 camelCase**），但 request body 欄位用 camelCase | 回應中的 `product_id`／`total_amount`；request body 的 `productId`／`recipientName` |
| 錯誤碼字串（`error` 欄位） | UPPER_SNAKE_CASE | `VALIDATION_ERROR`、`STOCK_INSUFFICIENT`、`CART_EMPTY` |
| EJS 頁面檔 | kebab-case | `product-detail.ejs`、`order-detail.ejs` |
| 前端頁面腳本 | 與 EJS 頁面同名（kebab-case），置於 `public/js/pages/` | `product-detail.js` 對應 `views/pages/product-detail.ejs` |
| CSS 自訂色票變數 | `--color-<name>` | `--color-rose-primary`、`--color-sage` |

**注意**：API 的請求 body 用 camelCase（`productId`、`recipientName`）、回應與資料庫用 snake_case（`product_id`、`recipient_name`）是**刻意但未被文件化**的既有慣例，新增端點時應延續此模式以維持前後端呼叫一致性，不要在同一個端點內混用兩種風格。

## 模組系統

整個後端使用 **CommonJS**（`require`/`module.exports`），`package.json` 未設定 `"type": "module"`。**前端** `public/js/*` 也是傳統 `<script>` 全域變數模式（`Auth`、`apiFetch`、`Notification` 皆掛在全域 `window` 作用域下的頂層常數／函式，非 ES module `import/export`），Vue 3 透過 CDN 的 `vue.global.prod.js` 提供全域 `Vue` 物件（`const { createApp, ref, ... } = Vue`）。新增前端腳本時不能使用 `import`/`export` 語法，必須遵循既有的「多個 `<script src>` 依序載入、彼此靠全域變數溝通」模式，且**載入順序在 `layouts/front.ejs`／`layouts/admin.ejs` 中是固定的**（`auth.js` → `api.js` → `notification.js` → `header-init.js` → 頁面專屬腳本），新腳本若依賴這些工具必須確保它們已在該腳本之前載入。

## 新增一支 API 端點的步驟

1. 在對應的 `src/routes/*Routes.js` 加入 `router.<method>(path, handler)`。若是全新資源，於 `src/routes/` 新建檔案並在 `app.js` 以 `app.use('/api/<prefix>', require('./src/routes/xxxRoutes'))` 掛載。
2. Handler 一律回傳統一信封格式（見 ARCHITECTURE.md「統一回應格式」），成功 `error: null`，失敗依情境選用既有錯誤碼字串或新增一個 UPPER_SNAKE_CASE 字串。
3. 需要驗證登入 → 掛 `authMiddleware`（單一路由用 `router.get(path, authMiddleware, handler)`，整組路由都要保護則在檔案開頭 `router.use(authMiddleware)`）。
4. 需要限管理員 → 在 `authMiddleware` 之後接 `adminMiddleware`（順序不可顛倒，`adminMiddleware` 依賴 `req.user` 已被前者設定）。
5. 涉及多筆寫入且需保證原子性（例如訂單建立同時扣庫存、清購物車）→ 使用 `db.transaction(() => { ... })()`（`better-sqlite3` 同步交易，見 `orderRoutes.js` 的 `createOrder` 為範例）。
6. 補上 `@openapi` JSDoc 註解（見下方「JSDoc 格式說明」），確保 `npm run openapi` 能正確產出 spec。
7. 在 `tests/` 對應檔案（或新建 `tests/<feature>.test.js`）補上整合測試，並視需要調整 `vitest.config.js` 的 `sequence.files` 執行順序（見 TESTING.md）。
8. 若端點會被前台頁面使用，於對應 `public/js/pages/*.js` 呼叫 `apiFetch(url, options)`（勿直接用裸 `fetch`，`apiFetch` 統一處理 header 注入與 401 自動登出導頁）。

## 新增一個 Middleware 的步驟

1. 於 `src/middleware/` 新建檔案，簽名為 `(req, res, next)`（一般 middleware）或 `(err, req, res, next)`（錯誤處理 middleware，且**參數必須是 4 個**，Express 靠參數數量分辨這是 error handler）。
2. 全域套用（所有請求都要經過）→ 在 `app.js` 用 `app.use(require('./src/middleware/xxx'))`，注意放置順序（例如 `express.json()` 必須在任何讀取 `req.body` 的 middleware 之前）。
3. 僅特定路由組套用 → 在該 routes 檔案的 `router.use(middleware)` 或個別路由上掛載。
4. 中止請求時務必 `return res.status(...).json({ data: null, error: '...', message: '...' })`，遵循統一回應格式；不確定的例外交給 `next(err)` 讓 `errorHandler`（必須註冊在 `app.use()` 鏈的最後）統一處理。

## 新增一張資料庫表 / 修改 Schema 的步驟

1. 在 `src/database.js` 的 `initializeDatabase()` 內的 `db.exec(...)` SQL 區塊新增 `CREATE TABLE IF NOT EXISTS`。**此專案沒有 migration 工具**（無 knex/prisma migrate 之類機制），schema 變更靠直接編輯這段 DDL；`IF NOT EXISTS` 代表**既有的 `database.sqlite` 檔案不會自動套用新欄位／新表**——本機或既有環境要套用新 schema，必須手動刪除 `database.sqlite`（連同 `-shm`/`-wal`）讓它在下次啟動時重新以最新 DDL 建表，這會清空所有現有資料，正式環境要謹慎處理（此專案定位為教學/demo，未考慮正式環境資料遷移策略）。
2. 主鍵一律用 `id TEXT PRIMARY KEY`，以 `uuidv4()` 產生，不使用資料庫 `AUTOINCREMENT`。
3. 需要驗證用途的欄位加 SQL `CHECK` 約束（如 `price > 0`），優先於應用層重複驗證但**不可只靠 CHECK**——因為觸發 CHECK 失敗時 `better-sqlite3` 拋出的是原始 SQLite 例外，會被 `errorHandler` 當成未預期錯誤回 500，使用者得到的訊息不友善，因此應用層仍須做同等驗證並回傳恰當的 4xx。
4. 如果新表需要種子資料，在 `initializeDatabase()` 中仿照 `seedAdminUser()`/`seedProducts()` 寫一個 `seedXxx()` 函式，並在 `initializeDatabase()` 尾端呼叫；務必先查詢是否已有資料（`SELECT COUNT(*)`）以保持重複執行的冪等性。
5. 需要交易寫入多表時用 `db.transaction()`，避免手動 `BEGIN`/`COMMIT`。
6. 更新完 `src/database.js` 後，同步更新 `docs/ARCHITECTURE.md` 的「資料庫 Schema」章節（欄位表格），避免文件與程式碼落差。

## 環境變數表

| 變數 | 用途 | 必要性 | 預設值 |
|---|---|---|---|
| `JWT_SECRET` | 簽發/驗證 JWT 的密鑰 | **必要**（`server.js` 啟動時強制檢查，未設定直接 `process.exit(1)`） | 無，`.env.example` 提供佔位字串 `your-jwt-secret-key-here` |
| `PORT` | Express 監聽埠 | 選填 | `3001` |
| `BASE_URL` | 組成 ECPay `ReturnURL`（`src/services/ecpayService.js` 的 `buildCheckoutParams`）；本機開發時此 URL 對綠界不可達，僅為未來部署到公開網域預留 | 選填 | `http://localhost:3001` |
| `FRONTEND_URL` | CORS 允許的來源（`cors({ origin })`），同時組成 ECPay `ClientBackURL`（消費者付款後導回的訂單詳情頁） | 選填 | `http://localhost:3001`（此專案無獨立前端 dev server，前後台同源皆由 Express 於 `PORT`/`BASE_URL` 服務；`.env.example` 曾誤標為 `5173`，會導致 ECPay 付款完成後「返回商店」按鈕連到不存在的服務，已修正為 `3001`） |
| `ADMIN_EMAIL` | 首次啟動 seed 管理員帳號的 email | 選填 | `admin@hexschool.com` |
| `ADMIN_PASSWORD` | 首次啟動 seed 管理員帳號的密碼 | 選填 | `12345678` |
| `NODE_ENV` | 一般 Node 慣例；本專案唯一讀取處是 `src/database.js` 用來決定 bcrypt salt rounds（`test` → 1 round 加速測試，其他 → 10 rounds） | 選填 | 未設定（Vitest 執行時預設會設為 `test`） |
| `ECPAY_MERCHANT_ID` / `ECPAY_HASH_KEY` / `ECPAY_HASH_IV` | 綠界 ECPay AIO 金流的特店編號與 CheckMacValue 簽章密鑰，由 `src/services/ecpayService.js` 讀取。**正式環境務必改用環境變數管理，不可寫入版本控制**（`.env.example` 中為官方公開測試值） | 選填（未設定時 `CheckMacValue` 會用 `undefined` 計算，導致所有 ECPay 請求簽章錯誤） | 見 `.env.example`（測試用假值 `3002607`／`pwFHCqoQZGmho4w6`／`EkRm7iFT261dpevs`） |
| `ECPAY_ENV` | 切換 ECPay AIO 端點網域，`src/services/ecpayService.js` 僅在此值**恰好等於** `'production'` 時使用正式環境 `payment.ecpay.com.tw`，其餘任何值（含未設定）一律視為測試環境 `payment-stage.ecpay.com.tw` | 選填 | `staging`（測試環境） |

新增環境變數時務必同步更新 `.env.example` 並在此表補上一列，說明用途與是否有預設值 fallback。

## JSDoc / OpenAPI 註解格式

本專案用 `swagger-jsdoc` 直接掃描 `src/routes/*.js` 內的 `/** @openapi ... */` 區塊（純 YAML-in-JSDoc 風格，非一般 JS 型別 JSDoc），設定於 `swagger-config.js`（`apis: ['./src/routes/*.js']`）。撰寫新端點時，緊接在 `router.<method>(...)` 呼叫**之前**加上完整區塊：

```js
/**
 * @openapi
 * /api/products/{id}:
 *   get:
 *     summary: 取得商品詳情
 *     tags: [Products]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: 成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     id: { type: string }
 *       404:
 *         description: 商品不存在
 */
router.get('/:id', (req, res) => { /* ... */ });
```

規則：
- `tags` 依模組分類，沿用既有標籤：`Auth`、`Products`、`Cart`、`Orders`、`Admin Products`、`Admin Orders`、`Ecpay`（`ecpayRoutes.js` 的綠界 callback，`orderRoutes.js` 內的 ECPay 結帳/查詢端點仍歸在 `Orders`）。新模組請新增對應標籤，勿混用既有標籤。
- 需要認證的端點加 `security: [{ bearerAuth: [] }]`（JWT）；購物車雙模式端點加兩個選項 `security: [{ bearerAuth: [] }, { sessionId: [] }]`（`securitySchemes` 定義於 `swagger-config.js`）。
- `responses` 至少列出成功狀態碼與所有會回傳的錯誤狀態碼（400/401/403/404/409 依實際 handler 邏輯列出），維持與 handler 內 `res.status(...)` 呼叫一致。
- 修改或新增端點後執行 `npm run openapi` 重新產生 `openapi.json`，確認沒有 YAML 縮排錯誤（`swagger-jsdoc` 對縮排敏感，錯誤時通常靜默略過該區塊而非報錯，需目視比對輸出）。

## 計畫歸檔流程

新增/大型功能開發前，於 `docs/plans/` 建立一份計畫文件，完成後移到歸檔目錄，並回頭更新功能與變更紀錄文件，形成完整追溯鏈。

1. **計畫檔案命名格式**：`YYYY-MM-DD-<feature-name>.md`（例如 `2026-09-03-ecpay-integration.md`）。
2. **計畫文件結構**：
   - `User Story`：這個功能要解決誰的什麼問題，為什麼需要。
   - `Spec`：具體規格——涉及哪些端點、資料表變更、前端頁面/腳本變更、與既有行為的相容性考量。
   - `Tasks`：拆解成可勾選的待辦清單（`- [ ] ...`），對應到實際的 commit / PR 顆粒度。
3. **功能完成後**：將該檔案從 `docs/plans/` 移至 `docs/plans/archive/`（`git mv`，保留檔名與內容，不要重寫歷史）。
4. **同步更新**：
   - `docs/FEATURES.md`：把新功能加入對應表格與行為描述段落，狀態標記為 ✅（若尚無測試則標 🟡 並在 TESTING.md 補上待辦）。
   - `docs/CHANGELOG.md`：新增一筆條目，說明改了什麼、為什麼改。
   - 若涉及 schema／認證機制／路由總覽變動，一併更新 `docs/ARCHITECTURE.md` 對應章節。

## 其他開發注意事項

- `public/stylesheets/style.css` 是 Express 專案產生器（`express-generator`）殘留的預設樣式檔，**目前沒有任何 EJS 頁面引用它**（所有頁面走 Tailwind 編譯出的 `public/css/output.css`）。除非確認要復用，否則新頁面不要引用此檔，避免混淆樣式來源；若確認完全無用，可在獨立的清理計畫中移除。
- `database.sqlite`／`-shm`／`-wal` 是執行期產生的資料檔，**不應手動編輯內容**；需要重置測試資料時直接刪除三個檔案即可讓下次啟動重新建表與 seed。
- 專案中**沒有** ESLint／Prettier 設定檔，目前程式碼風格（2 空白縮排、單引號、必要處才加分號）純靠既有程式碼慣例延續，新增程式碼請比對鄰近既有檔案的風格手動對齊。

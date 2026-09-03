# 架構文件

## 目錄結構

```
.
├── app.js                     # Express app 組裝：middleware、路由掛載、404、錯誤處理（不含 listen）
├── server.js                  # 進入點：檢查 JWT_SECRET 存在、呼叫 app.listen()、匯出 app 供測試引用
├── generate-openapi.js        # 讀取 swagger-config.js，掃描路由 JSDoc，輸出 openapi.json（npm run openapi）
├── swagger-config.js          # swagger-jsdoc 設定：title/version、securitySchemes（bearerAuth、sessionId）、apis glob
├── database.sqlite(-shm/-wal) # SQLite 資料庫檔案（WAL 模式），首次啟動自動建立
├── vitest.config.js           # 測試設定：globals、fileParallelism:false、固定測試檔執行順序
├── src/
│   ├── database.js            # 建立 better-sqlite3 連線、建表 DDL、seed admin/products，匯出 db 單例
│   ├── middleware/
│   │   ├── authMiddleware.js   # 驗證 JWT，成功則掛 req.user = { userId, email, role }
│   │   ├── adminMiddleware.js  # 檢查 req.user.role === 'admin'（必須接在 authMiddleware 之後）
│   │   ├── sessionMiddleware.js# 讀取 X-Session-Id header，掛 req.sessionId（全域套用，非強制）
│   │   └── errorHandler.js     # 統一錯誤處理，5xx 隱藏內部訊息，僅回傳白名單安全訊息
│   └── routes/
│       ├── authRoutes.js         # /api/auth/*：register、login、profile
│       ├── productRoutes.js      # /api/products/*：公開瀏覽（分頁清單、詳情）
│       ├── cartRoutes.js         # /api/cart/*：雙模式認證（JWT 或 X-Session-Id）購物車 CRUD
│       ├── orderRoutes.js        # /api/orders/*：需登入；建立訂單（transaction）、清單、詳情、模擬付款
│       ├── adminProductRoutes.js # /api/admin/products/*：需 admin；商品 CRUD
│       ├── adminOrderRoutes.js   # /api/admin/orders/*：需 admin；訂單清單（可篩選狀態）、詳情
│       └── pageRoutes.js         # 前台/後台頁面路由（EJS render），不回傳 JSON
├── views/
│   ├── layouts/
│   │   ├── front.ejs           # 前台外殼：head + header + <%- body %> + footer + notification + 共用 JS
│   │   └── admin.ejs           # 後台外殼：head + admin-header + admin-sidebar + <%- body %> + 內嵌 requireAdmin 檢查
│   ├── partials/                # head、header、footer、admin-header、admin-sidebar、notification（toast 容器）
│   └── pages/                   # index、login、cart、checkout、orders、order-detail、product-detail、404、admin/products、admin/orders
├── public/
│   ├── css/input.css → output.css  # Tailwind v4 原始檔與編譯產物（自訂 @theme 色票，見下）
│   ├── js/
│   │   ├── auth.js             # Auth 物件：token/user 存取（localStorage）、session id 產生、登入態導頁守門
│   │   ├── api.js              # apiFetch()：統一 fetch 包裝，自動帶 Authorization + X-Session-Id，401 自動登出導頁
│   │   ├── notification.js     # Notification.show()：右上角 toast，3 秒後淡出
│   │   ├── header-init.js      # 依登入狀態渲染 header 導覽列、購物車角標數字
│   │   └── pages/*.js          # 每頁一支 Vue 3 createApp，掛載於該頁 EJS 內的 #app 節點
│   └── stylesheets/style.css   # Express 產生器殘留的舊版樣式檔（實際頁面未引用，見 DEVELOPMENT.md 注意事項）
├── tests/                       # Vitest + Supertest 整合測試（見 TESTING.md）
└── docs/                        # 本文件目錄
```

## 啟動流程

```
node server.js
  → require('./app')
      → require('dotenv').config()                 // 讀取 .env
      → require('./src/middleware/sessionMiddleware')
      → require('./src/middleware/errorHandler')
      → require('./src/database')                   // 建線 + 建表 + seed（副作用執行，僅第一次 require 生效）
      → app.set('view engine', 'ejs') / views 路徑設定
      → express.static(public/)
      → cors({ origin: FRONTEND_URL })
      → express.json() / express.urlencoded()
      → sessionMiddleware                            // 全域掛載，解析 X-Session-Id
      → 掛載 6 組 API 路由 + 1 組頁面路由（見下方路由總覽）
      → 404 handler（API 回 JSON，頁面回 404.ejs）
      → errorHandler（最終 4 個參數的 Express error middleware）
  → 若直接執行本檔（require.main === module）：
      → 檢查 process.env.JWT_SECRET，未設定則 console.error 並 process.exit(1)
      → app.listen(PORT || 3001)
  → module.exports = app   // 供 tests/setup.js 以 supertest 直接注入，不需要真的監聽 port
```

`src/database.js` 在 `require` 時就會立即執行 `initializeDatabase()`（檔案最底部呼叫），因此**任何** `require('../database')` 都會觸發一次建表 + seed 檢查（有 `IF NOT EXISTS` 與存在性檢查保護，重複呼叫是安全的，但仍是同步 I/O）。

## API 路由總覽

| 前綴 | 檔案 | 認證 | 說明 |
|---|---|---|---|
| `POST/GET /api/auth/*` | `authRoutes.js` | 部分公開，`profile` 需 `authMiddleware` | 註冊、登入、取得個人資料 |
| `GET /api/products`、`GET /api/products/:id` | `productRoutes.js` | 公開 | 商品清單（分頁）、商品詳情 |
| `GET/POST/PATCH/DELETE /api/cart*` | `cartRoutes.js` | 路由內自訂 `dualAuth`（JWT **或** `X-Session-Id`） | 購物車增刪改查，訪客與登入會員共用邏輯 |
| `POST/GET/PATCH /api/orders*` | `orderRoutes.js` | 全路由 `router.use(authMiddleware)` | 建立訂單、清單、詳情、模擬付款 |
| `GET/POST/PUT/DELETE /api/admin/products*` | `adminProductRoutes.js` | 全路由 `router.use(authMiddleware, adminMiddleware)` | 後台商品管理 |
| `GET /api/admin/orders*` | `adminOrderRoutes.js` | 全路由 `router.use(authMiddleware, adminMiddleware)` | 後台訂單清單、詳情（唯讀，無狀態變更端點） |
| `GET /`、`/products/:id`、`/cart`、`/checkout`、`/login`、`/orders`、`/orders/:id`、`/admin/products`、`/admin/orders` | `pageRoutes.js` | 無伺服器端保護；頁面載入後由前端 `Auth.requireAuth()`/`requireAdmin()` 導頁 | 回傳 EJS 渲染的 HTML 頁面骨架 |

掛載順序（見 `app.js`）：`auth → admin/products → admin/orders → products → cart → orders → 頁面路由`。因為 Express 路由是精確前綴比對（`app.use('/api/admin/products', ...)` 與 `app.use('/api/products', ...)` 前綴不重疊），順序本身不影響比對結果，但維持此順序有助於閱讀（先 auth，再 admin 專用，再一般用戶）。

**重要**：後台頁面路由（`/admin/products`、`/admin/orders`）與後台 API 一樣掛在 `authMiddleware/adminMiddleware` 之下的錯覺容易誤導——實際上 `pageRoutes.js` **完全沒有**伺服器端的權限檢查，僅回傳靜態 HTML 殼；真正的權限守門是 `views/layouts/admin.ejs` 內嵌 `<script>` 呼叫 `Auth.requireAdmin()`（純前端、依賴 localStorage 中的 JWT payload 解出的 `role`）。這代表**頁面本身可被未授權者直接開啟並看到骨架**，只是骨架的 Vue app 會在 `onMounted`/`setup()` 開頭因 `Auth.requireAuth()`/`requireAdmin()` 失敗而導頁、資料不會被載入。若日後要強化，需在 `pageRoutes.js` 對應路由加上伺服器端 middleware。

## 統一回應格式

所有 `/api/*` JSON 回應（成功與失敗）一律遵循同一個信封格式：

```json
{
  "data": { /* 成功時為實際資料物件/陣列，失敗時固定為 null */ },
  "error": null,
  "message": "成功"
}
```

失敗範例：

```json
{
  "data": null,
  "error": "VALIDATION_ERROR",
  "message": "email、password、name 為必填欄位"
}
```

`error` 欄位在各路由中手動指定的字串值（非集中管理的錯誤碼枚舉），實際出現過的值：`VALIDATION_ERROR`、`UNAUTHORIZED`、`FORBIDDEN`、`NOT_FOUND`、`CONFLICT`、`STOCK_INSUFFICIENT`、`CART_EMPTY`、`INVALID_STATUS`；未攔截的例外會落入 `errorHandler.js`，一律回傳 `error: 'INTERNAL_ERROR'`（即使實際 HTTP 狀態碼不是 500，`errorHandler` 對所有情況都硬編碼回傳字串 `'INTERNAL_ERROR'` 作為 `error` 欄位——這是與各路由手動 `error` 值不一致之處，見下方「已知不一致」）。

分頁清單類端點（`GET /api/products`、`GET /api/admin/products`、`GET /api/admin/orders`）額外在 `data` 中包一層 `pagination`：

```json
{
  "data": {
    "products": [ /* ... */ ],
    "pagination": { "total": 8, "page": 1, "limit": 10, "totalPages": 1 }
  },
  "error": null,
  "message": "成功"
}
```

### 已知不一致（供未來重構參考）

- `errorHandler.js`（catch-all，未被路由攔截的例外）永遠回傳 `"error": "INTERNAL_ERROR"`，即便對應的 HTTP 狀態碼是 400/401/403/404（取自 `err.status`）。與各路由手寫的 `error` 字串（如 `VALIDATION_ERROR`）語意不同，若前端依賴 `error` 欄位做分支要注意這條路徑。
- `page` 頁面路由完全沒有伺服器端保護（見上一節說明），純屬前端 UX 導頁，不是安全邊界。

## 認證與授權機制

### JWT

- 簽發位置：`authRoutes.js` 的 `register`／`login`，以及測試輔助 `tests/setup.js` 間接透過登入端點取得。
- Payload：`{ userId, email, role }`。
- 簽章演算法：預設（`jsonwebtoken` 預設 `HS256`），驗證時明確限制 `algorithms: ['HS256']`（`authMiddleware.js`、`cartRoutes.js` 的 `dualAuth`）以避免演算法混淆攻擊。
- 有效期：`expiresIn: '7d'`（固定 7 天，寫死在程式碼中，無 refresh token 機制）。
- Secret：`process.env.JWT_SECRET`，`server.js` 在啟動時強制檢查存在，不存在即拒絕啟動（`process.exit(1)`）。**未在 `authMiddleware`/路由層再次檢查 `JWT_SECRET` 是否存在**——若透過 `require('./app')`（如測試）繞過 `server.js` 的檢查且環境變數未設，`jwt.sign`/`jwt.verify` 會以 `undefined` 作為 secret，不會報錯但極不安全；測試環境透過 `tests/setup.js`／`vitest` 啟動時仍依賴外部已設定 `.env` 或 shell 環境變數提供 `JWT_SECRET`。

### `authMiddleware`（`src/middleware/authMiddleware.js`）

1. 讀 `Authorization` header，要求格式為 `Bearer <token>`，否則 401 `UNAUTHORIZED`。
2. `jwt.verify` 失敗（過期、簽章錯誤、格式錯）→ 401 `Token 無效或已過期`。
3. 驗證通過後，**額外查詢資料庫**確認 `decoded.userId` 對應的使用者仍存在（防止使用者被刪除後舊 token 仍可用）；不存在則 401 `使用者不存在，請重新登入`。
4. 通過後掛 `req.user = { userId, email, role }`，其中 `email`/`role` 直接信任 token payload、**不會**重新從資料庫撈最新值（若使用者角色被後台變更，舊 token 在到期前仍持有舊角色權限）。

### `adminMiddleware`（`src/middleware/adminMiddleware.js`）

僅檢查 `req.user.role === 'admin'`，必須接在 `authMiddleware` 之後使用（否則 `req.user` 不存在會直接判定 403，不會拋錯，因為程式先檢查 `!req.user`）。

### 購物車雙模式認證（`cartRoutes.js` 內的 `dualAuth`，僅此檔案使用，未抽成共用 middleware）

購物車支援「訪客模式」與「登入會員模式」共用同一組 API：

1. 若帶 `Authorization: Bearer <token>` header：走 JWT 驗證邏輯（與 `authMiddleware` 幾乎相同，但**寫在 `cartRoutes.js` 內重複實作，未重用 `authMiddleware`**）；驗證失敗立即 401，**不會**退回訪客模式（避免「帶著壞 token 卻被當訪客處理」的混淆行為）。
2. 若無 `Authorization` header，改看 `req.sessionId`（由全域 `sessionMiddleware` 從 `X-Session-Id` header 解析）；有值則放行，視為訪客購物車。
3. 兩者皆無 → 401 `請提供有效的登入 Token 或 X-Session-Id`。
4. `getOwnerCondition(req)` 依 `req.user` 是否存在，決定用 `user_id` 或 `session_id` 欄位過濾/寫入 `cart_items`。

前端 `Auth.getAuthHeaders()`（`public/js/auth.js`）永遠會帶上 `X-Session-Id`（登入時也帶），但 `apiFetch`／後端邏輯在「同時帶 token 又帶 session id」時**以 token 優先**（訪客購物車與登入後的購物車不會自動合併）。

### 訂單與後台 API

`orderRoutes.js` 全路由 `router.use(authMiddleware)`，僅要求登入（無角色限制，訂單資料以 `user_id` 過濾為自己的訂單，沒有訪客下單）。`adminProductRoutes.js`／`adminOrderRoutes.js` 全路由 `router.use(authMiddleware, adminMiddleware)`，須為 `role === 'admin'`。

## 資料庫 Schema

檔案：`src/database.js`，使用 `better-sqlite3` 同步 API，`journal_mode = WAL`、`foreign_keys = ON`。所有主鍵皆為 `uuidv4()` 產生的 TEXT。

### `users`

| 欄位 | 型別 | 約束 |
|---|---|---|
| `id` | TEXT | PRIMARY KEY |
| `email` | TEXT | UNIQUE NOT NULL |
| `password_hash` | TEXT | NOT NULL（bcrypt，正式環境 salt rounds 10；`NODE_ENV=test` 時降為 1 以加速測試） |
| `name` | TEXT | NOT NULL |
| `role` | TEXT | NOT NULL DEFAULT `'user'`，CHECK `IN ('user', 'admin')` |
| `created_at` | TEXT | NOT NULL DEFAULT `datetime('now')`（UTC ISO 字串） |

### `products`

| 欄位 | 型別 | 約束 |
|---|---|---|
| `id` | TEXT | PRIMARY KEY |
| `name` | TEXT | NOT NULL |
| `description` | TEXT | 可為 NULL |
| `price` | INTEGER | NOT NULL，CHECK `price > 0`（無小數，單位為整數元） |
| `stock` | INTEGER | NOT NULL DEFAULT 0，CHECK `stock >= 0` |
| `image_url` | TEXT | 可為 NULL |
| `created_at` | TEXT | NOT NULL DEFAULT `datetime('now')` |
| `updated_at` | TEXT | NOT NULL DEFAULT `datetime('now')`；**僅**在 `adminProductRoutes.js` 的 `PUT /:id` 手動以 `datetime('now')` 更新，資料庫本身無 trigger 自動維護 |

### `cart_items`

| 欄位 | 型別 | 約束 |
|---|---|---|
| `id` | TEXT | PRIMARY KEY |
| `session_id` | TEXT | 可為 NULL（訪客購物車用；有值時 `user_id` 為 NULL） |
| `user_id` | TEXT | 可為 NULL（會員購物車用），FOREIGN KEY → `users(id)` |
| `product_id` | TEXT | NOT NULL，FOREIGN KEY → `products(id)` |
| `quantity` | INTEGER | NOT NULL DEFAULT 1，CHECK `quantity > 0` |

`session_id`／`user_id` 為互斥語意（同一列只會有其中一個有值），但資料庫層**未**用 CHECK 約束強制互斥，完全依賴應用層 `getOwnerCondition()` 的寫入邏輯保證。同一 `(product_id, owner)` 組合可能有多筆列（`POST /api/cart` 是先查再決定 UPDATE 或 INSERT，非資料庫 UNIQUE 約束防止重複，若有併發請求仍可能產生重複列，見 FEATURES.md 的購物車章節）。

### `orders`

| 欄位 | 型別 | 約束 |
|---|---|---|
| `id` | TEXT | PRIMARY KEY |
| `order_no` | TEXT | UNIQUE NOT NULL，格式 `ORD-YYYYMMDD-XXXXX`（見 FEATURES.md） |
| `user_id` | TEXT | NOT NULL，FOREIGN KEY → `users(id)`（訂單必屬於登入會員，無訪客下單） |
| `recipient_name` / `recipient_email` / `recipient_address` | TEXT | 皆 NOT NULL |
| `total_amount` | INTEGER | NOT NULL（下單當下由購物車項目加總計算，非即時計算欄位） |
| `status` | TEXT | NOT NULL DEFAULT `'pending'`，CHECK `IN ('pending', 'paid', 'failed')` |
| `created_at` | TEXT | NOT NULL DEFAULT `datetime('now')` |

無 `updated_at` 欄位（狀態變更如付款不會記錄變更時間）。

### `order_items`

| 欄位 | 型別 | 約束 |
|---|---|---|
| `id` | TEXT | PRIMARY KEY |
| `order_id` | TEXT | NOT NULL，FOREIGN KEY → `orders(id)` |
| `product_id` | TEXT | NOT NULL（**無** FOREIGN KEY 約束，刻意設計——見下） |
| `product_name` / `product_price` | TEXT / INTEGER | NOT NULL，**建單當下快照**，商品之後改名/改價不會影響歷史訂單顯示 |
| `quantity` | INTEGER | NOT NULL |

`product_id` 沒有加 FK 約束是刻意的：`adminProductRoutes.js` 的刪除商品邏輯只擋「該商品仍存在 `pending` 狀態訂單」的情況（見 FEATURES.md），對於已結案（`paid`/`failed`）訂單所引用的商品是允許被刪除的，此時 `order_items` 會保留一筆指向已不存在商品 id 的歷史紀錄（`product_name`/`product_price` 快照仍完整可用，不影響訂單詳情顯示）。

## 金流／第三方整合

`.env.example` 中列有 `ECPAY_MERCHANT_ID`、`ECPAY_HASH_KEY`、`ECPAY_HASH_IV`、`ECPAY_ENV` 四個綠界金流（ECPay）相關變數，**但目前程式碼庫中沒有任何一處讀取或使用這些變數**（`grep` 全專案找不到 `ECPAY`/`ecpay` 字樣出現在 `.js` 檔中）。實際的付款流程是 `PATCH /api/orders/:id/pay` 的**模擬付款**：前端 `order-detail.js` 呼叫此端點並帶 `{ action: 'success' | 'fail' }`，後端直接依 `action` 將訂單 `status` 改為 `paid` 或 `failed`，沒有任何外部金流串接、簽章驗證或 callback/webhook 處理。若日後要接入真正的 ECPay，這些環境變數是預留位置，需要新增對應的路由（可能是 `POST /api/orders/:id/checkout` 產生綠界表單、以及一支處理 ECPay callback 的公開端點）與簽章驗證邏輯，此為目前系統的空白區塊，不是既有功能。

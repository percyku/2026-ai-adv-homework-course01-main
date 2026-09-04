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
│   ├── utils/
│   │   └── ecpayCrypto.js      # 綠界 ECPay CheckMacValue 簽章（SHA256）產生與驗證，純用內建 crypto
│   ├── services/
│   │   └── ecpayService.js     # 綠界 ECPay：組裝 AIO 付款表單參數（buildCheckoutParams）、主動查詢交易狀態（queryTradeInfo，呼叫 QueryTradeInfo/V5）
│   └── routes/
│       ├── authRoutes.js         # /api/auth/*：register、login、profile
│       ├── productRoutes.js      # /api/products/*：公開瀏覽（分頁清單、詳情）
│       ├── cartRoutes.js         # /api/cart/*：雙模式認證（JWT 或 X-Session-Id）購物車 CRUD
│       ├── orderRoutes.js        # /api/orders/*：需登入；建立訂單（transaction）、清單、詳情、模擬付款（開發用，前端已不呼叫）、ECPay 結帳表單產生、主動查詢付款狀態
│       ├── adminProductRoutes.js # /api/admin/products/*：需 admin；商品 CRUD
│       ├── adminOrderRoutes.js   # /api/admin/orders/*：需 admin；訂單清單（可篩選狀態）、詳情
│       ├── ecpayRoutes.js        # /api/ecpay/*：無需登入；接收綠界 Server Notify（本機開發環境無法被觸及，見下方「金流／第三方整合」）
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
      → 掛載 7 組 API 路由 + 1 組頁面路由（見下方路由總覽）
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
| `POST/GET/PATCH /api/orders*` | `orderRoutes.js` | 全路由 `router.use(authMiddleware)` | 建立訂單、清單、詳情、模擬付款（`PATCH /:id/pay`，開發用，前端已不再呼叫）、ECPay 結帳表單產生（`POST /:id/checkout`）、主動查詢付款狀態（`POST /:id/confirm-payment`） |
| `GET/POST/PUT/DELETE /api/admin/products*` | `adminProductRoutes.js` | 全路由 `router.use(authMiddleware, adminMiddleware)` | 後台商品管理 |
| `GET /api/admin/orders*` | `adminOrderRoutes.js` | 全路由 `router.use(authMiddleware, adminMiddleware)` | 後台訂單清單、詳情（唯讀，無狀態變更端點） |
| `POST /api/ecpay/notify` | `ecpayRoutes.js` | 無（綠界 Server-to-Server 通知，非使用者請求，不掛 `authMiddleware`） | 接收綠界 AIO 付款結果通知，驗證 CheckMacValue 後冪等更新訂單狀態，回應純文字 `1\|OK`。**本機開發環境無法被綠界連線觸及**（`localhost` 無法對外公開），僅為未來部署到公開網域時的完整實作，本機測試流程不依賴此路由 |
| `GET /`、`/products/:id`、`/cart`、`/checkout`、`/login`、`/orders`、`/orders/:id`、`/admin/products`、`/admin/orders` | `pageRoutes.js` | 無伺服器端保護；頁面載入後由前端 `Auth.requireAuth()`/`requireAdmin()` 導頁 | 回傳 EJS 渲染的 HTML 頁面骨架 |

掛載順序（見 `app.js`）：`auth → admin/products → admin/orders → products → cart → orders → ecpay → 頁面路由`。因為 Express 路由是精確前綴比對（`app.use('/api/admin/products', ...)` 與 `app.use('/api/products', ...)` 前綴不重疊），順序本身不影響比對結果，但維持此順序有助於閱讀（先 auth，再 admin 專用，再一般用戶，最後是不需認證的第三方 callback）。

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

`error` 欄位在各路由中手動指定的字串值（非集中管理的錯誤碼枚舉），實際出現過的值：`VALIDATION_ERROR`、`UNAUTHORIZED`、`FORBIDDEN`、`NOT_FOUND`、`CONFLICT`、`STOCK_INSUFFICIENT`、`CART_EMPTY`、`INVALID_STATUS`、`NOT_CHECKED_OUT`（`confirm-payment` 時訂單尚未走過 `checkout`）、`ECPAY_QUERY_FAILED`（呼叫綠界 `QueryTradeInfo` 失敗或 CheckMacValue 驗證不符）；未攔截的例外會落入 `errorHandler.js`，一律回傳 `error: 'INTERNAL_ERROR'`（即使實際 HTTP 狀態碼不是 500，`errorHandler` 對所有情況都硬編碼回傳字串 `'INTERNAL_ERROR'` 作為 `error` 欄位——這是與各路由手動 `error` 值不一致之處，見下方「已知不一致」）。

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
| `merchant_trade_no` | TEXT | 可為 NULL，呼叫 `POST /:id/checkout` 前為 NULL。送給綠界的 `MerchantTradeNo`（`T${Date.now()}`，英數字、≤20 碼）。每次呼叫 `checkout` 都會**重新產生並覆寫**，允許同一筆訂單多次重新導向付款（例如上次交易未成立或使用者中途放棄） |
| `ecpay_trade_no` | TEXT | 可為 NULL，僅在 `confirm-payment` 查得 `TradeStatus === '1'`（已付款）時寫入綠界回傳的 `TradeNo` |
| `payment_method` | TEXT | 可為 NULL，同上時機寫入，例如 `Credit_CreditCard`（見 `PaymentType` 回覆值，實際依消費者選擇的付款方式而定） |
| `paid_at` | TEXT | 可為 NULL，同上時機以 `datetime('now')` 寫入，是目前 `orders` 表**唯一**會記錄「狀態變更時間」的欄位 |
| `created_at` | TEXT | NOT NULL DEFAULT `datetime('now')` |

無 `updated_at` 欄位（除了 `paid_at` 專門記錄付款確認時間，其餘狀態變更如 `failed` 不會記錄變更時間）。

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

已串接綠界 ECPay **AIO 全方位金流**（CMV-SHA256 協定），取代原本 `PATCH /api/orders/:id/pay` 的模擬付款（該端點程式碼仍保留於 `orderRoutes.js`，但前端 `order-detail.js` 已不再呼叫，純屬開發期遺留的手動測試工具）。

### 架構限制：本機環境無法接收 Server Notify

本專案僅在 `localhost` 執行、無法對外公開，因此綠界標準的 Server-to-Server `ReturnURL` callback **永遠打不到本機**。因此付款結果確認採用「本地端主動查詢」架構，而非被動等待 callback：

1. `POST /api/orders/:id/checkout` 產生 ECPay 付款表單參數，**其中仍依規格帶上 `ReturnURL`**（`${BASE_URL}/api/ecpay/notify`），但這支路由在本機測試時綠界連不進來，純粹是為了未來部署到公開網域時架構已經完整；本機測試流程完全不依賴它是否被觸發。
2. `ClientBackURL`（`${FRONTEND_URL}/orders/:id`）是**消費者瀏覽器**的重導向而非 server-to-server，`localhost` 完全可行，付款完成後會把使用者導回訂單詳情頁。
3. 訂單詳情頁載入時（`public/js/pages/order-detail.js` 的 `onMounted`），若訂單為 `pending` 且已有 `merchant_trade_no`，會自動呼叫一次 `POST /api/orders/:id/confirm-payment`；使用者也可以手動點「重新查詢付款狀態」按鈕再次觸發。這支端點由**後端主動呼叫綠界 `QueryTradeInfo` API** 查詢真實交易狀態並更新訂單，是「本地端主動查詢驗證」的實際落地。

### 相關檔案

- `src/utils/ecpayCrypto.js` — `ecpayUrlEncode`（ECPay 專屬 URL encode：`encodeURIComponent` → 轉小寫 → .NET 字元還原）、`generateCheckMacValue`（SHA256，排序後串接 `HashKey=...&...&HashIV=...` 再雜湊、轉大寫）、`verifyCheckMacValue`（`crypto.timingSafeEqual` 做 timing-safe 比對，長度不同時提前短路避免拋錯）。純用內建 `crypto`，未加任何新依賴。
- `src/services/ecpayService.js`：
  - `buildCheckoutParams(order, orderItems)` — 組出送往 `Cashier/AioCheckOut/V5` 的完整表單參數（含 `CheckMacValue`），並回傳 `{ actionUrl, params, merchantTradeNo }`。`MerchantTradeDate` 以 `Asia/Taipei` 時區格式化；`ItemName` 由 `orderItems` 的 `product_name` 以 `#` 串接並截斷至 200 字元。
  - `queryTradeInfo(merchantTradeNo)` — 用 Node 內建全域 `fetch`（**需要 Node 18+**，專案未加 axios/node-fetch 之類依賴）POST 到 `Cashier/QueryTradeInfo/V5`，回應是 URL-encoded 字串（非 JSON），以 `new URLSearchParams(text)` 解析後**驗證回應的 `CheckMacValue`**，通過才回傳 `{ tradeStatus, tradeNo, paymentType, tradeAmt, paymentDate }`；驗證失敗或 HTTP 非 2xx 一律 `throw`。
- `src/routes/orderRoutes.js` 新增兩個端點（皆在既有 `router.use(authMiddleware)` 保護下）：
  - `POST /:id/checkout` — 訂單須存在、屬於自己、且 `status !== 'paid'`（`pending`/`failed` 皆可重新結帳）。呼叫 `buildCheckoutParams` 後把新產生的 `merchant_trade_no` 寫回該筆訂單，回傳 `{ actionUrl, params }` 給前端組表單、`form.submit()` 整頁跳轉到綠界（**不可用 `fetch`/`iframe`**，ECPay 付款頁會被瀏覽器的 `X-Frame-Options`/CSP 政策封鎖）。
  - `POST /:id/confirm-payment` — 訂單須存在、屬於自己、且已有 `merchant_trade_no`（沒有則 400 `NOT_CHECKED_OUT`，代表還沒走過 `checkout`）。呼叫 `queryTradeInfo` 失敗則 502 `ECPAY_QUERY_FAILED`；成功時依 `TradeStatus` 更新：`'1'` → `paid`（同時寫入 `ecpay_trade_no`/`payment_method`/`paid_at`）、`'0'` → 維持 `pending`（尚未付款，允許稍後再查）、其他值（如 `10200095` 交易未成立）→ `failed`。
- `src/routes/ecpayRoutes.js` + `app.js` 的 `app.use('/api/ecpay', ...)` — `POST /notify`，**不掛 `authMiddleware`**（綠界呼叫不會帶 JWT）。驗證 `CheckMacValue` 後依 `MerchantTradeNo` 找到訂單並以 `UPDATE`（非 `INSERT`）冪等更新狀態，最後一律回應純文字 `1|OK`（即使驗證失敗也要回，避免綠界持續重試）。如前述，本機環境這支路由不會被觸發。

### 付款方式限制（`ChoosePayment` / `IgnorePayment`）

`buildCheckoutParams` 目前設定 `ChoosePayment: 'ALL'` 搭配 `IgnorePayment: 'ATM#CVS#BARCODE#ApplePay#TWQR#BNPL#WeiXin'`——因為 ECPay AIO 的 `ChoosePayment` 一次只能指定單一付款方式或 `ALL`（顯示付款方式選擇頁），要同時提供「信用卡＋網路 ATM（WebATM）」給消費者自選，只能用 `ALL` 再以 `IgnorePayment` 排除不需要的方式。`DigitalPayment`（電子支付/電子錢包）依官方規格**無法**透過 `IgnorePayment` 排除，若特店帳號有開通仍可能出現在付款頁上。

### 已知偏差：`SimulatePaid` 在共用測試帳號上不可用

官方文件記載測試環境可在建單參數加 `SimulatePaid=1` 略過刷卡，直接模擬付款成功（本地開發免刷卡的官方建議路徑）。但實測發現**共用測試帳號 `3002607` 送出 `SimulatePaid=1` 會被綠界正式伺服器拒絕**，回應 `10100050 Parameter Error`，推測該公開帳號未開通此功能。因此最終實作**未使用 `SimulatePaid`**，一律導向真實付款收銀台；本機測試時需用官方測試卡 `4311-9522-2222-2222`（任意 3 碼安全碼、任意未來到期日）＋ 3D 驗證碼 `1234` 完成付款。

### 環境變數

`ECPAY_MERCHANT_ID`/`ECPAY_HASH_KEY`/`ECPAY_HASH_IV` 直接對應綠界共用測試帳號；`ECPAY_ENV` 僅在等於 `'production'` 時切換 `AIO_BASE_URL` 為正式環境網域（`payment.ecpay.com.tw`），其餘任何值（含未設定）一律視為測試環境（`payment-stage.ecpay.com.tw`）。`BASE_URL`（組出 `ReturnURL`）與 `FRONTEND_URL`（組出 `ClientBackURL`，同時也是既有的 CORS 允許來源）現在**皆有實際用途**，不再是純預留變數（詳見 DEVELOPMENT.md 環境變數表）。

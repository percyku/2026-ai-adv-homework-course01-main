# 功能清單與完成狀態

狀態圖例：✅ 已完成並有測試覆蓋　🟡 已完成但無自動化測試覆蓋　⬜ 未實作（僅有預留設定，無程式碼）

## 總覽表

| 模組 | 端點 | 方法 | 認證 | 狀態 |
|---|---|---|---|---|
| 認證 | `/api/auth/register` | POST | 無 | ✅ |
| 認證 | `/api/auth/login` | POST | 無 | ✅ |
| 認證 | `/api/auth/profile` | GET | JWT | ✅ |
| 商品（前台） | `/api/products` | GET | 無 | ✅ |
| 商品（前台） | `/api/products/:id` | GET | 無 | ✅ |
| 購物車 | `/api/cart` | GET | JWT 或 X-Session-Id | ✅ |
| 購物車 | `/api/cart` | POST | JWT 或 X-Session-Id | ✅ |
| 購物車 | `/api/cart/:itemId` | PATCH | JWT 或 X-Session-Id | ✅ |
| 購物車 | `/api/cart/:itemId` | DELETE | JWT 或 X-Session-Id | ✅ |
| 訂單 | `/api/orders` | POST | JWT | ✅ |
| 訂單 | `/api/orders` | GET | JWT | ✅ |
| 訂單 | `/api/orders/:id` | GET | JWT | ✅ |
| 訂單 | `/api/orders/:id/pay`（模擬付款） | PATCH | JWT | 🟡（無測試） |
| 後台商品 | `/api/admin/products` | GET | JWT + admin | ✅ |
| 後台商品 | `/api/admin/products` | POST | JWT + admin | ✅ |
| 後台商品 | `/api/admin/products/:id` | PUT | JWT + admin | ✅ |
| 後台商品 | `/api/admin/products/:id` | DELETE | JWT + admin | ✅ |
| 後台訂單 | `/api/admin/orders` | GET | JWT + admin | ✅ |
| 後台訂單 | `/api/admin/orders/:id` | GET | JWT + admin | ✅ |
| 前台頁面（9 個路由） | `pageRoutes.js` | GET | 無（前端導頁） | ✅ |
| 綠界金流（ECPay）串接 | — | — | — | ⬜ 未實作，僅 `.env.example` 有預留變數，見 [ARCHITECTURE.md](./ARCHITECTURE.md#金流第三方整合) |
| 訪客購物車併入會員購物車（登入後合併） | — | — | — | ⬜ 未實作，訪客與會員購物車完全獨立、不會自動合併 |
| 商品評論/收藏/搜尋 | — | — | — | ⬜ 未實作 |

---

## 認證（Auth）

檔案：`src/routes/authRoutes.js`

### `POST /api/auth/register`

- 必填 body：`email`（string）、`password`（string，≥ 6 字元）、`name`（string）。缺任一欄位 → 400 `VALIDATION_ERROR`。
- Email 格式以正則 `/^[^\s@]+@[^\s@]+\.[^\s@]+$/` 驗證（簡易格式檢查，非 RFC 完整驗證）。
- 密碼長度僅檢查 `< 6`，無其他複雜度要求（無需大小寫/數字/符號混合）。
- Email 唯一性檢查：查表確認不存在，存在則 409 `CONFLICT`（`Email 已被註冊`）。**此檢查與後續 INSERT 之間存在 race condition**：`users.email` 有 `UNIQUE` 資料庫約束兜底，但若真的併發撞上，`db.prepare(...).run()` 會拋出 SQLite constraint 例外並落入 `errorHandler`（回 500，而非預期的 409）。
- 密碼以 `bcrypt.hashSync(password, 10)` 雜湊（固定 10 rounds，不隨 `NODE_ENV` 調整——與 `database.js` 內 seed admin 帳號、測試環境降為 1 round 不同，此路由永遠是 10）。
- 新使用者 `role` 固定為 `'user'`（無法透過 API 註冊為 admin）。
- 成功回應 201，`data.user`（`id`/`email`/`name`/`role`）+ `data.token`（JWT，7 天有效）。**註冊即自動登入**，前端拿到 token 後可直接使用，不需再呼叫 `/login`。

### `POST /api/auth/login`

- 必填 body：`email`、`password`，缺一 → 400。
- 找不到使用者 或 `bcrypt.compareSync` 密碼不符 → 皆回 401 `Email 或密碼錯誤`（刻意用同一訊息，不透露「帳號是否存在」以降低使用者列舉風險）。
- 成功回傳與註冊相同的結構（`user` + `token`）。

### `GET /api/auth/profile`

- 需 `authMiddleware`（見 ARCHITECTURE.md）。
- 回傳 `id/email/name/role/created_at`（**不含** `password_hash`，SQL 明確指定欄位）。
- 理論上 `authMiddleware` 已確認使用者存在，此處的 404 分支（`使用者不存在`）是防禦性程式碼，實務上難以觸發（除非使用者在 `authMiddleware` 查詢與此查詢之間的極短時間內被刪除）。

---

## 商品（前台瀏覽，Products）

檔案：`src/routes/productRoutes.js`。無需認證，公開端點。

### `GET /api/products`

- Query 參數：
  - `page`：整數，預設 `1`，最小值強制為 `1`（`Math.max(1, parseInt(...) || 1)`，非數字或 ≤0 一律回退為 1）。
  - `limit`：整數，預設 `10`，範圍鉗制在 `[1, 100]`（超過 100 會被砍到 100，避免一次撈全表）。
- 排序固定為 `created_at DESC`（新品在前），無其他排序選項，無關鍵字搜尋、無分類篩選。
- 回傳 `data.products`（完整欄位含 `description`）+ `data.pagination`（`total/page/limit/totalPages`，`totalPages = Math.ceil(total / limit)`）。

### `GET /api/products/:id`

- 找不到 → 404 `NOT_FOUND`。
- 回傳完整商品欄位（單一物件，非陣列）。

---

## 購物車（Cart）

檔案：`src/routes/cartRoutes.js`。所有端點皆通過本檔內自訂的 `dualAuth` middleware（見 ARCHITECTURE.md 認證章節），支援「JWT 會員」與「`X-Session-Id` 訪客」兩種身分，兩者資料完全隔離、不互通。

### `GET /api/cart`

- 以 JOIN `products` 撈出購物車項目與商品當下的 `name/price/stock/image_url`（**即時**商品資料，非快照——與訂單成立後的 `order_items` 快照行為不同）。
- 回傳 `data.items`（每項含巢狀 `product` 物件）+ `data.total`（**伺服器端計算**：`Σ product.price × quantity`，前端不需自行加總，且前端 `cart.js`/`checkout.js` 也各自重算一次 `total` 供畫面即時反應）。

### `POST /api/cart`（加入購物車）

- 必填 `productId`；`quantity` 選填，預設 `1`，需為正整數（`parseInt` 後檢查 `Number.isInteger && >= 1`，否則 400 `VALIDATION_ERROR`）。
- `productId` 對應商品不存在 → 404。
- **累加邏輯**：若該 owner（`user_id` 或 `session_id`）在購物車中已有相同 `product_id` 的項目，新數量 = 既有數量 + 本次 `quantity`（非覆寫），並檢查累加後總量是否超過 `product.stock`，超過則 400 `STOCK_INSUFFICIENT`，**不會**自動把數量降到庫存上限——請求整體失敗，前端需自行提示使用者。
- 若尚無此商品項目，檢查 `quantity` 是否超過現有庫存後直接 INSERT。
- 成功一律回 200（**非 201**，即使是新增操作也不是 201 Created，因為加入購物車在此系統視為「更新購物車狀態」而非建立新資源的語意）。
- 庫存檢查僅比對「當下查詢到的 `product.stock`」，與寫入之間非原子操作；`better-sqlite3` 是同步 API 且 Node 單執行緒事件循環在同一個請求處理函式內不會被其他 JS 打斷，但仍**不是**資料庫層級交易保護（無 `BEGIN/COMMIT`），跨請求的競態視 SQLite 寫入序列化特性而定，可视为在此專案規模下風險可忽略但非嚴謹保證。

### `PATCH /api/cart/:itemId`（修改數量）

- 必填 body `quantity`，需為正整數。
- 依 owner 條件查該筆 `cart_items`，查無（不存在或不屬於此 owner）→ 404（**刻意**不區分「不存在」與「存在但不是你的」，避免洩漏其他人購物車內容的存在性）。
- 新數量超過商品目前庫存 → 400 `STOCK_INSUFFICIENT`。
- 直接 `UPDATE ... SET quantity = ?`（非累加，PATCH 語意是「設為此值」，與 POST 的累加邏輯不同，前端呼叫時需注意）。

### `DELETE /api/cart/:itemId`

- 依 owner 條件確認歸屬後刪除；不存在/不屬於自己 → 404。
- 成功回傳 `data: null`。

---

## 訂單（Orders）

檔案：`src/routes/orderRoutes.js`。全路由 `router.use(authMiddleware)`，**無訪客下單**（`getOwnerCondition` 在此檔不適用，訂單一律綁 `user_id`）。

### `POST /api/orders`（結帳建單）

- 必填 body：`recipientName`、`recipientEmail`（需通過與註冊相同的簡易 email 正則）、`recipientAddress`，缺一即 400。
- 讀取當前使用者（`req.user.userId`）的**會員購物車**（`cart_items.user_id = ?`；訪客購物車 `session_id` 不會被此端點讀取——若使用者是以訪客身分加商品到購物車、之後才登入，這些訪客購物車項目**不會**出現在結帳清單中，是前述「購物車不自動合併」限制的直接後果）。
- 購物車為空 → 400 `CART_EMPTY`。
- **建單前重新檢查庫存**：逐一比對每個購物車項目的 `quantity` 是否 ≤ 當下 `products.stock`，任何一項不足即整單失敗，回傳 400 `STOCK_INSUFFICIENT`，訊息內列出所有庫存不足商品的名稱（`insufficientItems.map(name).join(', ')`），**不會**部分成立（要嘛全部商品都建單成功，要嘛整單失敗、購物車保持不變）。
- 訂單編號：`generateOrderNo()` 產生 `ORD-YYYYMMDD-XXXXX`格式，日期取當下 UTC（`toISOString().slice(0,10)`），亂數尾碼取一組新 `uuidv4()` 的前 5 碼並轉大寫（非遞增序號，理論上有極低機率碰撞，但資料庫層 `order_no` 有 `UNIQUE` 約束兜底，碰撞會讓交易拋錯、整個請求 500，機率在此系統規模下可忽略）。
- **交易（transaction）**：`db.transaction(() => {...})()`，在同一個 SQLite 交易內依序執行：
  1. INSERT `orders`（狀態固定 `pending`）。
  2. 對每個購物車項目 INSERT 對應的 `order_items`（快照當下的 `product_name`/`product_price`，之後商品改名改價不影響此訂單顯示）。
  3. 對每個購物車項目執行 `UPDATE products SET stock = stock - ?`（扣庫存，允許扣到 0，不會扣成負數是因為前一步已檢查過，但此 UPDATE 本身沒有 `WHERE stock >= ?` 這種資料庫層防呆，純靠應用層先行檢查）。
  4. `DELETE FROM cart_items WHERE user_id = ?`（清空該會員**全部**購物車項目，因為結帳邏輯是撈「全部購物車項目」一次建單，沒有「只結帳部分商品」的功能）。
  - 任何一步拋錯，`better-sqlite3` 的 `db.transaction()` 會自動 ROLLBACK 整個交易（訂單不會產生、庫存不會被扣、購物車不會被清空）。
- 成功回 201，回傳訂單摘要（`id/order_no/total_amount/status/items/created_at`），**不含**收件人資訊（`recipient_*` 未包含在此回應中，需另外呼叫 `GET /api/orders/:id` 才能看到）。

### `GET /api/orders`（我的訂單列表）

- 僅回傳當前使用者自己的訂單（`WHERE user_id = ?`），依 `created_at DESC` 排序，**無分頁**（與商品清單不同，此端點會一次回傳全部歷史訂單）。
- 每筆僅回傳摘要欄位（`id/order_no/total_amount/status/created_at`），不含 `items` 明細。

### `GET /api/orders/:id`（訂單詳情）

- 查詢條件同時比對 `id` 與 `user_id`，確保使用者只能看自己的訂單；查無（含「訂單存在但屬於別人」的情況）→ 統一 404，不洩漏訂單是否存在。
- 回傳完整訂單欄位（含 `recipient_*`）+ `items`（`order_items` 全部欄位）。

### `PATCH /api/orders/:id/pay`（模擬付款）

- **這不是真正的金流串接**，純粹是教學用的狀態切換端點，見 ARCHITECTURE.md「金流／第三方整合」章節說明。
- 必填 body `action`，僅接受 `'success'` 或 `'fail'`，對應到 `actionMap = { success: 'paid', fail: 'failed' }`；其他值 → 400 `VALIDATION_ERROR`。
- 訂單需存在且屬於自己，否則 404。
- **只有 `status === 'pending'` 的訂單才能付款**，已經是 `paid` 或 `failed` 的訂單再次呼叫此端點會回 400 `INVALID_STATUS`（`訂單狀態不是 pending，無法付款`）——代表**沒有「付款失敗後重試」的路徑**：一旦訂單被標記 `failed`，它會永遠卡在 `failed`，無法再次呼叫此端點轉為 `paid`（需要在資料庫手動處理或未來新增「重新結帳」功能，目前系統沒有此功能）。
- 成功回傳更新後的訂單（含 `items`），`message` 依 `action` 動態給 `付款成功`／`付款失敗`。
- 前端流程（`views/pages/order-detail.ejs` + `public/js/pages/order-detail.js`）：頁面上有「模擬付款成功」「模擬付款失敗」兩顆按鈕直接呼叫這支 API，屬於**開發／教學用的假付款頁面**，並非真實使用者會看到的金流頁（沒有導去第三方收銀台再導回）。

---

## 後台商品管理（Admin Products）

檔案：`src/routes/adminProductRoutes.js`。全路由需 `authMiddleware + adminMiddleware`。

### `GET /api/admin/products`

- 與 `GET /api/products` 邏輯完全相同（分頁、排序），差異只在需要 admin 權限。**無法篩選/搜尋商品**，後台清單頁（`admin-products.js`）純粹是同一份分頁資料。

### `POST /api/admin/products`（新增商品）

- 必填：`name`（非空字串）、`price`（整數，`Number.isInteger && > 0`）、`stock`（整數，`Number.isInteger && >= 0`）。任一不符 → 400，各有獨立錯誤訊息。
- 選填：`description`、`image_url`，未提供時存 `null`（而非空字串）。
- **注意型別要求較嚴格**：`price`/`stock` 必須是 JSON 數字型別（`Number.isInteger` 檢查），若前端傳字串數字（如 `"500"`）會被判定為驗證失敗，與購物車/訂單端點使用 `parseInt()` 寬容轉型的行為不同——這是本專案路由間**不一致**的驗證風格，新增功能時需留意仿照哪一種慣例（後台商品的表單 `admin-products.js` 送出前已在前端 `Number()` 轉型，故實務上不會觸發此差異）。
- 成功 201，回傳新商品完整欄位。

### `PUT /api/admin/products/:id`（編輯商品，部分更新語意）

- 先查商品是否存在，不存在 404。
- 所有欄位皆為**選填**（PUT 但實際行為近似 PATCH）：只驗證/更新請求中「有出現」的欄位，未出現的欄位保留原值（`updated !== undefined ? updated : existing.xxx` pattern）。
- `name` 若有提供但 `trim()` 後為空字串 → 400（`商品名稱不能為空`）；若完全不提供 `name` 則不受此檢查影響。
- `price`/`stock` 若有提供則須通過與新增時相同的型別/範圍檢查。
- 更新時 SQL 手動設定 `updated_at = datetime('now')`（唯一會更新此欄位的地方）。
- 成功回傳更新後完整商品物件。

### `DELETE /api/admin/products/:id`

- 商品不存在 → 404。
- **刪除保護**：JOIN `order_items` + `orders`，檢查是否有任何 `status = 'pending'` 的訂單包含此商品，若有 → 409 `CONFLICT`（`此商品存在未完成的訂單，無法刪除`）。
- 已 `paid`/`failed` 訂單引用的商品**允許刪除**（因為那些訂單的 `order_items` 已是快照資料，不受商品刪除影響，詳見 ARCHITECTURE.md 的 `order_items` schema 說明）。
- 刪除後**不會**級聯清理任何仍指向此商品 id 的 `cart_items`（訪客/會員購物車中若仍有此商品，之後呼叫 `GET /api/cart` 的 JOIN 查詢會直接排除該筆項目——因為是 INNER JOIN `products`，商品被刪除後該筆購物車項目會「靜默消失」於清單中，不會噴錯，但資料庫裡的孤兒 `cart_items` 列不會被清除，是潛在的資料堆積）。

---

## 後台訂單管理（Admin Orders）

檔案：`src/routes/adminOrderRoutes.js`。全路由需 `authMiddleware + adminMiddleware`，**唯讀**（無任何 PATCH/PUT/DELETE，後台無法手動變更訂單狀態、無法退款/取消訂單）。

### `GET /api/admin/orders`

- 分頁邏輯同商品清單。
- 選填 query `status`，僅接受白名單值 `pending`/`paid`/`failed`（其他值會被忽略，等同不篩選，**不會**回傳 400）。
- 回傳**所有使用者**的訂單（無 `user_id` 過濾），欄位為 `orders` 表全部欄位（含 `user_id`，但不含收件人以外的關聯使用者資訊——即這層清單 API 本身不 JOIN `users`，只有詳情 API 才會附使用者資料）。

### `GET /api/admin/orders/:id`

- 訂單不存在 → 404。
- 額外 JOIN 出下單者的 `name`/`email`（`data.user`），若使用者已被刪除則 `data.user` 為 `null`（不會因找不到使用者而整體失敗）。
- 回傳完整訂單欄位 + `items`（`order_items` 全表欄位）+ `user`。

---

## 前台頁面（Page Routes / 純渲染，非 API）

檔案：`src/routes/pageRoutes.js`，全部回傳 `text/html`（EJS render），無 JSON 回應、無伺服器端資料預載（頁面渲染時不查資料庫，所有資料都是頁面載入後由對應的 `public/js/pages/*.js` 透過 `apiFetch` 向 `/api/*` 拉取，屬於純前端 SPA-like 頁面內渲染模式，只是每個頁面各自獨立 mount，非單頁應用路由切換）。

| 路徑 | Layout | 對應 Vue 頁面腳本 | 說明 |
|---|---|---|---|
| `GET /` | front | `index.js` | 首頁，展示商品列表 |
| `GET /products/:id` | front | `product-detail.js` | 商品詳情頁，`productId` 透過 EJS 局部變數注入頁面（供頁面腳本讀取 `dataset` 或直接 EJS 內嵌） |
| `GET /cart` | front | `cart.js` | 購物車頁 |
| `GET /checkout` | front | `checkout.js` | 結帳頁，`onMounted` 時若購物車為空會直接導回 `/cart` |
| `GET /login` | front | `login.js` | 登入／註冊頁 |
| `GET /orders` | front | `orders.js` | 我的訂單列表頁，需登入（前端守門） |
| `GET /orders/:id` | front | `order-detail.js` | 訂單詳情 + 模擬付款頁，`orderId` 與 `paymentResult`（來自 query string `?payment=`）透過 `#app` 節點的 `data-*` 屬性傳入 |
| `GET /admin/products` | admin | `admin-products.js` | 後台商品管理頁 |
| `GET /admin/orders` | admin | `admin-orders.js` | 後台訂單管理頁 |

`renderFront`/`renderAdmin` 皆採「先 render 內層 page 拿到 `body` 字串，再包進對應 layout」的兩段式渲染（EJS 沒有原生 layout 支援，此為手動模擬 layout 的慣用寫法）。新增頁面時必須依樣呼叫，否則不會套用共用外殼與共用 JS。

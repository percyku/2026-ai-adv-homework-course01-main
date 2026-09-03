# 測試規範與指南

測試框架：**Vitest**（`globals: true`，可直接用 `describe`/`it`/`expect` 不需 import）+ **Supertest**（對 `app.js` 匯出的 Express app 實例直接發送模擬 HTTP 請求，不需要真的 `listen` 一個 port）。設定檔：`vitest.config.js`。執行：`npm test`（等同 `vitest run`，跑一次就結束，非 watch 模式）。

## 測試檔案表

| 檔案 | 涵蓋範圍 | 依賴的前置狀態 |
|---|---|---|
| `tests/setup.js` | 非測試檔本身，提供共用輔助函式與 `app`/`request` re-export | 無（其他測試檔皆從此檔案 `require`） |
| `tests/auth.test.js` | 註冊、重複註冊、登入（成功/密碼錯誤）、取得個人資料（有/無 token） | 依賴 `database.js` seed 出的 admin 帳號（`admin@hexschool.com` / `12345678`） |
| `tests/products.test.js` | 商品清單、分頁、詳情、404 | 依賴 seed 出的 8 筆商品資料（`products.length > 0` 的斷言） |
| `tests/cart.test.js` | 訪客模式（`X-Session-Id`）加入/查看/修改/移除購物車、會員模式加入購物車、加入不存在商品 404 | 依賴 `GET /api/products` 至少有 1 筆商品可用 |
| `tests/orders.test.js` | 從購物車建單、空購物車建單失敗、未登入建單 401、訂單清單、訂單詳情、404 | 依賴 `registerUser()` 建立新會員 + 商品存在；**依賴前一個測試檔（`cart.test.js`）已驗證的購物車行為，但不共用資料**（各測試檔各自獨立 `beforeAll` 建立自己的使用者與購物車狀態） |
| `tests/adminProducts.test.js` | 後台商品清單、新增、編輯、刪除、驗證刪除後 404、非 admin 拒絕存取、無 token 拒絕存取 | 依賴 `getAdminToken()` 登入 seed 管理員 |
| `tests/adminOrders.test.js` | 後台訂單清單、依狀態篩選、後台訂單詳情（含 user 資訊）、非 admin 拒絕存取 | 依賴 `beforeAll` 內完整跑一次「註冊會員 → 加入購物車 → 建立訂單」流程產生至少一筆訂單 |

## 執行順序與依賴關係

`vitest.config.js` 明確設定：

```js
sequence: {
  files: [
    'tests/auth.test.js',
    'tests/products.test.js',
    'tests/cart.test.js',
    'tests/orders.test.js',
    'tests/adminProducts.test.js',
    'tests/adminOrders.test.js',
  ],
},
fileParallelism: false,
```

**這個順序是刻意且必要的，不能隨意打亂**，原因：

1. `fileParallelism: false` 代表所有測試檔**依序、非並行**執行，共用同一個 `database.sqlite` 連線與資料狀態（沒有每個測試檔各自建立獨立資料庫或重置資料）。
2. 順序背後的邏輯依賴鏈：
   - `auth.test.js` 先確認 seed 的管理員帳號能登入、註冊/登入端點本身正確，後面所有測試檔的 `getAdminToken()`/`registerUser()` 輔助函式都建立在這個前提成立之上。
   - `products.test.js` 確認商品 seed 資料存在，後面 `cart.test.js`/`orders.test.js` 才能安全地假設 `GET /api/products` 一定回傳非空清單。
   - `cart.test.js` 驗證購物車基礎行為後，`orders.test.js` 才依賴「加入購物車可正常運作」去建立測試訂單的前置資料。
   - `adminOrders.test.js` 依賴 `orders.test.js`／自己的 `beforeAll` 已產生的訂單資料存在於資料庫中才能測「清單裡至少有一筆」。
3. 每個測試檔內部的 `it` 區塊也常有**執行順序依賴**（同一 `describe` 內用 `let` 變數在前一個 `it` 賦值、後一個 `it` 讀取，例如 `cart.test.js` 先 `should add product to cart` 存下 `cartItemId`，後續 `should update cart item quantity` 才能用），Vitest 預設同一檔案內 `it` 依撰寫順序執行，**新增測試時務必注意插入位置**，不要插在「產生資料」與「使用資料」的測試中間。

若要新增測試檔，且它會依賴其他測試檔已產生的資料狀態，務必把檔名加進 `vitest.config.js` 的 `sequence.files` 陣列中正確的位置；若不小心漏加，Vitest 仍會執行該檔案（Vitest 預設會找到所有 `tests/**` 底下的測試檔），但**執行順序相對其他檔案是未定義的**，可能導致間歇性失敗。

`hookTimeout: 10000`：`beforeAll`/`afterAll` 等 hook 的逾時上限拉長到 10 秒（預設 5 秒可能不夠，因為部分 `beforeAll` 內要跑好幾個 await 的 supertest 請求鏈，如 `adminOrders.test.js` 的註冊→加購物車→建訂單）。

## 輔助函式說明（`tests/setup.js`）

```js
const { app, request, getAdminToken, registerUser } = require('./setup');
```

- `app`：`require('../app')`，直接重新匯出，供 `supertest(app)` 使用；因為所有測試檔共用同一個 Node process，`require('../app')` 只會真正執行一次（Node 的 `require` cache），代表**所有測試檔共用同一個 `src/database.js` 連線與同一份 `database.sqlite` 資料**。
- `request`：`require('supertest')` 的直接重新匯出，測試檔用 `request(app).get(...)` 發送請求。
- `getAdminToken()`：以 seed 管理員帳號（`admin@hexschool.com` / `12345678`，硬編碼在函式內，**未**讀取 `.env` 的 `ADMIN_EMAIL`/`ADMIN_PASSWORD`）呼叫 `POST /api/auth/login`，回傳 `res.body.data.token`。**若本機 `.env` 有自訂 `ADMIN_EMAIL`/`ADMIN_PASSWORD` 覆蓋預設值，此函式會登入失敗**（因為它寫死呼叫預設帳密），這是撰寫/執行測試時常見的陷阱，見下方「常見陷阱」。
- `registerUser(overrides = {})`：呼叫 `POST /api/auth/register` 建立一個新會員，`email` 預設用 `test-${Date.now()}-${random}@example.com` 產生（確保每次呼叫都是唯一 email，避免 409 衝突），回傳 `{ token, user }`。可傳 `{ email, password, name }` 覆寫預設值。

## 撰寫新測試的步驟與範例

1. 在 `tests/` 新建 `<feature>.test.js`，開頭固定：
   ```js
   const { app, request, getAdminToken, registerUser } = require('./setup');
   ```
2. 用 `describe('<模組名稱> API', () => { ... })` 包裹，內部用 `it('should ...', async () => { ... })`。
3. 若測試需要登入態，優先用 `registerUser()` 取得一般會員 token，或 `getAdminToken()` 取得管理員 token，不要在測試內重新手刻登入流程。
4. 若測試步驟間有資料依賴（例如先建立訂單、再查詳情），用 `describe` 作用域內的 `let` 變數在前一個 `it` 賦值、後一個 `it` 讀取（既有測試檔一致的寫法），並確保 `it` 撰寫順序符合資料產生順序。
5. 每個成功案例的斷言至少檢查：
   - `res.status`
   - `res.body` 具備 `data`/`error`/`message` 三個 key（統一回應信封）
   - `error` 在成功時為 `null`
   - `data` 內關鍵欄位的存在與型別（`toHaveProperty`）
6. 每個失敗案例至少檢查 `res.status` 與 `res.body.error` 非 `null`（既有測試檔的一致模式，不需要斷言 `message` 的精確文字，避免測試對訊息文案過度敏感）。
7. 若新測試檔的資料**依賴**其他測試檔已產生的狀態，把檔名加進 `vitest.config.js` 的 `sequence.files`，插入到正確的相依順序位置；若完全獨立不依賴任何其他測試檔的資料，仍建議加入陣列以保持順序穩定、可預期。
8. 執行 `npm test` 確認全部通過，並確認**沒有**因為執行順序改變導致其他既有測試檔失敗（改動 `sequence.files` 或在既有檔案中插入新 `it` 時要特別檢查這一點）。

範例骨架：

```js
const { app, request, registerUser } = require('./setup');

describe('Xxx API', () => {
  let token;
  let createdId;

  beforeAll(async () => {
    const { token: t } = await registerUser();
    token = t;
  });

  it('should do the happy path', async () => {
    const res = await request(app)
      .post('/api/xxx')
      .set('Authorization', `Bearer ${token}`)
      .send({ /* ... */ });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('data');
    expect(res.body).toHaveProperty('error', null);
    expect(res.body.data).toHaveProperty('id');

    createdId = res.body.data.id;
  });

  it('should reject invalid input', async () => {
    const res = await request(app)
      .post('/api/xxx')
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('data', null);
    expect(res.body.error).not.toBeNull();
  });
});
```

## 常見陷阱

- **不要假設測試資料庫是乾淨的**：`database.sqlite` 是真實檔案、跨測試執行持久化（除非手動刪除），且測試彼此共用同一份資料。撰寫斷言時避免依賴「資料表目前總筆數恰好等於 N」這種絕對數字，改用 `toBeGreaterThan(0)`／檢查特定剛建立的資料這類相對斷言（既有測試檔一致做法）。
- **`getAdminToken()` 寫死帳密**：若本機 `.env` 自訂了 `ADMIN_EMAIL`/`ADMIN_PASSWORD`，管理員相關測試會因登入失敗而連鎖失敗（`adminToken` 會是 `undefined`，後續帶 `Bearer undefined` 的請求全部得到 401 而非預期的成功/403 案例）。本機測試前建議確認 `.env` 未覆寫這兩個值，或改用預設值執行測試。
- **`NODE_ENV` 影響 bcrypt 成本**：`src/database.js` 只在 `NODE_ENV === 'test'` 時把 seed 管理員的雜湊 rounds 降到 1；Vitest 預設會設定 `NODE_ENV=test`，但若你透過自訂腳本或 CI 設定覆蓋了這個變數，seed 管理員的雜湊會變成 10 rounds（不影響正確性，但每次測試啟動變慢，且**不影響**一般使用者註冊——`authRoutes.js` 的 `register` 端點固定用 10 rounds，不受 `NODE_ENV` 影響）。
- **`fileParallelism: false` 是必要設定，不要為了「加速測試」移除它**：移除後 Vitest 可能平行執行多個測試檔案，因為所有檔案共用同一個 SQLite 連線與資料狀態，會產生競態資料（例如 `products.test.js` 假設的第一筆商品 id 可能被其他並行檔案的操作影響）與不可預期的間歇性失敗。
- **購物車 POST 是累加、PATCH 是覆寫**：撰寫涉及購物車數量的測試時，務必留意 `POST /api/cart` 對同一商品重複呼叫會累加數量而非重設，若測試預期是「設定為固定值」應該用 `PATCH /api/cart/:itemId`（見 FEATURES.md 購物車章節）。
- **訂單一旦 `failed` 無法轉為 `paid`**：`PATCH /api/orders/:id/pay` 只接受 `status === 'pending'` 的訂單，撰寫「先付款失敗、再付款成功」的測試情境前，需確認這在目前系統下**是不被支援的**（會回 400 `INVALID_STATUS`），不要誤判為 bug。
- **後台商品新增/編輯的型別要求比其他端點嚴格**：`price`/`stock` 必須是 JSON 數字型別（`Number.isInteger` 檢查），測試中若用 `.send({ price: '500' })`（字串）會得到非預期的 400，需傳 `.send({ price: 500 })`（數字），與購物車/訂單端點寬容接受字串數字（`parseInt`）的行為不同。

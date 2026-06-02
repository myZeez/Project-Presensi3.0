# Admin Presensi

Admin sederhana native HTML, CSS, dan JS untuk mengelola data `employees` dan `attendance` di Google Sheets.

## Menjalankan Lokal

```powershell
$env:GOOGLE_SPREADSHEET_ID="1cOTDyiPEJNmNcfl1HTqASQhvRUB2aaF_S0qeBf5ep0Q"
npm start
```

Kalau `ADMIN_API_TOKEN` tidak diisi, backend akan membuat token otomatis di file `.admin-token`. Saat admin dibuka dari `http://localhost:3000`, halaman akan mengambil token itu otomatis.

Secara default backend membaca credential dari file lokal:

```text
D:\PROJECT\WEB\P-Presensi3.0-Backend\backend-app-key.json
```

File itu harus key JSON milik service account admin:

```text
backend-app@gen-lang-client-0684358981.iam.gserviceaccount.com
```

File `backend-app-key.json` sudah masuk `.gitignore`, jadi jangan di-upload ke GitHub.

Kalau credential dipindah, isi:

```powershell
$env:GOOGLE_CREDENTIALS_PATH="D:\path\backend-app-key.json"
```

Buka `http://localhost:3000`.

## GitHub Pages

Folder `public/` bisa di-host sebagai static site di GitHub Pages. Karena GitHub Pages tidak bisa menjalankan Node API, host folder backend/API ini di layanan Node seperti Render, Railway, VPS, atau server lokal yang dibuka publik.

Setelah API punya URL publik, edit `public/config.js`:

```js
window.PRESENSI_ADMIN_CONFIG = {
  API_BASE_URL: 'https://url-api-kamu.example.com',
};
```

Di hosting API, set juga:

```text
GOOGLE_SPREADSHEET_ID=1cOTDyiPEJNmNcfl1HTqASQhvRUB2aaF_S0qeBf5ep0Q
ADMIN_API_TOKEN=token_rahasia_minimal_16_karakter
CORS_ORIGIN=https://username.github.io
GOOGLE_SERVICE_ACCOUNT_JSON={...isi service account json...}
GOOGLE_SERVICE_ACCOUNT_EMAIL=backend-app@gen-lang-client-0684358981.iam.gserviceaccount.com
```

## Endpoint JSON

- `GET /api/employees`
- `POST /api/employees`
- `PUT /api/employees/:id`
- `DELETE /api/employees/:id`
- `GET /api/attendance`
- `POST /api/attendance`
- `PUT /api/attendance/:id`
- `DELETE /api/attendance/:id`

Semua endpoint CRUD wajib membawa header:

```text
Authorization: Bearer ADMIN_API_TOKEN
```

## Otomatisasi Spreadsheet

- Sheet `employees` dan `attendance` otomatis dibuat kalau belum ada.
- Header kolom otomatis ditulis di baris pertama.
- Tambah karyawan dari admin otomatis menulis row baru ke sheet `employees`.
- Tambah presensi dari admin otomatis menulis row baru ke sheet `attendance`.
- Kalau tanggal atau jam presensi dikosongkan saat request API, backend otomatis memakai waktu sekarang zona WIB.
- Aplikasi Flutter juga memastikan sheet/header tersedia sebelum membaca data karyawan atau menulis presensi.

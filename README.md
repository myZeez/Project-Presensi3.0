# Admin Presensi

Admin sederhana native HTML, CSS, dan JS untuk mengelola data `employees` dan `attendance` di Google Sheets.

## Menjalankan Lokal

```powershell
$env:GOOGLE_SPREADSHEET_ID="1cOTDyiPEJNmNcfl1HTqASQhvRUB2aaF_S0qeBf5ep0Q"
npm start
```

Login admin memakai sesi browser. Untuk lokal, credential dibaca dari file `.admin-login.json`:

```text
username: admin
password: lihat file .admin-login.json di folder backend lokal
```

Setelah login, akun admin tambahan bisa dibuat dari tab `Admin`. Password akan disimpan sebagai hash di `.admin-login.json`.

File `.admin-login.json` sudah masuk `.gitignore`. Untuk hosting, lebih aman pakai environment variable:

```text
ADMIN_USERNAME=admin
ADMIN_PASSWORD=password_rahasia
```

Atau pakai hash:

```text
ADMIN_USERNAME=admin
ADMIN_PASSWORD_HASH=sha256_password
```

Kalau butuh banyak admin dari environment variable, isi `ADMIN_USERS_JSON`:

```json
{
  "admins": [
    {
      "username": "admin",
      "password_hash": "sha256_password"
    }
  ]
}
```

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
ADMIN_USERNAME=admin
ADMIN_PASSWORD=password_rahasia
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
- `GET /api/admins`
- `POST /api/admins`
- `DELETE /api/admins/:username`

Semua endpoint CRUD wajib membawa header:

```text
Authorization: Bearer SESSION_TOKEN_DARI_LOGIN
```

## Otomatisasi Spreadsheet

- Sheet `employees` dan `attendance` otomatis dibuat kalau belum ada.
- Sheet `settings` menyimpan titik toko utama, radius presensi, batas tepat waktu, dan status validasi radius.
- Header kolom otomatis ditulis di baris pertama.
- Tambah karyawan dari admin otomatis menulis row baru ke sheet `employees`.
- Tambah karyawan tidak perlu mengisi koordinat toko. Backend otomatis memakai titik toko dari `settings`.
- Tambah presensi dari admin otomatis menulis row baru ke sheet `attendance`.
- Saat titik toko di `settings` diubah, backend menyinkronkan koordinat toko ke semua karyawan agar Flutter tetap punya patokan lokasi.
- Kalau tanggal atau jam presensi dikosongkan saat request API, backend otomatis memakai waktu sekarang zona WIB.
- Aplikasi Flutter juga memastikan sheet/header tersedia sebelum membaca data karyawan atau menulis presensi.

const sheets = {
  employees: {
    title: 'employees',
    range: 'employees!A2:G',
    columns: [
      'id',
      'nama',
      'username',
      'password_hash',
      'lokasi_toko_lat',
      'lokasi_toko_lng',
      'status',
    ],
  },
  attendance: {
    title: 'attendance',
    range: 'attendance!A2:J',
    columns: [
      'id',
      'employee_id',
      'nama',
      'tanggal',
      'jam',
      'tipe',
      'latitude',
      'longitude',
      'jarak',
      'status',
    ],
  },
  settings: {
    title: 'settings',
    range: 'settings!A2:C',
    columns: ['key', 'value', 'description'],
  },
};

module.exports = { sheets };

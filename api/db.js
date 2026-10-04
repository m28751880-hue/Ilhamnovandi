const { neon } = require('@neondatabase/serverless');

function getSql() {
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.NEON_DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL belum dikonfigurasi. Tambahkan connection string Neon di Vercel Environment Variables.');
  return neon(url);
}

module.exports = { getSql };

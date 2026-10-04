const { getSql } = require('./db');

function json(res, status, body) {
  res.status(status).setHeader('Cache-Control', 'no-store').json(body);
}

function clampLimit(value) {
  return Math.min(Math.max(Number(value || 260), 1), 1500);
}

function normalizeCandle(c) {
  return {
    time: Math.floor(Number(c.time)),
    open: Number(c.open),
    high: Number(c.high),
    low: Number(c.low),
    close: Number(c.close),
    volume: Number(c.volume),
    closed: Boolean(c.closed)
  };
}

async function ensureSchema(sql) {
  await sql`
    CREATE TABLE IF NOT EXISTS candles (
      symbol TEXT NOT NULL,
      interval TEXT NOT NULL,
      time BIGINT NOT NULL,
      open DOUBLE PRECISION NOT NULL,
      high DOUBLE PRECISION NOT NULL,
      low DOUBLE PRECISION NOT NULL,
      close DOUBLE PRECISION NOT NULL,
      volume DOUBLE PRECISION NOT NULL,
      closed BOOLEAN NOT NULL DEFAULT FALSE,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (symbol, interval, time)
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS candles_lookup_idx ON candles (symbol, interval, time DESC)`;
}

async function handler(req, res) {
  try {
    const sql = getSql();
    await ensureSchema(sql);
    const action = String(req.query?.action || 'latest').toLowerCase();
    const symbol = String(req.query?.symbol || 'BTCUSDT').toUpperCase();
    const interval = String(req.query?.interval || '15m');

    if (action === 'health') {
      await sql`SELECT 1 AS ok`;
      return json(res, 200, { ok: true, service: 'neon-candles' });
    }

    if (action === 'latest') {
      const limit = clampLimit(req.query?.limit);
      const rows = await sql`
        SELECT time, open, high, low, close, volume, closed
        FROM candles
        WHERE symbol=${symbol} AND interval=${interval}
        ORDER BY time DESC
        LIMIT ${limit}
      `;
      rows.reverse();
      return json(res, 200, { ok: true, symbol, interval, candles: rows, source: 'neon-postgres' });
    }

    if (action === 'upsert') {
      if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'POST required' });
      const incoming = Array.isArray(req.body?.candles) ? req.body.candles : [];
      if (!incoming.length) return json(res, 400, { ok: false, error: 'candles array is required' });
      if (incoming.length > 1500) return json(res, 400, { ok: false, error: 'Maximum 1500 candles per request' });

      const candles = incoming.map(normalizeCandle).filter(c =>
        Number.isFinite(c.time) && c.time > 0 &&
        Number.isFinite(c.open) && Number.isFinite(c.high) &&
        Number.isFinite(c.low) && Number.isFinite(c.close) && Number.isFinite(c.volume)
      );
      if (!candles.length) return json(res, 400, { ok: false, error: 'No valid candles' });

      const queries = candles.map(c => sql`
        INSERT INTO candles (symbol, interval, time, open, high, low, close, volume, closed)
        VALUES (${symbol}, ${interval}, ${c.time}, ${c.open}, ${c.high}, ${c.low}, ${c.close}, ${c.volume}, ${c.closed})
        ON CONFLICT (symbol, interval, time) DO UPDATE SET
          open=EXCLUDED.open, high=EXCLUDED.high, low=EXCLUDED.low,
          close=EXCLUDED.close, volume=EXCLUDED.volume, closed=EXCLUDED.closed, updated_at=NOW()
      `);
      await sql.transaction(queries);
      return json(res, 200, { ok: true, symbol, interval, saved: candles.length, source: 'neon-postgres' });
    }

    return json(res, 404, { ok: false, error: 'Unknown action', available: ['health', 'latest', 'upsert'] });
  } catch (err) {
    return json(res, 500, { ok: false, error: err.message || 'Neon database error' });
  }
}

module.exports = handler;

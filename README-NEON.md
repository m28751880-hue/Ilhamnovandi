# ILHAM NOVANDI AI TRADING SYSTEM — v8.7.1

## Binance Futures + Neon candle database

This version is **100% Binance Futures** for market data. Bybit is not used.

### Chart data flow
1. **Neon PostgreSQL** is the chart history database.
2. If Neon has enough candles, the chart loads directly from Neon.
3. If Neon is empty/insufficient, `/api/binance?action=market` bootstraps history from:
   - Binance USDⓈ-M Futures REST first.
   - Binance's official USDⓈ-M Futures public archive if REST is blocked (including HTTP 451).
4. **Binance Futures WebSocket starts independently of historical loading.** A REST/archive failure therefore does not prevent realtime candles from arriving.
5. Every WebSocket candle is upserted into Neon.
6. REST polling is only a fallback when the WebSocket is not connected.

### Required Vercel environment variables
```env
DATABASE_URL=postgresql://USER:PASSWORD@HOST/DB?sslmode=require

TRADING_MODE=demo
ENABLE_LIVE_TRADING=false

BINANCE_BASE_URL=https://fapi.binance.com
BINANCE_WS_URL=wss://fstream.binance.com
BINANCE_MARKET_BASE_URL=https://fapi.binance.com
BINANCE_MARKET_WS_URL=wss://fstream.binance.com/market
BINANCE_PUBLIC_WS_URL=wss://fstream.binance.com/public
BINANCE_PRIVATE_WS_URL=wss://fstream.binance.com/private
NODE_ENV=production
```

`PORT` is not required on Vercel.

### Important limitation
WebSocket supplies realtime market events, not hundreds of historical candles. Historical candles therefore require Neon to already contain them, Binance Futures REST, or Binance's official Futures archive. If Vercel cannot reach both Binance Futures REST and Binance's archive, the site can still receive realtime data through WebSocket if the browser can connect to Binance's Futures WebSocket, but it cannot invent missing historical candles.

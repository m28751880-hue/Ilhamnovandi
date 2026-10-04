v8.7.2
- Binance Futures only.
- Neon is the candle database.
- Historical bootstrap uses official Binance Futures daily archives with monthly archive fallback.
- WebSocket realtime runs independently.
- Chart displays 70 candles with Supertrend B/S-style lines and H/L markers.


## v8.9.2 realtime chart fix

The browser connects directly to Binance USDⓈ-M Futures WebSocket using the official
`wss://fstream.binance.com/ws/<symbol>@kline_<interval>` stream. The previous build
could construct an invalid `/market/ws/...` URL.

The chart updates the current candle from Binance WebSocket events without waiting
for Vercel or Neon. If the socket becomes stale, the browser reconnects automatically.
REST is only a fallback. Neon receives throttled candle snapshots and every closed
candle, so the database is not used as the realtime transport.


## V8.9.6
The chart no longer depends on browser-to-Binance WebSocket. Vercel fetches Binance Futures live price + current kline and the browser refreshes it every second. This avoids the mobile/browser WSS reconnect loop. The server tries fapi.binance.com plus fapi1-fapi4 and the function region is Singapore (sin1).

## V8.9.7 critical Binance WebSocket migration fix
Binance USDⓈ-M Futures WebSocket market streams now use the `/market` URL path. The browser market stream was updated from `/stream` to `/market/stream`, and public/private defaults were updated accordingly. Binance announced this migration with the old URL retirement on 2026-04-23.

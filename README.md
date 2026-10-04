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

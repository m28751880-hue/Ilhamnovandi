const { unzipSync, strFromU8 } = require('fflate');

function json(res, status, body) {
  res.status(status).setHeader('Cache-Control', 'no-store').json(body);
}

const DAY_MS = 86400000;
const MAX_DAYS = 7;
const FETCH_TIMEOUT_MS = 12000;

function isoDay(d) { return d.toISOString().slice(0, 10); }

function parseCsv(bytes) {
  const files = unzipSync(bytes);
  const name = Object.keys(files).find(k => /\.csv$/i.test(k)) || Object.keys(files)[0];
  if (!name) return [];
  const text = strFromU8(files[name]);
  const out = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line || line[0] === '#') continue;
    const p = line.split(',');
    if (p.length < 7) continue;
    const nums = p.slice(0, 7).map(Number);
    if (!nums.every(Number.isFinite)) continue;
    const [t,o,h,l,c,v,closeTime] = nums;
    if (t <= 0 || o <= 0 || h <= 0 || l <= 0 || c <= 0 || h < l) continue;
    out.push([t,String(o),String(h),String(l),String(c),String(v),closeTime,'0',0,'0','0','0']);
  }
  return out;
}

async function fetchBytes(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const r = await fetch(url, {
      headers: { 'User-Agent': 'ilham-novandi/8.7.1', 'Accept': 'application/zip' },
      cache: 'no-store', signal: controller.signal
    });
    if (!r.ok) return { ok:false, status:r.status };
    return { ok:true, status:200, bytes:new Uint8Array(await r.arrayBuffer()) };
  } finally { clearTimeout(timer); }
}

async function fetchDay(symbol, interval, day) {
  const file = `${symbol}-${interval}-${day}.zip`;
  const path = `data/futures/um/daily/klines/${encodeURIComponent(symbol)}/${encodeURIComponent(interval)}/${file}`;
  const urls = [
    `https://data.binance.vision/${path}`,
    `https://s3-ap-northeast-1.amazonaws.com/data.binance.vision/${path}`
  ];
  let lastStatus = 0;
  for (const url of urls) {
    try {
      const r = await fetchBytes(url); lastStatus = r.status;
      if (r.ok) return { day, rows:parseCsv(r.bytes), status:200 };
    } catch (e) { lastStatus = 0; }
  }
  return { day, rows:[], status:lastStatus };
}

async function fetchMonth(symbol, interval, year, month) {
  const mm = String(month).padStart(2, '0');
  const file = `${symbol}-${interval}-${year}-${mm}.zip`;
  const path = `data/futures/um/monthly/klines/${encodeURIComponent(symbol)}/${encodeURIComponent(interval)}/${file}`;
  const urls = [
    `https://data.binance.vision/${path}`,
    `https://s3-ap-northeast-1.amazonaws.com/data.binance.vision/${path}`
  ];
  let lastStatus = 0;
  for (const url of urls) {
    try {
      const r = await fetchBytes(url); lastStatus = r.status;
      if (r.ok) return { year, month, rows: parseCsv(r.bytes), status: 200 };
    } catch (e) { lastStatus = 0; }
  }
  return { year, month, rows: [], status: lastStatus };
}

async function getHistorical(symbol, interval, limit) {
  const now = new Date();
  const map = new Map();

  // Daily files are the freshest official Binance Futures archive. Check the
  // last 8 completed UTC days, including yesterday. If the newest daily file
  // has not appeared yet, monthly archives provide a stable history fallback.
  const dailyDays = Array.from({length: 8}, (_,i) => isoDay(new Date(now.getTime()-(i+1)*DAY_MS)));
  const dailyResults = await Promise.all(dailyDays.map(day => fetchDay(symbol, interval, day)));
  for (const r of dailyResults) for (const k of r.rows) map.set(Number(k[0]), k);

  if (map.size < limit) {
    const months = [];
    for (let i=0;i<3;i++) {
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth()-i, 1));
      months.push({year:d.getUTCFullYear(), month:d.getUTCMonth()+1});
    }
    const monthlyResults = await Promise.all(months.map(x => fetchMonth(symbol, interval, x.year, x.month)));
    for (const r of monthlyResults) for (const k of r.rows) map.set(Number(k[0]), k);
  }

  return [...map.values()].sort((a,b)=>Number(a[0])-Number(b[0])).slice(-limit);
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return json(res, 405, {ok:false,error:'GET required'});
  const symbol = String(req.query?.symbol || 'BTCUSDT').toUpperCase();
  const interval = String(req.query?.interval || '15m');
  const limit = Math.min(Math.max(Number(req.query?.limit || 260),1),1500);
  try {
    const klines = await getHistorical(symbol, interval, limit);
    if (!klines.length) return json(res,502,{ok:false,error:`Binance Futures archive tidak mengembalikan candle ${symbol} ${interval}`,source:'binance-futures-public-archive',daysChecked:MAX_DAYS});
    const last=klines.at(-1), prev=klines.at(-2)||last;
    const lastClose=Number(last[4]), prevClose=Number(prev[4]);
    const ticker={symbol,lastPrice:String(lastClose),highPrice:String(Math.max(...klines.map(k=>Number(k[2])))),lowPrice:String(Math.min(...klines.map(k=>Number(k[3])))),volume:String(klines.reduce((a,k)=>a+Number(k[5]),0)),priceChangePercent:String(prevClose?((lastClose/prevClose)-1)*100:0)};
    return json(res,200,{ok:true,symbol,interval,klines,ticker,source:'binance-futures-public-archive'});
  } catch(err) { return json(res,502,{ok:false,error:err.message||'Binance Futures archive error',source:'binance-futures-public-archive'}); }
};

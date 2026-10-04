const crypto = require('crypto');
const binanceHistory = require('./binance-history');

const BASE_URL = process.env.BINANCE_BASE_URL || 'https://fapi.binance.com';
const MARKET_BASE_URL = process.env.BINANCE_MARKET_BASE_URL || BASE_URL;
const MARKET_BASE_URLS = Array.from(new Set([
  MARKET_BASE_URL, BASE_URL,
  'https://fapi1.binance.com','https://fapi2.binance.com','https://fapi3.binance.com','https://fapi4.binance.com'
]));
const API_KEY = process.env.BINANCE_API_KEY || '';
const API_SECRET = process.env.BINANCE_API_SECRET || '';
const LIVE_ENABLED = String(process.env.ENABLE_LIVE_TRADING || 'false').toLowerCase() === 'true';
const MAX_NOTIONAL = Number(process.env.MAX_NOTIONAL_USDT || 0);

function json(res,status,body){res.status(status).setHeader('Cache-Control','no-store').json(body)}
function configured(){return !!API_KEY && !!API_SECRET}
function signedParams(params={}){
  const p={...params,timestamp:Date.now(),recvWindow:5000};
  const qs=new URLSearchParams(p).toString();
  return {p,qs,signature:crypto.createHmac('sha256',API_SECRET).update(qs).digest('hex')};
}
async function rawFetch(base,path,{method='GET',params={},signed=false,headers={}}={}){
  let url=base+path, body;
  const h={'Accept':'application/json',...headers};
  if(signed){
    if(!configured()) throw new Error('BINANCE_API_KEY / BINANCE_API_SECRET belum dikonfigurasi');
    const s=signedParams(params); const qs=s.qs+'&signature='+s.signature;
    if(method==='GET'||method==='DELETE') url+='?'+qs; else {body=qs;h['Content-Type']='application/x-www-form-urlencoded';}
    h['X-MBX-APIKEY']=API_KEY;
  }else if(Object.keys(params).length){
    const qs=new URLSearchParams(params).toString();
    if(method==='GET'||method==='DELETE') url+='?'+qs; else {body=qs;h['Content-Type']='application/x-www-form-urlencoded';}
  }
  const controller=new AbortController(); const timer=setTimeout(()=>controller.abort(),9000);
  try{
    const r=await fetch(url,{method,headers:h,body,cache:'no-store',signal:controller.signal});
    const text=await r.text(); let data; try{data=JSON.parse(text)}catch{data={raw:text}}
    if(!r.ok){const e=new Error(data?.msg||data?.error||`Binance HTTP ${r.status}`);e.status=r.status;e.details=data;throw e}
    return data;
  }finally{clearTimeout(timer)}
}
async function marketFetch(path){
  let last;
  for(const base of MARKET_BASE_URLS){
    try{return await rawFetch(base,path)}catch(e){last=e;if(e.status===451)break}
  }
  throw last||new Error('Binance Futures market data tidak dapat diakses');
}
async function signedFetch(path,opts={}){return rawFetch(BASE_URL,path,{...opts,signed:true})}

async function handler(req,res){
  const action=String(req.query?.action||'').toLowerCase();
  if(action==='ping')return json(res,200,{ok:true,service:'binance-futures',version:'8.9.2',marketBaseUrl:MARKET_BASE_URL});
  if(action==='config'){
    const wsUrl=process.env.BINANCE_WS_URL||'wss://fstream.binance.com';
    const marketWsUrl=process.env.BINANCE_MARKET_WS_URL||'wss://fstream.binance.com/market';
    const privateWsUrl=process.env.BINANCE_PRIVATE_WS_URL||'wss://fstream.binance.com/private';
    return json(res,200,{ok:true,wsUrl,marketWsUrl,publicWsUrl:process.env.BINANCE_PUBLIC_WS_URL||'wss://fstream.binance.com/public',privateWsUrl,configured:configured(),liveEnabled:LIVE_ENABLED});
  }
  if(action==='status')return json(res,200,{ok:true,configured:configured(),liveEnabled:LIVE_ENABLED,maxNotionalUsdt:MAX_NOTIONAL||null});
  if(action==='proxy'){
    const rawPath=String(req.query?.path||'');
    if(!rawPath.startsWith('/fapi/v1/'))return json(res,400,{ok:false,error:'Only /fapi/v1/* market paths are allowed'});
    try{return json(res,200,{ok:true,data:await marketFetch(rawPath),source:'binance-futures-rest'})}catch(e){return json(res,502,{ok:false,error:e.message,details:e.details||null})}
  }
  if(action==='history'){
    const symbol=String(req.query?.symbol||'BTCUSDT').toUpperCase(), interval=String(req.query?.interval||'15m'), limit=Math.min(Math.max(Number(req.query?.limit||260),1),1500);
    try{
      const fake={status(c){this.code=c;return this},setHeader(){return this},json(b){this.body=b;return this}};
      await binanceHistory({method:'GET',query:{symbol,interval,limit}},fake);
      return json(res,fake.code||200,fake.body||{ok:false,error:'Binance history unavailable'});
    }catch(e){return json(res,502,{ok:false,error:e.message})}
  }
  if(action==='market'){
    const symbol=String(req.query?.symbol||'BTCUSDT').toUpperCase(),interval=String(req.query?.interval||'15m'),limit=Math.min(Math.max(Number(req.query?.limit||260),1),1500);
    try{
      const [klines,ticker]=await Promise.all([marketFetch(`/fapi/v1/klines?symbol=${encodeURIComponent(symbol)}&interval=${encodeURIComponent(interval)}&limit=${limit}`),marketFetch(`/fapi/v1/ticker/24hr?symbol=${encodeURIComponent(symbol)}`)]);
      return json(res,200,{ok:true,symbol,interval,klines,ticker,source:'binance-futures-rest'});
    }catch(e){
      try{
        const fake={status(c){this.code=c;return this},setHeader(){return this},json(b){this.body=b;return this}};
        await binanceHistory({method:'GET',query:{symbol,interval,limit}},fake);
        if(fake.body?.ok)return json(res,200,fake.body);
      }catch{}
      return json(res,502,{ok:false,error:e.message,details:e.details||null,fallback:'binance-futures-public-archive'});
    }
  }
  if(action==='market24'){
    const symbol=String(req.query?.symbol||'BTCUSDT').toUpperCase();
    try{return json(res,200,{ok:true,symbol,ticker:await marketFetch(`/fapi/v1/ticker/24hr?symbol=${encodeURIComponent(symbol)}`),source:'binance-futures-rest'})}
    catch(e){return json(res,502,{ok:false,error:e.message,details:e.details||null})}
  }

  if(action==='account'){
    if(!configured())return json(res,400,{ok:false,error:'API key Binance Futures belum dikonfigurasi'});
    try{
      const [a,b,p]=await Promise.all([signedFetch('/fapi/v3/account'),signedFetch('/fapi/v3/balance'),signedFetch('/fapi/v3/positionRisk',{params:{symbol:String(req.query?.symbol||'BTCUSDT').toUpperCase()}})]);
      const usdt=(b||[]).find(x=>x.asset==='USDT')||{};
      const pos=(p||[]).find(x=>x.symbol===String(req.query?.symbol||'BTCUSDT').toUpperCase() && Math.abs(Number(x.positionAmt||0))>0) || (p||[]).find(x=>x.symbol===String(req.query?.symbol||'BTCUSDT').toUpperCase()) || {};
      return json(res,200,{ok:true,walletBalance:Number(usdt.balance??a.totalWalletBalance??0),availableBalance:Number(usdt.availableBalance??a.availableBalance??0),marginBalance:Number(a.totalMarginBalance??0),unrealizedPnl:Number(a.totalUnrealizedProfit??pos.unRealizedProfit??0),positions:p||[],assets:b||[],position:pos,source:'binance-futures-signed-v3'});
    }catch(e){return json(res,e.status===401?401:502,{ok:false,error:e.message,details:e.details||null})}
  }
  if(action==='listenkey'){
    if(!configured())return json(res,400,{ok:false,error:'API key Binance Futures belum dikonfigurasi'});
    try{
      const data=await rawFetch(BASE_URL,'/fapi/v1/listenKey',{method:'POST',headers:{'X-MBX-APIKEY':API_KEY}});
      return json(res,200,{ok:true,listenKey:data.listenKey,privateWsUrl:process.env.BINANCE_PRIVATE_WS_URL||'wss://fstream.binance.com/private'});
    }catch(e){return json(res,e.status===401?401:502,{ok:false,error:e.message,details:e.details||null})}
  }
  if(action==='keepalive'){
    if(!configured())return json(res,400,{ok:false,error:'API key Binance Futures belum dikonfigurasi'});
    try{const key=String(req.query?.listenKey||'');if(!key)throw new Error('listenKey wajib');await rawFetch(BASE_URL,'/fapi/v1/listenKey',{method:'PUT',headers:{'X-MBX-APIKEY':API_KEY},params:{listenKey:key}});return json(res,200,{ok:true})}catch(e){return json(res,e.status===401?401:502,{ok:false,error:e.message,details:e.details||null})}
  }
  if(['order','close','bracket','protect'].includes(action)){
    if(!LIVE_ENABLED)return json(res,403,{ok:false,error:'ENABLE_LIVE_TRADING=false'});
    if(!configured())return json(res,400,{ok:false,error:'BINANCE_API_KEY / BINANCE_API_SECRET belum dikonfigurasi'});
    if(req.headers['x-live-confirm']!=='ILHAM-NOVANDI-LIVE')return json(res,403,{ok:false,error:'Live confirmation header missing'});
    let payload={};try{payload=typeof req.body==='object'?req.body:JSON.parse(req.body||'{}')}catch{payload={}}
    const symbol=String(payload.symbol||'BTCUSDT').toUpperCase();
    try{
      if(action==='order'){
        const side=String(payload.side||'').toUpperCase(), quantity=Number(payload.quantity||0); if(!['BUY','SELL'].includes(side)||!(quantity>0))throw new Error('side/quantity tidak valid');
        if(MAX_NOTIONAL>0 && quantity*Number(payload.entryPrice||0)>MAX_NOTIONAL)throw new Error('Notional melebihi MAX_NOTIONAL_USDT');
        return json(res,200,{ok:true,order:await signedFetch('/fapi/v1/order',{method:'POST',params:{symbol,side,type:'MARKET',quantity}})});
      }
      if(action==='close'){
        const p=await signedFetch('/fapi/v3/positionRisk',{params:{symbol}}); const pos=(p||[]).find(x=>x.symbol===symbol && Math.abs(Number(x.positionAmt||0))>0); if(!pos)return json(res,200,{ok:true,flat:true});
        const amt=Number(pos.positionAmt), side=amt>0?'SELL':'BUY', quantity=Math.abs(amt);
        const order=await signedFetch('/fapi/v1/order',{method:'POST',params:{symbol,side,type:'MARKET',quantity,reduceOnly:'true'}});
        return json(res,200,{ok:true,orderId:order.orderId,order});
      }
      if(action==='bracket'){
        const side=String(payload.side||'').toUpperCase(), quantity=Number(payload.quantity||0), entry=Number(payload.entryPrice||0); if(!['BUY','SELL'].includes(side)||!(quantity>0)||!(entry>0))throw new Error('Order bracket tidak valid');
        if(MAX_NOTIONAL>0 && quantity*entry>MAX_NOTIONAL)throw new Error('Notional melebihi MAX_NOTIONAL_USDT');
        const open=await signedFetch('/fapi/v1/order',{method:'POST',params:{symbol,side,type:'MARKET',quantity}});
        const exitSide=side==='BUY'?'SELL':'BUY'; const sl=side==='BUY'?entry*0.992:entry*1.008; const tp=side==='BUY'?entry*1.016:entry*0.984;
        const common={symbol,side:exitSide,algoType:'CONDITIONAL',positionSide:'BOTH',timeInForce:'GTC',workingType:'MARK_PRICE',closePosition:'true'};
        let stop=null,take=null;
        try{stop=await signedFetch('/fapi/v1/algoOrder',{method:'POST',params:{...common,type:'STOP_MARKET',triggerPrice:sl.toFixed(8),clientAlgoId:`SL_${Date.now()}`}})}catch(e){stop={error:e.message,details:e.details||null}}
        try{take=await signedFetch('/fapi/v1/algoOrder',{method:'POST',params:{...common,type:'TAKE_PROFIT_MARKET',triggerPrice:tp.toFixed(8),clientAlgoId:`TP_${Date.now()}`}})}catch(e){take={error:e.message,details:e.details||null}}
        return json(res,200,{ok:true,open,stop,take});
      }
      if(action==='protect'){
        const p=await signedFetch('/fapi/v3/positionRisk',{params:{symbol}});const pos=(p||[]).find(x=>x.symbol===symbol&&Math.abs(Number(x.positionAmt||0))>0);if(!pos)throw new Error('Tidak ada posisi aktif');
        const side=Number(pos.positionAmt)>0?'SELL':'BUY', entry=Number(pos.entryPrice||0), mark=Number(pos.markPrice||entry); let trigger;
        if(payload.mode==='breakeven')trigger=Number(pos.positionAmt)>0?entry*1.0005:entry*0.9995;
        else trigger=Number(pos.positionAmt)>0?mark*0.995:mark*1.005;
        const params={symbol,side,algoType:'CONDITIONAL',positionSide:'BOTH',type:payload.mode==='breakeven'?'STOP_MARKET':'TRAILING_STOP_MARKET',timeInForce:'GTC',workingType:'MARK_PRICE',closePosition:'true',triggerPrice:payload.mode==='breakeven'?trigger.toFixed(8):undefined,activatePrice:payload.mode==='trailing'?mark.toFixed(8):undefined,callbackRate:payload.mode==='trailing'?Number(payload.callbackRate||0.5):undefined,clientAlgoId:`PR_${Date.now()}`};
        Object.keys(params).forEach(k=>params[k]===undefined&&delete params[k]);
        const r=await signedFetch('/fapi/v1/algoOrder',{method:'POST',params});return json(res,200,{ok:true,order:r});
      }
    }catch(e){return json(res,e.status===401?401:502,{ok:false,error:e.message,details:e.details||null})}
  }
  return json(res,404,{ok:false,error:'Unknown action',available:['ping','config','status','proxy','history','market','market24','account','listenkey','keepalive','order','bracket','close','protect']});
}
module.exports=handler;


(() => {
  const $ = id => document.getElementById(id);
  const fmtIDR = n => new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0}).format(n || 0);
  const state = {symbol:'BTCUSDT', interval:'15m', confirmedSide:'WAIT', lastClosedTime:0, price:0, high:0, low:0, vol:0, candles:[], ema20:[], position:null, paper:true, lastTicker:null, ws:null, scannerTimer:null, earlyScore:0, earlySide:'WAIT', lastEarlyCandle:0, earlyEntryUsed:false, cooldownUntil:0, journal:[], dailyLoss:0, consecutiveLoss:0};
  let currentData = [];
  let emaData = [];
  const chartHost = $('chart');
  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-label','BTCUSDT 15M candlestick chart');
  canvas.style.width='100%'; canvas.style.height='100%'; canvas.style.display='block';
  chartHost.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  function resizeChartCanvas(){
    const r=chartHost.getBoundingClientRect(), dpr=Math.max(1,window.devicePixelRatio||1);
    canvas.width=Math.max(1,Math.floor(r.width*dpr)); canvas.height=Math.max(1,Math.floor(r.height*dpr));
    ctx.setTransform(dpr,0,0,dpr,0,0); drawChart();
  }
  function calcSupertrend(data, period=10, multiplier=3){
    if(!data.length) return [];
    const tr=data.map((c,i)=>i===0?c.high-c.low:Math.max(c.high-c.low,Math.abs(c.high-data[i-1].close),Math.abs(c.low-data[i-1].close)));
    const atr=[]; for(let i=0;i<data.length;i++){const a=tr.slice(Math.max(0,i-period+1),i+1);atr.push(a.reduce((x,y)=>x+y,0)/a.length)}
    const upper=[],lower=[],st=[],dir=[];
    for(let i=0;i<data.length;i++){
      const mid=(data[i].high+data[i].low)/2, bu=mid+multiplier*atr[i], bl=mid-multiplier*atr[i];
      upper[i]=i?Math.min(bu,upper[i-1]):bu; lower[i]=i?Math.max(bl,lower[i-1]):bl;
      if(i===0){dir[i]=data[i].close>=mid?1:-1;st[i]=dir[i]>0?lower[i]:upper[i];continue}
      dir[i]=data[i].close>upper[i-1]?1:data[i].close<lower[i-1]?-1:dir[i-1];
      st[i]=dir[i]>0?lower[i]:upper[i];
    }
    return data.map((c,i)=>({value:st[i],dir:dir[i]}));
  }
  function drawChart(){
    const w=chartHost.clientWidth,h=chartHost.clientHeight; if(!w||!h)return;
    ctx.clearRect(0,0,w,h); ctx.fillStyle='#040b14'; ctx.fillRect(0,0,w,h);
    const data=currentData.slice(-70); if(!data.length){ctx.fillStyle='#6d8199';ctx.font='12px system-ui';ctx.fillText('Menunggu data Binance Futures…',20,40);return;}
    const pad={l:62,r:18,t:28,b:26}, cw=w-pad.l-pad.r, ch=h-pad.t-pad.b;
    let min=Math.min(...data.map(x=>x.low)), max=Math.max(...data.map(x=>x.high));
    const span=Math.max(max-min,1e-9), extra=span*.08; min-=extra; max+=extra;
    const y=v=>pad.t+(max-v)/(max-min)*ch, x=i=>pad.l+(i+.5)*cw/data.length;
    ctx.strokeStyle='#0a1726';ctx.lineWidth=1;
    for(let i=0;i<=5;i++){const yy=pad.t+i*ch/5;ctx.beginPath();ctx.moveTo(pad.l,yy);ctx.lineTo(pad.l+cw,yy);ctx.stroke();}
    for(let i=0;i<=6;i++){const xx=pad.l+i*cw/6;ctx.beginPath();ctx.moveTo(xx,pad.t);ctx.lineTo(xx,pad.t+ch);ctx.stroke();}
    const step=cw/data.length, bodyW=Math.max(3,Math.min(11,step*.58));
    data.forEach((c,i)=>{const xx=x(i),yo=y(c.open),yc=y(c.close),yh=y(c.high),yl=y(c.low),up=c.close>=c.open;ctx.strokeStyle=up?'#00d79a':'#ff4f72';ctx.fillStyle=ctx.strokeStyle;ctx.lineWidth=1.2;ctx.beginPath();ctx.moveTo(xx,yh);ctx.lineTo(xx,yl);ctx.stroke();const top=Math.min(yo,yc),bh=Math.max(2,Math.abs(yc-yo));ctx.fillRect(xx-bodyW/2,top,bodyW,bh);});
    const st=calcSupertrend(data,10,3);
    ctx.lineWidth=2.2;
    for(let i=1;i<st.length;i++){if(st[i-1].dir!==st[i].dir)continue;ctx.strokeStyle=st[i].dir>0?'#00d79a':'#ff4f72';ctx.beginPath();ctx.moveTo(x(i-1),y(st[i-1].value));ctx.lineTo(x(i),y(st[i].value));ctx.stroke();}
    ctx.lineWidth=2; if(emaData.length){const visible=emaData.slice(-data.length);ctx.strokeStyle='#eab84a';ctx.beginPath();visible.forEach((v,i)=>{const xx=x(i),yy=y(v);i?ctx.lineTo(xx,yy):ctx.moveTo(xx,yy)});ctx.stroke();}
    for(let i=2;i<data.length-2;i++){
      const isH=data[i].high>data[i-1].high&&data[i].high>=data[i+1].high&&data[i].high>=data[i-2].high&&data[i].high>=data[i+2].high;
      const isL=data[i].low<data[i-1].low&&data[i].low<=data[i+1].low&&data[i].low<=data[i-2].low&&data[i].low<=data[i+2].low;
      if(isH){ctx.fillStyle='#f0c05a';ctx.font='10px system-ui';ctx.textAlign='center';ctx.fillText('H',x(i),Math.max(12,y(data[i].high)-8));}
      if(isL){ctx.fillStyle='#63d8b3';ctx.font='10px system-ui';ctx.textAlign='center';ctx.fillText('L',x(i),Math.min(h-8,y(data[i].low)+16));}
    }
    const last=data[data.length-1],lastY=y(last.close);ctx.setLineDash([4,4]);ctx.strokeStyle='#20d7ff55';ctx.beginPath();ctx.moveTo(pad.l,lastY);ctx.lineTo(pad.l+cw,lastY);ctx.stroke();ctx.setLineDash([]);
    ctx.fillStyle='#9eb4c8';ctx.font='10px system-ui';ctx.textAlign='left';for(let i=0;i<=5;i++){const v=max-i*(max-min)/5;ctx.fillText(v.toFixed(v>100?0:2),8,pad.t+i*ch/5+3);}
    ctx.fillStyle='#6f8399';ctx.fillText('15M · '+data.length+' candles · Binance Futures',pad.l,16);ctx.textAlign='right';ctx.fillStyle='#aab8c6';ctx.fillText('LIVE',w-8,18);
  }
  const chart={applyOptions:()=>resizeChartCanvas(),timeScale:()=>({fitContent:()=>drawChart()})};
  const candleSeries={setData:d=>{currentData=d||[];drawChart()},update:c=>{const i=currentData.findIndex(x=>x.time===c.time);if(i>=0)currentData[i]=c;else currentData.push(c);if(currentData.length>260)currentData.shift();drawChart()}};
  const emaSeries={setData:d=>{emaData=(d||[]).map(x=>x.value);drawChart()},update:x=>{if(emaData.length)emaData[emaData.length-1]=x.value;drawChart()}};
  resizeChartCanvas();
  const toast = msg => { $('toast').textContent=msg; $('toast').classList.add('show'); setTimeout(()=>$('toast').classList.remove('show'),2200); };
  let binanceConfig=null;
  const getBinanceConfig = async () => {
    if(binanceConfig) return binanceConfig;
    try {
      const r=await fetch('/api/binance?action=config',{cache:'no-store'});
      const d=await r.json();
      if(d?.ok) binanceConfig=d;
    } catch(e) { console.warn('Binance config unavailable:',e.message); }
    return binanceConfig || {marketWsUrl:'wss://fstream.binance.com/market', wsUrl:'wss://fstream.binance.com'};
  };
  const api = async (path) => {
    const r=await fetch('/api/binance?'+new URLSearchParams({action:'proxy',path}),{cache:'no-store'});
    const data=await r.json().catch(()=>({error:'Binance response tidak valid'}));
    if(!r.ok || data?.ok===false) throw new Error(data?.error || ('Binance HTTP '+r.status));
    return data?.data ?? data;
  };
  const neonApi = async (symbol=state.symbol, interval='15m', limit=260) => {
    const q='symbol='+encodeURIComponent(symbol)+'&interval='+encodeURIComponent(interval)+'&limit='+limit;
    const r=await fetch('/api/candles?action=latest&'+q,{cache:'no-store'});
    const data=await r.json().catch(()=>({error:'Neon response tidak valid'}));
    if(!r.ok || !data.ok) throw new Error(data.error || ('Neon HTTP '+r.status));
    return data;
  };
  const saveNeonCandles = async (symbol, interval, candles) => {
    if(!candles?.length)return;
    try {
      await fetch('/api/candles?action=upsert&symbol='+encodeURIComponent(symbol)+'&interval='+encodeURIComponent(interval),{
        method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({candles})
      });
    } catch(e) { console.warn('Neon candle save failed:',e.message); }
  };
  const normalizeKlines = (rows, limit=260) => {
    const map=new Map();
    for(const k of (rows||[])){
      if(!Array.isArray(k)||k.length<6) continue;
      const t=Number(k[0]); const o=Number(k[1]),h=Number(k[2]),l=Number(k[3]),c=Number(k[4]),v=Number(k[5]);
      if(Number.isFinite(t)&&t>0&&[o,h,l,c,v].every(Number.isFinite)) map.set(t,[t,o,h,l,c,v,k[6]]);
    }
    return [...map.values()].sort((a,b)=>a[0]-b[0]).slice(-limit);
  };
  const marketApi = async (symbol=state.symbol, interval='15m', limit=260) => {
    const q='symbol='+encodeURIComponent(symbol)+'&interval='+encodeURIComponent(interval)+'&limit='+limit;
    let neonCandles=[];
    // Neon is the chart database. Use it immediately when it already has a
    // useful history; otherwise bootstrap it from Binance Futures archive/REST.
    try {
      const db=await neonApi(symbol,interval,limit);
      neonCandles=Array.isArray(db.candles)?db.candles:[];
      if(neonCandles.length>=Math.min(limit,200)) {
        const klines=normalizeKlines(neonCandles.map(c=>[Number(c.time)*1000,c.open,c.high,c.low,c.close,c.volume]),limit);
        const last=neonCandles.at(-1);
        let ticker={lastPrice:last.close,highPrice:last.high,lowPrice:last.low,volume:last.volume,priceChangePercent:'0'};
        try {
          const live=await fetch('/api/binance?action=market24&symbol='+encodeURIComponent(symbol),{cache:'no-store'});
          if(live.ok){const d=await live.json(); if(d?.ticker) ticker=d.ticker;}
        } catch(e) { console.warn('Live Binance ticker unavailable; using Neon last candle:',e.message); }
        return {symbol,interval,klines,ticker,source:'neon-postgres'};
      }
    } catch(e) { console.warn('Neon read failed:',e.message); }

    // Binance Futures is the ONLY market-data source. History is attempted
    // through the official Binance Futures archive first so a REST 451 cannot
    // consume the entire Vercel function timeout.
    try {
      const r=await fetch('/api/binance?action=history&'+q,{cache:'no-store'});
      const data=await r.json().catch(()=>({error:'Binance response tidak valid'}));
      if(r.ok && data.ok && Array.isArray(data.klines) && data.klines.length) {
        const klines=data.klines;
        const candles=klines.map(k=>({time:Number(k[0])/1000,open:+k[1],high:+k[2],low:+k[3],close:+k[4],volume:+k[5],closed:Number(k[6])<=Date.now()}));
        await saveNeonCandles(symbol,interval,candles);
        return {symbol,interval,klines,ticker:data.ticker||null,source:data.source||'binance-futures-seed-neon'};
      }
      console.warn('Binance archive history failed:',data.error||('HTTP '+r.status));
    } catch(e) { console.warn('Binance archive history failed:',e.message); }

    // REST is a secondary Binance Futures fallback.
    try {
      const r=await fetch('/api/binance?action=market&'+q,{cache:'no-store'});
      const data=await r.json().catch(()=>({error:'Binance response tidak valid'}));
      if(r.ok && data.ok && Array.isArray(data.klines) && data.klines.length){
        const klines=normalizeKlines(data.klines,limit);
        const candles=klines.map(k=>({time:Number(k[0])/1000,open:+k[1],high:+k[2],low:+k[3],close:+k[4],volume:+k[5],closed:Number(k[6])<=Date.now()}));
        await saveNeonCandles(symbol,interval,candles);
        return {symbol,interval,klines,ticker:data.ticker||null,source:data.source||'binance-futures-rest-neon'};
      }
    } catch(e) { console.warn('Binance REST history failed:',e.message); }

    // If bootstrap is unavailable, do NOT kill the chart. A live Binance
    // WebSocket may already be filling Neon/currentData independently.
    if(neonCandles.length) {
      const klines=normalizeKlines(neonCandles.map(c=>[Number(c.time)*1000,c.open,c.high,c.low,c.close,c.volume]),limit);
      const last=neonCandles.at(-1);
      return {symbol,interval,klines,ticker:{lastPrice:last.close,highPrice:last.high,lowPrice:last.low,volume:last.volume,priceChangePercent:'0'},source:'neon-postgres-partial'};
    }
    throw new Error('Belum ada candle Binance Futures di Neon dan history Binance tidak dapat diambil. WebSocket tetap dijalankan untuk data realtime.');
  };
  const market24 = async (symbol='BTCUSDT') => { const r=await fetch('/api/binance?action=market24&symbol='+encodeURIComponent(symbol),{cache:'no-store'}); const data=await r.json().catch(()=>({error:'Ticker response tidak valid'})); if(!r.ok || !data.ok) throw new Error(data.error||'Ticker proxy error'); return data.ticker || data; };
  let pollTimer=null, realtimeConnected=false, lastWsCandle=null;
  const calcEMA=(arr,p=20)=>{let k=2/(p+1),e=arr[0]||0;return arr.map((v,i)=>{if(i===0)e=v;else e=v*k+e*(1-k);return e})};
  function earlyScoreFor(data){
    if(!data || data.length<22) return {score:0,side:'WAIT',momentum:0,volume:0,structure:'WAIT',breakout:'WAIT',risk:0,rr:0,ema:0};
    const c=data.at(-1), prev=data.at(-2), pprev=data.at(-3);
    const emaArr=calcEMA(data.map(x=>x.close)); const ema=emaArr.at(-1);
    const range=Math.max(c.high-c.low,1e-12), body=Math.abs(c.close-c.open), bodyPct=body/range*100;
    const bullish=c.close>=c.open, above=c.close>=ema;
    const avgVol=data.slice(-21,-1).reduce((a,x)=>a+x.volume,0)/20; const volRatio=avgVol?c.volume/avgVol:1;
    const momentumRaw=((c.close-prev.close)/Math.max(prev.close,1e-12))*10000;
    const momentum=Math.max(0,Math.min(100,50+momentumRaw*1.8+(bodyPct-50)*0.22));
    const breakoutUp=c.close>Math.max(prev.high,pprev.high), breakoutDn=c.close<Math.min(prev.low,pprev.low);
    const structure=breakoutUp?'HH/BREAK ↑':breakoutDn?'LL/BREAK ↓':c.close>prev.close?'HH/HL':'LH/LL';
    const breakout=breakoutUp||breakoutDn?(bullish===breakoutUp?'VALID':'MIXED'):'NONE';
    const wickLow=(Math.min(c.open,c.close)-c.low)/range*100, wickHigh=(c.high-Math.max(c.open,c.close))/range*100;
    const rejectionUp=wickLow>35 && c.close>c.open, rejectionDn=wickHigh>35 && c.close<c.open;
    let score=20; score+=above===bullish?20:8; score+=Math.min(20,Math.round(Math.abs(momentum-50)*0.7)); score+=volRatio>=1.5?18:volRatio>=1.15?12:volRatio>=.9?7:2; score+=breakoutUp||breakoutDn?15:(rejectionUp||rejectionDn?9:4); score+=bodyPct>=55?10:bodyPct>=35?6:2;
    const side=score>=55?(bullish||breakoutUp||rejectionUp?'BUY':'SELL'):'WAIT';
    const slDist=Math.max(range*1.15, c.close*0.0025); const tpDist=Math.max(slDist*1.8,c.close*0.0045);
    const rr=tpDist/slDist; const risk=Math.min(100,Math.round((slDist/c.close)*10000));
    return {score:Math.max(0,Math.min(100,Math.round(score))),side,momentum:Math.round(momentum),volume:volRatio,structure,breakout,risk,rr,ema,rejectionUp,rejectionDn,slDist,tpDist};
  }
  function updateEarlyUI(x){
    state.earlyScore=x.score; state.earlySide=x.side;
    $('earlyScore').textContent=x.score; $('earlyMeter').style.width=x.score+'%';
    const stateText=x.score>=90?'EXTREME':x.score>=80?'STRONG':x.score>=70?'EARLY':'WATCH';
    $('earlyState').textContent=stateText; $('earlyState').className='entry-badge '+(x.score>=80?'strong':x.score>=70?'warn':'');
    $('earlyEntrySide').textContent=x.side==='WAIT'?'WAIT':x.side; $('earlyEntrySide').className=x.side==='BUY'?'green':x.side==='SELL'?'red':'';
    $('earlyMomentum').textContent=x.momentum+'/100'; $('earlyVolume').textContent=x.volume.toFixed(2)+'x'; $('earlyStructure').textContent=x.structure; $('earlyBreakout').textContent=x.breakout;
    $('earlyRisk').textContent=x.risk?x.risk+' bp':'—'; $('earlyRR').textContent=x.rr?x.rr.toFixed(1)+'R':'—';
    $('earlyPlan').textContent=x.score>=90?'STRONG: 20% early + 30% momentum + 50% confirmation. Jangan chase jika jarak dari EMA melebar.':x.score>=80?'EARLY: 30% awal, tambah hanya jika momentum tetap sehat.':x.score>=70?'WATCH/EARLY: 20% awal jika RR layak; jangan tambah bila momentum gagal.':'WAIT: tidak cukup kuat untuk entry otomatis.';
  }
  function entryPlan(x){
    const c=currentData.at(-1); if(!c)return {stage:'WAIT',low:0,high:0,opp:0,pressure:50,rr:x.rr||0};
    const ema=state.ema20.at(-1)||c.close; const range=Math.max(c.high-c.low,1e-9);
    const pressure=Math.max(0,Math.min(100,50+(x.momentum-50)*0.65+(x.volume-1)*18+(x.side==='BUY'?(c.close>=ema?12:-8):(c.close<ema?12:-8))));
    const dist=Math.abs(c.close-ema)/c.close*100; const chase=dist>1.8 || x.rr<1.5;
    const pullbackLow=x.side==='BUY'?Math.max(ema,c.close-range*0.35):c.close-range*0.65;
    const pullbackHigh=x.side==='BUY'?c.close+range*0.12:Math.min(ema,c.close+range*0.35);
    const zoneLow=Math.min(pullbackLow,pullbackHigh), zoneHigh=Math.max(pullbackLow,pullbackHigh);
    const inside=c.close>=zoneLow&&c.close<=zoneHigh;
    let stage='WATCH'; if(x.score>=90&&!chase)stage='STRONG'; else if(x.score>=80&&!chase)stage='EARLY'; else if(x.score>=70)stage='WATCH'; if(chase)stage='PULLBACK';
    const opp=Math.max(0,Math.min(100,Math.round(x.score*0.72+Math.min(20,x.rr*7)+Math.max(0,pressure-50)*0.18)));
    return {stage,zoneLow,zoneHigh,opp,pressure,rr:x.rr||0,chase,inside};
  }
  function updateSmartUI(x){
    const p=entryPlan(x); $('entryStage').textContent=p.stage; $('entryStage').className='stage '+(p.stage==='PULLBACK'?'warn':p.opp>=80?'good':'');
    $('bestEntry').textContent=p.stage==='PULLBACK'?fmtIDR(((p.zoneLow+p.zoneHigh)/2)*1000000):fmtIDR(state.price*1000000);
    $('profitOpp').textContent=p.opp+'/100'; $('marketPressure').textContent=(p.pressure>=60?'BUY ':p.pressure<=40?'SELL ':'NEUTRAL ')+Math.round(p.pressure); $('rrPotential').textContent=p.rr.toFixed(1)+'R'; $('entryWindowMeter').style.width=p.opp+'%';
    $('entryHint').textContent=p.stage==='PULLBACK'?'Breakout sudah terlalu jauh. Tunggu pullback/retest ke zona entry.':p.chase?'Harga terlalu jauh dari EMA20 atau RR mengecil. Jangan chase.':p.opp>=80?'Peluang masih menarik. Early entry boleh dilakukan dengan exposure terbatas.':'Menunggu momentum/volume/struktur lebih selaras.';
  }
  function journalAdd(side,entry,exit,pnl,score,reason){
    state.journal.unshift({time:new Date().toLocaleTimeString('id-ID'),symbol:state.symbol,side,entry,exit,pnl,score,reason}); state.journal=state.journal.slice(0,30);
    const wins=state.journal.filter(x=>x.pnl>0).length, total=state.journal.length; $('journalStats').textContent=total+' trades · '+(total?Math.round(wins/total*100):0)+'% win'; $('journalList').innerHTML=state.journal.map(x=>'<div class="journal-row"><b>'+x.symbol+' '+x.side+'</b><span class="'+(x.pnl>=0?'good':'danger')+'">'+(x.pnl>=0?'+':'')+fmtIDR(x.pnl)+'</span><span>'+x.score+'/100</span><span>'+x.reason+'</span></div>').join('');
  }
  function maybePaperEarly(x){
    if(!state.paper || state.position || !state.price || Date.now()<state.cooldownUntil || x.score<70 || x.side==='WAIT') return;
    const plan=entryPlan(x); if(plan.chase){return;} if(x.rr<1.5)return;
    const c=currentData.at(-1); if(state.lastEarlyCandle===c.time)return; state.lastEarlyCandle=c.time; state.earlyEntryUsed=true;
    const pct=x.score>=90?0.30:x.score>=80?0.30:0.20; openPosition(x.side,true,pct,x);
  }
  const analyze = () => {
    if(!currentData.length)return;
    const c=currentData[currentData.length-1], prev=currentData[Math.max(0,currentData.length-2)], ema=state.ema20[state.ema20.length-1]||c.close;
    const range=Math.max(c.high-c.low,1), body=Math.abs(c.close-c.open), bodyPct=Math.round(body/range*100), upper=Math.max(0,c.high-Math.max(c.open,c.close))/range*100, lower=Math.max(0,Math.min(c.open,c.close)-c.low)/range*100;
    const closed=currentData.length>1?currentData[currentData.length-2]:c, closedPrev=currentData.length>2?currentData[currentData.length-3]:closed;
    const closedEma=state.ema20.length>1?state.ema20[state.ema20.length-2]:closed.close, closedBull=closed.close>=closed.open;
    state.confirmedSide=closed.close>=closedEma&&closedBull?'BUY':(closed.close<closedEma&&!closedBull?'SELL':'WAIT');
    $('tfLive').textContent=c.close>=c.open?'BULLISH ↑':'BEARISH ↓'; $('tfLive').className=c.close>=c.open?'tf-good':'tf-bad';
    $('tfConfirmed').textContent=state.confirmedSide==='WAIT'?'WAIT / MIXED':state.confirmedSide+' ✓'; $('tfConfirmed').className=state.confirmedSide==='BUY'?'tf-good':state.confirmedSide==='SELL'?'tf-bad':'tf-warn';
    $('tfNext').textContent=c.close>=ema?'BUY BIAS ↑':'SELL BIAS ↓'; $('tfNext').className=c.close>=ema?'tf-good':'tf-bad';
    $('tfEma').textContent=c.close>=ema?'ABOVE EMA20':'BELOW EMA20'; $('tfEma').className=c.close>=ema?'tf-good':'tf-bad';
    const cr=Math.max(closed.high-closed.low,1), cu=(closed.high-Math.max(closed.open,closed.close))/cr*100, cl=(Math.min(closed.open,closed.close)-closed.low)/cr*100;
    $('tfStructure').textContent=closed.close>closedPrev.high?'BREAK ↑':closed.close<closedPrev.low?'BREAK ↓':closed.close>closedPrev.close?'HH/HL BIAS':'LH/LL BIAS';
    $('tfWick').textContent=cl>45?'LOWER REJECT':cu>45?'UPPER REJECT':'BALANCED'; $('tfVolume').textContent=closed.volume>=closedPrev.volume?'EXPANDING':'NORMAL';
    update15mCountdown(c.time);
    const bullish=c.close>=c.open, above=c.close>=ema, momentum=Math.max(20,Math.min(95,50+(above?18:-18)+(bullish?12:-12)+Math.min(15,bodyPct/6)));
    const score=Math.round((above?45:20)+(bullish?25:10)+(c.close>=prev.close?15:5)+Math.min(15,bodyPct/7));
    const side=score>=55?'BUY':'SELL';
    $('finalSignal').textContent=side; $('score').textContent=score+'/100'; $('meter').style.width=score+'%'; $('trendSignal').textContent=(above?'BUY ↑':'SELL ↓'); $('liveSignal').textContent=side+' '+Math.min(99,Math.max(1,Math.round(score)))+'/100'; $('nextSignal').textContent=side;
    $('trendCard').textContent=above?'BUY ↑':'SELL ↓'; $('candleCard').textContent=side+' '+score+'/100'; $('candleDesc').textContent=(bullish?'Body naik':'Body turun')+' · upper '+Math.round(upper)+'% · lower '+Math.round(lower)+'%'; $('momentumCard').textContent=(momentum>=55?'BUY ':'SELL ')+Math.round(momentum)+'/100'; $('nextCard').textContent=side;
    $('bodyPct').textContent=(bullish?'Naik':'Turun')+' ('+bodyPct+'%)'; $('upperPct').textContent=Math.round(upper)+'%'; $('lowerPct').textContent=Math.round(lower)+'%'; $('closePos').textContent=Math.round((c.close-c.low)/range*100)+'%'; $('popupSide').textContent=side;
    $('chartSignal').innerHTML='Supertrend (B/S) 10 3 <b style="color:'+(side==='BUY'?'#00df93':'#ff4d6b')+'">'+side+'</b>'; $('ohlc').textContent='O '+fmtIDR(c.open*1000000)+' H '+fmtIDR(c.high*1000000)+' L '+fmtIDR(c.low*1000000)+' C '+fmtIDR(c.close*1000000);
    const early=earlyScoreFor(currentData); updateEarlyUI(early); updateSmartUI(early); if(c.time!==state.lastEarlyCandle && early.score>=70) maybePaperEarly(early);
    updateRisk(c.close, side);
  };
  function updateRisk(p,side){const sl=side==='BUY'?p*.992:p*1.008,tp=side==='BUY'?p*1.016:p*.984;$('slValue').textContent=fmtIDR(sl*1000000);$('tpValue').textContent=fmtIDR(tp*1000000+'');}

  function update15mCountdown(timeSec){const now=Math.floor(Date.now()/1000), start=timeSec||now, elapsed=Math.max(0,now-start)%900, remain=900-elapsed; const mm=String(Math.floor(remain/60)).padStart(2,'0'),ss=String(remain%60).padStart(2,'0'); $('tfCountdown').textContent=mm+':'+ss; $('tfProgress').style.width=((elapsed/900)*100).toFixed(1)+'%';}
  async function loadSymbol(symbol=state.symbol){ state.interval='15m';
    try{
      const m=await marketApi(symbol,state.interval,260); const ks=m.klines, t=m.ticker||{};
      currentData=normalizeKlines(ks,260).map(k=>({time:k[0]/1000,open:+k[1],high:+k[2],low:+k[3],close:+k[4],volume:+k[5]})); state.candles=currentData;
      const last=currentData.at(-1);
      state.price=Number(t.lastPrice||last?.close||0);state.high=Number(t.highPrice||last?.high||0);state.low=Number(t.lowPrice||last?.low||0);state.vol=Number(t.volume||last?.volume||0);
      candleSeries.setData(currentData); const ema=calcEMA(currentData.map(x=>x.close));state.ema20=ema;emaSeries.setData(currentData.map((x,i)=>({time:x.time,value:ema[i]}))); chart.timeScale().fitContent(); updateHeader(t); analyze(); renderSR(); renderOverlay();
      $('ohlc').textContent='O '+fmtIDR(currentData.at(-1).open*16000)+' H '+fmtIDR(currentData.at(-1).high*16000)+' L '+fmtIDR(currentData.at(-1).low*16000)+' C '+fmtIDR(currentData.at(-1).close*16000);
    }catch(e){
      $('ohlc').textContent='Binance Futures: '+e.message;
      $('chartSignal').textContent='BINANCE DATA ERROR';
      drawChart();
      toast('Market data gagal: '+e.message);
      console.warn('loadSymbol failed:',e);
    }
  }
  function updateHeader(t){const last=Number(t.lastPrice||state.price||0);$('pairLabel').textContent=state.symbol;$('chartPair').textContent=state.symbol+' · '+state.interval+' · Binance Futures → Neon · v8.7.1';$('topPrice').textContent=fmtIDR(last*16000);$('topChange').textContent=(+t.priceChangePercent>=0?'+':'')+Number(t.priceChangePercent||0).toFixed(2)+'%';$('high24').textContent=fmtIDR(Number(t.highPrice||state.high||0)*16000);$('low24').textContent=fmtIDR(Number(t.lowPrice||state.low||0)*16000);$('vol24').textContent=Number(t.volume||state.vol||0).toFixed(0)+' '+state.symbol.replace('USDT','');$('orderPrice').textContent=fmtIDR(last*16000);$('posNow').textContent=fmtIDR(last*16000);$('posCurrent').textContent=fmtIDR(last*16000)}
  function renderSR(){const o=$('overlay');o.querySelectorAll('.sr').forEach(x=>x.remove());if(!currentData.length)return;const highs=currentData.slice(-80).map(x=>x.high), lows=currentData.slice(-80).map(x=>x.low);[Math.max(...highs),Math.min(...lows)].forEach((v,i)=>{const d=document.createElement('div');d.className='sr';d.style.position='absolute';d.style.left='0';d.style.right='0';d.style.top=(i?'88%':'13%');d.style.borderTop='1px dashed '+(i?'#00c98a':'#ffb73a');d.style.opacity='.55';d.style.pointerEvents='none';o.appendChild(d)})}
  function renderOverlay(){const o=$('overlay');o.querySelectorAll('.fibline,.trendline').forEach(x=>x.remove());if(!$('fibBtn').classList.contains('active')&&!$('trendBtn').classList.contains('active'))return;const add=(top,text,color,cls)=>{const d=document.createElement('div');d.className=cls;d.style.position='absolute';d.style.left='10%';d.style.right='8%';d.style.top=top;d.style.borderTop='1px dashed '+color;d.style.color=color;d.style.fontSize='9px';d.style.paddingTop='2px';d.textContent=text;o.appendChild(d)};if($('fibBtn').classList.contains('active')){['0%','23.6%','38.2%','50%','61.8%','78.6%','100%'].forEach((x,i)=>add((18+i*10)+'%',x,'#f4b63e','fibline'))}if($('trendBtn').classList.contains('active'))add('48%','Trendline ↗','#20d7ff','trendline')}
  function applyRealtimeCandle(c, closed=false){
    const idx=currentData.findIndex(x=>x.time===c.time); if(idx>=0) currentData[idx]=c; else currentData.push(c); if(currentData.length>260)currentData.shift();
    state.price=c.close; state.candles=currentData; state.ema20=calcEMA(currentData.map(x=>x.close));
    candleSeries.update(c); emaSeries.update({time:c.time,value:state.ema20.at(-1)});
    $('topPrice').textContent=fmtIDR(c.close*16000); $('posNow').textContent=fmtIDR(c.close*16000); $('posCurrent').textContent=fmtIDR(c.close*16000);
    $('ohlc').textContent='O '+fmtIDR(c.open*16000)+' H '+fmtIDR(c.high*16000)+' L '+fmtIDR(c.low*16000)+' C '+fmtIDR(c.close*16000);
    analyze(); if(state.position)updatePosition(); if(closed) toast('Candle 15M ditutup · engine mengevaluasi ulang');
  }
  async function pollMarket(){
    if(realtimeConnected) return;
    try{
      const q='symbol='+encodeURIComponent(state.symbol)+'&interval=15m&limit=3';
      const klines=await api('/fapi/v1/klines?'+q); const k=klines?.at(-1); if(!k)return;
      const c={time:k[0]/1000,open:+k[1],high:+k[2],low:+k[3],close:+k[4],volume:+k[5],closed:Date.now()>=+k[6]};
      await saveNeonCandles(state.symbol,'15m',[c]);
      const prev=currentData.at(-1)?.time; applyRealtimeCandle(c, prev!=null && c.time!==prev);
      realtimeConnected=true;
    }catch(e){ console.warn('Binance REST fallback:',e.message); realtimeConnected=false; }
  }
  function startPolling(){ if(pollTimer)clearInterval(pollTimer); pollTimer=setInterval(pollMarket,5000); pollMarket(); }
  async function wsConnect(){
    if(state.ws)try{state.ws.close()}catch{}; state.interval='15m';
    const cfg=await getBinanceConfig();
    const base=String(cfg.marketWsUrl || cfg.wsUrl || 'wss://fstream.binance.com/market').replace(/\/$/,'');
    const wsUrl=base.endsWith('/market') ? base+'/ws/'+state.symbol.toLowerCase()+'@kline_15m' : base+'/market/ws/'+state.symbol.toLowerCase()+'@kline_15m';
    try{
      state.ws=new WebSocket(wsUrl);
      state.ws.onopen=()=>{realtimeConnected=true; toast('Binance Futures WebSocket LIVE');};
      state.ws.onmessage=e=>{try{const m=JSON.parse(e.data);const k=m?.k;if(!k)return;const c={time:Number(k.t)/1000,open:+k.o,high:+k.h,low:+k.l,close:+k.c,volume:+k.v,closed:!!k.x};lastWsCandle=c;applyRealtimeCandle(c,!!k.x);saveNeonCandles(state.symbol,'15m',[c]);}catch(err){console.warn('Binance WS message:',err)}};
      state.ws.onerror=()=>{realtimeConnected=false; console.warn('Binance WS error',wsUrl);};
      state.ws.onclose=()=>{realtimeConnected=false; setTimeout(()=>{if(!realtimeConnected) wsConnect()},3000);};
    }catch(e){realtimeConnected=false; console.warn('Binance WS connect:',e.message);}
    startPolling();
  }
  function openPosition(side,auto=false,pct=1,signal=null){if(state.position){toast('Posisi masih terbuka. Tidak menambah posisi secara buta.');return}const p=state.price, qty=0.0072*pct;const slDist=signal?.slDist||p*.008,tpDist=signal?.tpDist||p*.016;state.position={side,entry:p,qty,opened:Date.now(),allocatedPct:pct,signalScore:signal?.score||state.earlyScore,sl:side==='BUY'?p-slDist:p+slDist,tp1:side==='BUY'?p+tpDist*.65:p-tpDist*.65,tp:side==='BUY'?p+tpDist:p-tpDist,remainingQty:qty,tp1Done:false,be:false,trail:false};$('posStatus').textContent='● '+side;$('posStatus').className=side==='BUY'?'green':'red';$('posEntry').textContent=fmtIDR(p*1000000);$('openCount').textContent='1';$('positionRow').innerHTML='<span><b>'+state.symbol+'</b><small style="display:block;color:#71849b">Perpetual · '+Math.round(pct*100)+'% allocation</small></span><span class="badge">'+side+'</span><span>'+qty.toFixed(6)+'</span><span>'+fmtIDR(p*1000000)+'</span><span id="posCurrent">'+fmtIDR(p*1000000)+'</span><span id="rowPnl" class="green">Rp 0</span><span id="rowRoe" class="green">0.00%</span><span class="green">● Aktif</span>';toast((auto?'Paper Early Entry · ':'Paper ')+side+' '+Math.round(pct*100)+'% · score '+(signal?.score||state.earlyScore));updatePosition()}
  function updatePosition(){if(!state.position)return;const p=state.price,e=state.position.entry,q=state.position.qty;const diff=state.position.side==='BUY'?p-e:e-p;const pnl=diff*q*16000,roe=diff/e*100*10;if(state.paper){const pos=state.position;const dir=pos.side==='BUY'?1:-1;const tp1Hit=dir>0?p>=pos.tp1:p<=pos.tp1;const tpHit=dir>0?p>=pos.tp:p<=pos.tp;const slHit=dir>0?p<=pos.sl:p>=pos.sl;if(tp1Hit&&!pos.tp1Done){pos.tp1Done=true;pos.be=true;pos.sl=e+(dir*e*0.0005);toast('Paper TP1 · 30% profit protected · SL Plus BE');}if(pos.tp1Done&&!pos.trail&&((dir>0?p>=e+pos.tp1-e:p<=e-(pos.tp1-e)))){pos.trail=true;}if(pos.trail){const trail=dir>0?p*0.997:p*1.003;pos.sl=dir>0?Math.max(pos.sl,trail):Math.min(pos.sl,trail);}if(slHit||tpHit){const reason=tpHit?'TP':'SL/Trail';toast('Paper '+reason+' · '+(pnl>=0?'Profit ':'Loss ')+fmtIDR(pnl));journalAdd(pos.side,e,p,pnl,pos.signalScore,reason);if(pnl<0)state.consecutiveLoss++;else state.consecutiveLoss=0;state.dailyLoss+=Math.min(0,pnl);state.position=null;state.cooldownUntil=Date.now()+60000;$('posStatus').textContent='● FLAT';$('posStatus').className='green';$('posEntry').textContent='—';$('posPnl').textContent='Rp 0';$('posRoe').textContent='0.00%';$('openCount').textContent='0';return;}}$('posPnl').textContent=(pnl>=0?'+':'')+fmtIDR(pnl);$('posPnl').className=pnl>=0?'green':'red';$('posRoe').textContent=(roe>=0?'+':'')+roe.toFixed(2)+'%';$('posRoe').className=roe>=0?'green':'red';const rp=$('rowPnl'),rr=$('rowRoe');if(rp){rp.textContent=(pnl>=0?'+':'')+fmtIDR(pnl);rp.className=pnl>=0?'green':'red';rr.textContent=(roe>=0?'+':'')+roe.toFixed(2)+'%';rr.className=roe>=0?'green':'red'}$('slValue').textContent=fmtIDR((state.position?.sl||0)*1000000);$('tpValue').textContent=fmtIDR((state.position?.tp||0)*1000000)+' · '+(state.position?.trail?'TRAIL':'TP1→BE')}
  function closePosition(){if(!state.position){toast('Tidak ada posisi terbuka');return}updatePosition();const p=state.price,e=state.position.entry,q=state.position.qty;const diff=state.position.side==='BUY'?p-e:e-p;const pnl=diff*q*16000;toast('Posisi ditutup · '+(pnl>=0?'Profit ':'Loss ')+fmtIDR(pnl));state.position=null;$('posStatus').textContent='● FLAT';$('posStatus').className='green';$('posEntry').textContent='—';$('posPnl').textContent='Rp 0';$('posRoe').textContent='0.00%';$('openCount').textContent='0';$('positionRow').innerHTML='<span>—</span><span>—</span><span>—</span><span>—</span><span id="posCurrent">'+fmtIDR(state.price*16000)+'</span><span>—</span><span>—</span><span>—</span>'}
  async function scanner(){try{
    const data=await market24(); const raw=data.filter(x=>x.symbol.endsWith('USDT')).filter(x=>+x.quoteVolume>10000000).sort((a,b)=>Math.abs(+b.priceChangePercent)-Math.abs(+a.priceChangePercent)).slice(0,8);
    const scored=await Promise.all(raw.map(async x=>{try{const mk=await marketApi(x.symbol,'15m',40);const d=mk.klines.map(k=>({time:k[0]/1000,open:+k[1],high:+k[2],low:+k[3],close:+k[4],volume:+k[5]}));const e=earlyScoreFor(d);return {...x,e,rank:e.score+(Math.abs(+x.priceChangePercent)>2?5:0)}}catch{return {...x,e:{score:0,side:'WAIT',momentum:0,volume:0,structure:'ERR',breakout:'—'},rank:0}}}));
    scored.sort((a,b)=>b.rank-a.rank); $('scannerList').innerHTML=scored.map(x=>'<div class="scanrow"><span class="pairname">'+x.symbol+'<small style="display:block;color:#66798f">'+x.e.side+' '+x.e.score+'/100</small></span><span class="'+(x.e.side==='BUY'?'green':x.e.side==='SELL'?'red':'')+'">'+x.e.momentum+'</span><button data-s="'+x.symbol+'">Open</button></div>').join('');
    $('scannerList').querySelectorAll('button').forEach(b=>b.onclick=()=>switchSymbol(b.dataset.s));
    if(state.paper&&!state.position){const candidate=scored[0]; if(candidate&&candidate.e.score>=70&&candidate.symbol!==state.symbol){await switchSymbol(candidate.symbol,true);setTimeout(()=>{if(state.paper&&!state.position&&state.price){const x=earlyScoreFor(currentData);maybePaperEarly(x)}},500)}}
  }catch(e){console.warn(e)}}
  function runBacktest(){
    const data=currentData.slice(-200); if(data.length<40){$('backtestResult').textContent='Data 15M belum cukup untuk backtest.';return;}
    let wins=0,losses=0,pnl=0,peak=0,maxDD=0,streak=0,maxStreak=0;
    for(let i=22;i<data.length-1;i++){const x=earlyScoreFor(data.slice(0,i+1)); if(x.score<70||x.side==='WAIT'||x.rr<1.5)continue; const e=data[i].close, dir=x.side==='BUY'?1:-1, sl=x.slDist, tp=x.tpDist; let out=0; for(let j=i+1;j<data.length;j++){const c=data[j];if(dir>0&&c.low<=e-sl){out=-1;break}if(dir<0&&c.high>=e+sl){out=-1;break}if(dir>0&&c.high>=e+tp){out=x.rr;break}if(dir<0&&c.low<=e-tp){out=x.rr;break}} if(!out)continue; pnl+=out; peak=Math.max(peak,pnl); maxDD=Math.max(maxDD,peak-pnl); if(out>0){wins++;streak=0}else{losses++;streak++;maxStreak=Math.max(maxStreak,streak)}}
    const total=wins+losses, wr=total?wins/total*100:0, pf=losses?((pnl+losses)/losses):0; $('backtestResult').innerHTML='<b>'+total+' trades</b> · Win rate <b>'+wr.toFixed(1)+'%</b> · Net R <b>'+pnl.toFixed(2)+'</b><br>Profit Factor <b>'+pf.toFixed(2)+'</b> · Max DD <b>'+maxDD.toFixed(2)+'R</b> · Max Consecutive Loss <b>'+maxStreak+'</b>'; toast('Backtest 15M selesai');
  }
  async function switchSymbol(symbol,auto=false){state.symbol=symbol;$('pairLabel').textContent=symbol;await loadSymbol(symbol);wsConnect();toast((auto?'Paper Engine auto-switch → ':'Pair → ')+symbol)}
  document.querySelectorAll('.tf button').forEach(b=>b.onclick=()=>{if(b.textContent!=='15m'){toast('ILHAM NOVANDI 15M Focus: timeframe lain dikunci.');return}document.querySelectorAll('.tf button').forEach(x=>x.classList.remove('active'));b.classList.add('active');state.interval='15m';loadSymbol();wsConnect()});
$('panicBtn').onclick=closePosition;$('closePopup').onclick=()=>$('candlePopup').classList.remove('show');$('candleBtn').onclick=()=>$('candlePopup').classList.toggle('show');['fibBtn','trendBtn','srBtn','emaBtn','superBtn'].forEach(id=>$(id).onclick=()=>{$(id).classList.toggle('active');if(id==='emaBtn')emaSeries.applyOptions({visible:$(id).classList.contains('active')});if(id==='srBtn')renderSR();else renderOverlay()});$('paperBtn').onclick=()=>{state.paper=!state.paper;$('paperBtn').textContent='Paper Engine: '+(state.paper?'ON':'OFF');toast('Paper Engine '+(state.paper?'aktif':'nonaktif'))};$('modalClose').onclick=()=>$('modal').classList.remove('show');
  async function backend(path, options={}){
    const r=await fetch(path,{headers:{'Content-Type':'application/json',...(options.headers||{})},...options});
    const data=await r.json().catch(()=>({error:'Respons server tidak valid'}));
    if(!r.ok) throw new Error(data.error||'Backend error');
    return data;
  }
  async function refreshAccount(){
    try{
      const st=await backend('/api/binance?action=status');
      const status=$('accountStatus'); status.textContent=st.configured?(st.liveEnabled?'Backend Binance LIVE siap':'Backend Binance terhubung · Live OFF'):'Backend ada, API key belum dikonfigurasi'; status.className='account-status '+(st.configured?'ok':'bad');
      if(st.configured){
        const a=await backend('/api/binance?action=account');
        $('accountWallet').textContent=fmtIDR(Number(a.walletBalance)*16000);
        $('accountAvailable').textContent=fmtIDR(Number(a.availableBalance)*16000);
        $('accountMargin').textContent=fmtIDR(Number(a.marginBalance)*16000);
        $('accountPnl').textContent=fmtIDR(Number(a.unrealizedPnl)*16000);
      } else { ['accountWallet','accountAvailable','accountMargin','accountPnl'].forEach(id=>$(id).textContent='—'); }
    }catch(e){$('accountStatus').textContent=e.message;$('accountStatus').className='account-status bad'}
  }
  async function liveOrder(side){
    if(state.paper){ openPosition(side); return; }
    if(!state.price){toast('Harga belum siap');return}
    const qty=Number(($('orderQty').textContent||'0').replace(/[^0-9.]/g,''))||0.0072;
    if(!confirm('Kirim MARKET '+side+' '+state.symbol+' ke akun Binance LIVE?')) return;
    try{
      const st=await backend('/api/binance?action=status');
      if(!st.liveEnabled) throw new Error('Live trading masih OFF di Vercel.');
      const order=await backend('/api/binance?action=bracket',{method:'POST',headers:{'x-live-confirm':'ILHAM-NOVANDI-LIVE'},body:JSON.stringify({symbol:state.symbol,side,quantity,entryPrice:state.price})});
      toast('LIVE '+side+' + SL/TP aktif · Order '+(order.open?.orderId||'OK')); await refreshAccount();
    }catch(e){toast('LIVE gagal: '+e.message)}
  }
  async function liveClose(){
    if(state.paper){closePosition();return}
    if(!confirm('Tutup posisi '+state.symbol+' di Binance LIVE sekarang?'))return;
    try{const r=await backend('/api/binance?action=close',{method:'POST',headers:{'x-live-confirm':'ILHAM-NOVANDI-LIVE'},body:JSON.stringify({symbol:state.symbol})});toast('LIVE posisi ditutup · Order '+(r.orderId||'OK'));await refreshAccount()}catch(e){toast('LIVE close gagal: '+e.message)}
  }
  async function protectLive(mode){
    if(state.paper){
      if(!state.position){toast('Paper: tidak ada posisi untuk dilindungi');return}
      const p=state.position, entry=p.entry, buffer=mode==='breakeven'?0.05:0;
      if(mode==='breakeven') toast('Paper SL Plus → BE '+(p.side==='BUY'?'↑':'↓')+' dengan buffer 0.05%');
      else toast('Paper trailing stop aktif · callback 0.5%');
      return;
    }
    if(!state.price){toast('Harga belum siap');return}
    if(!confirm(mode==='breakeven'?'Pindahkan SL LIVE ke Break Even + 0.05%?':'Aktifkan TRAILING STOP LIVE callback 0.5%?'))return;
    try{
      const r=await backend('/api/binance?action=protect',{method:'POST',headers:{'x-live-confirm':'ILHAM-NOVANDI-LIVE'},body:JSON.stringify({symbol:state.symbol,mode,bufferPct:0.05,callbackRate:0.5})});
      toast(mode==='breakeven'?'LIVE SL Plus aktif':'LIVE trailing stop aktif'); await refreshAccount();
    }catch(e){toast('Risk action gagal: '+e.message)}
  }
  $('buyBtn').onclick=()=>liveOrder('BUY'); $('sellBtn').onclick=()=>liveOrder('SELL'); $('closePosition').onclick=liveClose; $('panicBtn').onclick=liveClose; $('beBtn').onclick=()=>protectLive('breakeven'); $('trailBtn').onclick=()=>protectLive('trailing');
  $('backtestBtn').onclick=runBacktest;
  $('accountBtn').onclick=()=>{$('modal').classList.add('show');refreshAccount()};
  $('liveOk').onclick=async()=>{try{const st=await backend('/api/binance?action=status');if(!st.configured||!st.liveEnabled)throw new Error('Backend live belum diaktifkan.');if(!confirm('Aktifkan LIVE MODE pada browser ini? Order berikutnya dapat menggunakan uang nyata.'))return;state.paper=false;$('paperBtn').textContent='Paper Engine: OFF · LIVE';toast('LIVE MODE aktif');$('modal').classList.remove('show')}catch(e){toast(e.message)}};
  $('paperOk').onclick=()=>{state.paper=true;$('paperBtn').textContent='Paper Engine: ON';$('modal').classList.remove('show');toast('Paper Mode aktif')};

  $('chartPanel').addEventListener('dblclick',()=>toast('Chart tools: Fib, Trendline, Auto S/R, EMA20 tersedia di toolbar.'));
  window.addEventListener('resize',resizeChartCanvas);
  // Binance Futures WebSocket is started independently of historical REST/archive.
  // This is critical when Binance REST returns HTTP 451 in the deployment region.
  wsConnect();
  loadSymbol().then(()=>{if(lastWsCandle) applyRealtimeCandle(lastWsCandle,false); scanner();setInterval(scanner,30000);setInterval(()=>{if(document.visibilityState==='visible')refreshAccount()},10000)}).catch(e=>console.warn('Initial market load:',e.message));
})();

export type Candle={time:number;open:number;high:number;low:number;close:number};
export type Check={name:string;value:string;bull:boolean;bear:boolean};
export type Signal={side:'LONG'|'SHORT';entry:number;sl:number;tp1:number;tp2:number;tp3:number;time:number;reason:string;score:number};
export type Analysis={signal:Signal|null;checks:Check[];structureChecks:Check[];atr:number|null;bullScore:number;bearScore:number;structureBull:number;structureBear:number};
function ema(v:number[],n:number){const k=2/(n+1);let p=v[0];return v.map((x,i)=>p=i===0?x:p+(x-p)*k)}
function rsi(v:number[],n=14){let gain=0,loss=0;const out=Array(v.length).fill(50);for(let i=1;i<v.length;i++){const d=v[i]-v[i-1],g=Math.max(d,0),l=Math.max(-d,0);if(i<=n){gain+=g;loss+=l;if(i===n){gain/=n;loss/=n}}else{gain=(gain*(n-1)+g)/n;loss=(loss*(n-1)+l)/n}if(i>=n)out[i]=loss===0?(gain===0?50:100):100-100/(1+gain/loss)}return out}
function wilder(v:number[],n:number){const out=Array(v.length).fill(0);if(v.length<n)return out;let sum=0;for(let i=0;i<n;i++)sum+=v[i];out[n-1]=sum/n;for(let i=n;i<v.length;i++)out[i]=(out[i-1]*(n-1)+v[i])/n;return out}
export function analyzeDetailed(c:Candle[]):Analysis{const empty={signal:null,checks:[],structureChecks:[],atr:null,bullScore:0,bearScore:0,structureBull:0,structureBear:0};if(c.length<210)return empty;const close=c.map(x=>x.close),e20=ema(close,20),e50=ema(close,50),e200=ema(close,200),r=rsi(close);const e12=ema(close,12),e26=ema(close,26),macd=e12.map((x,i)=>x-e26[i]),macdSignal=ema(macd,9),hist=macd.map((x,i)=>x-macdSignal[i]);const tr=c.map((x,i)=>i?Math.max(x.high-x.low,Math.abs(x.high-c[i-1].close),Math.abs(x.low-c[i-1].close)):x.high-x.low);const atr=wilder(tr,14);const plusDM=c.map((x,i)=>i&&x.high-c[i-1].high>c[i-1].low-x.low?Math.max(x.high-c[i-1].high,0):0);const minusDM=c.map((x,i)=>i&&c[i-1].low-x.low>x.high-c[i-1].high?Math.max(c[i-1].low-x.low,0):0);const atrSm=wilder(tr,14),plusSm=wilder(plusDM,14),minusSm=wilder(minusDM,14);const dx=tr.map((_,i)=>{const p=atrSm[i]?100*plusSm[i]/atrSm[i]:0,m=atrSm[i]?100*minusSm[i]/atrSm[i]:0;return p+m?100*Math.abs(p-m)/(p+m):0});const adx=wilder(dx.slice(14),14);const i=c.length-1,adxNow=adx[i-14]||0;const checks:Check[]=[{name:'EMA 20 / 50 / 200',value:'Trendfilter',bull:e20[i]>e50[i]&&e50[i]>e200[i]&&close[i]>e20[i],bear:e20[i]<e50[i]&&e50[i]<e200[i]&&close[i]<e20[i]},{name:'RSI (14)',value:r[i].toFixed(1),bull:r[i]>=52&&r[i]<=70,bear:r[i]<=48&&r[i]>=30},{name:'MACD (12/26/9)',value:hist[i].toFixed(5),bull:macd[i]>macdSignal[i]&&hist[i]>hist[i-1],bear:macd[i]<macdSignal[i]&&hist[i]<hist[i-1]},{name:'ADX (14)',value:adxNow.toFixed(1),bull:adxNow>=20&&plusSm[i]>minusSm[i],bear:adxNow>=20&&minusSm[i]>plusSm[i]},{name:'EMA20 Momentum',value:'Kerzenschluss',bull:close[i]>close[i-1]&&close[i]>e20[i],bear:close[i]<close[i-1]&&close[i]<e20[i]}];// Price-action filters are deterministic approximations, not institutional order-flow data.
const lookback=c.slice(i-48,i), recent=c.slice(i-20,i);
const resistance=Math.max(...lookback.map(x=>x.high)),support=Math.min(...lookback.map(x=>x.low));
const tolerance=atr[i]*0.6;
// A breakout/retest near an observed swing level is a directional S/R confirmation.
const srBull=close[i]>resistance || (Math.abs(close[i]-support)<tolerance && close[i]>c[i].open);
const srBear=close[i]<support || (Math.abs(close[i]-resistance)<tolerance && close[i]<c[i].open);
// Three-candle imbalance (FVG) from the last 20 completed candles, with proximity check.
const gaps:{bull:boolean;low:number;high:number}[]=[];
for(let j=Math.max(2,i-19);j<=i;j++){
 if(c[j].low>c[j-2].high)gaps.push({bull:true,low:c[j-2].high,high:c[j].low});
 if(c[j].high<c[j-2].low)gaps.push({bull:false,low:c[j].high,high:c[j-2].low});
}
const nearGap=(bull:boolean)=>gaps.some(g=>g.bull===bull && (bull?close[i]>=g.low:close[i]<=g.high) && Math.min(Math.abs(close[i]-g.low),Math.abs(close[i]-g.high))<=atr[i]*1.5);
// Order block proxy: last opposite candle before a strong displacement (>= 1.2 ATR).
const blocks:{bull:boolean;low:number;high:number}[]=[];
for(let j=Math.max(1,i-24);j<i;j++){
 const prev=c[j-1],next=c[j];
 if(prev.close<prev.open && next.close>next.open && next.close-prev.high>atr[j]*0.4 && next.close-next.open>atr[j]*1.2)blocks.push({bull:true,low:prev.low,high:prev.high});
 if(prev.close>prev.open && next.close<next.open && prev.low-next.close>atr[j]*0.4 && next.open-next.close>atr[j]*1.2)blocks.push({bull:false,low:prev.low,high:prev.high});
}
const nearBlock=(bull:boolean)=>blocks.some(b=>b.bull===bull && (bull?close[i]>=b.low:close[i]<=b.high) && Math.min(Math.abs(close[i]-b.low),Math.abs(close[i]-b.high))<=atr[i]*1.5);
// Sweep of a previous 20-bar extreme followed by a close back inside the range.
const priorHigh=Math.max(...recent.map(x=>x.high)),priorLow=Math.min(...recent.map(x=>x.low));
const sweepBull=c[i].low<priorLow && close[i]>priorLow && close[i]>c[i].open;
const sweepBear=c[i].high>priorHigh && close[i]<priorHigh && close[i]<c[i].open;
const structureChecks:Check[]=[
 {name:'Support / Resistance',value:`S ${support.toFixed(4)} · R ${resistance.toFixed(4)}`,bull:srBull,bear:srBear},
 {name:'Order Block (Proxy)',value:'Impuls + Rücklauf',bull:nearBlock(true),bear:nearBlock(false)},
 {name:'Fair Value Gap (FVG)',value:'3-Kerzen-Ungleichgewicht',bull:nearGap(true),bear:nearGap(false)},
 {name:'Liquidity Sweep',value:'20-Kerzen-Extrem',bull:sweepBull,bear:sweepBear}
];
const structureBull=structureChecks.filter(x=>x.bull).length,structureBear=structureChecks.filter(x=>x.bear).length;
const bullScore=checks.filter(x=>x.bull).length,bearScore=checks.filter(x=>x.bear).length;const bullish=bullScore>=4&&checks[0].bull&&checks[3].bull&&structureBull>=2,bearish=bearScore>=4&&checks[0].bear&&checks[3].bear&&structureBear>=2;let signal:Signal|null=null;if((bullish||bearish)&&atr[i]>0){const side=bullish?'LONG':'SHORT',dir=bullish?1:-1,entry=close[i],risk=atr[i]*1.5;signal={side,entry,sl:entry-dir*risk,tp1:entry+dir*risk,tp2:entry+dir*2*risk,tp3:entry+dir*3*risk,time:c[i].time,reason:'Mindestens 4/5 Indikatoren (EMA und ADX Pflicht) sowie 2/4 Price-Action-Filter bestätigt. SL = 1,5 × ATR(14); TP1/2/3 = 1R/2R/3R.',score:bullish?bullScore:bearScore}}return {signal,checks,structureChecks,atr:atr[i],bullScore,bearScore,structureBull,structureBear}}
export function analyze(c:Candle[]):Signal|null{return analyzeDetailed(c).signal}

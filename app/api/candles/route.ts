import {NextRequest,NextResponse} from 'next/server';
export const dynamic='force-dynamic';
const symbols:Record<string,string>={EURUSD:'EUR/USD',GBPUSD:'GBP/USD',USDJPY:'USD/JPY',AUDUSD:'AUD/USD'};
type Candle={time:number;open:number;high:number;low:number;close:number};
export async function GET(req:NextRequest){
 const symbol=req.nextUrl.searchParams.get('symbol')||'EURUSD';
 if(!symbols[symbol])return NextResponse.json({error:'Unbekanntes Symbol'},{status:400});
 const key=process.env.TWELVEDATA_API_KEY;
 if(!key)return NextResponse.json({error:'TWELVEDATA_API_KEY fehlt.'},{status:503});
 try{
  const url=new URL('https://api.twelvedata.com/time_series');
  for(const [k,v] of Object.entries({symbol:symbols[symbol],interval:'1h',outputsize:'350',apikey:key,timezone:'UTC'}))url.searchParams.set(k,v);
  const response=await fetch(url,{next:{revalidate:3600}});
  const data=await response.json();
  if(!response.ok||data.status==='error'||!Array.isArray(data.values))return NextResponse.json({error:data.message||'Keine Marktdaten verfügbar.'},{status:502});
  const now=Math.floor(Date.now()/1000);
  const unique=new Map<number,Candle>();
  for(const item of data.values){
   // Twelve Data's datetime is the UTC start of a one-hour candle.
   const timestamp=Date.parse(String(item.datetime).replace(' ','T')+'Z');
   const time=Math.floor(timestamp/1000);
   const candle={time,open:Number(item.open),high:Number(item.high),low:Number(item.low),close:Number(item.close)};
   if(!Number.isFinite(timestamp)||time%3600!==0||time+3600>now)continue;
   if(!Object.values(candle).every(Number.isFinite))continue;
   if(candle.low>Math.min(candle.open,candle.close)||candle.high<Math.max(candle.open,candle.close)||candle.low>candle.high)continue;
   unique.set(time,candle);
  }
  const candles=[...unique.values()].sort((a,b)=>a.time-b.time);
  if(candles.length<210)return NextResponse.json({error:'Zu wenige gültige abgeschlossene 1H-Kerzen für die Analyse.'},{status:502});
  return NextResponse.json({symbol,candles,updatedAt:new Date().toISOString(),lastCandleAt:new Date(candles[candles.length-1].time*1000).toISOString(),source:'Twelve Data · 1H · abgeschlossene Kerzen',interval:'1h'},{headers:{'Cache-Control':'public, s-maxage=3600, stale-while-revalidate=300'}});
 }catch{return NextResponse.json({error:'Datenanbieter momentan nicht erreichbar.'},{status:502});}
}

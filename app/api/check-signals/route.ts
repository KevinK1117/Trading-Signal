
import { NextRequest, NextResponse } from 'next/server';
import { analyzeDetailed, type Candle } from '../../../lib/signals';
import {
  calculateRiskLevels,
  type TradingSymbol
} from '../../../lib/risk';
import { sendSignalEmail } from '../../../lib/mailer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const markets: TradingSymbol[] = [
  'EURUSD',
  'GBPUSD',
  'USDJPY',
  'AUDUSD',
  'XAUUSD',
  'BTCUSD',
  'ETHUSD'
];

const providerSymbols: Record<TradingSymbol, string> = {
  EURUSD: 'EUR/USD',
  GBPUSD: 'GBP/USD',
  USDJPY: 'USD/JPY',
  AUDUSD: 'AUD/USD',
  XAUUSD: 'XAU/USD',
  BTCUSD: 'BTC/USD',
  ETHUSD: 'ETH/USD'
};

const broker = 'roboforex' as const;

function isCrypto(symbol: TradingSymbol) {
  return symbol === 'BTCUSD' || symbol === 'ETHUSD';
}

function intervalSeconds(symbol: TradingSymbol) {
  return isCrypto(symbol) ? 1800 : 900;
}

function intervalName(symbol: TradingSymbol) {
  return isCrypto(symbol) ? '30min' : '15min';
}

function timeframeName(symbol: TradingSymbol): 'M15' | 'M30' {
  return isCrypto(symbol) ? 'M30' : 'M15';
}

async function redisCommand(
  ...args: Array<string | number>
): Promise<unknown> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    throw new Error('Upstash nicht konfiguriert');
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(args),
    cache: 'no-store'
  });

  const data = await response.json();

  if (!response.ok || data.error) {
    throw new Error('Upstash-Anfrage fehlgeschlagen');
  }

  return data.result;
}

async function getCandles(
  symbol: TradingSymbol
): Promise<Candle[]> {
  const apiKey = process.env.TWELVEDATA_API_KEY;

  if (!apiKey) {
    throw new Error('Twelve-Data-Key fehlt');
  }

  const seconds = intervalSeconds(symbol);

  const url = new URL(
    'https://api.twelvedata.com/time_series'
  );

  url.searchParams.set(
    'symbol',
    providerSymbols[symbol]
  );
  url.searchParams.set(
    'interval',
    intervalName(symbol)
  );
  url.searchParams.set('outputsize', '350');
  url.searchParams.set('apikey', apiKey);
  url.searchParams.set('timezone', 'UTC');

  const response = await fetch(url.toString(), {
    next: { revalidate: 600 }
  });

  const data = await response.json();

  if (
    !response.ok ||
    data.status === 'error' ||
    !Array.isArray(data.values)
  ) {
    throw new Error(
      data.message || `Keine Daten für ${symbol}`
    );
  }

  const now = Math.floor(Date.now() / 1000);
  const unique = new Map<number, Candle>();

  for (const item of data.values) {
    const parsed = Date.parse(
      String(item.datetime).replace(' ', 'T') + 'Z'
    );

    if (!Number.isFinite(parsed)) continue;

    const time = Math.floor(parsed / 1000);

    const candle: Candle = {
      time,
      open: Number(item.open),
      high: Number(item.high),
      low: Number(item.low),
      close: Number(item.close)
    };

    if (time % seconds !== 0) continue;
    if (time + seconds > now) continue;

    if (
      !Object.values(candle).every(Number.isFinite)
    ) continue;

    if (
      candle.low > Math.min(candle.open, candle.close) ||
      candle.high < Math.max(candle.open, candle.close) ||
      candle.low > candle.high
    ) continue;

    unique.set(time, candle);
  }

  const candles = [...unique.values()].sort(
    (a, b) => a.time - b.time
  );

  if (candles.length < 260) {
    throw new Error(
      `Zu wenige gültige Kerzen für ${symbol}`
    );
  }

  return candles;
}

function isFresh(
  symbol: TradingSymbol,
  candle: Candle
) {
  const age =
    Math.floor(Date.now() / 1000) -
    (candle.time + intervalSeconds(symbol));

  return (
    age >= -60 &&
    age <= (isCrypto(symbol) ? 5400 : 3600)
  );
}

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;

  // Der geheime Schlüssel darf nicht fehlen.
  if (
    !secret ||
    request.headers.get('authorization') !==
      `Bearer ${secret}`
  ) {
    return NextResponse.json(
      { error: 'Nicht autorisiert' },
      { status: 401 }
    );
  }

  const configured = [
    'TWELVEDATA_API_KEY',
    'UPSTASH_REDIS_REST_URL',
    'UPSTASH_REDIS_REST_TOKEN',
    'SMTP_HOST',
    'SMTP_PORT',
    'SMTP_USER',
    'SMTP_PASSWORD',
    'ALERT_EMAIL'
  ].every(name => Boolean(process.env[name]));

  if (!configured) {
    return NextResponse.json(
      { error: 'Server-Konfiguration unvollständig' },
      { status: 503 }
    );
  }

  const report: Array<{
    symbol: string;
    status: string;
  }> = [];

  try {
    // Gleiche Zeitbasis für alle EUR-Umrechnungen.
    const eurCandles = await getCandles('EURUSD');
    const lastEUR = eurCandles.at(-1);

    if (!lastEUR || !isFresh('EURUSD', lastEUR)) {
      return NextResponse.json(
        { error: 'EUR/USD-Umrechnungskurs veraltet' },
        { status: 503 }
      );
    }

    const eurUsd = lastEUR.close;

    for (const symbol of markets) {
      try {
        const candles = symbol === 'EURUSD'
          ? eurCandles
          : await getCandles(symbol);

        const last = candles.at(-1);

        if (!last || !isFresh(symbol, last)) {
          report.push({
            symbol,
            status: 'Veraltete Daten – übersprungen'
          });
          continue;
        }

        const analysis = analyzeDetailed(candles);
        const rawSignal = analysis.signal;

        if (
          !rawSignal ||
          rawSignal.time !== last.time
        ) {
          report.push({
            symbol,
            status: 'Kein neues Signal'
          });
          continue;
        }

        const risk = calculateRiskLevels(
          rawSignal,
          {
            broker,
            symbol,
            eurUsd,
            usdJpy: symbol === 'USDJPY'
              ? last.close
              : undefined,
            atr: analysis.atr
          }
        );

        // Bei extrem engem Stop-Loss keine
        // ungeprüfte E-Mail versenden.
        if (
          analysis.atr !== null &&
          risk.stopDistance < analysis.atr * 0.2
        ) {
          report.push({
            symbol,
            status: 'SL zu eng – übersprungen'
          });
          continue;
        }

        const id = [
          'signaldesk',
          broker,
          symbol,
          timeframeName(symbol),
          rawSignal.side,
          rawSignal.time
        ].join(':');

        // Atomare Reservierung für 5 Minuten.
        // Nur ein gleichzeitiger Aufruf darf senden.
        const reserved = await redisCommand(
          'SET',
          id,
          'sending',
          'EX',
          300,
          'NX'
        );

        if (reserved !== 'OK') {
          report.push({
            symbol,
            status: 'Bereits verarbeitet'
          });
          continue;
        }

        try {
          const signal = risk.signal;

          await sendSignalEmail({
            symbol,
            timeframe: timeframeName(symbol),
            side: signal.side,
            broker: 'RoboForex Pro Demo',
            lots: risk.lots,
            entry: signal.entry,
            sl: signal.sl,
            tp2: signal.tp1,
            tp3: signal.tp2,
            tp4: signal.tp3,
            signalTime: new Date(
              signal.time * 1000
            ).toISOString()
          });

          // Nach erfolgreichem Versand 90 Tage merken.
          await redisCommand(
            'SET',
            id,
            'sent',
            'EX',
            90 * 24 * 60 * 60
          );

          report.push({
            symbol,
            status: 'Neue E-Mail versendet'
          });
        } catch (error) {
          // Wenn der Versand fehlschlägt, ist später
          // ein erneuter Versuch möglich.
          // Bei unklarem Versandstatus sind
          // doppelte E-Mails nicht völlig ausgeschlossen.
          await redisCommand('DEL', id);

          throw error;
        }
      } catch {
        report.push({
          symbol,
          status: 'Prüfung fehlgeschlagen'
        });
      }
    }

    return NextResponse.json({
      checkedAt: new Date().toISOString(),
      broker: 'RoboForex Pro Demo',
      report
    });
  } catch {
    return NextResponse.json(
      { error: 'Signalprüfung fehlgeschlagen' },
      { status: 503 }
    );
  }
}

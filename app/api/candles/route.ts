
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const symbols: Record<string, string> = {
  EURUSD: "EUR/USD",
  GBPUSD: "GBP/USD",
  USDJPY: "USD/JPY",
  AUDUSD: "AUD/USD",
  XAUUSD: "XAU/USD",
  BTCUSD: "BTC/USD",
  ETHUSD: "ETH/USD",
};

type Candle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
};

export async function GET(req: NextRequest) {
  const symbol =
    req.nextUrl.searchParams.get("symbol") || "EURUSD";

  if (!symbols[symbol]) {
    return NextResponse.json(
      { error: "Unbekanntes Symbol" },
      { status: 400 }
    );
  }

  const key = process.env.TWELVEDATA_API_KEY;

  if (!key) {
    return NextResponse.json(
      { error: "TWELVEDATA_API_KEY fehlt." },
      { status: 503 }
    );
  }

  const isCrypto =
    symbol === "BTCUSD" || symbol === "ETHUSD";

  const interval = isCrypto ? "30min" : "15min";
  const intervalSeconds = isCrypto ? 1800 : 900;

  try {
    const url = new URL(
      "https://api.twelvedata.com/time_series"
    );

    const params = {
      symbol: symbols[symbol],
      interval,
      outputsize: "350",
      apikey: key,
      timezone: "UTC",
    };

    for (const [name, value] of Object.entries(params)) {
      url.searchParams.set(name, value);
    }

    const response = await fetch(url, {
      next: { revalidate: 600 },
    });

    const data = await response.json();

    if (
      !response.ok ||
      data.status === "error" ||
      !Array.isArray(data.values)
    ) {
      return NextResponse.json(
        {
          error:
            data.message ||
            "Keine Marktdaten verfügbar.",
        },
        { status: 502 }
      );
    }

    const now = Math.floor(Date.now() / 1000);
    const unique = new Map<number, Candle>();

    for (const item of data.values) {
      const timestamp = Date.parse(
        String(item.datetime).replace(" ", "T") + "Z"
      );

      if (!Number.isFinite(timestamp)) continue;

      const time = Math.floor(timestamp / 1000);

      const candle: Candle = {
        time,
        open: Number(item.open),
        high: Number(item.high),
        low: Number(item.low),
        close: Number(item.close),
      };

      // Nur vollständig abgeschlossene Kerzen.
      if (time % intervalSeconds !== 0) continue;
      if (time + intervalSeconds > now) continue;

      if (
        !Object.values(candle).every(Number.isFinite)
      ) {
        continue;
      }

      if (
        candle.low > Math.min(candle.open, candle.close) ||
        candle.high < Math.max(candle.open, candle.close) ||
        candle.low > candle.high
      ) {
        continue;
      }

      unique.set(time, candle);
    }

    const candles = [...unique.values()].sort(
      (a, b) => a.time - b.time
    );

    if (candles.length < 260) {
      return NextResponse.json(
        {
          error:
            "Zu wenige gültige abgeschlossene Kerzen " +
            "für die EMA-250-Analyse.",
        },
        { status: 502 }
      );
    }

    const lastCandle = candles[candles.length - 1];

    return NextResponse.json(
      {
        symbol,
        candles,
        updatedAt: new Date().toISOString(),
        lastCandleAt: new Date(
          lastCandle.time * 1000
        ).toISOString(),
        source:
          "Twelve Data · " +
          (isCrypto ? "M30" : "M15") +
          " · abgeschlossene Kerzen",
        interval,
      },
      {
        headers: {
          "Cache-Control":
            "public, s-maxage=600, stale-while-revalidate=60",
        },
      }
    );
  } catch {
    return NextResponse.json(
      {
        error:
          "Datenanbieter momentan nicht erreichbar.",
      },
      { status: 502 }
    );
  }
}

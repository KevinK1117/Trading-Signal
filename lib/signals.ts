
export type Candle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
};

export type Check = {
  name: string;
  value: string;
  bull: boolean;
  bear: boolean;
};

export type Signal = {
  side: 'LONG' | 'SHORT';
  entry: number;
  sl: number;
  tp1: number;
  tp2: number;
  tp3: number;
  time: number;
  reason: string;
  score: number;
};

export type Analysis = {
  signal: Signal | null;
  checks: Check[];
  structureChecks: Check[];
  atr: number | null;
  bullScore: number;
  bearScore: number;
  structureBull: number;
  structureBear: number;
  ema60: number[];
  ema125: number[];
  ema250: number[];
  cci: number[];
  macd: number[];
  macdSignal: number[];
  macdHist: number[];
};

export function ema(values: number[], period: number): number[] {
  if (!values.length) return [];
  const k = 2 / (period + 1);
  let previous = values[0];
  return values.map((value, index) => {
    previous = index === 0
      ? value
      : value * k + previous * (1 - k);
    return previous;
  });
}

export function cci(candles: Candle[], period = 14): number[] {
  const typical = candles.map(
    x => (x.high + x.low + x.close) / 3
  );
  const result = Array(candles.length).fill(NaN);

  for (let i = period - 1; i < candles.length; i++) {
    const window = typical.slice(i - period + 1, i + 1);
    const average = window.reduce((a, b) => a + b, 0) / period;
    const deviation = window.reduce(
      (sum, value) => sum + Math.abs(value - average), 0
    ) / period;

    result[i] = deviation > 0
      ? (typical[i] - average) / (0.015 * deviation)
      : 0;
  }

  return result;
}

export function macdValues(values: number[]) {
  const fast = ema(values, 12);
  const slow = ema(values, 26);
  const macd = fast.map((x, i) => x - slow[i]);
  const signal = ema(macd, 9);
  const histogram = macd.map((x, i) => x - signal[i]);

  return { macd, signal, histogram };
}

function atrValues(candles: Candle[], period = 14): number[] {
  const result = Array(candles.length).fill(NaN);
  if (candles.length < period) return result;

  const trueRanges = candles.map((x, i) => {
    if (i === 0) return x.high - x.low;
    const previousClose = candles[i - 1].close;
    return Math.max(
      x.high - x.low,
      Math.abs(x.high - previousClose),
      Math.abs(x.low - previousClose)
    );
  });

  let average = trueRanges
    .slice(0, period)
    .reduce((a, b) => a + b, 0) / period;

  result[period - 1] = average;

  for (let i = period; i < candles.length; i++) {
    average = (average * (period - 1) + trueRanges[i]) / period;
    result[i] = average;
  }

  return result;
}

function swingLow(candles: Candle[], index: number, lookback = 12) {
  const from = Math.max(0, index - lookback);
  return Math.min(...candles.slice(from, index + 1).map(x => x.low));
}

function swingHigh(candles: Candle[], index: number, lookback = 12) {
  const from = Math.max(0, index - lookback);
  return Math.max(...candles.slice(from, index + 1).map(x => x.high));
}

export function analyzeDetailed(candles: Candle[]): Analysis {
  const empty: Analysis = {
    signal: null,
    checks: [],
    structureChecks: [],
    atr: null,
    bullScore: 0,
    bearScore: 0,
    structureBull: 0,
    structureBear: 0,
    ema60: [],
    ema125: [],
    ema250: [],
    cci: [],
    macd: [],
    macdSignal: [],
    macdHist: []
  };

  if (candles.length < 260) return empty;

  const closes = candles.map(x => x.close);
  const ema60 = ema(closes, 60);
  const ema125 = ema(closes, 125);
  const ema250 = ema(closes, 250);
  const cciData = cci(candles, 14);
  const macdData = macdValues(closes);
  const atrData = atrValues(candles);

  const i = candles.length - 1;
  const current = candles[i];
  const previous = candles[i - 1];

  const trendBull =
    current.close > ema60[i] &&
    ema60[i] > ema125[i] &&
    ema125[i] > ema250[i];

  const trendBear =
    current.close < ema60[i] &&
    ema60[i] < ema125[i] &&
    ema125[i] < ema250[i];

  // Rücklauf: Innerhalb der letzten sechs Kerzen muss
  // der Kurs die EMA 60 berührt oder durchquert haben.
  const recentStart = Math.max(1, i - 6);
  let touchedEMA60 = false;

  for (let j = recentStart; j <= i; j++) {
    if (
      candles[j].low <= ema60[j] &&
      candles[j].high >= ema60[j]
    ) {
      touchedEMA60 = true;
      break;
    }
  }

  // Die letzte abgeschlossene Kerze muss den Einstieg
  // in Trendrichtung bestätigen.
  const candleBull =
    current.close > current.open &&
    current.close > previous.close &&
    current.close > ema60[i];

  const candleBear =
    current.close < current.open &&
    current.close < previous.close &&
    current.close < ema60[i];

  const cciBull =
    cciData[i] > 0 &&
    cciData[i] > cciData[i - 1];

  const cciBear =
    cciData[i] < 0 &&
    cciData[i] < cciData[i - 1];

  const macdBull =
    macdData.macd[i] > macdData.signal[i] &&
    macdData.histogram[i] > 0;

  const macdBear =
    macdData.macd[i] < macdData.signal[i] &&
    macdData.histogram[i] < 0;

  const checks: Check[] = [
    {
      name: 'EMA 60 / 125 / 250',
      value: 'Trendrichtung',
      bull: trendBull,
      bear: trendBear
    },
    {
      name: 'Rücklauf + Kerzenbestätigung',
      value: touchedEMA60 ? 'EMA 60 berührt' : 'Kein Rücklauf',
      bull: touchedEMA60 && candleBull,
      bear: touchedEMA60 && candleBear
    },
    {
      name: 'CCI (14)',
      value: Number.isFinite(cciData[i])
        ? cciData[i].toFixed(1)
        : '—',
      bull: cciBull,
      bear: cciBear
    },
    {
      name: 'MACD (12/26/9)',
      value: macdData.histogram[i].toFixed(5),
      bull: macdBull,
      bear: macdBear
    }
  ];

  const bullScore = checks.filter(x => x.bull).length;
  const bearScore = checks.filter(x => x.bear).length;

  const bullish = bullScore === 4;
  const bearish = bearScore === 4;

  let signal: Signal | null = null;

  if ((bullish || bearish) && Number.isFinite(atrData[i])) {
    const side = bullish ? 'LONG' : 'SHORT';
    const entry = current.close;
    const buffer = atrData[i] * 0.1;

    const sl = bullish
      ? swingLow(candles, i, 12) - buffer
      : swingHigh(candles, i, 12) + buffer;

    const risk = Math.abs(entry - sl);

    // Schutz gegen unrealistische bzw. ungültige SL-Abstände.
    const validRisk =
      risk > 0 &&
      risk >= atrData[i] * 0.2 &&
      risk <= atrData[i] * 5;

    if (validRisk) {
      const direction = bullish ? 1 : -1;

      signal = {
        side,
        entry,
        sl,
        tp1: entry + direction * risk * 2,
        tp2: entry + direction * risk * 3,
        tp3: entry + direction * risk * 4,
        time: current.time,
        reason:
          'EMA-Trend, Rücklauf zur EMA 60, CCI und MACD bestätigt. ' +
          'Stop-Loss am lokalen Swing-Punkt mit 0,1 ATR Puffer. ' +
          'Gewinnziele: 2R, 3R oder 4R.',
        score: bullish ? bullScore : bearScore
      };
    }
  }

  return {
    signal,
    checks,
    structureChecks: [],
    atr: Number.isFinite(atrData[i]) ? atrData[i] : null,
    bullScore,
    bearScore,
    structureBull: 0,
    structureBear: 0,
    ema60,
    ema125,
    ema250,
    cci: cciData,
    macd: macdData.macd,
    macdSignal: macdData.signal,
    macdHist: macdData.histogram
  };
}

export function analyze(candles: Candle[]): Signal | null {
  return analyzeDetailed(candles).signal;
}

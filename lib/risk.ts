
import type { Signal } from './signals';

export type Broker = 'roboforex' | 'puprime';

export type TradingSymbol =
  | 'EURUSD'
  | 'GBPUSD'
  | 'USDJPY'
  | 'AUDUSD'
  | 'XAUUSD'
  | 'BTCUSD'
  | 'ETHUSD';

export type RiskResult = {
  signal: Signal;
  broker: Broker;
  symbol: TradingSymbol;
  lots: number;
  riskEUR: number;
  tp2EUR: number;
  tp3EUR: number;
  tp4EUR: number;
  contractSize: number;
  stopDistance: number;
  warnings: string[];
};

type RiskOptions = {
  broker: Broker;
  symbol: TradingSymbol;
  eurUsd: number;
  usdJpy?: number;
  atr?: number | null;
};

// Größe der Position gemäß deinen Vorgaben.
export const LOT_SIZES: Record<TradingSymbol, number> = {
  EURUSD: 0.1,
  GBPUSD: 0.1,
  USDJPY: 0.1,
  AUDUSD: 0.1,
  XAUUSD: 0.01,
  BTCUSD: 0.05,
  ETHUSD: 0.05
};

export const RISK_EUR = 5;

// Standard-Kontraktgrößen.
// RoboForex Pro: veröffentlichte Kontraktspezifikationen.
// PU Prime: Forex/Gold als übliche Standardwerte;
// vor realem Handel in MT4/MT5 bestätigen.
// PU Prime Krypto: bis zur Bestätigung deaktiviert.
const CONTRACT_SIZES: Record<
  Broker,
  Record<TradingSymbol, number | null>
> = {
  roboforex: {
    EURUSD: 100000,
    GBPUSD: 100000,
    USDJPY: 100000,
    AUDUSD: 100000,
    XAUUSD: 100,
    BTCUSD: 1,
    ETHUSD: 10
  },
  puprime: {
    EURUSD: 100000,
    GBPUSD: 100000,
    USDJPY: 100000,
    AUDUSD: 100000,
    XAUUSD: 100,
    BTCUSD: null,
    ETHUSD: null
  }
};

const PRICE_DIGITS: Record<TradingSymbol, number> = {
  EURUSD: 5,
  GBPUSD: 5,
  USDJPY: 3,
  AUDUSD: 5,
  XAUUSD: 2,
  BTCUSD: 2,
  ETHUSD: 2
};

export function calculateRiskLevels(
  original: Signal,
  options: RiskOptions
): RiskResult {
  const { broker, symbol, eurUsd, atr } = options;

  const lots = LOT_SIZES[symbol];
  const contractSize = CONTRACT_SIZES[broker]?.[symbol];

  if (!contractSize || contractSize <= 0) {
    throw new Error(
      'Kontraktgröße für ' +
      symbol +
      ' bei diesem Broker noch nicht bestätigt.'
    );
  }

  if (!Number.isFinite(eurUsd) || eurUsd <= 0) {
    throw new Error(
      'Aktueller EUR/USD-Wechselkurs fehlt.'
    );
  }

  const usdJpy = symbol === 'USDJPY'
    ? options.usdJpy ?? original.entry
    : undefined;

  if (
    symbol === 'USDJPY' &&
    (!usdJpy || !Number.isFinite(usdJpy) || usdJpy <= 0)
  ) {
    throw new Error(
      'Gültiger USD/JPY-Wechselkurs fehlt.'
    );
  }

  // Wert einer Kursänderung von 1,0 in USD.
  // USDJPY notiert in JPY, daher erst JPY -> USD.
  const quoteUnits = lots * contractSize;

  const usdPerPriceUnit = symbol === 'USDJPY'
    ? quoteUnits / (usdJpy as number)
    : quoteUnits;

  // 5 EUR in USD umrechnen.
  const targetRiskUSD = RISK_EUR * eurUsd;

  const rawDistance =
    targetRiskUSD / usdPerPriceUnit;

  if (
    !Number.isFinite(rawDistance) ||
    rawDistance <= 0
  ) {
    throw new Error(
      'SL-Abstand konnte nicht berechnet werden.'
    );
  }

  const digits = PRICE_DIGITS[symbol];
  const tick = 10 ** -digits;

  // Auf den angezeigten Preisschritt abrunden,
  // damit das errechnete Kursrisiko nicht
  // durch die Rundung vergrößert wird.
  const ticks = Math.floor(
    (rawDistance + tick * 1e-7) / tick
  );

  if (ticks < 1) {
    throw new Error(
      '5 EUR Risiko ergibt weniger als einen ' +
      'Preisschritt. Positionsgröße prüfen.'
    );
  }

  const stopDistance = ticks * tick;
  const direction =
    original.side === 'LONG' ? 1 : -1;

  const round = (value: number) =>
    Number(value.toFixed(digits));

  const entry = original.entry;

  const sl = round(
    entry - direction * stopDistance
  );

  const tp1 = round(
    entry + direction * stopDistance * 2
  );

  const tp2 = round(
    entry + direction * stopDistance * 3
  );

  const tp3 = round(
    entry + direction * stopDistance * 4
  );

  const actualRiskEUR =
    (Math.abs(entry - sl) * usdPerPriceUnit) /
    eurUsd;

  const warnings: string[] = [];

  if (
    atr &&
    Number.isFinite(atr) &&
    stopDistance < atr * 0.2
  ) {
    warnings.push(
      'Der Stop-Loss liegt sehr nahe am Einstieg ' +
      'im Verhältnis zur aktuellen Volatilität.'
    );
  }

  if (broker === 'puprime') {
    warnings.push(
      'PU-Prime-Kontraktgröße in der ' +
      'Handelsplattform bestätigen.'
    );
  }

  warnings.push(
    'Spread, Kommission, Slippage und ' +
    'brokerabhängige Mindestabstände ' +
    'sind nicht eingerechnet.'
  );

  return {
    signal: {
      ...original,
      entry,
      sl,
      tp1,
      tp2,
      tp3,
      reason:
        original.reason +
        ' SL auf circa 5 EUR Kursrisiko ' +
        'bei ' + lots + ' Lot berechnet.',
    },
    broker,
    symbol,
    lots,
    riskEUR: actualRiskEUR,
    tp2EUR: actualRiskEUR * 2,
    tp3EUR: actualRiskEUR * 3,
    tp4EUR: actualRiskEUR * 4,
    contractSize,
    stopDistance,
    warnings
  };
}

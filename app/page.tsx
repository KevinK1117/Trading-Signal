
'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react';

import {
  createChart,
  ColorType,
  CrosshairMode,
  LineStyle,
  UTCTimestamp
} from 'lightweight-charts';

import {
  RefreshCw,
  TrendingUp,
  TrendingDown,
  ShieldCheck,
  Clock3,
  BarChart3,
  Target,
  Activity
} from 'lucide-react';

import {
  analyzeDetailed,
  type Candle,
  type Analysis,
  type Signal
} from '../lib/signals';

import {
  calculateRiskLevels,
  LOT_SIZES,
  type Broker,
  type TradingSymbol
} from '../lib/risk';

const markets: {
  id: TradingSymbol;
  flag: string;
  name: string;
}[] = [
  { id: 'EURUSD', flag: '🇪🇺 🇺🇸', name: 'Euro / US-Dollar' },
  { id: 'GBPUSD', flag: '🇬🇧 🇺🇸', name: 'Pfund / US-Dollar' },
  { id: 'USDJPY', flag: '🇺🇸 🇯🇵', name: 'US-Dollar / Yen' },
  { id: 'AUDUSD', flag: '🇦🇺 🇺🇸', name: 'Australischer Dollar / US-Dollar' },
  { id: 'XAUUSD', flag: '🥇 🇺🇸', name: 'Gold / US-Dollar' },
  { id: 'BTCUSD', flag: '₿ 🇺🇸', name: 'Bitcoin / US-Dollar' },
  { id: 'ETHUSD', flag: '◆ 🇺🇸', name: 'Ethereum / US-Dollar' }
];

type RR = 2 | 3 | 4;

const REFRESH_MS = 600000;

const isCrypto = (symbol: TradingSymbol) =>
  symbol === 'BTCUSD' || symbol === 'ETHUSD';

const timeframeOf = (symbol: TradingSymbol) =>
  isCrypto(symbol) ? 'M30' : 'M15';

const secondsOf = (symbol: TradingSymbol) =>
  isCrypto(symbol) ? 1800 : 900;

const cacheKey = (symbol: TradingSymbol) =>
  'signaldesk-candles-v2-' + symbol;

function IndicatorCharts({
  candles,
  analysis,
  signal,
  rr
}: {
  candles: Candle[];
  analysis: Analysis;
  signal: Signal | null;
  rr: RR;
}) {
  const priceRef = useRef<HTMLDivElement>(null);
  const cciRef = useRef<HTMLDivElement>(null);
  const macdRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (
      !priceRef.current ||
      !cciRef.current ||
      !macdRef.current ||
      candles.length < 260
    ) {
      return;
    }

    const elements = [
      priceRef.current,
      cciRef.current,
      macdRef.current
    ];

    const heights = [390, 155, 165];

    const charts = elements.map((element, index) =>
      createChart(element, {
        width: element.clientWidth,
        height: heights[index],
        layout: {
          background: {
            type: ColorType.Solid,
            color: '#ffffff'
          },
          textColor: '#66758a',
          fontSize: 11
        },
        grid: {
          vertLines: { color: '#f1f5f9' },
          horzLines: { color: '#eef2f6' }
        },
        crosshair: {
          mode: CrosshairMode.Normal
        },
        rightPriceScale: {
          borderColor: '#e4eaf1'
        },
        timeScale: {
          borderColor: '#e4eaf1',
          timeVisible: true,
          secondsVisible: false,
          visible: index === 2
        },
        handleScroll: true,
        handleScale: true
      })
    );

    const [priceChart, cciChart, macdChart] = charts;
    const time = (value: number) => value as UTCTimestamp;

    const candleSeries = priceChart.addCandlestickSeries({
      upColor: '#15a76b',
      downColor: '#f05c65',
      wickUpColor: '#15a76b',
      wickDownColor: '#f05c65',
      borderVisible: false
    });

    candleSeries.setData(
      candles.map(c => ({
        time: time(c.time),
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close
      }))
    );

    function addEMA(
      values: number[],
      color: string,
      title: string
    ) {
      const series = priceChart.addLineSeries({
        color,
        lineWidth: 2,
        title,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false
      });

      series.setData(
        candles.flatMap((c, i) =>
          Number.isFinite(values[i])
            ? [{ time: time(c.time), value: values[i] }]
            : []
        )
      );
    }

    addEMA(analysis.ema60, '#f59e0b', 'EMA 60');
    addEMA(analysis.ema125, '#2563eb', 'EMA 125');
    addEMA(analysis.ema250, '#475569', 'EMA 250');

    if (signal) {
      const tp =
        rr === 2 ? signal.tp1 :
        rr === 3 ? signal.tp2 :
        signal.tp3;

      [
        { price: signal.entry, color: '#2563eb', title: 'ENTRY' },
        { price: signal.sl, color: '#e45561', title: 'SL ~5 EUR' },
        { price: tp, color: '#13a36a', title: 'TP 1:' + rr }
      ].forEach(line => {
        candleSeries.createPriceLine({
          price: line.price,
          color: line.color,
          title: line.title,
          lineWidth: 2,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: true,
          axisLabelColor: line.color,
          axisLabelTextColor: '#ffffff'
        });
      });
    }

    const cciSeries = cciChart.addLineSeries({
      color: '#7c3aed',
      lineWidth: 2,
      title: 'CCI 14',
      priceLineVisible: false
    });

    cciSeries.setData(
      candles.flatMap((c, i) =>
        Number.isFinite(analysis.cci[i])
          ? [{ time: time(c.time), value: analysis.cci[i] }]
          : []
      )
    );

    for (const level of [100, -100, 0]) {
      cciSeries.createPriceLine({
        price: level,
        color: level === 0 ? '#cbd5e1' : '#94a3b8',
        lineWidth: 1,
        lineStyle: level === 0
          ? LineStyle.Dotted
          : LineStyle.Dashed,
        axisLabelVisible: level !== 0,
        title: level === 0 ? '' : String(level)
      });
    }

    const histogram = macdChart.addHistogramSeries({
      priceLineVisible: false,
      lastValueVisible: false,
      title: 'MACD Histogramm'
    });

    histogram.setData(
      candles.flatMap((c, i) =>
        Number.isFinite(analysis.macdHist[i])
          ? [{
              time: time(c.time),
              value: analysis.macdHist[i],
              color: analysis.macdHist[i] >= 0
                ? '#15a76b'
                : '#f05c65'
            }]
          : []
      )
    );

    const macdLine = macdChart.addLineSeries({
      color: '#2563eb',
      lineWidth: 2,
      title: 'MACD',
      priceLineVisible: false
    });

    macdLine.setData(
      candles.flatMap((c, i) =>
        Number.isFinite(analysis.macd[i])
          ? [{ time: time(c.time), value: analysis.macd[i] }]
          : []
      )
    );

    const macdSignalLine = macdChart.addLineSeries({
      color: '#f59e0b',
      lineWidth: 2,
      title: 'Signal',
      priceLineVisible: false
    });

    macdSignalLine.setData(
      candles.flatMap((c, i) =>
        Number.isFinite(analysis.macdSignal[i])
          ? [{
              time: time(c.time),
              value: analysis.macdSignal[i]
            }]
          : []
      )
    );

    charts.forEach(chart =>
      chart.timeScale().fitContent()
    );

    let syncing = false;

    charts.forEach(source => {
      source.timeScale().subscribeVisibleLogicalRangeChange(
        range => {
          if (syncing || !range) return;

          syncing = true;

          try {
            charts.forEach(chart => {
              if (chart !== source) {
                chart.timeScale().setVisibleLogicalRange(range);
              }
            });
          } finally {
            syncing = false;
          }
        }
      );
    });

    const observer = new ResizeObserver(() => {
      elements.forEach((element, index) => {
        charts[index].applyOptions({
          width: element.clientWidth
        });
      });
    });

    elements.forEach(element => observer.observe(element));

    return () => {
      observer.disconnect();
      charts.forEach(chart => chart.remove());
    };
  }, [candles, analysis, signal, rr]);

  return (
    <div className="indicatorCharts">
      <div className="indicatorTitle">
        Kurschart · EMA 60 / 125 / 250
      </div>
      <div ref={priceRef} className="chart" />

      <div className="indicatorTitle">
        CCI (14) · Grenzwerte +100 / −100
      </div>
      <div ref={cciRef} className="indicatorChart" />

      <div className="indicatorTitle">
        MACD (12 / 26 / 9)
      </div>
      <div ref={macdRef} className="indicatorChart" />
    </div>
  );
}

export default function Home() {
  const [symbol, setSymbol] =
    useState<TradingSymbol>('EURUSD');

  const [broker, setBroker] =
    useState<Broker>('roboforex');

  const [candles, setCandles] =
    useState<Candle[]>([]);

  const [eurUsd, setEurUsd] =
    useState<number | null>(null);

  const [rateUpdated, setRateUpdated] =
    useState(0);

  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [updated, setUpdated] = useState('');
  const [source, setSource] = useState('');
  const [rr, setRR] = useState<RR>(3);
  const [now, setNow] = useState(() => Date.now());

  const requestId = useRef(0);

  const timeframe = timeframeOf(symbol);
  const intervalSeconds = secondsOf(symbol);

  const loadRate = useCallback(async () => {
    try {
      const response = await fetch(
        '/api/candles?symbol=EURUSD',
        { cache: 'no-store' }
      );

      if (!response.ok) {
        throw new Error('EUR/USD nicht verfügbar');
      }

      const data = await response.json();

      if (!Array.isArray(data.candles)) {
        throw new Error('Ungültige Wechselkursdaten');
      }

      const last = data.candles.at(-1);

      if (
        !last ||
        !Number.isFinite(last.close) ||
        last.close <= 0
      ) {
        throw new Error('Ungültiger EUR/USD-Kurs');
      }

      const interval = 900;
      const age =
        Date.now() / 1000 - (last.time + interval);

      // Keine veraltete Währungsumrechnung benutzen.
      if (age < -60 || age > 3600) {
        setEurUsd(null);
        setRateUpdated(0);
        return;
      }

      setEurUsd(last.close);
      setRateUpdated(Date.now());
    } catch {
      setEurUsd(null);
      setRateUpdated(0);
    }
  }, []);

  const load = useCallback(async (
    selectedSymbol: TradingSymbol,
    manual = false
  ) => {
    const id = ++requestId.current;

    if (manual) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      const response = await fetch(
        '/api/candles?symbol=' +
          encodeURIComponent(selectedSymbol),
        { cache: 'no-store' }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error || 'Marktdaten nicht verfügbar'
        );
      }

      if (!Array.isArray(data.candles)) {
        throw new Error('Ungültige Kursdaten');
      }

      if (id !== requestId.current) return;

      setCandles(data.candles);
      setUpdated(data.updatedAt || '');
      setSource(data.source || 'Twelve Data');
      setError('');
      setNow(Date.now());

      try {
        localStorage.setItem(
          cacheKey(selectedSymbol),
          JSON.stringify({
            candles: data.candles,
            updatedAt: data.updatedAt
          })
        );
      } catch {}
    } catch (e) {
      if (id !== requestId.current) return;

      setError(
        e instanceof Error
          ? e.message
          : 'Marktdaten nicht verfügbar'
      );

      try {
        const saved = localStorage.getItem(
          cacheKey(selectedSymbol)
        );

        if (saved) {
          const data = JSON.parse(saved);

          if (Array.isArray(data.candles)) {
            setCandles(data.candles);
            setUpdated(data.updatedAt || '');
            setSource('Gespeicherte Daten (offline)');
          }
        }
      } catch {}
    } finally {
      if (id === requestId.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    try {
      const savedRR = localStorage.getItem('signaldesk-rr');

      if (
        savedRR === '2' ||
        savedRR === '3' ||
        savedRR === '4'
      ) {
        setRR(Number(savedRR) as RR);
      }

      const savedBroker = localStorage.getItem(
        'signaldesk-broker'
      );

      if (
        savedBroker === 'roboforex' ||
        savedBroker === 'puprime'
      ) {
        setBroker(savedBroker);
      }
    } catch {}
  }, []);

  useEffect(() => {
    loadRate();

    const timer = setInterval(loadRate, REFRESH_MS);
    return () => clearInterval(timer);
  }, [loadRate]);

  useEffect(() => {
    requestId.current++;

    setCandles([]);
    setError('');
    setUpdated('');
    setSource('');
    setLoading(true);
    setRefreshing(false);

    try {
      const saved = localStorage.getItem(cacheKey(symbol));

      if (saved) {
        const data = JSON.parse(saved);

        if (Array.isArray(data.candles)) {
          setCandles(data.candles);
          setUpdated(data.updatedAt || '');
          setSource('Lokaler Cache');
        }
      }
    } catch {}

    load(symbol);

    const timer = setInterval(
      () => load(symbol),
      REFRESH_MS
    );

    return () => {
      clearInterval(timer);
      requestId.current++;
    };
  }, [symbol, load]);

  useEffect(() => {
    const timer = setInterval(
      () => setNow(Date.now()),
      60000
    );

    return () => clearInterval(timer);
  }, []);

  const changeRR = (value: RR) => {
    setRR(value);

    try {
      localStorage.setItem(
        'signaldesk-rr',
        String(value)
      );
    } catch {}
  };

  const changeBroker = (value: Broker) => {
    setBroker(value);

    try {
      localStorage.setItem(
        'signaldesk-broker',
        value
      );
    } catch {}
  };

  const cleanCandles = useMemo(() => {
    const nowSeconds = Math.floor(now / 1000);
    const unique = new Map<number, Candle>();

    candles.forEach(c => {
      if (
        Number.isFinite(c.time) &&
        Number.isFinite(c.open) &&
        Number.isFinite(c.high) &&
        Number.isFinite(c.low) &&
        Number.isFinite(c.close) &&
        c.time % intervalSeconds === 0 &&
        c.time + intervalSeconds <= nowSeconds &&
        c.high >= c.low &&
        c.high >= Math.max(c.open, c.close) &&
        c.low <= Math.min(c.open, c.close)
      ) {
        unique.set(c.time, c);
      }
    });

    return [...unique.values()].sort(
      (a, b) => a.time - b.time
    );
  }, [candles, intervalSeconds, now]);

  const analysis = useMemo(
    () => analyzeDetailed(cleanCandles),
    [cleanCandles]
  );

  const last = cleanCandles.at(-1);

  const market = markets.find(
    x => x.id === symbol
  )!;

  const latestIsRecent = last
    ? Math.floor(now / 1000) -
        (last.time + intervalSeconds) <=
        (isCrypto(symbol) ? 5400 : 3600)
    : false;

  const rateIsRecent =
    eurUsd !== null &&
    rateUpdated > 0 &&
    now - rateUpdated <= 3600000;

  const rawSignal =
    latestIsRecent && !error
      ? analysis.signal
      : null;

  const riskCalculation = useMemo(() => {
    if (!rawSignal) {
      return { result: null, message: '' };
    }

    if (!rateIsRecent || eurUsd === null) {
      return {
        result: null,
        message:
          'Kein aktueller EUR/USD-Umrechnungskurs. ' +
          'SL und TP werden nicht angezeigt.'
      };
    }

    try {
      const result = calculateRiskLevels(
        rawSignal,
        {
          broker,
          symbol,
          eurUsd,
          usdJpy: symbol === 'USDJPY'
            ? rawSignal.entry
            : undefined,
          atr: analysis.atr
        }
      );

      return { result, message: '' };
    } catch (e) {
      return {
        result: null,
        message: e instanceof Error
          ? e.message
          : 'Risikoberechnung nicht möglich'
      };
    }
  }, [
    rawSignal,
    rateIsRecent,
    eurUsd,
    broker,
    symbol,
    analysis.atr
  ]);

  const signal = riskCalculation.result?.signal ?? null;

  const selectedTP = signal
    ? rr === 2
      ? signal.tp1
      : rr === 3
        ? signal.tp2
        : signal.tp3
    : null;

  const fmt = (value: number) => {
    const digits =
      symbol === 'USDJPY' ? 3 :
      symbol === 'BTCUSD' ||
      symbol === 'ETHUSD' ||
      symbol === 'XAUUSD' ? 2 : 5;

    return value.toLocaleString('de-DE', {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits
    });
  };

  const euro = (value: number) =>
    value.toLocaleString('de-DE', {
      style: 'currency',
      currency: 'EUR',
      maximumFractionDigits: 2
    });

  const brokerName = broker === 'roboforex'
    ? 'RoboForex Pro Demo'
    : 'PU Prime';

  const handleRefresh = () => {
    load(symbol, true);
    loadRate();
  };

  return (
    <main className="shell">
      <header className="header">
        <div className="brand">
          <img
            src="/icon.svg"
            alt="SignalDesk Icon"
            className="brandicon"
          />

          <div>
            <div className="brandname">
              Signal<span>Desk</span>
            </div>
            <small>M15 / M30 Trading Terminal</small>
          </div>
        </div>

        <div className="headerRight">
          <span className="online" />
          EMA-Strategie
        </div>
      </header>

      <section className="heading">
        <div>
          <div className="eyebrow">
            DEIN TRADING-DASHBOARD
          </div>

          <h1>Trading Signale</h1>

          <p>
            EMA 60/125/250 · CCI · MACD ·
            automatisches Risikoziel 5 €
          </p>
        </div>

        <button
          className="refresh"
          onClick={handleRefresh}
          disabled={refreshing || loading}
        >
          <RefreshCw
            size={18}
            className={refreshing ? 'spin' : ''}
          />

          {refreshing
            ? 'Aktualisiere …'
            : 'Jetzt aktualisieren'}
        </button>
      </section>

      <nav className="markets">
        {markets.map(x => (
          <button
            key={x.id}
            className={
              'market ' +
              (symbol === x.id ? 'selected' : '')
            }
            onClick={() => setSymbol(x.id)}
          >
            <span className="flags">{x.flag}</span>

            <span>
              <strong>{x.id}</strong>
              <small>{x.name}</small>
            </span>
          </button>
        ))}
      </nav>

      <section className="content">
        <div className="panel chartPanel">
          <div className="panelHead">
            <div>
              <div className="pair">
                <span className="flags">{market.flag}</span>
                <h2>{symbol}</h2>
                <span className="period">{timeframe}</span>
              </div>

              <small>{market.name}</small>
            </div>

            <span className="chip">Candlestick</span>
          </div>

          <div className="quote">
            {last ? fmt(last.close) : '—'}
          </div>

          {last && (
            <div className="candleStamp">
              Letzte abgeschlossene {timeframe}-Kerze:{' '}
              {new Date(last.time * 1000).toLocaleString(
                'de-DE',
                {
                  timeZone: 'UTC',
                  day: '2-digit',
                  month: '2-digit',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit'
                }
              )}{' '}
              UTC · {cleanCandles.length} gültige Kerzen
            </div>
          )}

          {error && (
            <div className="warning">
              {error}
              {cleanCandles.length > 0
                ? ' · Gespeicherte Kursdaten werden angezeigt.'
                : ''}
            </div>
          )}

          {!latestIsRecent && last && (
            <div className="warning">
              Die Kursdaten sind nicht aktuell.
              Es wird kein aktives Handelssignal angezeigt.
            </div>
          )}

          {loading && !candles.length ? (
            <div className="placeholder">
              Lade {timeframe}-Marktdaten …
            </div>
          ) : cleanCandles.length >= 260 ? (
            <IndicatorCharts
              candles={cleanCandles}
              analysis={analysis}
              signal={signal}
              rr={rr}
            />
          ) : (
            <div className="placeholder">
              {cleanCandles.length
                ? 'Mindestens 260 Kerzen benötigt.'
                : 'Noch keine Chartdaten verfügbar.'}
            </div>
          )}

          <div className="legend">
            <span>
              <i className="green" /> Aufwärtskerze
            </span>
            <span>
              <i className="red" /> Abwärtskerze
            </span>
            <span>Orange: EMA 60</span>
            <span>Blau: EMA 125</span>
            <span>Dunkelgrau: EMA 250</span>
          </div>
        </div>

        <aside className="panel signalPanel">
          <div className="panelHead">
            <h2>
              <Target size={22} color="#159966" />
              Aktuelles Signal
            </h2>

            <span className="chip greenchip">
              {timeframe}
            </span>
          </div>

          <div className="rrSelector">
            <strong>Broker auswählen</strong>

            <select
              value={broker}
              onChange={e =>
                changeBroker(e.target.value as Broker)
              }
              aria-label="Trading-Broker"
              style={{
                width: '100%',
                padding: '12px',
                border: '1px solid #dce6ed',
                borderRadius: '9px',
                background: '#ffffff',
                color: '#26364b',
                fontSize: '14px',
                fontWeight: 700
              }}
            >
              <option value="roboforex">
                RoboForex Pro Demo
              </option>
              <option value="puprime">
                PU Prime
              </option>
            </select>

            <div
              className="level"
              style={{ marginTop: 10 }}
            >
              <span>Positionsgröße</span>
              <strong>
                {LOT_SIZES[symbol].toLocaleString('de-DE')} Lot
              </strong>
            </div>

            <div className="level">
              <span>Geplantes SL-Risiko</span>
              <strong>5,00 €</strong>
            </div>
          </div>

          <div className="rrSelector">
            <strong>Take-Profit · Risk/Reward</strong>

            <div className="rrButtons">
              {([2, 3, 4] as RR[]).map(value => (
                <button
                  key={value}
                  type="button"
                  className={
                    'rrButton ' +
                    (rr === value ? 'active' : '')
                  }
                  onClick={() => changeRR(value)}
                >
                  1:{value}
                </button>
              ))}
            </div>

            <p className="smallnote">
              Zielgewinn vor Handelskosten:{' '}
              {euro(5 * rr)}
            </p>
          </div>

          {riskCalculation.message && (
            <div className="warning">
              {riskCalculation.message}
            </div>
          )}

          {signal ? (
            <>
              <div
                className={
                  'signalTitle ' +
                  (signal.side === 'LONG'
                    ? 'positive'
                    : 'negative')
                }
              >
                {signal.side === 'LONG'
                  ? <TrendingUp />
                  : <TrendingDown />}

                {signal.side}
              </div>

              <p className="sub">
                {symbol} · {timeframe} · {brokerName}
              </p>

              <div className="levels">
                <div className="level">
                  <span>Entry</span>
                  <strong>{fmt(signal.entry)}</strong>
                </div>

                <div className="level">
                  <span>Stop-Loss</span>
                  <strong className="negative">
                    {fmt(signal.sl)}
                  </strong>
                </div>

                <div className="level">
                  <span>Take-Profit 1:{rr}</span>
                  <strong className="positive">
                    {selectedTP !== null
                      ? fmt(selectedTP)
                      : '—'}
                  </strong>
                </div>

                <div className="level">
                  <span>Berechnetes Kursrisiko</span>
                  <strong>
                    {euro(
                      riskCalculation.result!.riskEUR
                    )}
                  </strong>
                </div>

                <div className="level">
                  <span>
                    Rechnerisches Gewinnziel
                  </span>
                  <strong className="positive">
                    {euro(
                      riskCalculation.result!.riskEUR * rr
                    )}
                  </strong>
                </div>

                <div className="level">
                  <span>SL-Kursabstand</span>
                  <strong>
                    {fmt(
                      riskCalculation.result!.stopDistance
                    )}
                  </strong>
                </div>
              </div>

              <p className="smallnote">
                {signal.reason}
              </p>

              {riskCalculation.result!.warnings.map(
                (warning, index) => (
                  <div
                    key={index}
                    className="warning"
                  >
                    {warning}
                  </div>
                )
              )}
            </>
          ) : (
            <div className="noSignal">
              <Activity size={36} color="#8aa0b1" />

              <h3>Kein berechnetes Signal</h3>

              <p>
                Entweder bestätigen EMA, Rücklauf,
                CCI und MACD derzeit keinen Einstieg
                oder die Risikoberechnung ist nicht
                verfügbar.
              </p>
            </div>
          )}

          <div className="scores">
            <strong>Strategie-Check</strong>

            <span>
              LONG {analysis.bullScore}/4 · SHORT{' '}
              {analysis.bearScore}/4
            </span>

            <span>
              EMA 60/125/250 · Rücklauf · CCI · MACD
            </span>
          </div>

          <details className="details">
            <summary>4 Prüfungen anzeigen</summary>

            {analysis.checks.map((check, index) => (
              <div key={index} className="check">
                <span>
                  {check.name}

                  <small className="checkValue">
                    {check.value}
                  </small>
                </span>

                <b
                  className={
                    check.bull
                      ? 'positive'
                      : check.bear
                        ? 'negative'
                        : ''
                  }
                >
                  {check.bull
                    ? 'Bullisch'
                    : check.bear
                      ? 'Bärisch'
                      : 'Neutral'}
                </b>
              </div>
            ))}
          </details>
        </aside>
      </section>

      <section className="summary">
        <div>
          <Clock3 />
          <span>
            <small>Letzte Aktualisierung</small>
            <strong>
              {updated
                ? new Date(updated).toLocaleString('de-DE')
                : 'Noch keine Daten'}
            </strong>
          </span>
        </div>

        <div>
          <BarChart3 />
          <span>
            <small>Datenquelle</small>
            <strong>{source || 'Twelve Data'}</strong>
          </span>
        </div>

        <div>
          <ShieldCheck />
          <span>
            <small>Risikoprofil</small>
            <strong>
              {brokerName} · 5 € / Trade
            </strong>
          </span>
        </div>

        <div>
          <RefreshCw />
          <span>
            <small>Aktualisierung der App</small>
            <strong>Alle 10 Minuten</strong>
          </span>
        </div>
      </section>

      <footer>
        Signale aus abgeschlossenen M15-/M30-Kerzen.
        Rechnerisches Kursrisiko ungefähr 5 EUR,
        abhängig von Kontraktgröße, Wechselkurs
        und Kursrundung. Spread, Kommission,
        Slippage und Mindestabstände sind
        nicht eingerechnet. Der tatsächliche
        Verlust kann höher sein. Twelve-Data-Kurse
        sind keine garantierten PU-Prime- oder
        RoboForex-Ausführungskurse. Die automatische
        Aktualisierung funktioniert bislang nur
        bei geöffneter App. Keine Anlageberatung
        und keine automatische Orderausführung.
      </footer>
    </main>
  );
}

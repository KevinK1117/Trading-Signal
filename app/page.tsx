
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
  Candle,
  Analysis
} from '../lib/signals';

const markets = [
  {
    id: 'EURUSD',
    flag: '🇪🇺 🇺🇸',
    name: 'Euro / US-Dollar'
  },
  {
    id: 'GBPUSD',
    flag: '🇬🇧 🇺🇸',
    name: 'Pfund / US-Dollar'
  },
  {
    id: 'USDJPY',
    flag: '🇺🇸 🇯🇵',
    name: 'US-Dollar / Yen'
  },
  {
    id: 'AUDUSD',
    flag: '🇦🇺 🇺🇸',
    name: 'Australischer Dollar / US-Dollar'
  },
  {
    id: 'XAUUSD',
    flag: '🥇 🇺🇸',
    name: 'Gold / US-Dollar'
  },
  {
    id: 'BTCUSD',
    flag: '₿ 🇺🇸',
    name: 'Bitcoin / US-Dollar'
  },
  {
    id: 'ETHUSD',
    flag: '◆ 🇺🇸',
    name: 'Ethereum / US-Dollar'
  }
] as const;

type RR = 2 | 3 | 4;

const REFRESH_MS = 10 * 60 * 1000;

function isCrypto(symbol: string) {
  return symbol === 'BTCUSD' || symbol === 'ETHUSD';
}

function getTimeframe(symbol: string) {
  return isCrypto(symbol) ? 'M30' : 'M15';
}

function getIntervalSeconds(symbol: string) {
  return isCrypto(symbol) ? 1800 : 900;
}

function cacheKey(symbol: string) {
  return 'signaldesk-candles-v2-' + symbol;
}

function IndicatorCharts({
  candles,
  analysis,
  rr,
  showSignal
}: {
  candles: Candle[];
  analysis: Analysis;
  rr: RR;
  showSignal: boolean;
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

    const time = (value: number) =>
      value as UTCTimestamp;

    const priceData = candles.map(c => ({
      time: time(c.time),
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close
    }));

    const candleSeries =
      priceChart.addCandlestickSeries({
        upColor: '#15a76b',
        downColor: '#f05c65',
        wickUpColor: '#15a76b',
        wickDownColor: '#f05c65',
        borderVisible: false
      });

    candleSeries.setData(priceData);

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
        candles.flatMap((c, index) =>
          Number.isFinite(values[index])
            ? [{
                time: time(c.time),
                value: values[index]
              }]
            : []
        )
      );
    }

    addEMA(
      analysis.ema60,
      '#f59e0b',
      'EMA 60'
    );

    addEMA(
      analysis.ema125,
      '#2563eb',
      'EMA 125'
    );

    addEMA(
      analysis.ema250,
      '#475569',
      'EMA 250'
    );

    const signal = showSignal
      ? analysis.signal
      : null;

    if (signal) {
      const selectedTP =
        rr === 2
          ? signal.tp1
          : rr === 3
            ? signal.tp2
            : signal.tp3;

      const lines = [
        {
          price: signal.entry,
          color: '#2563eb',
          title: 'ENTRY'
        },
        {
          price: signal.sl,
          color: '#e45561',
          title: 'STOP LOSS'
        },
        {
          price: selectedTP,
          color: '#13a36a',
          title: 'TP 1:' + rr
        }
      ];

      lines.forEach(line => {
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

    // CCI 14
    const cciSeries = cciChart.addLineSeries({
      color: '#7c3aed',
      lineWidth: 2,
      title: 'CCI 14',
      priceLineVisible: false
    });

    cciSeries.setData(
      candles.flatMap((c, index) =>
        Number.isFinite(analysis.cci[index])
          ? [{
              time: time(c.time),
              value: analysis.cci[index]
            }]
          : []
      )
    );

    for (const level of [100, -100, 0]) {
      cciSeries.createPriceLine({
        price: level,
        color: level === 0
          ? '#cbd5e1'
          : '#94a3b8',
        lineWidth: 1,
        lineStyle: level === 0
          ? LineStyle.Dotted
          : LineStyle.Dashed,
        axisLabelVisible: level !== 0,
        title: level === 0
          ? ''
          : level > 0
            ? '+100'
            : '-100'
      });
    }

    // MACD Histogramm
    const histogramSeries =
      macdChart.addHistogramSeries({
        priceLineVisible: false,
        lastValueVisible: false,
        title: 'MACD Histogramm'
      });

    histogramSeries.setData(
      candles.flatMap((c, index) =>
        Number.isFinite(analysis.macdHist[index])
          ? [{
              time: time(c.time),
              value: analysis.macdHist[index],
              color: analysis.macdHist[index] >= 0
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
      candles.flatMap((c, index) =>
        Number.isFinite(analysis.macd[index])
          ? [{
              time: time(c.time),
              value: analysis.macd[index]
            }]
          : []
      )
    );

    const signalLine = macdChart.addLineSeries({
      color: '#f59e0b',
      lineWidth: 2,
      title: 'Signal',
      priceLineVisible: false
    });

    signalLine.setData(
      candles.flatMap((c, index) =>
        Number.isFinite(analysis.macdSignal[index])
          ? [{
              time: time(c.time),
              value: analysis.macdSignal[index]
            }]
          : []
      )
    );

    charts.forEach(chart =>
      chart.timeScale().fitContent()
    );

    let syncing = false;

    const syncRange = (
      source: typeof priceChart,
      range: any
    ) => {
      if (syncing || !range) return;

      syncing = true;

      try {
        charts.forEach(chart => {
          if (chart !== source) {
            chart.timeScale()
              .setVisibleLogicalRange(range);
          }
        });
      } finally {
        syncing = false;
      }
    };

    charts.forEach(chart => {
      chart.timeScale()
        .subscribeVisibleLogicalRangeChange(
          range => syncRange(chart, range)
        );
    });

    const observer = new ResizeObserver(() => {
      elements.forEach((element, index) => {
        charts[index].applyOptions({
          width: element.clientWidth
        });
      });
    });

    elements.forEach(element =>
      observer.observe(element)
    );

    return () => {
      observer.disconnect();
      charts.forEach(chart => chart.remove());
    };
  }, [candles, analysis, rr, showSignal]);

  return (
    <div className="indicatorCharts">
      <div className="indicatorTitle">
        Kurschart · EMA 60 / 125 / 250
      </div>

      <div
        ref={priceRef}
        className="chart"
      />

      <div className="indicatorTitle">
        CCI (14) · Grenzwerte +100 / −100
      </div>

      <div
        ref={cciRef}
        className="indicatorChart"
      />

      <div className="indicatorTitle">
        MACD (12 / 26 / 9)
      </div>

      <div
        ref={macdRef}
        className="indicatorChart"
      />
    </div>
  );
}

export default function Home() {
  const [symbol, setSymbol] =
    useState('EURUSD');

  const [candles, setCandles] =
    useState<Candle[]>([]);

  const [error, setError] =
    useState('');

  const [loading, setLoading] =
    useState(true);

  const [updated, setUpdated] =
    useState('');

  const [refreshing, setRefreshing] =
    useState(false);

  const [source, setSource] =
    useState('');

  const [rr, setRR] =
    useState<RR>(3);

  const [now, setNow] =
    useState(() => Date.now());

  const requestId = useRef(0);

  const timeframe = getTimeframe(symbol);
  const intervalSeconds =
    getIntervalSeconds(symbol);

  const load = useCallback(async (
    selectedSymbol: string,
    manual = false
  ) => {
    const currentRequest = ++requestId.current;

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
          data.error ||
          'Marktdaten nicht verfügbar'
        );
      }

      if (!Array.isArray(data.candles)) {
        throw new Error(
          'Ungültige Kursdaten'
        );
      }

      if (currentRequest !== requestId.current) {
        return;
      }

      setCandles(data.candles);
      setUpdated(data.updatedAt || '');
      setSource(data.source || 'API / Cache');
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
      } catch {
        // Lokaler Cache ist optional.
      }
    } catch (e) {
      if (currentRequest !== requestId.current) {
        return;
      }

      setError(
        e instanceof Error
          ? e.message
          : 'Unbekannter Fehler'
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
            setSource(
              'Gespeicherte Daten (offline)'
            );
          }
        }
      } catch {
        // Keine gespeicherten Daten.
      }
    } finally {
      if (currentRequest === requestId.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    requestId.current++;

    setCandles([]);
    setError('');
    setUpdated('');
    setSource('');
    setLoading(true);

    try {
      const saved = localStorage.getItem(
        cacheKey(symbol)
      );

      if (saved) {
        const data = JSON.parse(saved);

        if (Array.isArray(data.candles)) {
          setCandles(data.candles);
          setUpdated(data.updatedAt || '');
          setSource('Lokaler Cache');
        }
      }
    } catch {
      // Cache nicht verfügbar.
    }

    load(symbol);

    const timer = setInterval(() => {
      load(symbol);
    }, REFRESH_MS);

    return () => {
      clearInterval(timer);
      requestId.current++;
    };
  }, [symbol, load]);

  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now());
    }, 60000);

    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(
        'signaldesk-rr'
      );

      if (
        saved === '2' ||
        saved === '3' ||
        saved === '4'
      ) {
        setRR(Number(saved) as RR);
      }
    } catch {
      // Standard bleibt 1:3.
    }
  }, []);

  const changeRR = (value: RR) => {
    setRR(value);

    try {
      localStorage.setItem(
        'signaldesk-rr',
        String(value)
      );
    } catch {
      // Speichern ist optional.
    }
  };

  const cleanCandles = useMemo(() => {
    const nowSeconds =
      Math.floor(now / 1000);

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

  const showSignal =
    latestIsRecent && !error
      ? analysis.signal
      : null;

  const selectedTP = showSignal
    ? rr === 2
      ? showSignal.tp1
      : rr === 3
        ? showSignal.tp2
        : showSignal.tp3
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

            <small>
              M15 / M30 Trading Terminal
            </small>
          </div>
        </div>

        <div className="headerRight">
          <span className="online" />
          EMA-Strategie · M15 / M30
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
            abgeschlossene M15-/M30-Kerzen
          </p>
        </div>

        <button
          className="refresh"
          onClick={() => load(symbol, true)}
          disabled={refreshing || loading}
        >
          <RefreshCw
            size={18}
            className={
              refreshing ? 'spin' : ''
            }
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
              (symbol === x.id
                ? 'selected'
                : '')
            }
            onClick={() => setSymbol(x.id)}
          >
            <span className="flags">
              {x.flag}
            </span>

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
                <span className="flags">
                  {market.flag}
                </span>

                <h2>{symbol}</h2>

                <span className="period">
                  {timeframe}
                </span>
              </div>

              <small>{market.name}</small>
            </div>

            <span className="chip">
              Candlestick
            </span>
          </div>

          <div className="quote">
            {last
              ? fmt(last.close)
              : '—'}
          </div>

          {last && (
            <div className="candleStamp">
              Letzte abgeschlossene{' '}
              {timeframe}-Kerze:{' '}
              {new Date(
                last.time * 1000
              ).toLocaleString('de-DE', {
                timeZone: 'UTC',
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
              })}{' '}
              UTC · {cleanCandles.length}{' '}
              gültige Kerzen
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
              Es wird kein aktives Handelssignal
              angezeigt.
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
              rr={rr}
              showSignal={Boolean(showSignal)}
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
              <i className="green" />
              Aufwärtskerze
            </span>

            <span>
              <i className="red" />
              Abwärtskerze
            </span>

            <span>Orange: EMA 60</span>
            <span>Blau: EMA 125</span>
            <span>Dunkelgrau: EMA 250</span>
          </div>
        </div>

        <aside className="panel signalPanel">
          <div className="panelHead">
            <h2>
              <Target
                size={22}
                color="#159966"
              />
              Aktuelles Signal
            </h2>

            <span className="chip greenchip">
              {timeframe}
            </span>
          </div>

          <div className="rrSelector">
            <strong>
              Take-Profit · Risk/Reward
            </strong>

            <div className="rrButtons">
              {([2, 3, 4] as RR[]).map(
                value => (
                  <button
                    key={value}
                    type="button"
                    className={
                      'rrButton ' +
                      (rr === value
                        ? 'active'
                        : '')
                    }
                    onClick={() =>
                      changeRR(value)
                    }
                  >
                    1:{value}
                  </button>
                )
              )}
            </div>
          </div>

          {showSignal ? (
            <>
              <div
                className={
                  'signalTitle ' +
                  (showSignal.side === 'LONG'
                    ? 'positive'
                    : 'negative')
                }
              >
                {showSignal.side === 'LONG'
                  ? <TrendingUp />
                  : <TrendingDown />}

                {showSignal.side}
              </div>

              <p className="sub">
                {symbol} · Bestätigte{' '}
                {timeframe}-Kerze
              </p>

              <div className="levels">
                <div className="level">
                  <span>Entry</span>

                  <strong>
                    {fmt(showSignal.entry)}
                  </strong>
                </div>

                <div className="level">
                  <span>Stop-Loss</span>

                  <strong className="negative">
                    {fmt(showSignal.sl)}
                  </strong>
                </div>

                <div className="level">
                  <span>
                    Take-Profit 1:{rr}
                  </span>

                  <strong className="positive">
                    {selectedTP !== null
                      ? fmt(selectedTP)
                      : '—'}
                  </strong>
                </div>

                <div className="level">
                  <span>
                    Risiko (Kursabstand)
                  </span>

                  <strong>
                    {fmt(
                      Math.abs(
                        showSignal.entry -
                        showSignal.sl
                      )
                    )}
                  </strong>
                </div>
              </div>

              <p className="smallnote">
                {showSignal.reason}
              </p>
            </>
          ) : (
            <div className="noSignal">
              <Activity
                size={36}
                color="#8aa0b1"
              />

              <h3>
                Kein aktives Signal
              </h3>

              <p>
                Die EMA-Trendrichtung,
                der Rücklauf, CCI und MACD
                bestätigen derzeit keinen
                gemeinsamen Einstieg.
              </p>
            </div>
          )}

          <div className="scores">
            <strong>
              Strategie-Check
            </strong>

            <span>
              LONG {analysis.bullScore}/4 ·
              SHORT {analysis.bearScore}/4
            </span>

            <span>
              EMA 60/125/250 · Rücklauf ·
              CCI · MACD
            </span>
          </div>

          <details className="details">
            <summary>
              4 Prüfungen anzeigen
            </summary>

            {analysis.checks.map(
              (check, index) => (
                <div
                  key={index}
                  className="check"
                >
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
              )
            )}
          </details>
        </aside>
      </section>

      <section className="summary">
        <div>
          <Clock3 />

          <span>
            <small>
              Letzte Aktualisierung
            </small>

            <strong>
              {updated
                ? new Date(
                    updated
                  ).toLocaleString('de-DE')
                : 'Noch keine Daten'}
            </strong>
          </span>
        </div>

        <div>
          <BarChart3 />

          <span>
            <small>Datenquelle</small>
            <strong>
              {source || 'Twelve Data'}
            </strong>
          </span>
        </div>

        <div>
          <ShieldCheck />

          <span>
            <small>
              Beobachtete Märkte
            </small>

            <strong>
              4 Forex + Gold + BTC + ETH
            </strong>
          </span>
        </div>

        <div>
          <RefreshCw />

          <span>
            <small>
              Aktualisierung der App
            </small>

            <strong>
              Alle 10 Minuten
            </strong>
          </span>
        </div>
      </section>

      <footer>
        Die Signale beruhen auf historischen,
        abgeschlossenen M15- beziehungsweise
        M30-Kerzen. Die EMA-Strategie ist
        nicht auf Profitabilität validiert.
        Stop-Loss und Take-Profit sind
        rechnerische Marken, keine
        garantierten Ausführungskurse.
        Die automatische Aktualisierung
        dieser Ansicht funktioniert nur,
        solange die App geöffnet und aktiv
        ist. Keine Anlageberatung und keine
        automatische Orderausführung.
      </footer>
    </main>
  );
}

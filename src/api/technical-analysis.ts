/**
 * Technical Analysis Endpoints
 *
 * Provides technical indicators: RSI, MACD, Moving Averages
 * Uses price data from CoinGecko for calculation
 */

import { getCoinGecko } from '../data/coingecko';

// ============ Types ============

export interface PriceDataPoint {
  timestamp: number;
  price: number;
  volume: number;
}

export interface RSIResult {
  symbol: string;
  timeframe: string;
  rsi: number;
  signal: 'oversold' | 'overbought' | 'neutral';
  interpretation: string;
}

export interface MACDResult {
  symbol: string;
  timeframe: string;
  macdLine: number;
  signalLine: number;
  histogram: number;
  signal: 'bullish' | 'bearish' | 'neutral';
  interpretation: string;
}

export interface MovingAveragesResult {
  symbol: string;
  timeframe: string;
  ma7: number;
  ma14: number;
  ma30: number;
  ma50: number;
  ma200: number;
  currentPrice: number;
  trend: 'strong_uptrend' | 'uptrend' | 'downtrend' | 'strong_downtrend' | 'sideways';
  interpretation: string;
}

export interface BollingerBandsResult {
  symbol: string;
  timeframe: string;
  upper: number;
  middle: number; // SMA
  lower: number;
  currentPrice: number;
  bandwidth: number;
  position: 'above_upper' | 'near_upper' | 'middle' | 'near_lower' | 'below_lower';
  interpretation: string;
}

export interface TechnicalAnalysisSummary {
  symbol: string;
  timestamp: number;
  rsi: RSIResult;
  macd: MACDResult;
  movingAverages: MovingAveragesResult;
  bollingerBands: BollingerBandsResult;
  overallSignal: 'strong_buy' | 'buy' | 'neutral' | 'sell' | 'strong_sell';
  confidence: number;
  reasoning: string[];
}

// ============ Technical Analysis Engine ============

class TechnicalAnalysisEngine {
  private coinGecko: any;

  constructor() {
    this.coinGecko = getCoinGecko();
  }

  /**
   * Fetch price history for a token
   */
  private async fetchPriceHistory(
    symbol: string,
    days: number = 30
  ): Promise<PriceDataPoint[]> {
    try {
      // Map symbols to CoinGecko IDs
      const coinMap: Record<string, string> = {
        'ETH': 'ethereum',
        'BTC': 'bitcoin',
        'USDC': 'usd-coin',
        'DAI': 'dai',
        'cbETH': 'coinbase-wrapped-staked-eth',
        'WETH': 'weth',
        'BALD': 'bald',
        'AERO': 'aerodrome-finance',
        'USDbC': 'usd-coin',
      };

      const coinId = coinMap[symbol] || symbol.toLowerCase();

      const response = await this.coinGecko.client.get(
        `/coins/${coinId}/market_chart`,
        {
          params: {
            vs_currency: 'usd',
            days: days,
            interval: 'hourly',
          }
        }
      );

      return response.data.prices.map((p: any, i: number) => ({
        timestamp: p[0],
        price: p[1],
        volume: response.data.total_volumes[i]?.[1] || 0,
      }));
    } catch (error) {
      console.error(`Error fetching price history for ${symbol}:`, error);
      return [];
    }
  }

  /**
   * Calculate RSI (Relative Strength Index)
   */
  private calculateRSI(prices: number[], period: number = 14): number {
    if (prices.length < period + 1) return 50;

    let gains = 0;
    let losses = 0;

    // First average
    for (let i = 1; i <= period; i++) {
      const change = prices[i] - prices[i - 1];
      if (change >= 0) {
        gains += change;
      } else {
        losses -= change;
      }
    }

    let avgGain = gains / period;
    let avgLoss = losses / period;

    // Calculate subsequent values
    for (let i = period + 1; i < prices.length; i++) {
      const change = prices[i] - prices[i - 1];

      avgGain = ((avgGain * (period - 1)) + (change >= 0 ? change : 0)) / period;
      avgLoss = ((avgLoss * (period - 1)) + (change < 0 ? -change : 0)) / period;
    }

    if (avgLoss === 0) return 100;

    const rs = avgGain / avgLoss;
    return 100 - (100 / (1 + rs));
  }

  /**
   * Calculate MACD (Moving Average Convergence Divergence)
   */
  private calculateMACD(prices: PriceDataPoint[]): MACDResult {
    if (prices.length < 26) {
      return {
        symbol: '',
        timeframe: '1d',
        macdLine: 0,
        signalLine: 0,
        histogram: 0,
        signal: 'neutral',
        interpretation: 'Insufficient data for MACD calculation',
      };
    }

    const priceArray = prices.map(p => p.price);

    // Calculate EMAs
    const ema12 = this.calculateEMA(priceArray, 12);
    const ema26 = this.calculateEMA(priceArray, 26);
    const macdLine = ema12 - ema26;

    // Calculate signal line (9-period EMA of MACD)
    // For simplicity, we'll use recent MACD values
    const macdHistory = this.calculateMACDHistory(prices);
    const signalLine = this.calculateEMA(macdHistory, 9);
    const histogram = macdLine - signalLine;

    let signal: 'bullish' | 'bearish' | 'neutral';
    if (histogram > 0 && macdLine > signalLine) {
      signal = 'bullish';
    } else if (histogram < 0 && macdLine < signalLine) {
      signal = 'bearish';
    } else {
      signal = 'neutral';
    }

    return {
      symbol: '',
      timeframe: '1d',
      macdLine: parseFloat(macdLine.toFixed(4)),
      signalLine: parseFloat(signalLine.toFixed(4)),
      histogram: parseFloat(histogram.toFixed(4)),
      signal,
      interpretation: this.interpretMACD(signal, histogram),
    };
  }

  private calculateMACDHistory(prices: PriceDataPoint[]): number[] {
    const priceArray = prices.map(p => p.price);
    const result: number[] = [];

    for (let i = 25; i < priceArray.length; i++) {
      const slice = priceArray.slice(0, i + 1);
      const ema12 = this.calculateEMA(slice, 12);
      const ema26 = this.calculateEMA(slice, 26);
      result.push(ema12 - ema26);
    }

    return result;
  }

  private calculateEMA(prices: number[], period: number): number {
    const k = 2 / (period + 1);
    let ema = prices[0];

    for (let i = 1; i < prices.length; i++) {
      ema = prices[i] * k + ema * (1 - k);
    }

    return ema;
  }

  private interpretMACD(signal: string, histogram: number): string {
    if (signal === 'bullish' && histogram > 0) {
      return 'Bullish momentum with increasing strength';
    } else if (signal === 'bearish' && histogram < 0) {
      return 'Bearish momentum with increasing weakness';
    } else if (signal === 'bullish' && histogram < 0) {
      return 'Bullish but losing momentum (potential reversal)';
    } else {
      return 'Bearish but gaining strength (potential reversal)';
    }
  }

  /**
   * Calculate Moving Averages
   */
  private calculateMovingAverages(prices: PriceDataPoint[]): MovingAveragesResult {
    const priceArray = prices.map(p => p.price);
    const currentPrice = priceArray[priceArray.length - 1];

    const ma7 = this.calculateSMA(priceArray, 7);
    const ma14 = this.calculateSMA(priceArray, 14);
    const ma30 = this.calculateSMA(priceArray, 30);
    const ma50 = this.calculateSMA(priceArray, 50);
    const ma200 = this.calculateSMA(priceArray, 200);

    // Determine trend
    let trend: MovingAveragesResult['trend'];
    if (ma7 > ma14 && ma14 > ma30 && ma30 > ma50 && ma50 > ma200) {
      trend = 'strong_uptrend';
    } else if (ma7 > ma50) {
      trend = 'uptrend';
    } else if (ma7 < ma14 && ma14 < ma30 && ma30 < ma50) {
      trend = 'downtrend';
    } else if (currentPrice < ma200) {
      trend = 'strong_downtrend';
    } else {
      trend = 'sideways';
    }

    return {
      symbol: '',
      timeframe: '1d',
      ma7: parseFloat(ma7.toFixed(2)),
      ma14: parseFloat(ma14.toFixed(2)),
      ma30: parseFloat(ma30.toFixed(2)),
      ma50: parseFloat(ma50.toFixed(2)),
      ma200: parseFloat(ma200.toFixed(2)),
      currentPrice: parseFloat(currentPrice.toFixed(2)),
      trend,
      interpretation: this.interpretMovingAverages(trend, currentPrice, ma50),
    };
  }

  private calculateSMA(prices: number[], period: number): number {
    if (prices.length < period) return prices[prices.length - 1] || 0;

    const slice = prices.slice(-period);
    return slice.reduce((sum, price) => sum + price, 0) / period;
  }

  private interpretMovingAverages(
    trend: string,
    currentPrice: number,
    ma50: number
  ): string {
    if (trend === 'strong_uptrend') {
      return 'Strong uptrend - price above all major MAs';
    } else if (trend === 'uptrend') {
      return currentPrice > ma50
        ? 'Uptrend - price above 50-day MA'
        : 'Short-term uptrend, below 50-day MA';
    } else if (trend === 'downtrend') {
      return 'Downtrend - price declining';
    } else if (trend === 'strong_downtrend') {
      return 'Strong downtrend - price below 200-day MA';
    } else {
      return 'Sideways/consolidating - no clear trend';
    }
  }

  /**
   * Calculate Bollinger Bands
   */
  private calculateBollingerBands(
    prices: PriceDataPoint[],
    period: number = 20,
    stdDev: number = 2
  ): BollingerBandsResult {
    const priceArray = prices.map(p => p.price);
    const currentPrice = priceArray[priceArray.length - 1];

    // Calculate SMA (middle band)
    const middle = this.calculateSMA(priceArray, period);

    // Calculate standard deviation
    const slice = priceArray.slice(-period);
    const squaredDiffs = slice.map(p => Math.pow(p - middle, 2));
    const variance =
      squaredDiffs.reduce((sum, val) => sum + val, 0) / period;
    const standardDeviation = Math.sqrt(variance);

    // Calculate bands
    const upper = middle + (standardDeviation * stdDev);
    const lower = middle - (standardDeviation * stdDev);

    // Calculate bandwidth (volatility measure)
    const bandwidth = (upper - lower) / middle;

    // Determine position
    let position: BollingerBandsResult['position'];
    if (currentPrice > upper) {
      position = 'above_upper';
    } else if (currentPrice > middle + (upper - middle) * 0.6) {
      position = 'near_upper';
    } else if (currentPrice < lower) {
      position = 'below_lower';
    } else if (currentPrice < middle - (middle - lower) * 0.6) {
      position = 'near_lower';
    } else {
      position = 'middle';
    }

    return {
      symbol: '',
      timeframe: '1d',
      upper: parseFloat(upper.toFixed(2)),
      middle: parseFloat(middle.toFixed(2)),
      lower: parseFloat(lower.toFixed(2)),
      currentPrice: parseFloat(currentPrice.toFixed(2)),
      bandwidth: parseFloat(bandwidth.toFixed(4)),
      position,
      interpretation: this.interpretBollingerBands(position, bandwidth),
    };
  }

  private interpretBollingerBands(
    position: string,
    bandwidth: number
  ): string {
    const volatility = bandwidth > 0.04 ? 'high' : bandwidth > 0.02 ? 'medium' : 'low';

    if (position === 'above_upper') {
      return `Overbought territory - price above upper band (${volatility} volatility)`;
    } else if (position === 'below_lower') {
      return `Oversold territory - price below lower band (${volatility} volatility)`;
    } else if (position === 'near_upper') {
      return `Near upper band - potential resistance ahead (${volatility} volatility)`;
    } else if (position === 'near_lower') {
      return `Near lower band - potential support (${volatility} volatility)`;
    } else {
      return `Trading in middle band - neutral (${volatility} volatility)`;
    }
  }

  /**
   * Generate comprehensive technical analysis
   */
  async analyze(symbol: string): Promise<TechnicalAnalysisSummary> {
    // Fetch 30 days of price data
    const priceHistory = await this.fetchPriceHistory(symbol, 30);

    if (priceHistory.length < 50) {
      throw new Error(`Insufficient data for ${symbol} technical analysis`);
    }

    const prices = priceHistory.map(p => p.price);

    // Calculate all indicators
    const rsiValue = this.calculateRSI(prices);
    const rsiSignal: RSIResult['signal'] =
      rsiValue > 70 ? 'overbought' :
      rsiValue < 30 ? 'oversold' : 'neutral';

    const rsi: RSIResult = {
      symbol,
      timeframe: '1d',
      rsi: parseFloat(rsiValue.toFixed(2)),
      signal: rsiSignal,
      interpretation: rsiSignal === 'overbought'
        ? 'RSI > 70: Overbought, potential pullback'
        : rsiSignal === 'oversold'
        ? 'RSI < 30: Oversold, potential bounce'
        : 'RSI neutral: No clear overbought/oversold condition',
    };

    const macd = this.calculateMACD(priceHistory);
    macd.symbol = symbol;

    const movingAverages = this.calculateMovingAverages(priceHistory);
    movingAverages.symbol = symbol;

    const bollingerBands = this.calculateBollingerBands(priceHistory);
    bollingerBands.symbol = symbol;

    // Determine overall signal
    const reasoning: string[] = [];

    if (rsiSignal === 'oversold') {
      reasoning.push('RSI indicates oversold conditions');
    } else if (rsiSignal === 'overbought') {
      reasoning.push('RSI indicates overbought conditions');
    }

    if (macd.signal === 'bullish') {
      reasoning.push('MACD shows bullish momentum');
    } else if (macd.signal === 'bearish') {
      reasoning.push('MACD shows bearish momentum');
    }

    if (['uptrend', 'strong_uptrend'].includes(movingAverages.trend)) {
      reasoning.push('Moving averages show uptrend');
    } else if (['downtrend', 'strong_downtrend'].includes(movingAverages.trend)) {
      reasoning.push('Moving averages show downtrend');
    }

    if (bollingerBands.position === 'below_lower') {
      reasoning.push('Price below Bollinger lower band - potential buy signal');
    } else if (bollingerBands.position === 'above_upper') {
      reasoning.push('Price above Bollinger upper band - potential sell signal');
    }

    // Calculate overall signal and confidence
    const bullishSignals =
      (rsiSignal === 'oversold' ? 1 : 0) +
      (macd.signal === 'bullish' ? 1 : 0) +
      (['uptrend', 'strong_uptrend'].includes(movingAverages.trend) ? 1 : 0) +
      (bollingerBands.position === 'below_lower' ? 1 : 0);

    const bearishSignals =
      (rsiSignal === 'overbought' ? 1 : 0) +
      (macd.signal === 'bearish' ? 1 : 0) +
      (['downtrend', 'strong_downtrend'].includes(movingAverages.trend) ? 1 : 0) +
      (bollingerBands.position === 'above_upper' ? 1 : 0);

    let overallSignal: TechnicalAnalysisSummary['overallSignal'];
    let confidence: number;

    if (bullishSignals >= 3) {
      overallSignal = 'strong_buy';
      confidence = 75 + (bullishSignals - 3) * 8;
    } else if (bullishSignals >= 2) {
      overallSignal = 'buy';
      confidence = 60 + (bullishSignals - 2) * 5;
    } else if (bearishSignals >= 3) {
      overallSignal = 'strong_sell';
      confidence = 75 + (bearishSignals - 3) * 8;
    } else if (bearishSignals >= 2) {
      overallSignal = 'sell';
      confidence = 60 + (bearishSignals - 2) * 5;
    } else {
      overallSignal = 'neutral';
      confidence = 50;
    }

    confidence = Math.min(95, confidence);

    return {
      symbol,
      timestamp: Date.now(),
      rsi,
      macd,
      movingAverages,
      bollingerBands,
      overallSignal,
      confidence,
      reasoning,
    };
  }
}

// Singleton instance
const engine = new TechnicalAnalysisEngine();

export { TechnicalAnalysisEngine };
export default engine;

const https = require('https');

function fetchPrice(ticker) {
  return new Promise((resolve) => {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=1d`;
    https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0',
        'Accept': 'application/json',
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          const price = json?.chart?.result?.[0]?.meta?.regularMarketPrice;
          resolve({ ticker, price: price || null });
        } catch {
          resolve({ ticker, price: null });
        }
      });
    }).on('error', () => resolve({ ticker, price: null }));
  });
}

exports.handler = async (event) => {
  const tickersParam = event.queryStringParameters?.tickers || '';
  const tickers = tickersParam.split(',').map(t => t.trim()).filter(Boolean);

  if (!tickers.length) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'No tickers provided' }),
    };
  }

  const results = await Promise.all(tickers.map(fetchPrice));
  const prices = {};
  results.forEach(({ ticker, price }) => {
    if (price !== null) prices[ticker] = price;
  });

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
    body: JSON.stringify(prices),
  };
};

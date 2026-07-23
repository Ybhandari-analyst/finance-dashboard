const https = require('https');

function callAnthropic(apiKey, prompt) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 1000,
      messages: [{ role: 'user', content: prompt }],
    });
    const req = https.request('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
    }, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

exports.handler = async (event) => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'ANTHROPIC_API_KEY is not configured' }),
    };
  }

  let prompt;
  try {
    prompt = JSON.parse(event.body || '{}').prompt;
  } catch {
    prompt = null;
  }

  if (!prompt) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'No prompt provided' }),
    };
  }

  const body = await callAnthropic(apiKey, prompt);

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
    body,
  };
};

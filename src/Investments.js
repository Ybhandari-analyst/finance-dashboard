import React, { useState, useEffect } from 'react';
import { supabase } from './supabase';

const CRYPTO_ACCOUNT = 'Crypto';
const SECURITIES_ACCOUNTS = ['TFSA', 'FHSA', 'Group RRSP', 'DPSP', 'Non-registered'];
const ACCT_COLORS = { 'TFSA':'#534AB7','FHSA':'#1D9E75','Group RRSP':'#D85A30','DPSP':'#378ADD','Non-registered':'#888780','Crypto':'#BA7517' };

function parseAmount(s) {
  if (!s && s !== 0) return 0;
  return parseFloat(String(s).replace(/[$,\s]/g,'').replace('−','-')) || 0;
}

function parseHoldingsCSV(text) {
  const lines = text.trim().split('\n');
  const parseRow = line => {
    const result=[]; let cur=''; let inQ=false;
    for(let c of line){if(c==='"')inQ=!inQ;else if(c===','&&!inQ){result.push(cur.trim());cur='';}else cur+=c;}
    result.push(cur.trim()); return result;
  };
  const rows = lines.map(parseRow);
  const headers = rows[0].map(h=>h.toLowerCase().trim().replace(/[^a-z0-9]/g,'_'));
  const get = (row, col) => { const i=headers.findIndex(h=>h.includes(col)); return i>=0?(row[i]||'').trim():''; };
  return rows.slice(1).filter(r=>r.some(c=>c)).map(r=>({
    accountName: get(r,'account_name'),
    accountType: get(r,'account_type'),
    symbol: get(r,'symbol'),
    name: get(r,'name'),
    securityType: get(r,'security_type'),
    quantity: parseAmount(get(r,'quantity')),
    marketPrice: parseAmount(get(r,'market_price')),
    marketPriceCurrency: get(r,'market_price_currency'),
    bookValueCAD: parseAmount(get(r,'book_value__cad_')||get(r,'book_value_cad')||'0'),
    bookValueMarket: parseAmount(get(r,'book_value__market_')||get(r,'book_value_market')||'0'),
    marketValue: parseAmount(get(r,'market_value')),
    marketValueCurrency: get(r,'market_value_currency'),
    exchange: get(r,'exchange'),
    mic: get(r,'mic'),
    unrealizedReturn: parseAmount(get(r,'market_unrealized_returns')),
  })).filter(r=>r.symbol);
}

function parseActivitiesCSV(text) {
  const lines = text.trim().split('\n');
  const parseRow = line => {
    const result=[]; let cur=''; let inQ=false;
    for(let c of line){if(c==='"')inQ=!inQ;else if(c===','&&!inQ){result.push(cur.trim());cur='';}else cur+=c;}
    result.push(cur.trim()); return result;
  };
  const rows = lines.map(parseRow);
  const headers = rows[0].map(h=>h.toLowerCase().trim());
  const get = (row,col) => { const i=headers.indexOf(col); return i>=0?(row[i]||'').trim():''; };
  return rows.slice(1).filter(r=>r.some(c=>c)).map(r=>({
    date: get(r,'transaction_date'),
    account: get(r,'account_type'),
    activityType: get(r,'activity_type'),
    symbol: get(r,'symbol'),
    name: get(r,'name'),
    currency: get(r,'currency'),
    quantity: parseAmount(get(r,'quantity')),
    unitPrice: parseAmount(get(r,'unit_price')),
    netCash: parseAmount(get(r,'net_cash_amount')),
  })).filter(r=>r.date);
}

async function getUSDCAD() {
  try {
    const r = await fetch('/api/prices?tickers=USDCAD%3DX');
    if (!r.ok) throw new Error('failed');
    const j = await r.json();
    return j['USDCAD=X'] || 1.3640;
  } catch { return 1.3640; }
}

export default function Investments() {
  const [holdings, setHoldings] = useState([]);
  const [activities, setActivities] = useState([]);
  const [usdCad, setUsdCad] = useState(1.3640);
  const [subTab, setSubTab] = useState('securities');
  const [historyFilter, setHistoryFilter] = useState('Trade');
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState('');
  const [lastUpdated, setLastUpdated] = useState(null);
  const [livePrices, setLivePrices] = useState({});
  const [refreshing, setRefreshing] = useState(false);
  const [priceUpdatedAt, setPriceUpdatedAt] = useState(null);

  function buildYahooTicker(symbol, exchange, marketPriceCurrency) {
    if (!symbol) return null;
    // Crypto — no suffix, use CAD pair
    const cryptos = ['BTC','ETH','ADA','DOGE','DOT','SOL','XRP','POL','RENDER','SHIB'];
    if (cryptos.includes(symbol)) return symbol + '-CAD';
    // TSX / TSX-V / CBOE Canada — add .TO or .V
    if (exchange === 'TSX' || exchange === 'CBOE CANADA') return symbol + '.TO';
    if (exchange === 'TSX-V') return symbol + '.V';
    // US exchanges — use as-is
    if (['NYSE','NASDAQ','BATS'].includes(exchange)) return symbol;
    // Fallback: CAD currency = TSX, USD = US market
    if (marketPriceCurrency === 'CAD') return symbol + '.TO';
    return symbol;
  }

  async function fetchLivePrices(holdingsData) {
    const tickerMap = {}; // yahooTicker -> original symbol
    holdingsData.forEach(h => {
      const ticker = buildYahooTicker(h.symbol, h.exchange, h.market_price_currency);
      if (ticker) tickerMap[ticker] = h.symbol;
    });
    const tickers = Object.keys(tickerMap);
    if (!tickers.length) return {};
    try {
      const r = await fetch('/api/prices?tickers=' + tickers.join(','));
      if (!r.ok) throw new Error('prices api failed');
      const pricesByTicker = await r.json();
      // Map back to original symbol
      const pricesBySymbol = {};
      Object.entries(pricesByTicker).forEach(([ticker, price]) => {
        const sym = tickerMap[ticker];
        if (sym) pricesBySymbol[sym] = price;
      });
      return pricesBySymbol;
    } catch(e) {
      console.error('Price fetch failed:', e);
      return {};
    }
  }

  async function handleRefresh() {
    setRefreshing(true);
    try {
      const [newRate, newPrices] = await Promise.all([
        getUSDCAD(),
        fetchLivePrices(holdings),
      ]);
      setUsdCad(newRate);
      setLivePrices(newPrices);
      setPriceUpdatedAt(new Date());
    } catch(e) { console.error(e); }
    setRefreshing(false);
  }

  useEffect(() => { loadAll(); getUSDCAD().then(r=>setUsdCad(r)); }, []);

  async function loadAll() {
    const [{ data: hData }, { data: aData }] = await Promise.all([
      supabase.from('holdings_snapshot').select('*').order('account_type'),
      supabase.from('investment_activities').select('*').order('date', { ascending: false }),
    ]);
    if (hData) {
      setHoldings(hData);
      if (hData.length) setLastUpdated(hData[0].uploaded_at);
    }
    if (aData) setActivities(aData);
  }

  async function handleHoldingsFile(file) {
    setUploading(true); setUploadMsg('');
    const text = await file.text();
    const parsed = parseHoldingsCSV(text);
    // Clear old snapshot and insert new
    await supabase.from('holdings_snapshot').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    const { error } = await supabase.from('holdings_snapshot').insert(
      parsed.map(h => ({
        account_name: h.accountName, account_type: h.accountType,
        symbol: h.symbol, name: h.name, security_type: h.securityType,
        quantity: h.quantity, market_price: h.marketPrice,
        market_price_currency: h.marketPriceCurrency,
        exchange: h.exchange || null,
        mic: h.mic || null,
        book_value_cad: h.bookValueCAD, book_value_market: h.bookValueMarket,
        market_value: h.marketValue, market_value_currency: h.marketValueCurrency,
        unrealized_return: h.unrealizedReturn, uploaded_at: new Date().toISOString(),
      }))
    );
    if (error) setUploadMsg('Error: ' + error.message);
    else setUploadMsg(`Loaded ${parsed.length} positions.`);
    await loadAll();
    setUploading(false);
  }

  async function handleActivitiesFile(file) {
    setUploading(true); setUploadMsg('');
    const text = await file.text();
    const parsed = parseActivitiesCSV(text);
    const existing = new Set(activities.map(a=>`${a.date}_${a.symbol}_${a.quantity}_${a.account}`));
    const newOnes = parsed.filter(a=>!existing.has(`${a.date}_${a.symbol}_${a.quantity}_${a.account}`));
    if (newOnes.length > 0) {
      await supabase.from('investment_activities').insert(
        newOnes.map(a=>({ date:a.date, account:a.account, activity_type:a.activityType,
          symbol:a.symbol, name:a.name, currency:a.currency,
          quantity:a.quantity, unit_price:a.unitPrice, net_cash:a.netCash }))
      );
    }
    setUploadMsg(`Activities: +${newOnes.length} new (${parsed.length-newOnes.length} dupes skipped).`);
    await loadAll();
    setUploading(false);
  }

  // Holdings with CAD conversion
  const holdingsCAD = holdings.map(h => {
    const livePrice = livePrices[h.symbol];
    const liveMarketValue = livePrice && h.quantity
      ? livePrice * h.quantity
      : h.market_value;
    const isUSD = h.market_value_currency === 'USD';
    const marketValueCAD = isUSD ? liveMarketValue * usdCad : liveMarketValue;
    return { ...h, marketValueCAD, bookValueCAD: h.book_value_cad, livePrice };
  });

  const isCrypto = subTab === 'crypto';
  const filteredHoldings = holdingsCAD.filter(h =>
    isCrypto ? h.account_type === CRYPTO_ACCOUNT : SECURITIES_ACCOUNTS.includes(h.account_type)
  );

  const totalValue = filteredHoldings.reduce((s,h)=>s+h.marketValueCAD,0);
  const totalCost = filteredHoldings.reduce((s,h)=>s+h.bookValueCAD,0);
  const totalGain = totalValue - totalCost;

  const accounts = [...new Set(filteredHoldings.map(h=>h.account_type))];

  // Monthly invested from activities
  const filteredActivities = activities.filter(a =>
    isCrypto ? a.account === CRYPTO_ACCOUNT : SECURITIES_ACCOUNTS.includes(a.account)
  );
  const monthlyMap = {};
  filteredActivities.filter(a=>a.activity_type==='Trade'&&a.quantity>0&&a.symbol).forEach(a=>{
    const m=a.date.slice(0,7); monthlyMap[m]=(monthlyMap[m]||0)+Math.abs(a.net_cash||0);
  });
  const monthlyData = Object.entries(monthlyMap).sort();

  // Income/staking
  const incomeMap = {};
  filteredActivities.filter(a=>['Dividend','CryptoStakingReward','Interest','BonusPayment'].includes(a.activity_type)).forEach(a=>{
    const m=a.date.slice(0,7); incomeMap[m]=(incomeMap[m]||0)+Math.abs(a.net_cash||a.quantity||0);
  });
  const incomeData = Object.entries(incomeMap).sort();
  const totalIncome = incomeData.reduce((s,[,v])=>s+v,0);

  // History
  const activityTypes = ['All',...new Set(filteredActivities.map(a=>a.activity_type).filter(Boolean))];
  const historyRows = filteredActivities
    .filter(a=>historyFilter==='All'||a.activity_type===historyFilter)
    .slice(0,300);

  const s = {
    card:{background:'#fff',borderRadius:12,padding:'16px 20px',marginBottom:16,border:'1px solid #f0f0f0'},
    cardTitle:{fontSize:11,fontWeight:500,color:'#888',textTransform:'uppercase',letterSpacing:'0.05em',marginBottom:14},
    metric:{background:'#f5f5f3',borderRadius:10,padding:'12px 14px'},
    metricLabel:{fontSize:11,color:'#888',marginBottom:3,textTransform:'uppercase',letterSpacing:'0.04em'},
    metricValue:{fontSize:18,fontWeight:500},
    subTab:(a)=>({padding:'6px 14px',fontSize:13,borderRadius:8,border:'1px solid',borderColor:a?'#534AB7':'#e0e0e0',background:a?'#534AB7':'#fff',color:a?'#fff':'#888',cursor:'pointer',fontWeight:a?500:400}),
    row:{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'7px 0',borderBottom:'1px solid #f5f5f5',fontSize:13},
    hint:{fontSize:12,color:'#888',marginBottom:8},
    btn:{padding:'6px 14px',fontSize:13,borderRadius:8,border:'1px solid #e0e0e0',background:'#fff',cursor:'pointer'},
    btnPrimary:{padding:'7px 16px',fontSize:13,borderRadius:8,border:'none',background:'#534AB7',color:'#fff',cursor:'pointer',fontWeight:500},
    select:{padding:'6px 10px',fontSize:13,border:'1px solid #e0e0e0',borderRadius:8,background:'#fff'},
  };

  const MiniBar = ({data,color='#534AB7'}) => {
    if(!data.length) return null;
    const max = Math.max(...data.map(x=>x[1]),1);
    return (
      <div style={{display:'flex',alignItems:'flex-end',gap:3,height:120,paddingBottom:20}}>
        {data.map(([m,v])=>(
          <div key={m} style={{display:'flex',flexDirection:'column',alignItems:'center',flex:1,height:'100%',justifyContent:'flex-end'}}>
            <div style={{fontSize:9,color:'#888',marginBottom:2}}>{v>=1000?'$'+(v/1000).toFixed(1)+'k':'$'+Math.round(v)}</div>
            <div style={{width:'100%',borderRadius:'3px 3px 0 0',background:color,height:`${(v/max)*80}px`,minHeight:2}}></div>
            <div style={{fontSize:9,color:'#888',marginTop:3}}>{m.slice(5)}</div>
          </div>
        ))}
      </div>
    );
  };

  if (holdings.length === 0 && activities.length === 0) {
    return (
      <div>
        <div style={s.card}>
          <div style={s.cardTitle}>Upload holdings report</div>
          <p style={s.hint}>From Wealthsimple: Profile → Statements & Documents → Holdings Report → Download CSV. This gives exact current values.</p>
          <label style={{...s.btnPrimary,display:'inline-block',cursor:'pointer',marginBottom:12}}>
            Upload holdings report
            <input type="file" accept=".csv" style={{display:'none'}} onChange={e=>e.target.files[0]&&handleHoldingsFile(e.target.files[0])} />
          </label>
          {uploading&&<p style={s.hint}>Processing…</p>}
          {uploadMsg&&<p style={{color:'#0F6E56',fontSize:13,marginTop:8}}>{uploadMsg}</p>}
        </div>
        <div style={s.card}>
          <div style={s.cardTitle}>Upload activities export (optional)</div>
          <p style={s.hint}>From Wealthsimple: Activity → Download CSV. Powers the history and timeline charts.</p>
          <label style={{...s.btn,display:'inline-block',cursor:'pointer'}}>
            Upload activities
            <input type="file" accept=".csv" style={{display:'none'}} onChange={e=>e.target.files[0]&&handleActivitiesFile(e.target.files[0])} />
          </label>
        </div>
        <div style={{textAlign:'center',padding:'3rem',color:'#888',fontSize:13}}>
          <div style={{fontSize:32,marginBottom:8}}>📈</div>
          <div style={{fontWeight:500,color:'#1a1a1a',marginBottom:4}}>No investment data yet</div>
          <div>Upload your holdings report above to get started.</div>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Upload controls */}
      <div style={{display:'flex',gap:8,marginBottom:16,flexWrap:'wrap',alignItems:'center'}}>
        <label style={{...s.btnPrimary,cursor:'pointer',display:'inline-block'}}>
          Update holdings
          <input type="file" accept=".csv" style={{display:'none'}} onChange={e=>e.target.files[0]&&handleHoldingsFile(e.target.files[0])} />
        </label>
        <label style={{...s.btn,cursor:'pointer',display:'inline-block'}}>
          Update activities
          <input type="file" accept=".csv" style={{display:'none'}} onChange={e=>e.target.files[0]&&handleActivitiesFile(e.target.files[0])} />
        </label>
        <button
          style={{...s.btn,display:'inline-flex',alignItems:'center',gap:4}}
          onClick={handleRefresh}
          disabled={refreshing||holdings.length===0}
        >
          {refreshing?'↻ Refreshing…':'↻ Refresh prices'}
        </button>
        {uploading&&<span style={s.hint}>Processing…</span>}
        {uploadMsg&&<span style={{fontSize:12,color:'#0F6E56'}}>{uploadMsg}</span>}
        {priceUpdatedAt&&<span style={{...s.hint,color:'#0F6E56'}}>Live prices as of {priceUpdatedAt.toLocaleTimeString('en-CA',{hour:'2-digit',minute:'2-digit'})}</span>}
        {lastUpdated&&<span style={s.hint}>Holdings as of {new Date(lastUpdated).toLocaleDateString('en-CA',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'})}</span>}
        <span style={s.hint}>USD/CAD: {usdCad.toFixed(4)}</span>
      </div>

      {/* Total portfolio summary */}
      {(() => {
        const allHoldings = holdingsCAD;
        const allValue = allHoldings.reduce((s,h)=>s+h.marketValueCAD,0);
        const allCost = allHoldings.reduce((s,h)=>s+h.bookValueCAD,0);
        const allGain = allValue - allCost;
        const secValue = holdingsCAD.filter(h=>SECURITIES_ACCOUNTS.includes(h.account_type)).reduce((s,h)=>s+h.marketValueCAD,0);
        const cryptoValue = holdingsCAD.filter(h=>h.account_type===CRYPTO_ACCOUNT).reduce((s,h)=>s+h.marketValueCAD,0);
        const secPct = allValue > 0 ? (secValue/allValue*100) : 0;
        const cryptoPct = allValue > 0 ? (cryptoValue/allValue*100) : 0;
        return (
          <div style={{...s.card,marginBottom:16}}>
            <div style={s.cardTitle}>Total portfolio</div>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',marginBottom:12}}>
              <div style={{fontSize:28,fontWeight:500}}>${Math.round(allValue).toLocaleString()}</div>
              <div style={{fontSize:13,color:allGain>=0?'#0F6E56':'#A32D2D',fontWeight:500}}>
                {allGain>=0?'+':''}{Math.round(allGain).toLocaleString()} ({allCost>0?((allGain/allCost)*100).toFixed(1):0}%)
              </div>
            </div>
            <div style={{display:'flex',height:8,borderRadius:99,overflow:'hidden',marginBottom:10}}>
              <div style={{width:`${secPct}%`,background:'#534AB7'}}></div>
              <div style={{width:`${cryptoPct}%`,background:'#BA7517'}}></div>
            </div>
            <div style={{display:'flex',gap:20,fontSize:12,color:'#888'}}>
              <span><span style={{display:'inline-block',width:8,height:8,borderRadius:2,background:'#534AB7',marginRight:5}}></span>Securities ${Math.round(secValue).toLocaleString()} ({secPct.toFixed(1)}%)</span>
              <span><span style={{display:'inline-block',width:8,height:8,borderRadius:2,background:'#BA7517',marginRight:5}}></span>Crypto ${Math.round(cryptoValue).toLocaleString()} ({cryptoPct.toFixed(1)}%)</span>
            </div>
          </div>
        );
      })()}

      {/* Sub tabs */}
      <div style={{display:'flex',gap:4,marginBottom:16}}>
        <button style={s.subTab(subTab==='securities')} onClick={()=>setSubTab('securities')}>Securities</button>
        <button style={s.subTab(subTab==='crypto')} onClick={()=>setSubTab('crypto')}>Crypto</button>
      </div>

      {/* Summary metrics */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(130px,1fr))',gap:10,marginBottom:16}}>
        <div style={s.metric}><div style={s.metricLabel}>Market value</div><div style={s.metricValue}>${Math.round(totalValue).toLocaleString()}</div></div>
        <div style={s.metric}><div style={s.metricLabel}>Book value</div><div style={s.metricValue}>${Math.round(totalCost).toLocaleString()}</div></div>
        <div style={s.metric}><div style={s.metricLabel}>Gain / loss</div><div style={{...s.metricValue,color:totalGain>=0?'#0F6E56':'#A32D2D'}}>{totalGain>=0?'+':''}{Math.round(totalGain).toLocaleString()}</div></div>
        <div style={s.metric}><div style={s.metricLabel}>Return</div><div style={{...s.metricValue,color:totalGain>=0?'#0F6E56':'#A32D2D'}}>{totalCost>0?((totalGain/totalCost)*100).toFixed(1):0}%</div></div>
        <div style={s.metric}><div style={s.metricLabel}>Positions</div><div style={s.metricValue}>{filteredHoldings.length}</div></div>
      </div>

      {/* Monthly invested */}
      {monthlyData.length>0&&(
        <div style={s.card}>
          <div style={s.cardTitle}>Monthly invested</div>
          <MiniBar data={monthlyData} color={isCrypto?'#BA7517':'#534AB7'} />
        </div>
      )}

      {/* Income */}
      {incomeData.length>0&&(
        <div style={s.card}>
          <div style={s.cardTitle}>{isCrypto?'Staking rewards':'Dividends & interest'} · total ${totalIncome.toFixed(2)}</div>
          <MiniBar data={incomeData} color='#1D9E75' />
        </div>
      )}

      {/* Holdings by account */}
      {accounts.map(acct=>{
        const rows = filteredHoldings.filter(h=>h.account_type===acct).sort((a,b)=>b.marketValueCAD-a.marketValueCAD);
        if(!rows.length) return null;
        const acctValue = rows.reduce((s,h)=>s+h.marketValueCAD,0);
        const acctCost = rows.reduce((s,h)=>s+h.bookValueCAD,0);
        const acctGain = acctValue-acctCost;
        return (
          <div key={acct} style={s.card}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
              <div style={{display:'flex',alignItems:'center',gap:8}}>
                <div style={{width:10,height:10,borderRadius:2,background:ACCT_COLORS[acct]||'#888'}}></div>
                <div style={{fontSize:13,fontWeight:500}}>{acct}</div>
              </div>
              <div style={{fontSize:12,color:'#888'}}>
                ${Math.round(acctValue).toLocaleString()} &nbsp;
                <span style={{color:acctGain>=0?'#0F6E56':'#A32D2D'}}>
                  {acctGain>=0?'+':''}{acctCost>0?((acctGain/acctCost)*100).toFixed(1):0}%
                </span>
              </div>
            </div>
            {rows.map((h,i)=>{
              const gainCAD = h.marketValueCAD - h.bookValueCAD;
              const gainPct = h.bookValueCAD>0?(gainCAD/h.bookValueCAD*100):0;
              return (
                <div key={i} style={s.row}>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontWeight:500}}>{h.symbol} <span style={{fontSize:11,color:'#888',fontWeight:400}}>{(h.name||'').slice(0,35)}</span></div>
                    <div style={{fontSize:11,color:'#888'}}>{Number(h.quantity).toFixed(4)} units · book ${Number(h.book_value_cad).toFixed(2)} CAD {h.market_value_currency==='USD'?'· USD pos':''}</div>
                  </div>
                  <div style={{textAlign:'right',flexShrink:0}}>
                    <div style={{fontWeight:500}}>${Math.round(h.marketValueCAD).toLocaleString()}</div>
                    <div style={{fontSize:11,color:gainCAD>=0?'#0F6E56':'#A32D2D'}}>
                      {gainCAD>=0?'+':''}{Math.round(gainCAD).toLocaleString()} ({gainPct.toFixed(1)}%)
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}

      {/* Activity history */}
      {activities.length>0&&(
        <div style={s.card}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
            <div style={s.cardTitle}>Activity history</div>
            <select style={s.select} value={historyFilter} onChange={e=>setHistoryFilter(e.target.value)}>
              {activityTypes.map(t=><option key={t}>{t}</option>)}
            </select>
          </div>
          {historyRows.map((a,i)=>(
            <div key={i} style={s.row}>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontWeight:500}}>{a.symbol||a.activity_type} {a.symbol&&<span style={{fontSize:11,color:'#888',fontWeight:400}}>{(a.name||'').slice(0,30)}</span>}</div>
                <div style={{fontSize:11,color:'#888'}}>{a.date} · {a.account} · {a.activity_type}</div>
              </div>
              <div style={{textAlign:'right',flexShrink:0}}>
                {a.quantity?<div style={{fontWeight:500}}>{a.quantity>0?'+':''}{Number(a.quantity).toFixed(4)} @ ${Number(a.unit_price||0).toFixed(2)}</div>:null}
                <div style={{fontSize:11,color:a.net_cash>=0?'#0F6E56':'#A32D2D'}}>
                  {a.net_cash>=0?'+':''}{Number(a.net_cash||0).toFixed(2)} {a.currency}
                </div>
              </div>
            </div>
          ))}
          {historyRows.length===0&&<p style={s.hint}>No activities match this filter.</p>}
        </div>
      )}
    </div>
  );
}

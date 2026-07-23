import React, { useState, useEffect } from 'react';
import { supabase } from './supabase';
import { categorize, CATEGORIES, CAT_COLORS, EXPENSE_CATS } from './categorize';
import { parseFile, detectFileSource } from './parseFiles';
import './App.css';
import Investments from './Investments';
import WiseTab from './Wise';

export default function App() {
  const [tab, setTab] = useState('dashboard');
  const [transactions, setTransactions] = useState([]);
  const [rules, setRules] = useState({});
  const [holdings, setHoldings] = useState([]);
  const [prices, setPrices] = useState({});
  const [insights, setInsights] = useState([]);
  const [wiseTxs, setWiseTxs] = useState([]);
  const [trips, setTrips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState('');
  const [uploadPrompt, setUploadPrompt] = useState(null); // { file, source } waiting for user input
  const [insightLoading, setInsightLoading] = useState(false);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [filterCard, setFilterCard] = useState('All');
  const [filterCat, setFilterCat] = useState('All');
  const [searchQ, setSearchQ] = useState('');
  const [editTx, setEditTx] = useState(null);
  const [editCat, setEditCat] = useState('');
  const [activePreset, setActivePreset] = useState('all');
  const [fromMonth, setFromMonthState] = useState('');
  const [fromYear, setFromYearState] = useState('');
  const [toMonth, setToMonthState] = useState('');
  const [toYear, setToYearState] = useState('');

  function updateFromDate(month, year) {
    if (month && year) {
      setDateFrom(`${year}-${String(month).padStart(2,'0')}-01`);
    }
    // if only one is set, do nothing - wait for the other
  }

  function updateToDate(month, year) {
    if (month && year) {
      const last = new Date(parseInt(year), parseInt(month), 0).getDate();
      setDateTo(`${year}-${String(month).padStart(2,'0')}-${last}`);
    }
    // if only one is set, do nothing - wait for the other
  }

  function handleFromMonth(m) { setFromMonthState(m); updateFromDate(m, fromYear); setActivePreset('custom'); }
  function handleFromYear(y) { setFromYearState(y); updateFromDate(fromMonth, y); setActivePreset('custom'); }
  function handleToMonth(m) { setToMonthState(m); updateToDate(m, toYear); setActivePreset('custom'); }
  function handleToYear(y) { setToYearState(y); updateToDate(toMonth, y); setActivePreset('custom'); }

  function applyPreset(preset) {
    const now = new Date();
    const fmt = d => d.toISOString().slice(0,10);
    const pad = n => String(n).padStart(2,'0');
    let fromD, toD;
    switch(preset) {
      case 'this_month': fromD=new Date(now.getFullYear(),now.getMonth(),1); toD=now; break;
      case 'last_month': fromD=new Date(now.getFullYear(),now.getMonth()-1,1); toD=new Date(now.getFullYear(),now.getMonth(),0); break;
      case '3m': { fromD=new Date(now); fromD.setMonth(fromD.getMonth()-3); toD=now; break; }
      case '6m': { fromD=new Date(now); fromD.setMonth(fromD.getMonth()-6); toD=now; break; }
      case 'ytd': fromD=new Date(now.getFullYear(),0,1); toD=now; break;
      default:
        setDateFrom(''); setDateTo('');
        setFromMonthState(''); setFromYearState('');
        setToMonthState(''); setToYearState('');
        setActivePreset('all'); return;
    }
    setDateFrom(fmt(fromD));
    setDateTo(fmt(toD));
    setFromMonthState(pad(fromD.getMonth()+1));
    setFromYearState(String(fromD.getFullYear()));
    setToMonthState(pad(toD.getMonth()+1));
    setToYearState(String(toD.getFullYear()));
    setActivePreset(preset);
  }

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    setLoading(true);
    try {
      const [
        { data: txData },
        { data: ruleData },
        { data: holdData },
        { data: insData },
        { data: wiseData },
        { data: tripData },
      ] = await Promise.all([
        supabase.from('transactions').select('*').order('date', { ascending: false }).range(0, 9999),
        supabase.from('category_rules').select('*'),
        supabase.from('holdings').select('*'),
        supabase.from('insights').select('*').order('created_at', { ascending: false }).limit(10),
        supabase.from('wise_transactions').select('*').order('created_on', { ascending: false }),
        supabase.from('trips').select('*').order('start_date', { ascending: false }),
      ]);
      if (txData) setTransactions(txData);
      if (ruleData) {
        const r = {};
        ruleData.forEach(row => { r[row.description_key] = row.category; });
        setRules(r);
      }
      if (holdData) setHoldings(holdData);
      if (insData) setInsights(insData);
      if (wiseData) setWiseTxs(wiseData);
      if (tripData) setTrips(tripData);
    } catch (e) { console.error(e); }
    setLoading(false);
  }

  const txWithCats = transactions.map(tx => ({
    ...tx, category: tx.category_override || categorize(tx.description, rules),
  }));

  const filtered = txWithCats.filter(tx => {
    if (dateFrom && tx.date < dateFrom) return false;
    if (dateTo && tx.date > dateTo) return false;
    if (filterCard !== 'All' && tx.card !== filterCard) return false;
    if (filterCat !== 'All' && tx.category !== filterCat) return false;
    if (searchQ && !tx.description.toLowerCase().includes(searchQ.toLowerCase())) return false;
    return true;
  });

  const expenseTxs = filtered.filter(tx => !tx.is_credit && EXPENSE_CATS.has(tx.category));
  const incomeTxs = filtered.filter(tx => tx.is_credit && tx.category === 'Income');
  const totalExpenses = expenseTxs.reduce((s, tx) => s + Number(tx.amount), 0);
  const totalIncome = incomeTxs.reduce((s, tx) => s + Number(tx.amount), 0);

  const catTotals = {};
  expenseTxs.forEach(tx => { catTotals[tx.category] = (catTotals[tx.category] || 0) + Number(tx.amount); });
  const catData = Object.entries(catTotals).sort((a, b) => b[1] - a[1]);

  const monthlyMap = {};
  expenseTxs.forEach(tx => { const m = tx.date.slice(0, 7); monthlyMap[m] = (monthlyMap[m] || 0) + Number(tx.amount); });
  const monthlyData = Object.entries(monthlyMap).sort();

  const cards = ['All', ...new Set(txWithCats.map(tx => tx.card))].filter(Boolean).sort();

  async function handleFiles(files) {
    for (const file of files) {
      const detection = await detectFileSource(file);
      if (detection.confidence === 'low' || detection.needsCardName) {
        // Unknown or ambiguous — show prompt
        setUploadPrompt({ file, source: detection.source });
        return; // handle one at a time
      }
      await uploadSingleFile(file, null);
    }
  }

  async function uploadSingleFile(file, cardNameOverride) {
    setUploading(true);
    const existingIds = new Set(transactions.map(t => t.id));
    let added = 0; let dupes = 0;
    const parsed = await parseFile(file, cardNameOverride);
    const newOnes = parsed.filter(tx => !existingIds.has(tx.id));
    dupes = parsed.length - newOnes.length;
    if (newOnes.length > 0) {
      const { error } = await supabase.from('transactions').insert(newOnes);
      if (!error) added = newOnes.length;
      else console.error(error);
    }
    await loadAll();
    setUploadMsg(`Added ${added} transaction${added !== 1 ? 's' : ''}${dupes ? `, skipped ${dupes} duplicates` : ''}.`);
    setUploading(false);
  }

  async function handlePromptChoice(cardNameOverride) {
    if (!uploadPrompt) return;
    const file = uploadPrompt.file;
    setUploadPrompt(null);
    await uploadSingleFile(file, cardNameOverride);
  }

  async function applyOverride(tx, newCat) {
    await supabase.from('transactions').update({ category_override: newCat }).eq('id', tx.id);
    await supabase.from('category_rules').upsert({ description_key: tx.description.trim().toUpperCase(), category: newCat });
    await loadAll();
    setEditTx(null);
  }

  async function generateInsights() {
    setInsightLoading(true);
    try {
      const catSummary = {};
      txWithCats.filter(tx => !tx.is_credit && EXPENSE_CATS.has(tx.category))
        .forEach(tx => { catSummary[tx.category] = (catSummary[tx.category] || 0) + Number(tx.amount); });
      const monthSummary = {};
      txWithCats.filter(tx => !tx.is_credit && EXPENSE_CATS.has(tx.category))
        .forEach(tx => { const m = tx.date.slice(0,7); monthSummary[m] = (monthSummary[m]||0)+Number(tx.amount); });
      const merchantSummary = {};
      txWithCats.filter(tx => !tx.is_credit && EXPENSE_CATS.has(tx.category))
        .forEach(tx => { merchantSummary[tx.description] = (merchantSummary[tx.description]||0)+Number(tx.amount); });
      const top5 = Object.entries(merchantSummary).sort((a,b)=>b[1]-a[1]).slice(0,5);
      const prompt = `You are a personal finance analyst for a young professional in Toronto. Here is their spending data:\n\nCategory totals (CAD): ${JSON.stringify(catSummary)}\nMonthly totals: ${JSON.stringify(monthSummary)}\nTop merchants: ${JSON.stringify(top5)}\n\nGenerate 5 concise, specific, actionable insights. Be direct and specific to this data. Return ONLY a JSON array with objects containing: "type" (pattern, anomaly, suggestion, or positive) and "text" (one to two sentences). No markdown, no preamble.`;
      const resp = await fetch('/api/insights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
      });
      const data = await resp.json();
      const raw = data.content?.[0]?.text || '[]';
      const parsed = JSON.parse(raw.replace(/```json|```/g, '').trim());
      await supabase.from('insights').insert({ insights: parsed, created_at: new Date().toISOString() });
      await loadAll();
    } catch (e) { console.error(e); }
    setInsightLoading(false);
  }

  async function fetchPrices(tickers) {
    const newPrices = {};
    await Promise.all(tickers.map(async ticker => {
      try {
        const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=1d`);
        const j = await r.json();
        const price = j?.chart?.result?.[0]?.meta?.regularMarketPrice;
        if (price) newPrices[ticker] = price;
      } catch {}
    }));
    setPrices(p => ({ ...p, ...newPrices }));
  }

  useEffect(() => {
    if (holdings.length) fetchPrices(holdings.map(h => h.ticker));
  }, [holdings.length]);

  const portfolioRows = holdings.map(h => {
    const price = prices[h.ticker] || null;
    const currentValue = price ? price * h.shares : null;
    const costBasis = h.avg_cost * h.shares;
    const gain = currentValue != null ? currentValue - costBasis : null;
    const gainPct = costBasis > 0 && gain != null ? (gain / costBasis) * 100 : null;
    return { ...h, price, currentValue, costBasis, gain, gainPct };
  });
  const totalPortfolioValue = portfolioRows.reduce((s, r) => s + (r.currentValue || 0), 0);
  const totalCostBasis = portfolioRows.reduce((s, r) => s + r.costBasis, 0);
  const totalGain = totalPortfolioValue - totalCostBasis;

  const insightColors = { pattern: '#534AB7', anomaly: '#D85A30', suggestion: '#0F6E56', positive: '#1D9E75' };

  if (loading) return <div className="loading">Loading your data…</div>;

  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const YEARS = [];
  for(let y=2023; y<=new Date().getFullYear(); y++) YEARS.push(y);

  return (
    <div className="app">
      <div className="header">
        <div>
          <h1>Finance Dashboard</h1>
          <p className="subtitle">{transactions.length} transactions · {new Set(transactions.map(t => t.card)).size} accounts</p>
        </div>
      </div>

      <div className="tabs">
        {[['dashboard','Overview'],['transactions','Transactions'],['investments','Investments'],['wise','Wise & Travels'],['insights','Insights'],['settings','Settings']].map(([id, label]) => (
          <button key={id} className={`tab ${tab === id ? 'active' : ''}`} onClick={() => setTab(id)}>{label}</button>
        ))}
      </div>

      {tab === 'dashboard' && (
        <div>
          <div style={{display:'flex',gap:6,marginBottom:10,flexWrap:'wrap'}}>
            {[['all','All'],['this_month','This month'],['last_month','Last month'],['3m','3 months'],['6m','6 months'],['ytd','YTD']].map(([p,label])=>(
              <button key={p} onClick={()=>applyPreset(p)} style={{padding:'5px 12px',fontSize:12,borderRadius:99,border:'1px solid',cursor:'pointer',borderColor:activePreset===p?'#534AB7':'#e0e0e0',background:activePreset===p?'#534AB7':'#fff',color:activePreset===p?'#fff':'#888'}}>{label}</button>
            ))}
          </div>
          <div className="filters" style={{alignItems:'center'}}>
            <div style={{display:'flex',gap:4,alignItems:'center'}}>
              <span style={{fontSize:12,color:'#888',whiteSpace:'nowrap'}}>From</span>
              <select style={{padding:'6px 8px',fontSize:12,border:'1px solid #e0e0e0',borderRadius:8,background:'#fff'}} value={fromMonth} onChange={e=>handleFromMonth(e.target.value)}>
                <option value="">Month</option>
                {MONTHS.map((m,i)=><option key={i+1} value={String(i+1).padStart(2,'0')}>{m}</option>)}
              </select>
              <select style={{padding:'6px 8px',fontSize:12,border:'1px solid #e0e0e0',borderRadius:8,background:'#fff'}} value={fromYear} onChange={e=>handleFromYear(e.target.value)}>
                <option value="">Year</option>
                {YEARS.map(y=><option key={y}>{y}</option>)}
              </select>
            </div>
            <div style={{display:'flex',gap:4,alignItems:'center'}}>
              <span style={{fontSize:12,color:'#888',whiteSpace:'nowrap'}}>To</span>
              <select style={{padding:'6px 8px',fontSize:12,border:'1px solid #e0e0e0',borderRadius:8,background:'#fff'}} value={toMonth} onChange={e=>handleToMonth(e.target.value)}>
                <option value="">Month</option>
                {MONTHS.map((m,i)=><option key={i+1} value={String(i+1).padStart(2,'0')}>{m}</option>)}
              </select>
              <select style={{padding:'6px 8px',fontSize:12,border:'1px solid #e0e0e0',borderRadius:8,background:'#fff'}} value={toYear} onChange={e=>handleToYear(e.target.value)}>
                <option value="">Year</option>
                {YEARS.map(y=><option key={y}>{y}</option>)}
              </select>
            </div>
            <select value={filterCard} onChange={e => setFilterCard(e.target.value)}>
              {cards.map(c => <option key={c}>{c}</option>)}
            </select>
            <button className="btn" onClick={() => { setDateFrom(''); setDateTo(''); setFilterCard('All'); setFilterCat('All'); setActivePreset('all'); setFromMonthState(''); setFromYearState(''); setToMonthState(''); setToYearState(''); }}>Clear</button>
          </div>
          <div className="metrics">
            <div className="metric"><div className="metric-label">Total expenses</div><div className="metric-value">${Math.round(totalExpenses).toLocaleString()}</div></div>
            <div className="metric"><div className="metric-label">Total income</div><div className="metric-value green">${Math.round(totalIncome).toLocaleString()}</div></div>
            <div className="metric"><div className="metric-label">Transactions</div><div className="metric-value">{filtered.length}</div></div>
            <div className="metric"><div className="metric-label">Avg / month</div><div className="metric-value">${monthlyData.length ? Math.round(totalExpenses / monthlyData.length).toLocaleString() : '—'}</div></div>
          </div>
          {monthlyData.length > 0 && (
            <div className="card">
              <div className="card-title">Monthly expenses</div>
              <div className="bar-chart" style={{overflowX:"auto",minWidth:0}}>
                {monthlyData.map(([m, v], idx) => {
                  const [yr, mo] = m.split('-');
                  const label = MONTHS[parseInt(mo)-1] + ' ' + yr.slice(2);
                  const total = monthlyData.length;
                  const showLabel = total <= 12 || idx % Math.ceil(total/12) === 0 || idx === total-1;
                  return (
                    <div key={m} className="bar-col" style={{minWidth:total>18?'28px':undefined}}>
                      <div className="bar-val" style={{fontSize:9}}>{v>=1000?'$'+Math.round(v/1000)+'k':'$'+Math.round(v)}</div>
                      <div className="bar" style={{ height: `${(v / Math.max(...monthlyData.map(x=>x[1]))) * 140}px`, background: '#534AB7' }}></div>
                      <div className="bar-label" style={{fontSize:9,transform:'rotate(-35deg)',transformOrigin:'top center',whiteSpace:'nowrap'}}>{showLabel ? label : ''}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {catData.length > 0 && (
            <div className="card">
              <div className="card-title">By category</div>
              {catData.slice(0, 10).map(([cat, amt]) => (
                <div key={cat} className="cat-row">
                  <div className="cat-dot" style={{ background: CAT_COLORS[cat] || '#888' }}></div>
                  <div className="cat-name">{cat}</div>
                  <div className="cat-bar-wrap">
                    <div className="cat-bar" style={{ width: `${(amt / catData[0][1]) * 100}%`, background: CAT_COLORS[cat] || '#888' }}></div>
                  </div>
                  <div className="cat-amt">${Math.round(amt).toLocaleString()}</div>
                </div>
              ))}
            </div>
          )}
          {transactions.length === 0 && (
            <div className="empty">
              <div className="empty-icon">📂</div>
              <div className="empty-title">No data yet</div>
              <div className="empty-sub">Go to Settings to upload your statement files.</div>
            </div>
          )}
        </div>
      )}

      {tab === 'transactions' && ((() => {
        const ddStyle = {padding:'6px 8px',fontSize:12,border:'1px solid #e0e0e0',borderRadius:8,background:'#fff'};
        return (
        <div>
          <div className="filters" style={{alignItems:'center',flexWrap:'wrap'}}>
            <input placeholder="Search…" value={searchQ} onChange={e => setSearchQ(e.target.value)} style={{minWidth:120}} />
            <div style={{display:'flex',gap:4,alignItems:'center'}}>
              <span style={{fontSize:12,color:'#888'}}>From</span>
              <select style={ddStyle} value={fromMonth} onChange={e=>handleFromMonth(e.target.value)}>
                <option value="">Month</option>
                {MONTHS.map((m,i)=><option key={i+1} value={String(i+1).padStart(2,'0')}>{m}</option>)}
              </select>
              <select style={ddStyle} value={fromYear} onChange={e=>handleFromYear(e.target.value)}>
                <option value="">Year</option>
                {YEARS.map(y=><option key={y}>{y}</option>)}
              </select>
            </div>
            <div style={{display:'flex',gap:4,alignItems:'center'}}>
              <span style={{fontSize:12,color:'#888'}}>To</span>
              <select style={ddStyle} value={toMonth} onChange={e=>handleToMonth(e.target.value)}>
                <option value="">Month</option>
                {MONTHS.map((m,i)=><option key={i+1} value={String(i+1).padStart(2,'0')}>{m}</option>)}
              </select>
              <select style={ddStyle} value={toYear} onChange={e=>handleToYear(e.target.value)}>
                <option value="">Year</option>
                {YEARS.map(y=><option key={y}>{y}</option>)}
              </select>
            </div>
            <select value={filterCat} onChange={e => setFilterCat(e.target.value)}>
              <option value="All">All categories</option>
              {CATEGORIES.map(c => <option key={c}>{c}</option>)}
            </select>
            <select value={filterCard} onChange={e => setFilterCard(e.target.value)}>
              {cards.map(c => <option key={c}>{c}</option>)}
            </select>
            <button className="btn" onClick={()=>{setDateFrom('');setDateTo('');setFilterCat('All');setFilterCard('All');setSearchQ('');setFromMonthState('');setFromYearState('');setToMonthState('');setToYearState('');setActivePreset('all');}}>Clear</button>
          </div>
          <p className="hint">{filtered.length} transactions · click a row to recategorize</p>
          <div className="card">
            {filtered.slice(0, 300).map(tx => (
              <div key={tx.id} className="tx-row" onClick={() => { setEditTx(tx); setEditCat(tx.category); }}>
                <div className="tx-left">
                  <div className="tx-desc">{tx.description}</div>
                  <div className="tx-meta">{tx.date} · {tx.card}</div>
                </div>
                <div className="tx-right">
                  <span className="badge" style={{ background: (CAT_COLORS[tx.category] || '#888') + '22', color: CAT_COLORS[tx.category] || '#888' }}>{tx.category}</span>
                  <span className={`tx-amt ${tx.is_credit ? 'green' : ''}`}>{tx.is_credit ? '+' : '-'}${Number(tx.amount).toFixed(2)}</span>
                </div>
              </div>
            ))}
          </div>
          {editTx && (
            <div className="modal-overlay" onClick={() => setEditTx(null)}>
              <div className="modal" onClick={e => e.stopPropagation()}>
                <div className="modal-title">{editTx.description}</div>
                <div className="modal-meta">{editTx.date} · {editTx.card} · ${Number(editTx.amount).toFixed(2)}</div>
                <p className="hint">Recategorize — saves rule for all future matches:</p>
                <select value={editCat} onChange={e => setEditCat(e.target.value)} style={{ width: '100%', marginBottom: 12 }}>
                  {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                </select>
                <div className="modal-btns">
                  <button className="btn-primary" onClick={() => applyOverride(editTx, editCat)}>Save rule</button>
                  <button className="btn" onClick={() => setEditTx(null)}>Cancel</button>
                </div>
              </div>
            </div>
          )}
        </div>
        );
      })())}

      {tab === 'investments' && <Investments />}

      {tab === 'wise' && (
        <WiseTab
          wiseTxs={wiseTxs}
          trips={trips}
          cardTxs={txWithCats}
          rules={rules}
          onReload={loadAll}
        />
      )}

      {tab === 'insights' && (
        <div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 20 }}>
            <button className="btn-primary" onClick={generateInsights} disabled={insightLoading}>
              {insightLoading ? 'Generating…' : 'Generate insights ↗'}
            </button>
            <span className="hint">Powered by Claude AI</span>
          </div>
          {insights.length === 0 && <div className="empty"><div className="empty-sub">Upload transactions and click generate.</div></div>}
          {insights.map((batch, bi) => (
            <div key={bi} style={{ marginBottom: 24 }}>
              <div className="hint" style={{ marginBottom: 8 }}>{new Date(batch.created_at).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>
              {(batch.insights || []).map((ins, ii) => (
                <div key={ii} className="insight" style={{ borderLeftColor: insightColors[ins.type] || '#888' }}>
                  <div className="insight-type" style={{ color: insightColors[ins.type] || '#888' }}>{ins.type}</div>
                  <div className="insight-text">{ins.text}</div>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {tab === 'settings' && (
        <div>
          <div className="card">
            <div className="card-title">Upload statements</div>
            <p className="hint">Drop any Amex XLS, Scene+ CSV, CIBC CSV, EQ Bank CSV. Source is auto-detected. Duplicates skipped.</p>
            <input type="file" multiple accept=".csv,.xls,.xlsx" onChange={e => handleFiles(Array.from(e.target.files))} />
            {uploading && <p className="hint">Processing…</p>}
            {uploadMsg && <p style={{ color: '#0F6E56', fontSize: 13, marginTop: 8 }}>{uploadMsg}</p>}
            {uploadPrompt && (
              <div style={{marginTop:12,padding:'16px',background:'#f5f5f3',borderRadius:10,border:'1px solid #e0e0e0'}}>
                <p style={{fontSize:13,fontWeight:500,marginBottom:4}}>
                  {uploadPrompt.source === 'Amex CSV' ? 'Which Amex card is this?' : "We couldn't identify this file — what is it?"}
                </p>
                <p style={{fontSize:12,color:'#888',marginBottom:12}}>{uploadPrompt.file.name}</p>
                {uploadPrompt.source === 'Amex CSV' ? (
                  <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
                    <button className="btn-primary" onClick={() => handlePromptChoice('Amex Cobalt')}>Amex Cobalt</button>
                    <button className="btn" onClick={() => handlePromptChoice('Amex Platinum')}>Amex Platinum</button>
                    <button className="btn" style={{color:'#888'}} onClick={() => setUploadPrompt(null)}>Cancel</button>
                  </div>
                ) : (
                  <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
                    {['Amex Cobalt','Amex Platinum','EQ Bank','CIBC Costco MC','Scene+ Visa','Wealthsimple Credit'].map(card => (
                      <button key={card} className="btn" onClick={() => handlePromptChoice(card)}>{card}</button>
                    ))}
                    <button className="btn" style={{color:'#888'}} onClick={() => setUploadPrompt(null)}>Cancel</button>
                  </div>
                )}
              </div>
            )}
          </div>
          <div className="card">
            <div className="card-title">Category rules ({Object.keys(rules).length} saved)</div>
            <p className="hint">These apply globally whenever that description appears.</p>
            {Object.entries(rules).length === 0 && <p className="hint">No custom rules yet.</p>}
            {Object.entries(rules).map(([desc, cat]) => (
              <div key={desc} className="tx-row">
                <div className="tx-desc" style={{ fontSize: 12 }}>{desc}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span className="badge" style={{ background: (CAT_COLORS[cat] || '#888') + '22', color: CAT_COLORS[cat] || '#888' }}>{cat}</span>
                  <button className="btn" style={{ padding: '2px 8px', fontSize: 11 }} onClick={async () => { await supabase.from('category_rules').delete().eq('description_key', desc); loadAll(); }}>×</button>
                </div>
              </div>
            ))}
          </div>
          <div className="card">
            <div className="card-title">Data</div>
            <p className="hint">{transactions.length} transactions · {Object.keys(rules).length} rules · {holdings.length} holdings · {wiseTxs.length} Wise transactions · {trips.length} trips</p>
            <button className="btn" style={{ color: '#A32D2D' }} onClick={async () => { if (window.confirm('Clear all transactions?')) { await supabase.from('transactions').delete().neq('id', ''); loadAll(); } }}>Clear all transactions</button>
          </div>
        </div>
      )}
    </div>
  );
}

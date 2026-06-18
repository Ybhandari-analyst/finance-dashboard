import React, { useState, useEffect } from 'react';
import { supabase } from './supabase';
import { categorize, CATEGORIES, CAT_COLORS, EXPENSE_CATS } from './categorize';
import { parseFile } from './parseFiles';
import './App.css';
import Investments from './Investments';
import WiseTab from './Wise';

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const YEARS = [];
for (let y = 2023; y <= new Date().getFullYear(); y++) YEARS.push(y);

export default function App() {
  const [tab, setTab] = useState('dashboard');
  const [transactions, setTransactions] = useState([]);
  const [rules, setRules] = useState({});
  const [holdings, setHoldings] = useState([]);
  const [insights, setInsights] = useState([]);
  const [wiseTxs, setWiseTxs] = useState([]);
  const [trips, setTrips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState('');
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
  const [clickedMonth, setClickedMonth] = useState(null);
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [sortOrder, setSortOrder] = useState('date_desc');
  const [amountMin, setAmountMin] = useState('');
  const [amountMax, setAmountMax] = useState('');

  // Fix: useEffect avoids stale closure on date handlers
  useEffect(() => {
    if (fromMonth && fromYear) {
      setDateFrom(`${fromYear}-${String(fromMonth).padStart(2,'0')}-01`);
    } else if (!fromMonth && fromYear) {
      setDateFrom(`${fromYear}-01-01`);
    } else if (!fromYear) {
      setDateFrom('');
    }
  }, [fromMonth, fromYear]);

  useEffect(() => {
    if (toMonth && toYear) {
      const last = new Date(parseInt(toYear), parseInt(toMonth), 0).getDate();
      setDateTo(`${toYear}-${String(toMonth).padStart(2,'0')}-${last}`);
    } else if (!toMonth && toYear) {
      setDateTo(`${toYear}-12-31`);
    } else if (!toYear) {
      setDateTo('');
    }
  }, [toMonth, toYear]);

  function handleFromMonth(m) { setFromMonthState(m); setActivePreset('custom'); }
  function handleFromYear(y) { setFromYearState(y); setActivePreset('custom'); }
  function handleToMonth(m) { setToMonthState(m); setActivePreset('custom'); }
  function handleToYear(y) { setToYearState(y); setActivePreset('custom'); }

  function clearFilters() {
    setDateFrom(''); setDateTo('');
    setFromMonthState(''); setFromYearState('');
    setToMonthState(''); setToYearState('');
    setFilterCard('All'); setFilterCat('All');
    setSearchQ(''); setActivePreset('all');
    setClickedMonth(null);
    setAmountMin(''); setAmountMax('');
    setSortOrder('date_desc');
  }

  function applyPreset(preset) {
    const now = new Date();
    const fmt = d => d.toISOString().slice(0,10);
    const pad = n => String(n).padStart(2,'0');
    if (preset === 'all') { clearFilters(); return; }
    let fromD, toD;
    if (preset === 'this_month') { fromD = new Date(now.getFullYear(), now.getMonth(), 1); toD = now; }
    else if (preset === 'last_month') { fromD = new Date(now.getFullYear(), now.getMonth()-1, 1); toD = new Date(now.getFullYear(), now.getMonth(), 0); }
    else if (preset === '3m') { fromD = new Date(now); fromD.setMonth(fromD.getMonth()-3); toD = now; }
    else if (preset === '6m') { fromD = new Date(now); fromD.setMonth(fromD.getMonth()-6); toD = now; }
    else if (preset === 'ytd') { fromD = new Date(now.getFullYear(), 0, 1); toD = now; }
    if (!fromD) return;
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
      let allTx = [];
      let from = 0;
      const batchSize = 1000;
      while (true) {
        const { data, error } = await supabase.from('transactions').select('*').order('date', { ascending: false }).range(from, from + batchSize - 1);
        if (error || !data || data.length === 0) break;
        allTx = [...allTx, ...data];
        if (data.length < batchSize) break;
        from += batchSize;
      }
      const [
        { data: ruleData },
        { data: holdData },
        { data: insData },
        { data: wiseData },
        { data: tripData },
      ] = await Promise.all([
        supabase.from('category_rules').select('*'),
        supabase.from('holdings').select('*'),
        supabase.from('insights').select('*').order('created_at', { ascending: false }).limit(10),
        supabase.from('wise_transactions').select('*').order('created_on', { ascending: false }),
        supabase.from('trips').select('*').order('start_date', { ascending: false }),
      ]);
      setTransactions(allTx);
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

  const filteredBase = txWithCats.filter(tx => {
    if (dateFrom && tx.date < dateFrom) return false;
    if (dateTo && tx.date > dateTo) return false;
    if (filterCard !== 'All' && tx.card !== filterCard) return false;
    if (filterCat !== 'All' && tx.category !== filterCat) return false;
    if (searchQ && !tx.description.toLowerCase().includes(searchQ.toLowerCase())) return false;
    if (amountMin !== '' && Number(tx.amount) < Number(amountMin)) return false;
    if (amountMax !== '' && Number(tx.amount) > Number(amountMax)) return false;
    return true;
  });

  const filtered = [...filteredBase].sort((a, b) => {
    if (sortOrder === 'date_desc') return b.date.localeCompare(a.date);
    if (sortOrder === 'date_asc') return a.date.localeCompare(b.date);
    if (sortOrder === 'amount_desc') return Number(b.amount) - Number(a.amount);
    if (sortOrder === 'amount_asc') return Number(a.amount) - Number(b.amount);
    return 0;
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

  // Chat context — all-time spend summary
  const catSummaryForChat = {};
  txWithCats.filter(tx => !tx.is_credit && EXPENSE_CATS.has(tx.category))
    .forEach(tx => { catSummaryForChat[tx.category] = (catSummaryForChat[tx.category] || 0) + Number(tx.amount); });
  const monthSummaryForChat = {};
  txWithCats.filter(tx => !tx.is_credit && EXPENSE_CATS.has(tx.category))
    .forEach(tx => { const m = tx.date.slice(0,7); monthSummaryForChat[m] = (monthSummaryForChat[m] || 0) + Number(tx.amount); });

  async function handleFiles(files) {
    setUploading(true); setUploadMsg('');
    const existingIds = new Set(transactions.map(t => t.id));
    let added = 0; let dupes = 0;
    for (const file of files) {
      const parsed = await parseFile(file);
      const newOnes = parsed.filter(tx => !existingIds.has(tx.id));
      dupes += parsed.length - newOnes.length;
      if (newOnes.length > 0) {
        const { error } = await supabase.from('transactions').insert(newOnes);
        if (!error) { added += newOnes.length; newOnes.forEach(tx => existingIds.add(tx.id)); }
        else console.error(error);
      }
    }
    await loadAll();
    setUploadMsg(`Added ${added} transactions${dupes ? `, skipped ${dupes} duplicates` : ''}.`);
    if (added > 0) generateInsights();
    setUploading(false);
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
      const expTxs = txWithCats.filter(tx => !tx.is_credit && EXPENSE_CATS.has(tx.category));

      // Monthly totals sorted
      const monthTotals = {};
      expTxs.forEach(tx => { const m = tx.date.slice(0,7); monthTotals[m] = (monthTotals[m]||0)+Number(tx.amount); });
      const monthsSorted = Object.entries(monthTotals).sort((a,b) => a[0].localeCompare(b[0]));
      const lastMonth = monthsSorted[monthsSorted.length-1];
      const prevMonth = monthsSorted[monthsSorted.length-2];
      const avgMonthly = monthsSorted.length ? monthsSorted.reduce((s,[,v])=>s+v,0)/monthsSorted.length : 0;

      // Category totals this month vs prior month
      const catThisMonth = {};
      const catPrevMonth = {};
      if (lastMonth) expTxs.filter(tx=>tx.date.startsWith(lastMonth[0])).forEach(tx=>{ catThisMonth[tx.category]=(catThisMonth[tx.category]||0)+Number(tx.amount); });
      if (prevMonth) expTxs.filter(tx=>tx.date.startsWith(prevMonth[0])).forEach(tx=>{ catPrevMonth[tx.category]=(catPrevMonth[tx.category]||0)+Number(tx.amount); });

      // 3-month rolling averages per category
      const last3Months = monthsSorted.slice(-3).map(([m])=>m);
      const catLast3 = {};
      expTxs.filter(tx=>last3Months.some(m=>tx.date.startsWith(m))).forEach(tx=>{ catLast3[tx.category]=(catLast3[tx.category]||0)+Number(tx.amount); });
      Object.keys(catLast3).forEach(k=>{ catLast3[k] = catLast3[k]/Math.min(3,last3Months.length); });

      // Top merchants all time
      const merchantTotals = {};
      expTxs.forEach(tx=>{ merchantTotals[tx.description]=(merchantTotals[tx.description]||0)+Number(tx.amount); });
      const top5Merchants = Object.entries(merchantTotals).sort((a,b)=>b[1]-a[1]).slice(0,5);

      // Large single transactions (>$500)
      const bigTxs = expTxs.filter(tx=>Number(tx.amount)>500).sort((a,b)=>Number(b.amount)-Number(a.amount)).slice(0,5)
        .map(tx=>({ date:tx.date, desc:tx.description, amount:Number(tx.amount), category:tx.category }));

      const prompt = `You are a personal finance analyst for a young professional in Toronto, Canada. Analyze this spending data and generate structured insights.

DATA:
- Most recent month: ${lastMonth ? lastMonth[0] + ' ($' + Math.round(lastMonth[1]).toLocaleString() + ')' : 'N/A'}
- Previous month: ${prevMonth ? prevMonth[0] + ' ($' + Math.round(prevMonth[1]).toLocaleString() + ')' : 'N/A'}
- Monthly average (all time): $${Math.round(avgMonthly).toLocaleString()}
- Month-over-month change: ${lastMonth && prevMonth ? (((lastMonth[1]-prevMonth[1])/prevMonth[1])*100).toFixed(1)+'%' : 'N/A'}
- All monthly totals: ${JSON.stringify(Object.fromEntries(monthsSorted))}
- Category totals this month: ${JSON.stringify(catThisMonth)}
- Category totals prior month: ${JSON.stringify(catPrevMonth)}
- 3-month rolling category averages: ${JSON.stringify(catLast3)}
- Top merchants all time: ${JSON.stringify(top5Merchants)}
- Large transactions (>$500): ${JSON.stringify(bigTxs)}

Generate exactly 8 insights across these three layers:
- 2 x "monthly" type: specific to the most recent complete month vs prior month and vs average. Always include the specific month name and dollar amounts.
- 3 x "trend" type: 3-month patterns per category. Name the category and the direction with percentages or dollar changes.
- 3 x "flag" type: anomalies, large one-off transactions, categories spiking vs normal, or actionable suggestions with specific numbers.

Rules:
- Every insight must include specific dollar amounts and/or percentages from the data
- Never say "spending" without specifying which category and which time period
- Be direct — "Food delivery rose 34% in [month] to $580 vs your $433 average" not "food delivery increased"
- Return ONLY a valid JSON array. Each object: { "type": "monthly"|"trend"|"flag", "text": "..." }
- No markdown, no preamble, no explanation outside the JSON array.`;

      const resp = await fetch('https://corsproxy.io/?url=' + encodeURIComponent('https://api.anthropic.com/v1/messages'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.REACT_APP_ANTHROPIC_KEY, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
        body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 1500, messages: [{ role: 'user', content: prompt }] }),
      });
      const data = await resp.json();
      const raw = data.content?.[0]?.text || '[]';
      const parsed = JSON.parse(raw.replace(/```json|```/g, '').trim());
      await supabase.from('insights').insert({ insights: parsed, created_at: new Date().toISOString() });
      await loadAll();
    } catch (e) { console.error(e); }
    setInsightLoading(false);
  }

  async function sendChat() {
    if (!chatInput.trim() || chatLoading) return;
    const userMsg = chatInput.trim();
    setChatInput('');
    const newMessages = [...chatMessages, { role: 'user', content: userMsg }];
    setChatMessages(newMessages);
    setChatLoading(true);
    try {
      // Build full transaction context for the chat
      const txForChat = txWithCats.map(tx => ({
        date: tx.date,
        desc: tx.description,
        amount: Number(tx.amount),
        card: tx.card,
        category: tx.category,
        credit: tx.is_credit,
      })).sort((a,b) => b.date.localeCompare(a.date));

      // Monthly totals per card for quick lookup
      const cardMonthlyTotals = {};
      txWithCats.filter(tx => !tx.is_credit && EXPENSE_CATS.has(tx.category)).forEach(tx => {
        const key = tx.card + '|' + tx.date.slice(0,7);
        cardMonthlyTotals[key] = (cardMonthlyTotals[key]||0) + Number(tx.amount);
      });

      const systemPrompt = `You are a personal finance analyst with full access to the user's transaction history. You can see every transaction including its date, description, amount, card/account, and category.

FULL TRANSACTION DATA (${txForChat.length} transactions):
${JSON.stringify(txForChat.slice(0, 800))}

CATEGORY TOTALS (all time): ${JSON.stringify(catSummaryForChat)}
MONTHLY TOTALS: ${JSON.stringify(monthSummaryForChat)}
CARD/MONTHLY BREAKDOWN: ${JSON.stringify(cardMonthlyTotals)}

When answering:
- Always reference specific transaction dates, amounts, and descriptions when relevant
- If asked about a specific month, look through the transaction data for that month
- If asked about a specific card/account, filter transactions by the card field
- Rent payments appear as "CHEXY" (older apartment, via Amex Platinum) or "Paris Holding Landlord" (current apartment, via EQ Bank)
- Be specific — quote actual transaction descriptions and amounts from the data
- If a transaction isn't in the data, say so clearly rather than guessing`;
      const resp = await fetch('https://corsproxy.io/?url=' + encodeURIComponent('https://api.anthropic.com/v1/messages'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.REACT_APP_ANTHROPIC_KEY, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
        body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 500, system: systemPrompt, messages: newMessages }),
      });
      const data = await resp.json();
      const reply = data.content?.[0]?.text || 'Sorry, could not get a response.';
      setChatMessages([...newMessages, { role: 'assistant', content: reply }]);
    } catch (e) {
      setChatMessages([...newMessages, { role: 'assistant', content: 'Error connecting to AI.' }]);
    }
    setChatLoading(false);
  }

  const insightColors = { pattern: '#534AB7', anomaly: '#D85A30', suggestion: '#0F6E56', positive: '#1D9E75', monthly: '#378ADD', trend: '#BA7517', flag: '#D85A30' };
  const ddStyle = { padding:'6px 8px', fontSize:12, border:'1px solid #e0e0e0', borderRadius:8, background:'#fff' };
  const presetBtnStyle = (active) => ({ padding:'5px 12px', fontSize:12, borderRadius:99, border:'1px solid', cursor:'pointer', borderColor: active ? '#534AB7' : '#e0e0e0', background: active ? '#534AB7' : '#fff', color: active ? '#fff' : '#888' });

  if (loading) return <div className="loading">Loading your data…</div>;

  return (
    <div className="app">
      <div className="header">
        <h1>Finance Dashboard</h1>
        <p className="subtitle">{transactions.length} transactions · {new Set(transactions.map(t => t.card)).size} accounts</p>
      </div>

      <div className="tabs">
        {[['dashboard','Overview'],['transactions','Transactions'],['investments','Investments'],['wise','Wise & Travels'],['insights','Insights'],['settings','Settings']].map(([id, label]) => (
          <button key={id} className={`tab ${tab === id ? 'active' : ''}`} onClick={() => setTab(id)}>{label}</button>
        ))}
      </div>

      {/* ── OVERVIEW ── */}
      {tab === 'dashboard' && (
        <div>
          <div style={{display:'flex',gap:6,marginBottom:10,flexWrap:'wrap'}}>
            {[['all','All'],['this_month','This month'],['last_month','Last month'],['3m','3 months'],['6m','6 months'],['ytd','YTD']].map(([p,label]) => (
              <button key={p} style={presetBtnStyle(activePreset===p)} onClick={() => applyPreset(p)}>{label}</button>
            ))}
          </div>
          <div className="filters" style={{alignItems:'center'}}>
            <div style={{display:'flex',gap:4,alignItems:'center'}}>
              <span style={{fontSize:12,color:'#888',whiteSpace:'nowrap'}}>From</span>
              <select style={ddStyle} value={fromMonth} onChange={e => handleFromMonth(e.target.value)}>
                <option value="">Month</option>
                {MONTHS.map((m,i) => <option key={i+1} value={String(i+1).padStart(2,'0')}>{m}</option>)}
              </select>
              <select style={ddStyle} value={fromYear} onChange={e => handleFromYear(e.target.value)}>
                <option value="">Year</option>
                {YEARS.map(y => <option key={y}>{y}</option>)}
              </select>
            </div>
            <div style={{display:'flex',gap:4,alignItems:'center'}}>
              <span style={{fontSize:12,color:'#888',whiteSpace:'nowrap'}}>To</span>
              <select style={ddStyle} value={toMonth} onChange={e => handleToMonth(e.target.value)}>
                <option value="">Month</option>
                {MONTHS.map((m,i) => <option key={i+1} value={String(i+1).padStart(2,'0')}>{m}</option>)}
              </select>
              <select style={ddStyle} value={toYear} onChange={e => handleToYear(e.target.value)}>
                <option value="">Year</option>
                {YEARS.map(y => <option key={y}>{y}</option>)}
              </select>
            </div>
            <select value={filterCard} onChange={e => setFilterCard(e.target.value)}>
              {cards.map(c => <option key={c}>{c}</option>)}
            </select>
            <button className="btn" onClick={clearFilters}>Clear</button>
          </div>

          <div className="metrics">
            <div className="metric"><div className="metric-label">Total expenses</div><div className="metric-value">${Math.round(totalExpenses).toLocaleString()}</div></div>
            <div className="metric"><div className="metric-label">Total income</div><div className="metric-value green">${Math.round(totalIncome).toLocaleString()}</div></div>
            <div className="metric"><div className="metric-label">Transactions</div><div className="metric-value">{filtered.length}</div></div>
            <div className="metric"><div className="metric-label">Avg / month</div><div className="metric-value">${monthlyData.length ? Math.round(totalExpenses / monthlyData.length).toLocaleString() : '—'}</div></div>
          </div>

          {monthlyData.length > 0 && (
            <div className="card">
              <div className="card-title">
                Monthly expenses &nbsp;
                <span style={{fontWeight:400,textTransform:'none',color:'#aaa',fontSize:11,letterSpacing:0}}>click a bar to drill in</span>
              </div>
              <div style={{overflowX:'auto'}}>
                <div style={{display:'flex',alignItems:'flex-end',gap:4,height:260,paddingBottom:48,minWidth: monthlyData.length > 12 ? monthlyData.length * 38 + 'px' : '100%'}}>
                  {monthlyData.map(([m, v]) => {
                    const [yr, mo] = m.split('-');
                    const label = MONTHS[parseInt(mo)-1] + ' ' + yr.slice(2);
                    const maxV = Math.max(...monthlyData.map(x => x[1]));
                    const isActive = clickedMonth === m;
                    return (
                      <div key={m} style={{display:'flex',flexDirection:'column',alignItems:'center',flex:1,minWidth:28,height:'100%',justifyContent:'flex-end',cursor:'pointer'}}
                        onClick={() => {
                          setClickedMonth(m);
                          setFromMonthState(mo); setFromYearState(yr);
                          setToMonthState(mo); setToYearState(yr);
                          setActivePreset('custom');
                          setTab('transactions');
                        }}>
                        <div style={{fontSize:9,color:'#888',marginBottom:3}}>{v>=1000?'$'+Math.round(v/1000)+'k':'$'+Math.round(v)}</div>
                        <div style={{width:'100%',borderRadius:'4px 4px 0 0',background: isActive ? '#3533a0' : '#534AB7',height:`${(v/maxV)*190}px`,minHeight:2,transition:'background 0.2s'}}></div>
                        <div style={{fontSize:9,color:'#888',marginTop:6,transform:'rotate(-45deg)',transformOrigin:'top left',whiteSpace:'nowrap',paddingLeft:4}}>{label}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {catData.length > 0 && (
            <div className="card">
              <div className="card-title">By category</div>
              {catData.slice(0, 10).map(([cat, amt]) => (
                <div key={cat} className="cat-row">
                  <div className="cat-dot" style={{background: CAT_COLORS[cat] || '#888'}}></div>
                  <div className="cat-name">{cat}</div>
                  <div className="cat-bar-wrap">
                    <div className="cat-bar" style={{width:`${(amt/catData[0][1])*100}%`, background: CAT_COLORS[cat] || '#888'}}></div>
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

      {/* ── TRANSACTIONS ── */}
      {tab === 'transactions' && (
        <div>
          <div className="filters" style={{alignItems:'center',flexWrap:'wrap'}}>
            <input placeholder="Search…" value={searchQ} onChange={e => setSearchQ(e.target.value)} style={{minWidth:120}} />
            <select style={ddStyle} value={sortOrder} onChange={e => setSortOrder(e.target.value)}>
              <option value="date_desc">Newest first</option>
              <option value="date_asc">Oldest first</option>
              <option value="amount_desc">Amount high → low</option>
              <option value="amount_asc">Amount low → high</option>
            </select>
            <input type="number" placeholder="Min $" value={amountMin} onChange={e => setAmountMin(e.target.value)} style={{...ddStyle, width:72}} />
            <input type="number" placeholder="Max $" value={amountMax} onChange={e => setAmountMax(e.target.value)} style={{...ddStyle, width:72}} />
            <div style={{display:'flex',gap:4,alignItems:'center'}}>
              <span style={{fontSize:12,color:'#888'}}>From</span>
              <select style={ddStyle} value={fromMonth} onChange={e => handleFromMonth(e.target.value)}>
                <option value="">Month</option>
                {MONTHS.map((m,i) => <option key={i+1} value={String(i+1).padStart(2,'0')}>{m}</option>)}
              </select>
              <select style={ddStyle} value={fromYear} onChange={e => handleFromYear(e.target.value)}>
                <option value="">Year</option>
                {YEARS.map(y => <option key={y}>{y}</option>)}
              </select>
            </div>
            <div style={{display:'flex',gap:4,alignItems:'center'}}>
              <span style={{fontSize:12,color:'#888'}}>To</span>
              <select style={ddStyle} value={toMonth} onChange={e => handleToMonth(e.target.value)}>
                <option value="">Month</option>
                {MONTHS.map((m,i) => <option key={i+1} value={String(i+1).padStart(2,'0')}>{m}</option>)}
              </select>
              <select style={ddStyle} value={toYear} onChange={e => handleToYear(e.target.value)}>
                <option value="">Year</option>
                {YEARS.map(y => <option key={y}>{y}</option>)}
              </select>
            </div>
            <select value={filterCat} onChange={e => setFilterCat(e.target.value)}>
              <option value="All">All categories</option>
              {CATEGORIES.map(c => <option key={c}>{c}</option>)}
            </select>
            <select value={filterCard} onChange={e => setFilterCard(e.target.value)}>
              {cards.map(c => <option key={c}>{c}</option>)}
            </select>
            <button className="btn" onClick={clearFilters}>Clear</button>
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
                  <span className="badge" style={{background:(CAT_COLORS[tx.category]||'#888')+'22', color:CAT_COLORS[tx.category]||'#888'}}>{tx.category}</span>
                  <span className={`tx-amt ${tx.is_credit ? 'green' : ''}`}>{tx.is_credit?'+':'-'}${Number(tx.amount).toFixed(2)}</span>
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
                <select value={editCat} onChange={e => setEditCat(e.target.value)} style={{width:'100%',marginBottom:12}}>
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
      )}

      {/* ── INVESTMENTS ── */}
      {tab === 'investments' && <Investments />}

      {/* ── WISE & TRAVELS ── */}
      {tab === 'wise' && (
        <WiseTab wiseTxs={wiseTxs} trips={trips} cardTxs={txWithCats} rules={rules} onReload={loadAll} />
      )}

      {/* ── INSIGHTS ── */}
      {tab === 'insights' && (
        <div>
          <div style={{display:'flex',gap:12,alignItems:'center',marginBottom:20}}>
            <button className="btn-primary" onClick={generateInsights} disabled={insightLoading}>
              {insightLoading ? 'Generating…' : 'Generate insights ↗'}
            </button>
            <span className="hint">Powered by Claude AI</span>
          </div>

          {insights.length === 0 && (
            <div className="empty"><div className="empty-sub">Upload transactions and click generate.</div></div>
          )}

          {insights.map((batch, bi) => {
            const typeLabels = { monthly:'📅 This month', trend:'📈 Trend', flag:'🚩 Flag', pattern:'Pattern', anomaly:'Anomaly', suggestion:'Suggestion', positive:'Positive' };
            const grouped = { monthly:[], trend:[], flag:[], other:[] };
            (batch.insights || []).forEach(ins => {
              if (ins.type === 'monthly') grouped.monthly.push(ins);
              else if (ins.type === 'trend') grouped.trend.push(ins);
              else if (ins.type === 'flag') grouped.flag.push(ins);
              else grouped.other.push(ins);
            });
            return (
              <div key={bi} style={{marginBottom:28}}>
                <div className="hint" style={{marginBottom:12}}>
                  Generated {new Date(batch.created_at).toLocaleDateString('en-CA', {month:'short',day:'numeric',year:'numeric',hour:'2-digit',minute:'2-digit'})}
                </div>
                {[['monthly','monthly'],['trend','trend'],['flag','flag'],['other','other']].map(([key]) =>
                  grouped[key].length > 0 && (
                    <div key={key} style={{marginBottom:16}}>
                      <div style={{fontSize:11,fontWeight:600,color:'#888',textTransform:'uppercase',letterSpacing:'0.05em',marginBottom:6,paddingLeft:2}}>
                        {typeLabels[key] || key}
                      </div>
                      {grouped[key].map((ins, ii) => (
                        <div key={ii} className="insight" style={{borderLeftColor: insightColors[ins.type] || '#888', marginBottom:6}}>
                          <div className="insight-text">{ins.text}</div>
                        </div>
                      ))}
                    </div>
                  )
                )}
              </div>
            );
          })}

          <div className="card" style={{marginTop:8}}>
            <div className="card-title">Ask about your finances</div>
            <div style={{maxHeight:320,overflowY:'auto',marginBottom:12,display:'flex',flexDirection:'column',gap:8}}>
              {chatMessages.length === 0 && (
                <p className="hint">Ask anything — "why did March spike?", "what's my biggest category?", "how does food spending compare month to month?"</p>
              )}
              {chatMessages.map((msg, i) => (
                <div key={i} style={{display:'flex',justifyContent:msg.role==='user'?'flex-end':'flex-start'}}>
                  <div style={{maxWidth:'80%',padding:'8px 12px',borderRadius:msg.role==='user'?'12px 12px 2px 12px':'12px 12px 12px 2px',background:msg.role==='user'?'#534AB7':'#f5f5f3',color:msg.role==='user'?'#fff':'#1a1a1a',fontSize:13,lineHeight:1.5}}>
                    {msg.content}
                  </div>
                </div>
              ))}
              {chatLoading && (
                <div style={{display:'flex',justifyContent:'flex-start'}}>
                  <div style={{padding:'8px 12px',background:'#f5f5f3',borderRadius:'12px 12px 12px 2px',fontSize:13,color:'#888'}}>Thinking…</div>
                </div>
              )}
            </div>
            <div style={{display:'flex',gap:8}}>
              <input
                style={{flex:1,padding:'8px 12px',fontSize:13,border:'1px solid #e0e0e0',borderRadius:8,background:'#fff'}}
                placeholder="Ask a question about your spending…"
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && sendChat()}
              />
              <button className="btn-primary" onClick={sendChat} disabled={chatLoading || !chatInput.trim()}>Send</button>
            </div>
          </div>
        </div>
      )}

      {/* ── SETTINGS ── */}
      {tab === 'settings' && (
        <div>
          <div className="card">
            <div className="card-title">Upload statements</div>
            <p className="hint">Drop any Amex XLS, Scene+ CSV, CIBC CSV, EQ Bank CSV. Source is auto-detected. Duplicates skipped.</p>
            <input type="file" multiple accept=".csv,.xls,.xlsx" onChange={e => handleFiles(Array.from(e.target.files))} />
            {uploading && <p className="hint">Processing…</p>}
            {uploadMsg && <p style={{color:'#0F6E56',fontSize:13,marginTop:8}}>{uploadMsg}</p>}
          </div>
          <div className="card">
            <div className="card-title">Category rules ({Object.keys(rules).length} saved)</div>
            <p className="hint">These apply globally whenever that description appears.</p>
            {Object.entries(rules).length === 0 && <p className="hint">No custom rules yet.</p>}
            {Object.entries(rules).map(([desc, cat]) => (
              <div key={desc} className="tx-row">
                <div className="tx-desc" style={{fontSize:12}}>{desc}</div>
                <div style={{display:'flex',alignItems:'center',gap:8}}>
                  <span className="badge" style={{background:(CAT_COLORS[cat]||'#888')+'22',color:CAT_COLORS[cat]||'#888'}}>{cat}</span>
                  <button className="btn" style={{padding:'2px 8px',fontSize:11}} onClick={async () => { await supabase.from('category_rules').delete().eq('description_key', desc); loadAll(); }}>×</button>
                </div>
              </div>
            ))}
          </div>
          <div className="card">
            <div className="card-title">Data</div>
            <p className="hint">{transactions.length} transactions · {Object.keys(rules).length} rules · {holdings.length} holdings · {wiseTxs.length} Wise transactions · {trips.length} trips</p>
            <button className="btn" style={{color:'#A32D2D'}} onClick={async () => { if (window.confirm('Clear all transactions?')) { await supabase.from('transactions').delete().neq('id',''); loadAll(); } }}>Clear all transactions</button>
          </div>
        </div>
      )}
    </div>
  );
}

import React, { useState, useEffect } from 'react';
import { supabase } from './supabase';
import { EXPENSE_CATS, CAT_COLORS } from './categorize';

const BUDGET_CATS = [
  'Food Delivery','Dining & Drinks','Groceries','Shopping',
  'Entertainment & Events','Health & Wellness','Cannabis',
  'Transit & Rideshare','Subscriptions & Apps','Bills & Utilities',
  'Travel - Flights','Travel - Hotels','Rent','Other',
];

function getMonthKey(date) { return date.slice(0,7); }

function getLastNMonths(n) {
  const months = [];
  const now = new Date();
  for (let i = n-1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`);
  }
  return months;
}

function formatMonth(m) {
  const [yr, mo] = m.split('-');
  const names = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return names[parseInt(mo)-1] + ' ' + yr.slice(2);
}

export default function BudgetsTab({ transactions }) {
  const [budgets, setBudgets] = useState({});
  const [editValues, setEditValues] = useState({});
  const [trendWindow, setTrendWindow] = useState(6);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');

  useEffect(() => { loadBudgets(); }, []);

  async function loadBudgets() {
    const { data } = await supabase.from('budgets').select('*');
    if (data) {
      const b = {};
      data.forEach(row => { b[row.category] = row.target_amount; });
      setBudgets(b);
      setEditValues(b);
    }
  }

  // Compute monthly spend per category from transactions
  const expenseTxs = (transactions || []).filter(tx =>
    !tx.is_credit && EXPENSE_CATS.has(tx.category)
  );

  const months6 = getLastNMonths(6);
  const months3 = getLastNMonths(3);
  const currentMonth = getMonthKey(new Date().toISOString());

  // Monthly spend map: { category: { '2026-05': 450, ... } }
  const monthlySpend = {};
  BUDGET_CATS.forEach(cat => { monthlySpend[cat] = {}; });
  expenseTxs.forEach(tx => {
    const cat = tx.category;
    const m = getMonthKey(tx.date);
    if (!monthlySpend[cat]) monthlySpend[cat] = {};
    monthlySpend[cat][m] = (monthlySpend[cat][m] || 0) + Number(tx.amount);
  });

  // Averages
  function avg(cat, months) {
    const vals = months.map(m => monthlySpend[cat]?.[m] || 0);
    const nonZero = vals.filter(v => v > 0);
    if (!nonZero.length) return 0;
    return nonZero.reduce((s,v) => s+v, 0) / nonZero.length;
  }

  function autoSetAll(months) {
    const newVals = {};
    BUDGET_CATS.forEach(cat => {
      const a = avg(cat, months);
      if (a > 0) newVals[cat] = Math.round(a);
    });
    setEditValues(prev => ({ ...prev, ...newVals }));
  }

  async function saveAll() {
    setSaving(true); setSaveMsg('');
    const rows = Object.entries(editValues)
      .filter(([, v]) => v !== '' && !isNaN(Number(v)))
      .map(([category, target_amount]) => ({
        category, target_amount: Number(target_amount), updated_at: new Date().toISOString()
      }));
    for (const row of rows) {
      await supabase.from('budgets').upsert(row, { onConflict: 'category' });
    }
    await loadBudgets();
    setSaving(false);
    setSaveMsg(`Saved ${rows.length} targets.`);
    setTimeout(() => setSaveMsg(''), 3000);
  }

  const trendMonths = trendWindow === 6 ? months6 : months3;
  const currentSpend = {};
  BUDGET_CATS.forEach(cat => {
    currentSpend[cat] = monthlySpend[cat]?.[currentMonth] || 0;
  });

  const s = {
    card: { background:'#fff', borderRadius:12, padding:'16px 20px', marginBottom:16, border:'1px solid #f0f0f0' },
    cardTitle: { fontSize:11, fontWeight:500, color:'#888', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:14 },
    btn: { padding:'6px 14px', fontSize:13, borderRadius:8, border:'1px solid #e0e0e0', background:'#fff', cursor:'pointer' },
    btnPrimary: { padding:'7px 16px', fontSize:13, borderRadius:8, border:'none', background:'#534AB7', color:'#fff', cursor:'pointer', fontWeight:500 },
    input: { padding:'6px 10px', fontSize:13, border:'1px solid #e0e0e0', borderRadius:8, width:90, textAlign:'right' },
    toggle: (active) => ({ padding:'5px 12px', fontSize:12, borderRadius:99, border:'1px solid', cursor:'pointer', borderColor: active?'#534AB7':'#e0e0e0', background: active?'#534AB7':'#fff', color: active?'#fff':'#888' }),
  };

  const catsWithData = BUDGET_CATS.filter(cat => {
    const hasHistory = trendMonths.some(m => (monthlySpend[cat]?.[m] || 0) > 0);
    const hasTarget = budgets[cat] > 0;
    return hasHistory || hasTarget;
  });

  return (
    <div>
      {/* Controls */}
      <div style={{display:'flex',gap:8,marginBottom:16,flexWrap:'wrap',alignItems:'center'}}>
        <button style={s.toggle(trendWindow===3)} onClick={()=>setTrendWindow(3)}>3 months</button>
        <button style={s.toggle(trendWindow===6)} onClick={()=>setTrendWindow(6)}>6 months</button>
        <div style={{flex:1}}/>
        <button style={s.btn} onClick={()=>autoSetAll(months3)}>Auto-set from 3-month avg</button>
        <button style={s.btn} onClick={()=>autoSetAll(months6)}>Auto-set from 6-month avg</button>
        <button style={s.btnPrimary} onClick={saveAll} disabled={saving}>
          {saving ? 'Saving…' : 'Save targets'}
        </button>
        {saveMsg && <span style={{fontSize:12,color:'#0F6E56'}}>{saveMsg}</span>}
      </div>

      {/* This month progress */}
      {Object.keys(budgets).length > 0 && (
        <div style={s.card}>
          <div style={s.cardTitle}>This month — {formatMonth(currentMonth)}</div>
          {catsWithData.filter(cat => budgets[cat] > 0).map(cat => {
            const spent = currentSpend[cat];
            const target = budgets[cat];
            const pct = target > 0 ? (spent / target) * 100 : 0;
            const color = pct >= 100 ? '#A32D2D' : pct >= 80 ? '#BA7517' : '#0F6E56';
            const barColor = pct >= 100 ? '#A32D2D' : pct >= 80 ? '#E9A93A' : CAT_COLORS[cat] || '#534AB7';
            return (
              <div key={cat} style={{marginBottom:14}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',marginBottom:4}}>
                  <div style={{display:'flex',alignItems:'center',gap:6}}>
                    <div style={{width:8,height:8,borderRadius:2,background:CAT_COLORS[cat]||'#888',flexShrink:0}}/>
                    <span style={{fontSize:13,fontWeight:500}}>{cat}</span>
                  </div>
                  <div style={{display:'flex',gap:12,alignItems:'baseline'}}>
                    <span style={{fontSize:13,color:'#888'}}>${Math.round(spent).toLocaleString()} of ${Math.round(target).toLocaleString()}</span>
                    <span style={{fontSize:12,fontWeight:500,color,width:42,textAlign:'right'}}>{Math.round(pct)}%</span>
                  </div>
                </div>
                <div style={{background:'#f5f5f3',borderRadius:4,height:8,overflow:'hidden'}}>
                  <div style={{width:`${Math.min(pct,100)}%`,background:barColor,height:'100%',borderRadius:4,transition:'width 0.3s'}}/>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Category trends + target inputs */}
      <div style={s.card}>
        <div style={s.cardTitle}>Category trends &amp; targets</div>

        {/* Column headers */}
        <div style={{display:'flex',alignItems:'center',gap:8,padding:'0 0 8px 0',borderBottom:'1px solid #f0f0f0',marginBottom:8}}>
          <div style={{width:180,fontSize:11,color:'#888',fontWeight:500}}>CATEGORY</div>
          <div style={{flex:1,fontSize:11,color:'#888',fontWeight:500}}>{trendWindow}-MONTH TREND</div>
          <div style={{width:80,fontSize:11,color:'#888',fontWeight:500,textAlign:'right'}}>3M AVG</div>
          <div style={{width:80,fontSize:11,color:'#888',fontWeight:500,textAlign:'right'}}>6M AVG</div>
          <div style={{width:100,fontSize:11,color:'#888',fontWeight:500,textAlign:'right'}}>TARGET / MO</div>
        </div>

        {catsWithData.map(cat => {
          const vals = trendMonths.map(m => monthlySpend[cat]?.[m] || 0);
          const maxVal = Math.max(...vals, 1);
          const avg3 = avg(cat, months3);
          const avg6 = avg(cat, months6);
          const target = editValues[cat] || '';
          const color = CAT_COLORS[cat] || '#534AB7';

          return (
            <div key={cat} style={{display:'flex',alignItems:'center',gap:8,padding:'10px 0',borderBottom:'1px solid #f5f5f5'}}>
              {/* Category name */}
              <div style={{width:180,flexShrink:0}}>
                <div style={{display:'flex',alignItems:'center',gap:6}}>
                  <div style={{width:8,height:8,borderRadius:2,background:color,flexShrink:0}}/>
                  <span style={{fontSize:13,fontWeight:500}}>{cat}</span>
                </div>
              </div>

              {/* Sparkline */}
              <div style={{flex:1,display:'flex',alignItems:'flex-end',gap:3,height:36}}>
                {vals.map((v, i) => (
                  <div key={i} style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',gap:2}}>
                    <div style={{width:'100%',background:v>0?color:'#f0f0f0',borderRadius:'2px 2px 0 0',height:`${(v/maxVal)*32}px`,minHeight:v>0?2:0,transition:'height 0.3s'}}/>
                    <div style={{fontSize:8,color:'#aaa',whiteSpace:'nowrap'}}>{formatMonth(trendMonths[i]).split(' ')[0]}</div>
                  </div>
                ))}
              </div>

              {/* 3m avg */}
              <div style={{width:80,textAlign:'right',fontSize:12,color:'#666',flexShrink:0}}>
                {avg3 > 0 ? '$'+Math.round(avg3).toLocaleString() : '—'}
              </div>

              {/* 6m avg */}
              <div style={{width:80,textAlign:'right',fontSize:12,color:'#666',flexShrink:0}}>
                {avg6 > 0 ? '$'+Math.round(avg6).toLocaleString() : '—'}
              </div>

              {/* Target input */}
              <div style={{width:100,textAlign:'right',flexShrink:0}}>
                <input
                  style={s.input}
                  type="number"
                  placeholder="—"
                  value={target}
                  onChange={e => setEditValues(prev => ({ ...prev, [cat]: e.target.value }))}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

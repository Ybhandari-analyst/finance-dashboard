import React, { useState } from 'react';
import { supabase } from './supabase';

const WISE_TO_LOCAL = {
  'Eating out':'Dining & Drinks','Groceries':'Groceries',
  'Transport':'Transit & Rideshare','Shopping':'Shopping',
  'Personal care':'Health & Wellness','Trips':'Travel - Hotels',
  'Bills':'Bills & Utilities','General':'Other','Money added':'Transfers',
};
const CURRENCY_FLAGS = { CAD:'🇨🇦', EUR:'🇪🇺', GBP:'🇬🇧', USD:'🇺🇸' };
const TRIP_COLORS = ['#534AB7','#D85A30','#1D9E75','#BA7517','#D4537E','#378ADD'];
const CAT_COLORS = {
  'Dining & Drinks':'#D4537E','Groceries':'#1D9E75','Transit & Rideshare':'#9FE1CB',
  'Shopping':'#888780','Health & Wellness':'#378ADD','Travel - Hotels':'#E9A93A',
  'Bills & Utilities':'#4A90D9','Other':'#B4B2A9',
};
const EXCLUDE_CATS = new Set(['Card Payment','Transfers','Investments','Card Fee','Refund / Credit']);

function parseWiseCSV(text) {
  const lines = text.trim().split('\n');
  const parseRow = line => {
    const result=[]; let cur=''; let inQ=false;
    for(let c of line){if(c==='"')inQ=!inQ;else if(c===','&&!inQ){result.push(cur.trim());cur='';}else cur+=c;}
    result.push(cur.trim()); return result;
  };
  const rows = lines.map(parseRow);
  const headers = rows[0].map(h=>h.toLowerCase().trim());
  const get = (row,col) => { const i=headers.findIndex(h=>h.includes(col)); return i>=0?(row[i]||'').trim():''; };
  return rows.slice(1).filter(r=>r.some(c=>c)).map(r=>({
    id: get(r,'id'), status: get(r,'status'), direction: get(r,'direction'),
    created_on: get(r,'created on'), finished_on: get(r,'finished on'),
    source_name: get(r,'source name'),
    source_amount: parseFloat(get(r,'source amount'))||0,
    source_currency: get(r,'source currency'),
    target_name: get(r,'target name'),
    target_amount: parseFloat(get(r,'target amount'))||0,
    target_currency: get(r,'target currency'),
    exchange_rate: parseFloat(get(r,'exchange rate'))||1,
    wise_category: get(r,'category'),
  })).filter(r=>r.id && r.status==='COMPLETED' && r.direction==='OUT');
}

function detectTripsFromTxs(txs) {
  const foreign = txs.filter(t=>t.target_currency && t.target_currency!=='CAD');
  if(!foreign.length) return [];
  const byCurrency = {};
  foreign.forEach(t=>{
    const cur = t.target_currency;
    if(!byCurrency[cur]) byCurrency[cur]=[];
    byCurrency[cur].push((t.created_on||'').slice(0,10));
  });
  return Object.entries(byCurrency).map(([currency,dates])=>{
    const sorted=[...new Set(dates)].filter(Boolean).sort();
    const label=currency==='EUR'?'Europe':currency==='GBP'?'UK / London':currency;
    return {name:`${label} Trip`,destination:label,start_date:sorted[0],end_date:sorted[sorted.length-1],currency};
  });
}

// Date range presets
function getPresetRange(preset) {
  const now = new Date();
  const fmt = d => d.toISOString().slice(0,10);
  const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  switch(preset) {
    case 'this_month': return { from: fmt(firstOfMonth), to: fmt(now) };
    case 'last_month': {
      const start = new Date(now.getFullYear(), now.getMonth()-1, 1);
      const end = new Date(now.getFullYear(), now.getMonth(), 0);
      return { from: fmt(start), to: fmt(end) };
    }
    case '3m': { const d=new Date(now); d.setMonth(d.getMonth()-3); return { from:fmt(d), to:fmt(now) }; }
    case '6m': { const d=new Date(now); d.setMonth(d.getMonth()-6); return { from:fmt(d), to:fmt(now) }; }
    case 'ytd': return { from: fmt(new Date(now.getFullYear(),0,1)), to: fmt(now) };
    case 'all': return { from:'', to:'' };
    default: return { from:'', to:'' };
  }
}

export default function WiseTab({ wiseTxs, trips, cardTxs, onReload }) {
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState('');
  const [suggestedTrips, setSuggestedTrips] = useState([]);
  const [showAddTrip, setShowAddTrip] = useState(false);
  const [newTrip, setNewTrip] = useState({name:'',destination:'',start_date:'',end_date:'',notes:''});
  const [selectedTrip, setSelectedTrip] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [activePreset, setActivePreset] = useState('all');

  function applyPreset(preset) {
    const r = getPresetRange(preset);
    setDateFrom(r.from); setDateTo(r.to);
    setActivePreset(preset); setSelectedTrip('all');
  }

  const tripColorMap = {};
  trips.forEach((t,i)=>{ tripColorMap[t.id]=TRIP_COLORS[i%TRIP_COLORS.length]; });

  async function handleFile(file) {
    setUploading(true); setUploadMsg('');
    const text = await file.text();
    const parsed = parseWiseCSV(text);
    const existing = new Set(wiseTxs.map(t=>t.id));
    const newOnes = parsed.filter(t=>!existing.has(t.id));
    if(newOnes.length>0){
      const { error } = await supabase.from('wise_transactions').insert(newOnes);
      if(error) console.error('Wise insert error:', error);
    }
    setUploadMsg(`Added ${newOnes.length} transactions (${parsed.length-newOnes.length} skipped).`);
    const detected = detectTripsFromTxs(parsed);
    const existingRanges = new Set(trips.map(t=>t.start_date+'_'+t.end_date));
    setSuggestedTrips(detected.filter(t=>!existingRanges.has(t.start_date+'_'+t.end_date)));
    await onReload();
    setUploading(false);
  }

  async function saveTrip(trip) {
    await supabase.from('trips').insert([{
      name:trip.name,destination:trip.destination,
      start_date:trip.start_date,end_date:trip.end_date,notes:trip.notes||''
    }]);
    setSuggestedTrips(prev=>prev.filter(t=>t.start_date!==trip.start_date));
    setShowAddTrip(false);
    setNewTrip({name:'',destination:'',start_date:'',end_date:'',notes:''});
    await onReload();
  }

  async function deleteTrip(id) {
    await supabase.from('trips').delete().eq('id',id);
    await onReload();
  }

  // Tag with trips
  const wiseTxsTagged = wiseTxs.map(tx=>{
    const date=(tx.created_on||'').slice(0,10);
    const trip=trips.find(t=>date>=t.start_date&&date<=t.end_date);
    return {...tx,trip};
  });

  const cardTxsTagged = (cardTxs||[]).map(tx=>{
    const trip=trips.find(t=>tx.date>=t.start_date&&tx.date<=t.end_date);
    return {...tx,trip};
  });

  // Apply date or trip filter
  const wiseFiltered = wiseTxsTagged.filter(tx=>{
    if(selectedTrip!=='all') return tx.trip?.id===selectedTrip;
    const d=(tx.created_on||'').slice(0,10);
    if(dateFrom && d<dateFrom) return false;
    if(dateTo && d>dateTo) return false;
    return true;
  });

  const cardFiltered = (selectedTrip==='all'&&!dateFrom&&!dateTo) ? [] :
    cardTxsTagged.filter(tx=>{
      if(!tx.is_credit && !EXCLUDE_CATS.has(tx.category)) {
        if(selectedTrip!=='all') return tx.trip?.id===selectedTrip;
        if(dateFrom && tx.date<dateFrom) return false;
        if(dateTo && tx.date>dateTo) return false;
        return true;
      }
      return false;
    });

  const wiseSpend = wiseFiltered.reduce((s,t)=>s+Number(t.source_amount||0),0);
  const cardSpend = cardFiltered.reduce((s,t)=>s+Number(t.amount||0),0);

  const catBreakdown = {};
  wiseFiltered.forEach(t=>{
    const cat=WISE_TO_LOCAL[t.wise_category]||'Other';
    catBreakdown[cat]=(catBreakdown[cat]||0)+Number(t.source_amount||0);
  });
  const catData = Object.entries(catBreakdown).sort((a,b)=>b[1]-a[1]);

  const currentTrip = trips.find(t=>t.id===selectedTrip);
  const showingContext = selectedTrip!=='all' || (dateFrom||dateTo);

  const s = {
    card:{background:'#fff',borderRadius:12,padding:'16px 20px',marginBottom:16,border:'1px solid #f0f0f0'},
    cardTitle:{fontSize:11,fontWeight:500,color:'#888',textTransform:'uppercase',letterSpacing:'0.05em',marginBottom:14},
    metric:{background:'#f5f5f3',borderRadius:10,padding:'12px 14px'},
    metricLabel:{fontSize:11,color:'#888',marginBottom:3,textTransform:'uppercase',letterSpacing:'0.04em'},
    metricValue:{fontSize:18,fontWeight:500},
    row:{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'7px 0',borderBottom:'1px solid #f5f5f5',fontSize:13},
    hint:{fontSize:12,color:'#888',marginBottom:8},
    btn:{padding:'6px 14px',fontSize:13,borderRadius:8,border:'1px solid #e0e0e0',background:'#fff',cursor:'pointer'},
    btnPrimary:{padding:'7px 16px',fontSize:13,borderRadius:8,border:'none',background:'#534AB7',color:'#fff',cursor:'pointer',fontWeight:500},
    input:{padding:'7px 10px',fontSize:13,borderRadius:8,border:'1px solid #e0e0e0',background:'#fff',width:'100%',boxSizing:'border-box',marginBottom:8},
    select:{padding:'6px 10px',fontSize:13,border:'1px solid #e0e0e0',borderRadius:8,background:'#fff'},
    preset:(active)=>({padding:'5px 12px',fontSize:12,borderRadius:99,border:'1px solid',cursor:'pointer',borderColor:active?'#534AB7':'#e0e0e0',background:active?'#534AB7':'#fff',color:active?'#fff':'#888'}),
    tripBadge:(color)=>({fontSize:11,padding:'2px 8px',borderRadius:99,background:color+'22',color,fontWeight:500,whiteSpace:'nowrap'}),
  };

  return (
    <div>
      {/* Controls row */}
      <div style={{display:'flex',gap:8,marginBottom:12,flexWrap:'wrap',alignItems:'center'}}>
        <label style={{...s.btn,cursor:'pointer',display:'inline-block'}}>
          Upload Wise CSV
          <input type="file" accept=".csv" style={{display:'none'}} onChange={e=>e.target.files[0]&&handleFile(e.target.files[0])} />
        </label>
        <button style={s.btnPrimary} onClick={()=>setShowAddTrip(true)}>+ Add trip</button>
        <select style={s.select} value={selectedTrip} onChange={e=>{setSelectedTrip(e.target.value);setActivePreset('all');setDateFrom('');setDateTo('');}}>
          <option value="all">All time</option>
          {trips.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        {uploading&&<span style={s.hint}>Processing…</span>}
        {uploadMsg&&<span style={{fontSize:12,color:'#0F6E56'}}>{uploadMsg}</span>}
      </div>

      {/* Date presets */}
      <div style={{display:'flex',gap:6,marginBottom:16,flexWrap:'wrap'}}>
        {[['all','All time'],['this_month','This month'],['last_month','Last month'],['3m','3 months'],['6m','6 months'],['ytd','Year to date']].map(([p,label])=>(
          <button key={p} style={s.preset(activePreset===p&&selectedTrip==='all')} onClick={()=>applyPreset(p)}>{label}</button>
        ))}
        <input type="date" style={{...s.input,width:'auto',marginBottom:0,fontSize:12}} value={dateFrom} onChange={e=>{setDateFrom(e.target.value);setActivePreset('custom');setSelectedTrip('all');}} />
        <input type="date" style={{...s.input,width:'auto',marginBottom:0,fontSize:12}} value={dateTo} onChange={e=>{setDateTo(e.target.value);setActivePreset('custom');setSelectedTrip('all');}} />
      </div>

      {/* Suggested trips */}
      {suggestedTrips.length>0&&(
        <div style={{...s.card,border:'2px solid #534AB733'}}>
          <div style={s.cardTitle}>Trips detected — confirm to save</div>
          {suggestedTrips.map((t,i)=>(
            <div key={i} style={{...s.row,flexWrap:'wrap',gap:8}}>
              <div>
                <div style={{fontWeight:500,fontSize:13}}>{t.name} {CURRENCY_FLAGS[t.currency]||''}</div>
                <div style={{fontSize:11,color:'#888'}}>{t.start_date} → {t.end_date}</div>
              </div>
              <div style={{display:'flex',gap:8}}>
                <button style={s.btnPrimary} onClick={()=>saveTrip(t)}>Save trip</button>
                <button style={s.btn} onClick={()=>setSuggestedTrips(prev=>prev.filter((_,j)=>j!==i))}>Dismiss</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add trip form */}
      {showAddTrip&&(
        <div style={s.card}>
          <div style={s.cardTitle}>Add trip</div>
          <input style={s.input} placeholder="Trip name (e.g. Amsterdam April 2026)" value={newTrip.name} onChange={e=>setNewTrip(p=>({...p,name:e.target.value}))} />
          <input style={s.input} placeholder="Destination" value={newTrip.destination} onChange={e=>setNewTrip(p=>({...p,destination:e.target.value}))} />
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
            <input style={s.input} type="date" value={newTrip.start_date} onChange={e=>setNewTrip(p=>({...p,start_date:e.target.value}))} />
            <input style={s.input} type="date" value={newTrip.end_date} onChange={e=>setNewTrip(p=>({...p,end_date:e.target.value}))} />
          </div>
          <input style={s.input} placeholder="Notes (optional)" value={newTrip.notes} onChange={e=>setNewTrip(p=>({...p,notes:e.target.value}))} />
          <div style={{display:'flex',gap:8}}>
            <button style={s.btnPrimary} onClick={()=>newTrip.name&&newTrip.start_date&&saveTrip(newTrip)}>Save</button>
            <button style={s.btn} onClick={()=>setShowAddTrip(false)}>Cancel</button>
          </div>
        </div>
      )}

      {/* Summary metrics */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(130px,1fr))',gap:10,marginBottom:16}}>
        <div style={s.metric}><div style={s.metricLabel}>Wise spend</div><div style={s.metricValue}>${wiseSpend.toFixed(2)}</div></div>
        {showingContext&&<div style={s.metric}><div style={s.metricLabel}>Card spend</div><div style={s.metricValue}>${Math.round(cardSpend).toLocaleString()}</div></div>}
        {showingContext&&<div style={s.metric}><div style={s.metricLabel}>Combined</div><div style={s.metricValue}>${(wiseSpend+cardSpend).toFixed(2)}</div></div>}
        <div style={s.metric}><div style={s.metricLabel}>Wise txns</div><div style={s.metricValue}>{wiseFiltered.length}</div></div>
        <div style={s.metric}><div style={s.metricLabel}>Trips</div><div style={s.metricValue}>{trips.length}</div></div>
      </div>

      {/* Trip log */}
      {trips.length>0&&(
        <div style={s.card}>
          <div style={s.cardTitle}>Trip log</div>
          {trips.map(trip=>{
            const tw=wiseTxsTagged.filter(t=>t.trip?.id===trip.id);
            const tc=cardTxsTagged.filter(t=>t.trip?.id===trip.id&&!t.is_credit&&!EXCLUDE_CATS.has(t.category));
            const wSpend=tw.reduce((s,t)=>s+Number(t.source_amount||0),0);
            const cSpend=tc.reduce((s,t)=>s+Number(t.amount||0),0);
            const total=wSpend+cSpend;
            const currencies=[...new Set(tw.map(t=>t.target_currency).filter(c=>c&&c!=='CAD'))];
            return (
              <div key={trip.id} style={{...s.row,cursor:'pointer'}} onClick={()=>setSelectedTrip(trip.id===selectedTrip?'all':trip.id)}>
                <div style={{flex:1}}>
                  <div style={{fontWeight:500,display:'flex',alignItems:'center',gap:6,flexWrap:'wrap'}}>
                    <span style={{width:10,height:10,borderRadius:2,background:tripColorMap[trip.id],display:'inline-block',flexShrink:0}}></span>
                    {trip.name} {currencies.map(c=><span key={c}>{CURRENCY_FLAGS[c]||''}</span>)}
                    {selectedTrip===trip.id&&<span style={{fontSize:11,background:'#534AB722',color:'#534AB7',padding:'1px 6px',borderRadius:99}}>selected</span>}
                  </div>
                  <div style={{fontSize:11,color:'#888'}}>{trip.start_date} → {trip.end_date} · {tw.length} Wise + {tc.length} card txns</div>
                  {trip.notes&&<div style={{fontSize:11,color:'#888',fontStyle:'italic'}}>{trip.notes}</div>}
                </div>
                <div style={{display:'flex',alignItems:'center',gap:12}}>
                  <div style={{textAlign:'right'}}>
                    <div style={{fontWeight:500}}>${total.toFixed(2)}</div>
                    <div style={{fontSize:11,color:'#888'}}>Wise ${wSpend.toFixed(0)} + Cards ${Math.round(cSpend)}</div>
                  </div>
                  <button style={{...s.btn,padding:'3px 8px',fontSize:11,color:'#A32D2D'}} onClick={e=>{e.stopPropagation();deleteTrip(trip.id);}}>×</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Card txns during period */}
      {showingContext&&cardFiltered.length>0&&(
        <div style={s.card}>
          <div style={s.cardTitle}>Card transactions — {currentTrip?.name||'selected period'}</div>
          <p style={s.hint}>Happened during this period — not necessarily trip expenses, but context.</p>
          {cardFiltered.slice(0,100).map((tx,i)=>(
            <div key={i} style={s.row}>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontWeight:500,fontSize:13,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{tx.description}</div>
                <div style={{fontSize:11,color:'#888'}}>{tx.date} · {tx.card} · {tx.category}</div>
              </div>
              <div style={{fontWeight:500,fontSize:13,flexShrink:0}}>-${Number(tx.amount).toFixed(2)}</div>
            </div>
          ))}
          {cardFiltered.length>100&&<p style={s.hint}>Showing first 100 of {cardFiltered.length}</p>}
        </div>
      )}

      {/* Wise category breakdown */}
      {catData.length>0&&(
        <div style={s.card}>
          <div style={s.cardTitle}>Wise spend by category</div>
          {catData.map(([cat,amt])=>(
            <div key={cat} style={{display:'flex',alignItems:'center',gap:10,padding:'5px 0',borderBottom:'1px solid #f5f5f5'}}>
              <div style={{width:10,height:10,borderRadius:2,background:CAT_COLORS[cat]||'#888',flexShrink:0}}></div>
              <div style={{fontSize:13,color:'#444',width:160,flexShrink:0}}>{cat}</div>
              <div style={{flex:1,background:'#f5f5f5',borderRadius:4,height:8,overflow:'hidden'}}>
                <div style={{width:`${(amt/catData[0][1])*100}%`,background:CAT_COLORS[cat]||'#888',height:'100%',borderRadius:4}}></div>
              </div>
              <div style={{fontSize:13,fontWeight:500,width:70,textAlign:'right'}}>${amt.toFixed(2)}</div>
            </div>
          ))}
        </div>
      )}

      {/* Wise transaction list */}
      <div style={s.card}>
        <div style={s.cardTitle}>Wise transactions ({wiseFiltered.length})</div>
        {wiseFiltered.length===0&&<p style={s.hint}>{wiseTxs.length===0?'Upload your Wise CSV above to get started.':'No transactions match this filter.'}</p>}
        {wiseFiltered.map((tx,i)=>(
          <div key={i} style={s.row}>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontWeight:500,fontSize:13,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{tx.target_name}</div>
              <div style={{fontSize:11,color:'#888',display:'flex',gap:8,flexWrap:'wrap',alignItems:'center'}}>
                <span>{(tx.created_on||'').slice(0,10)}</span>
                <span>{CURRENCY_FLAGS[tx.target_currency]||''} {tx.target_currency}</span>
                {tx.wise_category&&<span>{tx.wise_category}</span>}
                {tx.trip&&<span style={s.tripBadge(tripColorMap[tx.trip.id]||'#888')}>{tx.trip.name}</span>}
              </div>
            </div>
            <div style={{textAlign:'right',flexShrink:0}}>
              <div style={{fontWeight:500,fontSize:13}}>-${Number(tx.source_amount||0).toFixed(2)} CAD</div>
              {tx.target_currency!=='CAD'&&<div style={{fontSize:11,color:'#888'}}>{Number(tx.target_amount||0).toFixed(2)} {tx.target_currency}</div>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ================================================================
//  EMPLOYEE VIEW
// ================================================================
function renderEmployee(){
  const emp=currentEmp();
  if(!emp){state.view='login';return renderLogin();}
  const period=PERIOD.current();
  const sheet=getOrCreateSheet(DB,emp.id,period.key,period.start); save();
  const tot=calcSheetTotal(sheet);
  if(!sheet._hpChecked){ sheet._hpChecked=true; ensureHolidaySourcesLoaded(emp.id, period.key); }

  const wrap=el('div','min-h-screen bg-slate-100');

  const hpEff  = getHolidayPay(emp.id, period.key);
  const hpCalc = calcHolidayPay(emp.id, period.key);
  const hpSources = getHolidayPaySources(emp.id, period.key);
  const hpTooltip = hpSources.length
    ? hpSources.map(s=>`${s.label}: ${fmtMins(s.mins)}`).join(' | ') + ` → ×5%=${fmtMins(hpCalc)}`
    : 'Chargement des périodes précédentes…';

  const header=el('div','nav-navy text-white px-4 py-3 flex items-center justify-between flex-wrap gap-2');
  header.innerHTML=`
    <div class="flex items-center gap-3">
      <div class="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center font-bold text-sm flex-shrink-0">
        ${emp.name.split(' ').map(n=>n[0]).join('').toUpperCase().slice(0,2)}
      </div>
      <div>
        <div class="font-semibold text-sm">${emp.name}</div>
        <div class="text-xs text-blue-200">${PERIOD.label(period.start,period.end)}</div>
      </div>
    </div>
    <div class="flex items-center gap-2 flex-wrap">
      <div class="flex items-center gap-1 bg-white/10 border border-white/20 rounded-lg px-2 py-1" title="${hpTooltip}">
        <span class="text-xs font-semibold whitespace-nowrap">🎉 Férié</span>
        <span class="mono text-xs font-bold">${fmtMins(hpEff)}</span>
        <button onclick="explainHolidayPay()" class="text-blue-200 hover:text-white text-xs leading-none" title="D'où vient ce calcul?">ℹ️</button>
      </div>
      ${sheet.approved?'<span class="badge-approved text-xs">✓ Approuvé</span>':'<span class="badge-pending text-xs">En attente</span>'}
      <button data-refresh onclick="refreshFromAirtable()" class="text-blue-200 hover:text-white text-xl leading-none px-1" title="Rafraîchir depuis Airtable">🔄</button>
      <button onclick="state.view='empProfile';render()" class="text-blue-200 hover:text-white text-xl leading-none px-1" title="Mon profil">⚙</button>
      <button onclick="logout()" class="text-blue-200 hover:text-white text-xs">Quitter</button>
    </div>`;

  const tabs=el('div','bg-white border-b flex gap-0 px-2');
  [['current','📋 Période courante'],['history','🕐 Historique']].forEach(([key,label])=>{
    const btn=el('button',`px-4 py-3 text-sm whitespace-nowrap ${state.empTab===key?'tab-active':'text-slate-500 hover:text-slate-700'}`);
    btn.textContent=label;
    btn.onclick=()=>{state.empTab=key;render();};
    tabs.appendChild(btn);
  });

  wrap.appendChild(header);
  wrap.appendChild(tabs);

  if(state.empTab==='history'){
    wrap.appendChild(renderEmpHistory(emp));
    return wrap;
  }

  let reminderHtml='';
  if(emp.reminderCount>0)
    reminderHtml=`<div class="mb-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2 text-sm text-amber-800 flex items-center gap-2"><span>⏰</span><span>${emp.reminderCount} rappel(s) envoyé(s) cette période.</span></div>`;

  let autoFillHtml='';
  if(!sheet.approved)
    autoFillHtml=`<div class="mb-3 bg-blue-50 border border-blue-200 rounded-xl px-4 py-2 flex items-center justify-between gap-2">
      <span class="text-sm text-blue-700">🔄 Copier les heures d'hier sur aujourd'hui</span>
      <button onclick="copyYesterday('${emp.id}','${period.key}')" class="btn btn-blue text-xs" style="padding:5px 12px">Copier hier</button>
    </div>`;

  const content=el('div','max-w-7xl mx-auto px-3 py-4 pb-28');
  content.innerHTML=reminderHtml+autoFillHtml;

  const deskWrap=el('div','desktop-only card overflow-x-auto');
  deskWrap.appendChild(buildDesktopTable(sheet,false,emp.id,period));
  content.appendChild(deskWrap);

  const mobWrap=el('div','mobile-only');
  const week1Mob = sheet.rows.slice(0,7).reduce((s,r)=>{const w=calcWorked(parseTime(r.start),parseTime(r.end),parseTime(r.lunch),parseTime(r.pause));return s+(w||0);},0);
  const week2Mob = sheet.rows.slice(7,14).reduce((s,r)=>{const w=calcWorked(parseTime(r.start),parseTime(r.end),parseTime(r.lunch),parseTime(r.pause));return s+(w||0);},0);
  sheet.rows.forEach((row,i)=>{
    mobWrap.appendChild(buildMobileCard(row,i,sheet.approved,emp.id,period.key));
    if(i === 6 || i === 13){
      const weekNum = i === 6 ? 1 : 2;
      const weekTotal = i === 6 ? week1Mob : week2Mob;
      const subCard = el('div','mx-1 mb-1 px-4 py-2 rounded-xl flex items-center justify-between');
      subCard.style.cssText='background:#f1f5f9;border:2px solid #cbd5e1;';
      subCard.innerHTML=`<span style="font-size:12px;font-weight:600;color:#475569">Sous-total semaine ${weekNum}</span>
        <span style="font-size:15px;font-weight:700;color:#1e3a5f;font-family:monospace">${fmtMins(weekTotal)}</span>`;
      mobWrap.appendChild(subCard);
    }
  });
  content.appendChild(mobWrap);

  const banner=el('div','total-banner flex items-center justify-between');
  banner.innerHTML=`
    <div class="flex items-center gap-3">
      <span class="text-slate-500 text-sm font-medium">Total période</span>
      <span class="mono font-bold text-2xl text-blue-900" id="gt-user">${fmtMins(tot)}</span>
    </div>
    <div class="text-xs text-slate-400 italic text-right hidden sm:block">
      ${sheet.approved?'Approuvé · Contactez l\'admin pour modifier':'Sauvegarde automatique'}
    </div>`;

  wrap.appendChild(content);
  wrap.appendChild(banner);
  return wrap;
}

function renderEmpHistory(emp){
  const content=el('div','max-w-7xl mx-auto px-3 py-4 pb-10');

  const periods=PERIOD.list(12).slice(1);
  const periodsWithData=periods.filter(p=>{
    const sheet=DB.timesheets[`${emp.id}_${p.key}`];
    return sheet && (calcSheetTotal(sheet)>0 || sheet.approved);
  });

  if(periodsWithData.length===0){
    content.innerHTML=`<div class="card p-8 text-center text-slate-400">
      <div class="text-4xl mb-3">📭</div>
      <div class="font-medium">Aucun historique disponible</div>
      <div class="text-sm mt-1">Les périodes complétées apparaîtront ici.</div>
    </div>`;
    return content;
  }

  if(!state.empHistoryPeriod || !periodsWithData.find(p=>p.key===state.empHistoryPeriod)){
    state.empHistoryPeriod=periodsWithData[0].key;
  }

  const selWrap=el('div','mb-4');
  const sel=document.createElement('select');
  sel.className='w-full sm:w-auto';
  periodsWithData.forEach(p=>{
    const opt=document.createElement('option');
    opt.value=p.key;
    opt.textContent=PERIOD.label(p.start,p.end);
    if(p.key===state.empHistoryPeriod) opt.selected=true;
    sel.appendChild(opt);
  });
  sel.onchange=()=>{state.empHistoryPeriod=sel.value;render();};
  selWrap.appendChild(sel);
  content.appendChild(selWrap);

  const selPeriod=periodsWithData.find(p=>p.key===state.empHistoryPeriod);
  if(!selPeriod) return content;

  const sheet=DB.timesheets[`${emp.id}_${selPeriod.key}`];
  const tot=calcSheetTotal(sheet);

  const info=el('div','card px-4 py-3 mb-4 flex items-center justify-between');
  info.innerHTML=`
    <div class="flex items-center gap-3">
      <span class="text-slate-500 text-sm">Total</span>
      <span class="mono font-bold text-xl text-blue-900">${fmtMins(tot)}</span>
    </div>
    <div>${sheet.approved
      ?`<span class="badge-approved">✓ Approuvé</span>`
      :`<span class="badge-pending">En attente</span>`}
    </div>`;
  content.appendChild(info);

  const deskWrap=el('div','desktop-only card overflow-x-auto mb-4');
  deskWrap.appendChild(buildDesktopTable(sheet, false, emp.id, selPeriod));
  content.appendChild(deskWrap);

  const mobWrap=el('div','mobile-only');
  sheet.rows.forEach((row,i)=>{
    mobWrap.appendChild(buildMobileCard(row, i, sheet.approved, emp.id, selPeriod.key));
  });
  content.appendChild(mobWrap);

  return content;
}

function buildDesktopTable(sheet,isAdmin,empId,period){
  const emp=DB.employees.find(e=>e.id===empId);
  const table=document.createElement('table');
  const adminNoteCol=isAdmin?'<th style="min-width:260px">🔒 Note admin</th>':'';
  table.innerHTML=`<thead><tr class="nav-navy">
    <th class="text-left pl-3" style="min-width:130px">Journée</th>
    <th style="min-width:82px">Début</th>
    <th style="min-width:82px">Dîner</th>
    <th style="min-width:82px">Fin</th>
    <th style="min-width:82px">Pause</th>
    <th style="min-width:80px">Total</th>
    <th style="min-width:220px">Notes</th>
    ${adminNoteCol}
  </tr></thead>`;
  const tbody=document.createElement('tbody');
  const week1Total = sheet.rows.slice(0,7).reduce((s,r)=>{const w=calcWorked(parseTime(r.start),parseTime(r.end),parseTime(r.lunch),parseTime(r.pause));return s+(w||0);},0);
  const week2Total = sheet.rows.slice(7,14).reduce((s,r)=>{const w=calcWorked(parseTime(r.start),parseTime(r.end),parseTime(r.lunch),parseTime(r.pause));return s+(w||0);},0);
  const adminCols = isAdmin ? 1 : 0;

  sheet.rows.forEach((row,i)=>{
    const d=new Date(row.date+'T00:00:00');
    const tr=document.createElement('tr');
    tr.className=isWeekend(d)?'bg-weekend':'bg-day';
    const s=parseTime(row.start),e=parseTime(row.end),l=parseTime(row.lunch),p=parseTime(row.pause);
    const worked=calcWorked(s,e,l,p);
    const locked=sheet.approved&&!isAdmin;
    const adminNoteTd=isAdmin
      ?`<td><div class="flex items-center gap-1">
          <input id="adminnote-inp-${empId}-${period.key}-${i}" type="text" class="time-input" style="width:220px;background:#fef9c3" placeholder="Note privée…" value="${(row.adminNote||'').replace(/"/g,'&quot;')}"
            onchange="saveAdminNote('${empId}','${period.key}',${i},this.value)"/>
          <button onclick="openNotesModal('${empId}','${period.key}',${i},document.getElementById('adminnote-inp-${empId}-${period.key}-${i}').value,'${dayLabelLong(d).replace(/'/g,"\\'")}','adminNote')" class="btn btn-light" style="padding:2px 6px;font-size:11px" title="Agrandir la note admin">🔍</button>
        </div></td>`
      :'';
    if(locked){
      tr.innerHTML=`
        <td class="text-left pl-3 font-medium text-slate-700 text-xs">${dayLabel(d)}</td>
        <td class="mono text-sm">${row.start||'—'}</td>
        <td class="mono text-sm">${row.lunch||'—'}</td>
        <td class="mono text-sm">${row.end||'—'}</td>
        <td class="total-cell">${worked!==null?fmtMins(worked):'—'}</td>
        <td class="text-xs text-slate-600">${row.notes||''}</td>
        ${adminNoteTd}`;
    } else {
      tr.innerHTML=`
        <td class="text-left pl-3 font-medium text-slate-700 text-xs">${dayLabel(d)}</td>
        <td><input type="text" class="time-input" placeholder="—" value="${row.start}"
          onfocus="captureOriginal('${empId}','${period.key}',${i},'start',this.value)"
          oninput="liveCalc('${empId}','${period.key}',${i},'start',this.value)"
          onchange="commitChange('${empId}','${period.key}',${i},'start',this.value);liveCalc('${empId}','${period.key}',${i},'start',this.value)"/></td>
        <td id="cell-lunch-${empId}-${i}"></td>
        <td><input type="text" class="time-input" placeholder="—" value="${row.end}"
          onfocus="captureOriginal('${empId}','${period.key}',${i},'end',this.value)"
          oninput="liveCalc('${empId}','${period.key}',${i},'end',this.value)"
          onchange="commitChange('${empId}','${period.key}',${i},'end',this.value);liveCalc('${empId}','${period.key}',${i},'end',this.value)"/></td>
        <td id="cell-pause-${empId}-${i}"></td>
        <td class="total-cell" id="row-t-${empId}-${i}">${worked!==null?fmtMins(worked):'—'}</td>
        <td>
          <div class="flex items-center gap-1">
            <input id="notes-inp-${empId}-${period.key}-${i}" type="text" class="time-input" style="width:100px" placeholder="Notes…" value="${row.notes}"
              onchange="liveCalc('${empId}','${period.key}',${i},'notes',this.value)"/>
            <button onclick="openNotesModal('${empId}','${period.key}',${i},document.getElementById('notes-inp-${empId}-${period.key}-${i}').value,'${dayLabelLong(d).replace(/'/g,"\\'")}')" class="btn btn-light" style="padding:2px 6px;font-size:11px" title="Agrandir les notes">🔍</button>
            <button onclick="quickFill('${empId}','${period.key}',${i},'Congé')" class="btn btn-gray" style="padding:2px 6px;font-size:11px">Congé</button>
            <button onclick="quickFill('${empId}','${period.key}',${i},'Maladie')" class="btn btn-orange" style="padding:2px 6px;font-size:11px">Maladie</button>
            <button onclick="quickFill('${empId}','${period.key}',${i},'Demi-journée')" class="btn btn-blue" style="padding:2px 6px;font-size:11px">½ Journée</button>
            <button onclick="quickFill('${empId}','${period.key}',${i},'Absent')" class="btn" style="padding:2px 6px;font-size:11px;background:#64748b;color:white">Absent</button>
            <button onclick="quickFill('${empId}','${period.key}',${i},'Férié')" class="btn" style="padding:2px 6px;font-size:11px;background:#d97706;color:white" title="Remplit avec l'indemnité de congé férié calculée">🎉 Férié</button>
            <button onclick="clearRow('${empId}','${period.key}',${i})" class="btn btn-red" style="padding:2px 6px;font-size:11px" title="Effacer la journée">✕</button>
          </div>
        </td>
        ${adminNoteTd}`;
      const lunchCell = tr.querySelector(`#cell-lunch-${empId}-${i}`);
      if(lunchCell) lunchCell.appendChild(makeBreakSelect('lunch', row.lunch, empId, period.key, i, false));
      const pauseCell = tr.querySelector(`#cell-pause-${empId}-${i}`);
      if(pauseCell) pauseCell.appendChild(makeBreakSelect('pause', row.pause||'', empId, period.key, i, false));
    }
    tbody.appendChild(tr);
    if(i === 6 || i === 13){
      const weekNum = i === 6 ? 1 : 2;
      const weekTotal = i === 6 ? week1Total : week2Total;
      const subTr = document.createElement('tr');
      subTr.className = 'subtotal-row';
      subTr.innerHTML = `
        <td class="text-left pl-3" colspan="4">Sous-total semaine ${weekNum}</td>
        <td class="total-cell">${fmtMins(weekTotal)}</td>
        <td colspan="${1 + adminCols}"></td>`;
      tbody.appendChild(subTr);
    }
  });
  table.appendChild(tbody);
  return table;
}

function buildMobileCard(row,i,approved,empId,periodKey){
  const d=new Date(row.date+'T00:00:00');
  const weekend=isWeekend(d);
  const card=el('div',`mobile-day-card ${weekend?'weekend':'weekday'}`);
  const s=parseTime(row.start),e=parseTime(row.end),l=parseTime(row.lunch),p=parseTime(row.pause);
  const worked=calcWorked(s,e,l,p);
  const emp=DB.employees.find(x=>x.id===empId);
  const useClock=(emp?.inputMode||'clock')==='clock';

  if(approved){
    card.innerHTML=`
      <div class="px-4 py-3">
        <div class="flex items-center justify-between mb-1">
          <div class="font-semibold text-slate-700 capitalize text-sm">${dayLabelLong(d)}</div>
          <div class="mono font-bold text-blue-900">${worked!==null?fmtMins(worked):'—'}</div>
        </div>
        <div class="flex gap-4 text-sm text-slate-500">
          ${row.start?`<span>${row.start}</span><span>→</span><span>${row.end||'—'}</span>`:'<span class="italic text-slate-300">Aucune entrée</span>'}
          ${row.lunch?`<span class="text-slate-400">🍽 ${row.lunch}</span>`:''}
        </div>
        ${row.notes?`<div class="text-xs text-slate-400 mt-1">📝 ${row.notes}</div>`:''}
      </div>`;
    return card;
  }
  const inner=el('div','px-4 pt-4 pb-3');
  const headerRow=el('div','flex items-center justify-between mb-3');
  const dayDiv=el('div','font-semibold text-slate-700 capitalize');
  dayDiv.textContent=dayLabelLong(d);
  const totalDiv=el('div','mono font-bold text-blue-900 text-lg');
  totalDiv.id=`m-row-t-${empId}-${i}`;
  totalDiv.textContent=worked!==null?fmtMins(worked):'—';
  const syncBadge=document.createElement('span');
  syncBadge.id=`row-sync-${empId}-${row.date}`;
  syncBadge.style.cssText='font-size:10px;font-weight:600;color:white;border-radius:10px;padding:2px 8px;margin-left:6px;display:none;cursor:default;';
  const _queuedNow = SyncQueue.getAll().some(x => x.empId === (DB.employees.find(e=>e.id===empId)?.airtableId) && x.date === row.date);
  if(_queuedNow){
    syncBadge.style.background='#f59e0b'; syncBadge.textContent='⏳ En attente';
    syncBadge.title="Données sauvegardées localement, envoi en cours…";
    syncBadge.style.display='inline-block';
  } else if(row.airtableRecordId && (row.start||row.end||row.notes)){
    syncBadge.style.background='#16a34a'; syncBadge.textContent='☁️ Sauvegardé';
    syncBadge.title='Données sauvegardées dans Airtable';
    syncBadge.style.display='inline-block';
  }
  totalDiv.appendChild(syncBadge);
  headerRow.appendChild(dayDiv); headerRow.appendChild(totalDiv);
  inner.appendChild(headerRow);

  function makeTimeField(labelTxt,field,stored){
    const col=el('div','');
    const lbl=el('div','field-label mb-1');
    lbl.textContent=labelTxt;
    col.appendChild(lbl);
    if(useClock && field!=='lunch'){
      const inp=document.createElement('input');
      inp.type='time'; inp.className='mobile-time-input';
      inp.lang='fr-CA';
      inp.style.cssText='font-size:16px;padding:10px 4px;cursor:pointer;';
      inp.value=toTimeVal(stored);
      const h=()=>liveCalc(empId,periodKey,i,field,inp.value);
      inp.addEventListener('change',h); inp.addEventListener('input',h);
      col.appendChild(inp);
    } else {
      const inp=document.createElement('input');
      inp.type='text'; inp.inputMode='decimal'; inp.className='mobile-time-input';
      inp.placeholder=field==='lunch'?'0.5h':(field==='start'?'9h00':'17h00');
      inp.value=stored||''; inp.autocomplete='off'; inp.autocorrect='off'; inp.spellcheck=false;
      const h=()=>liveCalc(empId,periodKey,i,field,inp.value);
      inp.addEventListener('input',h); inp.addEventListener('keyup',h); inp.addEventListener('change',h);
      col.appendChild(inp);
    }
    return col;
  }

  const grid=el('div','grid grid-cols-4 gap-2 mb-3');
  grid.appendChild(makeTimeField('DÉBUT','start',row.start));
  const lunchCol=el('div','');
  const lunchLbl=el('div','field-label mb-1'); lunchLbl.textContent='DÎNER';
  lunchCol.appendChild(lunchLbl);
  lunchCol.appendChild(makeMobileBreakSelect('lunch',row.lunch,empId,periodKey,i));
  grid.appendChild(lunchCol);
  grid.appendChild(makeTimeField('FIN','end',row.end));
  const pauseCol=el('div','');
  const pauseLbl=el('div','field-label mb-1'); pauseLbl.textContent='PAUSE';
  pauseCol.appendChild(pauseLbl);
  pauseCol.appendChild(makeMobileBreakSelect('pause',row.pause||'',empId,periodKey,i));
  grid.appendChild(pauseCol);
  inner.appendChild(grid);

  const notesWrap=el('div','');
  const notesLblRow=el('div','flex items-center justify-between mb-1');
  const notesLbl=el('div','field-label'); notesLbl.textContent='NOTES';
  const notesExpandBtn=el('button','text-slate-400 hover:text-blue-600 text-xs flex items-center gap-1');
  notesExpandBtn.innerHTML='🔍 Agrandir';
  notesExpandBtn.type='button';
  notesLblRow.appendChild(notesLbl); notesLblRow.appendChild(notesExpandBtn);
  const notesInp=document.createElement('input');
  notesInp.type='text'; notesInp.className='mobile-notes-input';
  notesInp.placeholder='Notes optionnelles…'; notesInp.value=row.notes||'';
  notesExpandBtn.addEventListener('click',()=>openNotesModal(empId,periodKey,i,notesInp.value,dayLabelLong(d)));
  const nh=()=>liveCalc(empId,periodKey,i,'notes',notesInp.value);
  notesInp.addEventListener('input',nh); notesInp.addEventListener('change',nh);
  notesWrap.appendChild(notesLblRow); notesWrap.appendChild(notesInp);

  const btnRow=el('div','flex gap-1 mt-2 overflow-x-auto');
  btnRow.style.cssText='-webkit-overflow-scrolling:touch;';
  const bc=el('button','btn btn-gray'); bc.style.cssText='padding:8px 6px;font-size:11px;white-space:nowrap;flex:1 0 auto;'; bc.textContent='🏖 Congé';
  bc.addEventListener('click',()=>quickFill(empId,periodKey,i,'Congé'));
  const bm=el('button','btn btn-orange'); bm.style.cssText='padding:8px 6px;font-size:11px;white-space:nowrap;flex:1 0 auto;'; bm.textContent='🤒 Maladie';
  bm.addEventListener('click',()=>quickFill(empId,periodKey,i,'Maladie'));
  const bdj=el('button','btn btn-blue'); bdj.style.cssText='padding:8px 6px;font-size:11px;white-space:nowrap;flex:1 0 auto;'; bdj.textContent='½ Journée';
  bdj.addEventListener('click',()=>quickFill(empId,periodKey,i,'Demi-journée'));
  const bf=el('button','btn'); bf.style.cssText='padding:8px 6px;font-size:11px;white-space:nowrap;flex:1 0 auto;background:#d97706;color:white;'; bf.textContent='🎉 Férié';
  bf.addEventListener('click',()=>quickFill(empId,periodKey,i,'Férié'));
  const babs=el('button','btn'); babs.style.cssText='padding:8px 6px;font-size:11px;white-space:nowrap;flex:1 0 auto;background:#64748b;color:white;'; babs.textContent='🚫 Absent';
  babs.addEventListener('click',()=>quickFill(empId,periodKey,i,'Absent'));
  const bclr=el('button','btn btn-red'); bclr.style.cssText='padding:8px 6px;font-size:11px;white-space:nowrap;flex:0 0 auto;';
  bclr.textContent='✕';
  bclr.addEventListener('click',()=>clearRow(empId,periodKey,i));
  btnRow.appendChild(bc); btnRow.appendChild(bm); btnRow.appendChild(bdj); btnRow.appendChild(bf); btnRow.appendChild(babs); btnRow.appendChild(bclr);
  notesWrap.appendChild(btnRow);

  inner.appendChild(notesWrap);
  card.appendChild(inner);
  return card;
}

function makeBreakSelect(field, value, empId, periodKey, idx, locked){
  const opts = [
    ['','—'],['0.25','15 min'],['0.5','30 min'],['0.75','45 min'],
    ['1','1h00'],['1.25','1h15'],['1.5','1h30'],['1.75','1h45'],
    ['2','2h00'],['2.25','2h15'],['2.5','2h30'],['2.75','2h45'],['3','3h00']
  ];
  const sel = document.createElement('select');
  sel.className = 'time-input';
  sel.disabled = locked;
  opts.forEach(([v,lbl])=>{
    const o = document.createElement('option');
    o.value = v; o.textContent = lbl;
    if(String(value||'') === v) o.selected = true;
    sel.appendChild(o);
  });
  sel.addEventListener('change', ()=>{
    captureOriginal(empId,periodKey,idx,field,value||'');
    liveCalc(empId,periodKey,idx,field,sel.value);
    commitChange(empId,periodKey,idx,field,sel.value);
  });
  return sel;
}

function makeMobileBreakSelect(field, value, empId, periodKey, idx){
  const opts = [
    ['','—'],['0.25','15 min'],['0.5','30 min'],['0.75','45 min'],
    ['1','1h00'],['1.25','1h15'],['1.5','1h30'],['1.75','1h45'],
    ['2','2h00'],['2.25','2h15'],['2.5','2h30'],['2.75','2h45'],['3','3h00']
  ];
  const sel = document.createElement('select');
  sel.className = 'mobile-time-input';
  sel.style.cssText = 'font-size:16px;padding:10px 4px;width:100%;';
  opts.forEach(([v,lbl])=>{
    const o = document.createElement('option');
    o.value = v; o.textContent = lbl;
    if(String(value||'') === v) o.selected = true;
    sel.appendChild(o);
  });
  sel.addEventListener('change', ()=>{
    liveCalc(empId,periodKey,idx,field,sel.value);
    commitChange(empId,periodKey,idx,field,sel.value);
  });
  return sel;
}

function clearRow(empId,periodKey,rowIdx){
  if(!confirm('Effacer toutes les données de cette journée?')) return;
  const key=`${empId}_${periodKey}`;
  if(!DB.timesheets[key]) return;
  const row = DB.timesheets[key].rows[rowIdx];
  const recordId = row.airtableRecordId;
  row.start=''; row.end=''; row.lunch=''; row.pause=''; row.notes='';
  save();
  render();
  const emp = DB.employees.find(e => e.id === empId);
  if(emp?.airtableId){
    fetch('/api/syncairtable',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({empId:emp.airtableId,date:row.date,start:'',end:'',lunch:'',pause:'',notes:'',recordId,forceWrite:true})});
  }
}

async function quickFill(empId,periodKey,rowIdx,value){
  const key=`${empId}_${periodKey}`;
  if(!DB.timesheets[key]) return;
  const row = DB.timesheets[key].rows[rowIdx];
  if(value==='Férié' && row.notes && !row.notes.startsWith('Férié')){
    toast('Notes déjà remplies pour cette journée.','info'); return;
  }
  row.notes = value;
  if(value==='Congé'||value==='Maladie'){
    row.start='00:00'; row.end='07:30'; row.lunch='';
  } else if(value==='Absent'){
    row.start='00:00'; row.end='00:00'; row.lunch='';
  } else if(value==='Férié'){
    const allPeriods = PERIOD.list(12);
    const curIdx = allPeriods.findIndex(p=>p.key===periodKey);
    const toCheck = [allPeriods[curIdx+1], allPeriods[curIdx+2]].filter(Boolean);
    const emp = DB.employees.find(e=>e.id===empId);
    if(emp?.airtableId){
      for(const p of toCheck){
        const existing = DB.timesheets[`${empId}_${p.key}`];
        // ← FIX: recharger si la feuille n'existe pas OU si elle est vide (0 minutes)
        // Évite d'utiliser un cache vide créé lors d'une session précédente
        if(!existing || calcSheetTotal(existing) === 0){
          toast('Chargement des données des périodes précédentes…','info',2000);
          await loadSheetFromAirtable(emp, p);
        }
      }
    }
    const hpMins = getHolidayPay(empId, periodKey);
    const sources = getHolidayPaySources(empId, periodKey);
    const srcStr = sources.map(s=>fmtMins(s.mins)).join(' + ');
    row.notes = `Férié - ${srcStr} × 5% = ${fmtMins(hpMins)}`;
    row.start='00:00';
    row.end=minsToHHMM(hpMins);
    row.lunch='';
  }
  const sheet=DB.timesheets[key];
  sheet.totalMinutes=calcSheetTotal(sheet);
  save();
  syncFullSheetToAirtable(empId, periodKey);
  render();
}

// ================================================================
//  EMPLOYEE PROFILE
// ================================================================
function renderEmpProfile(){
  const emp=currentEmp();
  if(!emp){state.view='login';return renderLogin();}
  const wrap=el('div','min-h-screen bg-slate-100');
  const header=el('div','nav-navy text-white px-4 py-3 flex items-center justify-between');
  header.innerHTML=`
    <div class="font-semibold">Mon profil</div>
    <button onclick="state.view='employee';render()" class="text-blue-200 hover:text-white text-sm">← Retour</button>`;
  const content=el('div','max-w-md mx-auto px-4 py-6');
  const hasPw=!!emp.password;
  const mode=emp.inputMode||'clock';
  content.innerHTML=`
    <div class="card p-5 space-y-5">
      <div class="flex items-center gap-4 pb-4 border-b">
        <div class="w-14 h-14 rounded-full nav-navy flex items-center justify-center text-white font-bold text-xl">
          ${emp.name.split(' ').map(n=>n[0]).join('').toUpperCase().slice(0,2)}
        </div>
        <div>
          <div class="font-bold text-slate-800 text-lg">${emp.name}</div>
          <div class="text-sm text-slate-400">${emp.partTime?'Temps partiel':'Temps plein'}</div>
        </div>
      </div>
      <div class="space-y-2 text-sm text-slate-600">
        <div class="flex items-center gap-2"><span class="text-base">📧</span><span>${emp.email||'Non configuré'}</span></div>
        <div class="flex items-center gap-2"><span class="text-base">📱</span><span>${emp.phone||'Non configuré'}</span></div>
        ${!emp.airtableId?'<div class="text-xs text-amber-600 bg-amber-50 rounded px-2 py-1">&#9888; Compte non li&#233; &#224; Airtable &mdash; contactez l\'administrateur</div>':''}
      </div>
      <div class="border-t pt-4">
        <div class="font-semibold text-slate-800 mb-1">📱 Mode de saisie (mobile)</div>
        <p class="text-xs text-slate-400 mb-3">Comment voulez-vous entrer vos heures sur téléphone?</p>
        <div class="grid grid-cols-2 gap-2">
          <button onclick="setInputMode('clock')"
            class="rounded-xl border-2 px-3 py-3 text-sm font-medium transition-all text-center
            ${mode==='clock'?'border-blue-500 bg-blue-50 text-blue-700':'border-slate-200 text-slate-500 hover:border-slate-300'}">
            🕐 Horloge<br><span class="text-xs font-normal">Cadran Android/iOS</span>
          </button>
          <button onclick="setInputMode('text')"
            class="rounded-xl border-2 px-3 py-3 text-sm font-medium transition-all text-center
            ${mode==='text'?'border-blue-500 bg-blue-50 text-blue-700':'border-slate-200 text-slate-500 hover:border-slate-300'}">
            ⌨️ Texte libre<br><span class="text-xs font-normal">ex: 9h30 ou 9.5</span>
          </button>
        </div>
      </div>
      <div class="border-t pt-4">
        <div class="font-semibold text-slate-800 mb-3">🔒 Mot de passe de connexion</div>
        ${hasPw?`
          <div class="bg-green-50 border border-green-200 rounded-lg p-2 text-xs text-green-700 mb-3">✓ Mot de passe actif</div>
          <div class="space-y-2">
            <div><label class="field-label block mb-1">Mot de passe actuel</label>
              <input type="password" id="ep-current" class="w-full"></div>
            <div><label class="field-label block mb-1">Nouveau mot de passe</label>
              <input type="password" id="ep-new" class="w-full"></div>
            <div><label class="field-label block mb-1">Confirmer</label>
              <input type="password" id="ep-confirm" class="w-full"></div>
            <div id="ep-err" class="text-red-500 text-xs hidden"></div>
            <button onclick="changeEmpPassword()" class="btn btn-navy w-full mt-1">Changer le mot de passe</button>
          </div>`:`
          <p class="text-sm text-slate-500 mb-3">Aucun mot de passe. Créez-en un pour sécuriser votre compte.</p>
          <div class="space-y-2">
            <div><label class="field-label block mb-1">Nouveau mot de passe</label>
              <input type="password" id="ep-new" class="w-full"></div>
            <div><label class="field-label block mb-1">Confirmer</label>
              <input type="password" id="ep-confirm" class="w-full"></div>
            <div id="ep-err" class="text-red-500 text-xs hidden"></div>
            <button onclick="createEmpPassword()" class="btn btn-green w-full mt-1">Créer mon mot de passe</button>
          </div>`}
      </div>
    </div>`;
  wrap.appendChild(header); wrap.appendChild(content);
  return wrap;
}

function showToast(msg, type='success'){
  const t=document.createElement('div');
  const bg=type==='success'?'bg-green-600':'bg-red-600';
  t.className=`fixed bottom-6 left-1/2 -translate-x-1/2 ${bg} text-white text-sm px-5 py-3 rounded-xl shadow-lg z-[999] transition-opacity duration-500`;
  t.textContent=msg;
  document.body.appendChild(t);
  setTimeout(()=>{ t.style.opacity='0'; setTimeout(()=>t.remove(),500); },2500);
}

async function syncEmpPrefsToAirtable(empId){
  const emp=DB.employees.find(e=>e.id===empId); if(!emp||!emp.airtableId) return;
  try{
    await fetch('/api/updateemployee',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({
        airtableId:    emp.airtableId,
        inputMode:     emp.inputMode,
        autoFill:      emp.autoFill,
        reminderCount: emp.reminderCount,
        partTime:      emp.partTime
      })
    });
  }catch(e){ console.warn('syncEmpPrefsToAirtable:', e.message); }
}

async function syncEmpPasswordToAirtable(airtableId, password){
  if(!airtableId) return;
  try{
    await fetch('/api/updateemployee',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({ airtableId, password: password ?? '' })
    });
  }catch(e){ console.warn('syncEmpPasswordToAirtable:', e.message); }
}

function setInputMode(mode){
  const emp=currentEmp(); if(!emp) return;
  emp.inputMode=mode;
  const dbEmp=DB.employees.find(e=>e.id===emp.id);
  if(dbEmp) dbEmp.inputMode=mode;
  save(); render();
  syncEmpPrefsToAirtable(emp.id);
}

async function changeEmpPassword(){
  const emp=currentEmp();
  const cur=document.getElementById('ep-current').value;
  const nw=document.getElementById('ep-new').value;
  const cf=document.getElementById('ep-confirm').value;
  const err=document.getElementById('ep-err');
  if(cur!==emp.password){err.textContent='Mot de passe actuel incorrect.';err.classList.remove('hidden');return;}
  if(nw.length<4){err.textContent='Min. 4 caractères.';err.classList.remove('hidden');return;}
  if(nw!==cf){err.textContent='Ne correspond pas.';err.classList.remove('hidden');return;}
  emp.password=nw;
  const dbEmp=DB.employees.find(e=>e.id===emp.id); if(dbEmp) dbEmp.password=nw;
  save();
  await syncEmpPasswordToAirtable(emp.airtableId, nw);
  showToast('Mot de passe changé!');
  render();
}

async function createEmpPassword(){
  const emp=currentEmp();
  const nw=document.getElementById('ep-new').value;
  const cf=document.getElementById('ep-confirm').value;
  const err=document.getElementById('ep-err');
  if(nw.length<4){err.textContent='Min. 4 caractères.';err.classList.remove('hidden');return;}
  if(nw!==cf){err.textContent='Ne correspond pas.';err.classList.remove('hidden');return;}
  emp.password=nw;
  const dbEmp=DB.employees.find(e=>e.id===emp.id); if(dbEmp) dbEmp.password=nw;
  save();
  await syncEmpPasswordToAirtable(emp.airtableId, nw);
  showToast('Mot de passe créé! Il sera demandé à la prochaine connexion.');
  render();
}

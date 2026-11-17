// ================================================================
//  ARCHIVE ROW ACTIONS (édition par date, depuis l'onglet Archives admin)
// ================================================================
const _adminNoteTimers = {};
const _adminNoteOriginal = {};
const _archiveEditTimers = {};
const _archiveFieldOriginal = {};

function archiveEditField(empId, periodKey, rowDate, field, value){
  const key = `${empId}_${periodKey}`;
  const sheet = DB.timesheets[key]; if(!sheet) return;
  const row = sheet.rows.find(r => r.date === rowDate); if(!row) return;
  const origKey = `${empId}_${periodKey}_${rowDate}_${field}`;
  if(_archiveFieldOriginal[origKey] === undefined) _archiveFieldOriginal[origKey] = row[field] || '';
  row[field] = value;
  const s=parseTime(row.start),e=parseTime(row.end),l=parseTime(row.lunch)||0,p=parseTime(row.pause)||0;
  const worked=(s!==null&&e!==null)?Math.max(0,e-s-l-p):null;
  const totalEl=document.getElementById(`arch-total-${empId}-${rowDate}`);
  if(totalEl) totalEl.textContent=worked!==null?fmtMins(worked):'—';
  sheet.totalMinutes=calcSheetTotal(sheet);
  // Mettre à jour le total du récapitulatif en temps réel (sans attendre render())
  const sumEl=document.getElementById(`arch-sum-${empId}`);
  if(sumEl) sumEl.textContent=fmtMins(sheet.totalMinutes);
  save();
  const timerKey=`arch-${empId}-${rowDate}`;
  clearTimeout(_archiveEditTimers[timerKey]);
  _archiveEditTimers[timerKey]=setTimeout(()=>{
    const prefix=`${empId}_${periodKey}_${rowDate}_`;
    Object.keys(_archiveFieldOriginal).forEach(k=>{
      if(!k.startsWith(prefix)) return;
      const f=k.slice(prefix.length);
      const orig=_archiveFieldOriginal[k];
      const cur=row[f] || '';
      if(orig !== cur) logChange(empId, rowDate, f, orig, cur);
      delete _archiveFieldOriginal[k];
    });
    save();
    const emp=DB.employees.find(e=>e.id===empId); if(!emp?.airtableId) return;
    const period=PERIOD.list(12).find(p=>p.key===periodKey); if(!period) return;
    const periodLabel=PERIOD.airtableLabel(period.start,period.end);
    fetch('/api/syncairtable',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({empId:emp.airtableId,date:rowDate,start:row.start||'',end:row.end||'',
        lunch:row.lunch||'',pause:row.pause||'',notes:row.notes||'',adminNote:row.adminNote||'',
        realStart:row.realStart||'',realEnd:row.realEnd||'',realLunch:row.realLunch||'',realPause:row.realPause||'',
        total:(()=>{const s2=parseTime(row.start),e2=parseTime(row.end),l2=parseTime(row.lunch)||0,p2=parseTime(row.pause)||0;return (s2!==null&&e2!==null)?fmtMins(Math.max(0,e2-s2-l2-p2)):'';})(),
        periodeDePaie:periodLabel,recordId:row.airtableRecordId||undefined})
    }).then(async r=>{
      if(r.ok){const j=await r.json();if(j.recordId){row.airtableRecordId=j.recordId;save();}}
    }).catch(console.error);
  }, 1500);
}

async function approveArchiveEmployee(empId, periodKey){
  const key=`${empId}_${periodKey}`;
  if(!DB.timesheets[key]){
    const period=PERIOD.list(12).find(p=>p.key===periodKey);
    if(period) getOrCreateSheet(DB,empId,periodKey,period.start); else return;
  }
  DB.timesheets[key].approved=true;
  DB.timesheets[key].approvedAt=new Date().toISOString();
  DB.timesheets[key].totalMinutes=calcSheetTotal(DB.timesheets[key]);
  save();
  const empName=DB.employees.find(e=>e.id===empId)?.name||'Employé';
  toast(`${empName} — approuvé ✓`,'success');
  render();
  await syncApprovalToAirtable(empId,periodKey,true);
}

async function approveAllArchiveVisible(){
  const summaryPeriods=state.archiveFilter.period
    ?[PERIOD.list(12).find(p=>p.key===state.archiveFilter.period)].filter(Boolean)
    :PERIOD.list(12);
  const summaryEmps=state.archiveFilter.name
    ?[DB.employees.find(e=>e.id===state.archiveFilter.name)].filter(Boolean)
    :DB.employees.filter(e=>!e.archived);
  const toSync=[];
  summaryEmps.forEach(emp=>{
    summaryPeriods.forEach(period=>{
      const key=`${emp.id}_${period.key}`;
      const sheet=DB.timesheets[key];
      if(sheet&&!sheet.approved&&calcSheetTotal(sheet)>0){
        sheet.approved=true; sheet.approvedAt=new Date().toISOString();
        sheet.totalMinutes=calcSheetTotal(sheet);
        toSync.push({empId:emp.id,periodKey:period.key});
      }
    });
  });
  if(toSync.length===0){toast('Aucune feuille à approuver.','info');return;}
  save(); autoBackup(DB,'approve-archives');
  toast(`${toSync.length} feuille(s) approuvée(s) ✓`,'success');
  render();
  for(const {empId,periodKey} of toSync) await syncApprovalToAirtable(empId,periodKey,true);
}

function unlockArchiveSheet(empId, periodKey){
  const key=`${empId}_${periodKey}`;
  if(DB.timesheets[key]){DB.timesheets[key].approved=false;DB.timesheets[key].approvedAt=null;}
  save();
  const empName=DB.employees.find(e=>e.id===empId)?.name||'Employé';
  toast(`${empName} — déverrouillé`,'info');
  syncApprovalToAirtable(empId,periodKey,false);
  render();
}

function saveAdminNote(empId,periodKey,rowIdx,value){
  const key=`${empId}_${periodKey}`;
  if(!DB.timesheets[key]) return;
  const row=DB.timesheets[key].rows[rowIdx];
  const timerKey=`adminnote-${empId}-${rowIdx}`;
  if(_adminNoteOriginal[timerKey] === undefined) _adminNoteOriginal[timerKey] = row.adminNote || '';
  row.adminNote=value;
  DataService.save(DB);
  clearTimeout(_adminNoteTimers[timerKey]);
  _adminNoteTimers[timerKey]=setTimeout(()=>{
    const orig=_adminNoteOriginal[timerKey];
    if(orig !== (row.adminNote||'')) logChange(empId, row.date, 'adminNote', orig, row.adminNote||'');
    delete _adminNoteOriginal[timerKey];
    syncFullSheetToAirtable(empId, periodKey);
  }, 1500);
}

async function archiveQuickFill(empId, periodKey, rowDate, value){
  const key=`${empId}_${periodKey}`;
  const sheet=DB.timesheets[key]; if(!sheet) return;
  const row=sheet.rows.find(r=>r.date===rowDate); if(!row) return;
  if(value==='clear'){
    if(!confirm('Effacer toutes les données de cette journée?')) return;
    row.start=''; row.end=''; row.lunch=''; row.pause=''; row.notes='';
  } else {
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
          if(!DB.timesheets[`${empId}_${p.key}`]){
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
  }
  sheet.totalMinutes=calcSheetTotal(sheet);
  save();
  syncFullSheetToAirtable(empId, periodKey);
  render();
}

function archiveClearRow(empId, periodKey, rowDate){
  archiveQuickFill(empId, periodKey, rowDate, 'clear');
}

function copyYesterday(empId,periodKey){
  const key=`${empId}_${periodKey}`;
  const sheet=DB.timesheets[key]; if(!sheet) return;
  const todayStr=localDateStr();
  const todayIdx=sheet.rows.findIndex(r=>r.date===todayStr);
  if(todayIdx<1){ alert("Impossible de trouver la journée d'hier dans cette période."); return; }
  const yesterday=sheet.rows[todayIdx-1];
  const today=sheet.rows[todayIdx];
  if(today.start||today.end){
    if(!confirm("Des heures sont déjà entrées pour aujourd'hui. Voulez-vous quand même écraser?")) return;
  }
  today.start=yesterday.start; today.end=yesterday.end; today.lunch=yesterday.lunch;
  const gt=sheet.rows.reduce((sum,r)=>{
    const rs=parseTime(r.start),re=parseTime(r.end),rl=parseTime(r.lunch)||0;
    if(rs!==null&&re!==null){const d=re-rs-rl;return sum+(d<0?0:d);}
    return sum;
  },0);
  sheet.totalMinutes=gt;
  save();
  syncFullSheetToAirtable(empId, periodKey);
  render();
}

function archiveStatusCell(emp, period, sheet){
  if(sheet.approved)
    return '<span class="badge-approved">\u2713 Approuv\u00e9</span> <button onclick="unlockSheet(\''+emp.id+'\',\''+period.key+'\')" class="btn btn-gray text-xs">\uD83D\uDD13</button>';
  return '<button onclick="approveSheet(\''+emp.id+'\',\''+period.key+'\')" class="btn btn-green text-xs">\u2713 Approuver</button>';
}

function exportFiltered(){
  const periods=PERIOD.list(12);
  const allEmps=DB.employees.filter(e => state.showArchivedInFilter || !e.archived);
  const summaryEmp=state.archiveFilter.name?[DB.employees.find(e=>e.id===state.archiveFilter.name)]:allEmps;
  const summaryPeriods=state.archiveFilter.period?[periods.find(p=>p.key===state.archiveFilter.period)]:periods;
  const search=state.archiveSearch;

  const csvRows=[['Employé','Période','Date','Début','Dîner','Fin','Pause','Total','Notes','Note admin','Statut']];
  (summaryPeriods||[]).filter(Boolean).forEach(p=>{
    (summaryEmp||[]).filter(Boolean).forEach(emp=>{
      const k=`${emp.id}_${p.key}`, sheet=DB.timesheets[k]; if(!sheet) return;
      sheet.rows.forEach(row=>{
        if(search&&(!row.notes||!row.notes.toLowerCase().includes(search.toLowerCase()))) return;
        const w=calcWorked(parseTime(row.start),parseTime(row.end),parseTime(row.lunch),parseTime(row.pause));
        csvRows.push([
          emp.name,
          PERIOD.label(p.start,p.end),
          row.date,
          row.start||'',
          row.lunch||'',
          row.end||'',
          row.pause||'',
          w!==null?fmtMins(w):'',
          row.notes||'',
          row.adminNote||'',
          sheet.approved?'Approuvé':'En attente'
        ]);
      });
    });
  });

  if(csvRows.length===1){ toast('Aucune donnée à exporter avec ces filtres.','info'); return; }

  const ts=new Date().toISOString().slice(0,10);
  downloadCSV(csvRows, `archives_export_${ts}.csv`);
  toast(`✅ ${csvRows.length-1} ligne(s) exportée(s) en CSV`,'success');
}

function recalcArchiveTotals(){
  // Recalcule tous les totalMinutes en mémoire et met à jour les cellules du récapitulatif
  const periods=PERIOD.list(12);
  DB.employees.forEach(emp=>{
    periods.forEach(p=>{
      const key=`${emp.id}_${p.key}`;
      const sheet=DB.timesheets[key]; if(!sheet) return;
      sheet.totalMinutes=calcSheetTotal(sheet);
      const sumEl=document.getElementById(`arch-sum-${emp.id}`);
      if(sumEl) sumEl.textContent=fmtMins(sheet.totalMinutes);
    });
  });
  save();
  render();
  toast('✅ Totaux recalculés','success',2000);
}

function renderArchives(){
  const frag=document.createDocumentFragment();
  const periods=PERIOD.list(12);
  const allEmps=DB.employees
  .filter(e => state.showArchivedInFilter || !e.archived)
  .sort((a,b)=>a.name.localeCompare(b.name,'fr',{sensitivity:'base'}));
  const archivedCount=DB.employees.filter(e=>e.archived).length;

  const filters=el('div','card p-4 mb-4 flex flex-wrap gap-3 items-end');
  const loadLbl=state.archivesLoading?'⏳ Chargement…':'🔄 Charger depuis Airtable';
  filters.innerHTML=`
    <div><label class="field-label block mb-1">Employé</label>
  <div class="flex items-center gap-2">
    <select onchange="state.archiveFilter.name=this.value;render()">
      <option value="">Tous</option>
      ${allEmps.map(e=>`<option value="${e.id}" ${state.archiveFilter.name===e.id?'selected':''}>${e.name}${e.archived?' (archivé)':''}</option>`).join('')}
    </select>
    ${archivedCount>0?`<button onclick="state.showArchivedInFilter=!state.showArchivedInFilter;render()" class="btn text-xs ${state.showArchivedInFilter?'btn-orange':'btn-light'}">📦 ${state.showArchivedInFilter?'Masquer':'Archivés ('+archivedCount+')'}</button>`:''}
  </div></div>
    <div><label class="field-label block mb-1">Période</label>
      <select onchange="state.archiveFilter.period=this.value;if(this.value)loadArchivePeriod(this.value);else render()">
        <option value="">Toutes</option>
        ${periods.map(p=>`<option value="${p.key}" ${state.archiveFilter.period===p.key?'selected':''}>${PERIOD.label(p.start,p.end)}</option>`).join('')}
      </select></div>
    <div><label class="field-label block mb-1">Recherche (Notes)</label>
      <input type="text" placeholder="Notes…" value="${state.archiveSearch}"
        oninput="state.archiveSearch=this.value;render()" style="width:180px"></div>
    <button onclick="refreshArchives()" class="btn btn-navy" ${state.archivesLoading?'disabled':''} style="align-self:flex-end">${loadLbl}</button>
    <button onclick="exportFiltered()" class="btn btn-navy" style="align-self:flex-end">📤 Exporter</button>`;
  frag.appendChild(filters);

  const summaryEmp=state.archiveFilter.name?[DB.employees.find(e=>e.id===state.archiveFilter.name)]:allEmps;
  const summaryPeriods=state.archiveFilter.period?[periods.find(p=>p.key===state.archiveFilter.period)]:periods;
  const hasPeriodFilter=!!state.archiveFilter.period;

  if(hasPeriodFilter){
    const actionBar=el('div','mb-4 flex flex-wrap gap-2');
    actionBar.innerHTML=`
      <button onclick="approveAllArchiveVisible()" class="btn btn-green">✓✓ Approuver tous visibles</button>`;
    frag.appendChild(actionBar);
  }

  const summaryCard=el('div','card p-4 mb-4');
  summaryCard.innerHTML=`
    <div class="flex items-center justify-between mb-2">
      <h3 class="text-sm font-semibold text-slate-700">Récapitulatif</h3>
      <button onclick="recalcArchiveTotals()" class="btn btn-light text-xs" style="padding:2px 8px" title="Recalculer tous les totaux">🔄 Recalculer</button>
    </div>
    <table><thead><tr class="nav-navy">
      <th class="text-left pl-3">Employé</th>
      <th>Total heures</th>
      ${hasPeriodFilter?'<th title="(2 périodes précédentes × 5%), arrondi au 15min supérieur">🎉 Congé férié</th><th>Statut</th><th></th>':''}
    </tr></thead>
    <tbody>${(summaryEmp||[]).filter(Boolean).map(emp=>{
      const tot=(summaryPeriods||[]).filter(Boolean).reduce((s,p)=>{
        const k=`${emp.id}_${p.key}`; return s+(DB.timesheets[k]?calcSheetTotal(DB.timesheets[k]):0);
      },0);
      const sheet=hasPeriodFilter?DB.timesheets[`${emp.id}_${state.archiveFilter.period}`]:null;
      const approved=sheet?.approved;
      const hpKey=state.archiveFilter.period;
      const hpCalc=hasPeriodFilter?calcHolidayPay(emp.id,hpKey):0;
      const hpEff=hasPeriodFilter?getHolidayPay(emp.id,hpKey):0;
      const hpIsOverride=hasPeriodFilter&&DB.holidayPay[emp.id]?.[hpKey]!==undefined;
      const hpSources=hasPeriodFilter?getHolidayPaySources(emp.id,hpKey):[];
      const hpTooltip=hpSources.map(s=>`${s.label}: ${fmtMins(s.mins)}`).join(' | ')+(hpSources.length?` → ×5%=${fmtMins(hpCalc)}`:'');
      return `<tr>
        <td class="text-left pl-3">${emp.name}</td>
        <td class="total-cell" id="arch-sum-${emp.id}">${fmtMins(tot)}</td>
        ${hasPeriodFilter?`
          <td>
            <div class="flex items-center justify-center gap-1">
              <div class="text-xs text-slate-400 whitespace-nowrap" title="${hpTooltip}" style="cursor:help">
                ${hpSources.map(s=>`<span class="mono">${fmtMins(s.mins)}</span>`).join('<span class="text-slate-300 mx-0.5">+</span>')}
                ${hpSources.length?'<span class="text-slate-300 mx-0.5">→</span>':''}
              </div>
              <input type="text" id="hp-arch-inp-${emp.id}"
                class="mono text-xs font-bold text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1 text-center"
                style="width:68px"
                value="${fmtMins(hpEff)}"
                title="${hpTooltip}"
                onchange="setHolidayPay('${emp.id}','${hpKey}',this.value)"
                onblur="setHolidayPay('${emp.id}','${hpKey}',this.value)"/>
              ${hpIsOverride?`<button onclick="delete DB.holidayPay['${emp.id}']['${hpKey}'];save();render()" class="text-amber-500 hover:text-amber-700 text-xs" title="Réinitialiser (auto: ${fmtMins(hpCalc)})">↺</button>`:'<span class="text-slate-300 text-xs">auto</span>'}
            </div>
          </td>
          <td>${approved
            ?'<span class="badge-approved">✓ Approuvé</span>'
            :'<span class="badge-pending">En attente</span>'}
          </td>
          <td class="text-right pr-2">${approved
            ?`<button onclick="unlockArchiveSheet('${emp.id}','${state.archiveFilter.period}')" class="btn btn-gray text-xs">🔓 Déverrouiller</button>`
            :tot>0?`<button onclick="approveArchiveEmployee('${emp.id}','${state.archiveFilter.period}')" class="btn btn-green text-xs">✓ Approuver</button>`:''}
          </td>`:''}
      </tr>`;
    }).join('')}</tbody></table>`;
  frag.appendChild(summaryCard);

  const search=state.archiveSearch;
  function hl(text){
    if(!search||!text) return text||'';
    return text.replace(new RegExp(`(${search.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')})`, 'gi'), '<mark class="highlight-search">$1</mark>');
  }
  const breakOpts=(['','0.25','0.5','0.75','1','1.25','1.5','1.75','2','2.5','3']);
  const breakLabels=(['—','15m','30m','45m','1h00','1h15','1h30','1h45','2h00','2h30','3h00']);

  let rows=[];
  (summaryPeriods||[]).filter(Boolean).forEach(p=>{
    (summaryEmp||[]).filter(Boolean).forEach(emp=>{
      const k=`${emp.id}_${p.key}`,sheet=DB.timesheets[k]; if(!sheet) return;
      sheet.rows.forEach(row=>{
        if(search&&(!row.notes||!row.notes.toLowerCase().includes(search.toLowerCase()))) return;
        rows.push({emp,period:p,row,sheet});
      });
    });
  });

  const detailCard=el('div','card overflow-x-auto');
  const table=document.createElement('table');
  table.style.tableLayout='fixed';
  // Pas de table.style.width fixé en px — on laisse la CSS globale table{width:100%} s'appliquer.
  // Les colgroup donnent des largeurs minimales proportionnelles; le tableau remplit son conteneur.
  const colWidths=[];
  if(!state.archiveFilter.name) colWidths.push(148);   // Employé
  if(!hasPeriodFilter) colWidths.push(82);              // Période
  colWidths.push(92, 92, 80, 92, 80, 58, 280, 190, 82, 82, 82, 82, 120, 104);
  // Date, Début, Dîner, Fin, Pause, Total, Notes+boutons, Note admin, Début réel, Fin réel, Dîner réel, Pause réelle, Photos, Statut
  const colgroupHtml='<colgroup>'+colWidths.map(w=>`<col style="width:${w}px">`).join('')+'</colgroup>';
  table.innerHTML=`${colgroupHtml}
  <thead><tr class="nav-navy">
    ${!state.archiveFilter.name?'<th class="text-left pl-3">Employé</th>':''}
    ${!hasPeriodFilter?'<th>Période</th>':''}
    <th>Date</th>
    <th>Début</th><th>Dîner</th>
    <th>Fin</th><th>Pause</th>
    <th>Total</th><th class="text-left pl-2">Notes</th>
    <th class="text-left pl-2">🔒 Note admin</th>
    <th style="min-width:82px;background:#fff7ed;color:#ea580c">✎ Début réel</th>
    <th style="min-width:82px;background:#fff7ed;color:#ea580c">✎ Fin réel</th>
    <th style="min-width:82px;background:#fff7ed;color:#ea580c">✎ Dîner réel</th>
    <th style="min-width:82px;background:#fff7ed;color:#ea580c">✎ Pause réelle</th>
    <th style="min-width:120px">📷 Photos</th>
    <th>Statut</th>
  </tr></thead>`;
  const tbody=document.createElement('tbody');

  if(rows.length===0){
    const tr=document.createElement('tr');
    tr.innerHTML='<td colspan="22" class="text-center text-slate-400 py-6">Aucun résultat.</td>';
    tbody.appendChild(tr);
  }

  rows.forEach(({emp,period,row,sheet})=>{
    const d=new Date(row.date+'T00:00:00');
    const w=calcWorked(parseTime(row.start),parseTime(row.end),parseTime(row.lunch),parseTime(row.pause));
    const tr=document.createElement('tr');
    tr.className=isWeekend(d)?'bg-weekend':'bg-day';
    const _nameParts=emp.name.split(' ');
    const _firstN=_nameParts[0];
    const _lastN=_nameParts.slice(1).join(' ');
    const _empCellHtml=`<div style="white-space:nowrap">${_firstN}</div><div class="text-slate-400" style="white-space:nowrap;font-size:10px">${_lastN}</div>`;
    const _periodCellHtml=`<div style="white-space:nowrap">${fmtShort(period.start)}</div><div style="white-space:nowrap">– ${fmtShort(period.end)}</div>`;

    if(sheet.approved){
      const _hasCorr=(row.realStart&&row.realStart!==row.start)||(row.realEnd&&row.realEnd!==row.end);
      const _dispRS=_hasCorr&&row.realStart
        ?`<span style="color:#ea580c;font-weight:600">${row.realStart}</span>${row.start?`<br><small style="color:#94a3b8;text-decoration:line-through">${row.start}</small>`:''}`:row.realStart||'—';
      const _dispRE=_hasCorr&&row.realEnd
        ?`<span style="color:#ea580c;font-weight:600">${row.realEnd}</span>${row.end?`<br><small style="color:#94a3b8;text-decoration:line-through">${row.end}</small>`:''}`:row.realEnd||'—';
      const _photosTd=(row.photos||[]).map(p=>`<a href="#" onclick="openPhoto('${row.airtableRecordId}','${p.id}');return false;" style="display:inline-block;margin-right:2px" title="${(p.filename||'').replace(/"/g,'&quot;')}"><img src="${(p.thumbnails&&p.thumbnails.small&&p.thumbnails.small.url)||p.url}" style="height:32px;width:32px;object-fit:cover;border-radius:4px" onerror="this.style.display='none';this.parentNode.textContent='📷'"/></a>`).join('');
      tr.innerHTML=`
        ${!state.archiveFilter.name?`<td class="text-left pl-3 text-xs font-medium">${_empCellHtml}</td>`:''}
        ${!hasPeriodFilter?`<td class="text-xs">${_periodCellHtml}</td>`:''}
        <td class="text-xs mono whitespace-nowrap">${dayLabel(d)}</td>
        <td class="mono text-xs">${row.start||'—'}</td>
        <td class="mono text-xs">${row.lunch||'—'}</td>
        <td class="mono text-xs">${row.end||'—'}</td>
        <td class="mono text-xs">${row.pause||'—'}</td>
        <td class="total-cell text-xs" id="arch-total-${emp.id}-${row.date}">${w!==null?fmtMins(w):'—'}</td>
        <td class="text-xs" style="max-width:260px;word-break:break-word;white-space:normal">${hl(row.notes)}</td>
        <td class="text-xs" style="max-width:220px;word-break:break-word;white-space:normal;background:#fef9c3">${row.adminNote||''}</td>
        <td class="mono text-xs">${_dispRS}</td>
        <td class="mono text-xs">${_dispRE}</td>
        <td class="mono text-xs">${row.realLunch||'—'}</td>
        <td class="mono text-xs">${row.realPause||'—'}</td>
        <td style="padding:4px 6px">${_photosTd}</td>
        <td><span class="badge-approved">✓ Approuvé</span></td>`;
    } else {
      const lOpts=breakOpts.map((v,i)=>`<option value="${v}"${String(row.lunch||'')===v?' selected':''}>${breakLabels[i]}</option>`).join('');
      const pOpts=breakOpts.map((v,i)=>`<option value="${v}"${String(row.pause||'')===v?' selected':''}>${breakLabels[i]}</option>`).join('');
      const dLong=dayLabelLong(d).replace(/'/g,"\\'");
      tr.innerHTML=`
        ${!state.archiveFilter.name?`<td class="text-left pl-3 text-xs font-medium">${_empCellHtml}</td>`:''}
        ${!hasPeriodFilter?`<td class="text-xs">${_periodCellHtml}</td>`:''}
        <td class="text-xs mono whitespace-nowrap">${dayLabel(d)}</td>
        <td><input type="text" class="time-input" value="${row.start||''}" placeholder="—"
          oninput="archiveEditField('${emp.id}','${period.key}','${row.date}','start',this.value)"
          onchange="archiveEditField('${emp.id}','${period.key}','${row.date}','start',this.value)"/></td>
        <td><select class="time-input" style="width:68px"
          onchange="archiveEditField('${emp.id}','${period.key}','${row.date}','lunch',this.value)">${lOpts}</select></td>
        <td><input type="text" class="time-input" value="${row.end||''}" placeholder="—"
          oninput="archiveEditField('${emp.id}','${period.key}','${row.date}','end',this.value)"
          onchange="archiveEditField('${emp.id}','${period.key}','${row.date}','end',this.value)"/></td>
        <td><select class="time-input" style="width:68px"
          onchange="archiveEditField('${emp.id}','${period.key}','${row.date}','pause',this.value)">${pOpts}</select></td>
        <td class="total-cell text-xs" id="arch-total-${emp.id}-${row.date}">${w!==null?fmtMins(w):'—'}</td>
        <td style="padding:3px 4px">
          <div style="display:flex;align-items:center;gap:2px;flex-wrap:nowrap">
            <input id="arch-notes-inp-${emp.id}-${row.date}" type="text" class="time-input"
              style="flex:1;min-width:44px;padding:3px 4px" placeholder="Notes…"
              value="${(row.notes||'').replace(/"/g,'&quot;')}"
              onchange="archiveEditField('${emp.id}','${period.key}','${row.date}','notes',this.value)"/>
            <button onclick="openNotesModal('${emp.id}','${period.key}',null,document.getElementById('arch-notes-inp-${emp.id}-${row.date}').value,'${dLong}','notes','${row.date}')"
              class="btn btn-light" style="padding:2px 5px;font-size:11px;flex-shrink:0" title="Agrandir les notes">🔍</button>
            <button onclick="archiveQuickFill('${emp.id}','${period.key}','${row.date}','Congé')"
              class="btn btn-gray" style="padding:2px 5px;font-size:10px;flex-shrink:0">Congé</button>
            <button onclick="archiveQuickFill('${emp.id}','${period.key}','${row.date}','Maladie')"
              class="btn btn-orange" style="padding:2px 5px;font-size:10px;flex-shrink:0">Mal.</button>
            <button onclick="archiveQuickFill('${emp.id}','${period.key}','${row.date}','Demi-journée')"
              class="btn btn-blue" style="padding:2px 5px;font-size:10px;flex-shrink:0">½j</button>
            <button onclick="archiveQuickFill('${emp.id}','${period.key}','${row.date}','Absent')"
              class="btn" style="padding:2px 5px;font-size:10px;flex-shrink:0;background:#64748b;color:white">Abs.</button>
            <button onclick="archiveQuickFill('${emp.id}','${period.key}','${row.date}','Férié')"
              class="btn" style="padding:2px 5px;font-size:10px;flex-shrink:0;background:#d97706;color:white"
              title="Remplit avec l&apos;indemnité de congé férié calculée">Férié</button>
            <button onclick="archiveClearRow('${emp.id}','${period.key}','${row.date}')"
              class="btn btn-red" style="padding:2px 5px;font-size:10px;flex-shrink:0" title="Effacer la journée">✕</button>
          </div>
        </td>
        <td style="padding:3px 4px">
          <div style="display:flex;align-items:center;gap:3px">
            <input id="arch-adminnote-inp-${emp.id}-${row.date}" type="text" class="time-input"
              style="flex:1;min-width:60px;background:#fef9c3;padding:3px 4px" placeholder="Note privée…"
              value="${(row.adminNote||'').replace(/"/g,'&quot;')}"
              onchange="archiveEditField('${emp.id}','${period.key}','${row.date}','adminNote',this.value)"/>
            <button onclick="openNotesModal('${emp.id}','${period.key}',null,document.getElementById('arch-adminnote-inp-${emp.id}-${row.date}').value,'${dLong}','adminNote','${row.date}')"
              class="btn btn-light" style="padding:2px 6px;font-size:11px;flex-shrink:0" title="Agrandir la note admin">🔍</button>
          </div>
        </td>
        <td><input type="text" class="time-input" style="width:72px;background:#fff7ed;border-color:#fdba74" placeholder="—"
          value="${(row.realStart||'').replace(/"/g,'&quot;')}"
          onchange="archiveEditField('${emp.id}','${period.key}','${row.date}','realStart',this.value)"
          title="Heure d'arrivée réelle (paie)"/></td>
        <td><input type="text" class="time-input" style="width:72px;background:#fff7ed;border-color:#fdba74" placeholder="—"
          value="${(row.realEnd||'').replace(/"/g,'&quot;')}"
          onchange="archiveEditField('${emp.id}','${period.key}','${row.date}','realEnd',this.value)"
          title="Heure de départ réelle (paie)"/></td>
        <td><input type="text" class="time-input" style="width:72px;background:#fff7ed;border-color:#fdba74" placeholder="—"
          value="${(row.realLunch||'').replace(/"/g,'&quot;')}"
          onchange="archiveEditField('${emp.id}','${period.key}','${row.date}','realLunch',this.value)"
          title="Dîner réel (paie)"/></td>
        <td><input type="text" class="time-input" style="width:72px;background:#fff7ed;border-color:#fdba74" placeholder="—"
          value="${(row.realPause||'').replace(/"/g,'&quot;')}"
          onchange="archiveEditField('${emp.id}','${period.key}','${row.date}','realPause',this.value)"
          title="Pause réelle (paie)"/></td>
        <td id="arch-photo-cell-${emp.id}-${row.date}" style="padding:4px 8px;vertical-align:middle">
          ${(row.photos||[]).map(p=>`<a href="#" onclick="openPhoto('${row.airtableRecordId}','${p.id}');return false;" style="display:inline-block;margin-right:2px" title="${(p.filename||'').replace(/"/g,'&quot;')}"><img src="${(p.thumbnails&&p.thumbnails.small&&p.thumbnails.small.url)||p.url}" style="height:36px;width:36px;object-fit:cover;border-radius:4px" onerror="this.style.display='none';this.parentNode.textContent='📷'"/></a>`).join('')}
          ${row.airtableRecordId
            ?`<label style="cursor:pointer;display:inline-block;vertical-align:middle;margin-top:2px"><input type="file" accept="image/*,video/*,application/pdf" style="display:none" onchange="uploadPhotoArchive('${emp.id}','${period.key}','${row.date}',this)"/><span style="font-size:11px;background:#e0f2fe;border:1px solid #7dd3fc;border-radius:4px;padding:2px 6px;color:#0369a1">+ Photo</span></label>`
            :'<span style="font-size:10px;color:#94a3b8">Sync requis</span>'}
        </td>
        <td style="padding:4px 6px">
          <button onclick="approveArchiveEmployee('${emp.id}','${period.key}')"
            class="btn btn-green text-xs" style="padding:3px 8px;font-size:10px;white-space:nowrap">✓ Approuver</button>
        </td>`;
    }
    tbody.appendChild(tr);
  });

  table.appendChild(tbody);
  detailCard.appendChild(table);
  frag.appendChild(detailCard);
  return frag;
}

async function uploadPhotoArchive(empId,periodKey,rowDate,input){
  const file=input.files[0]; if(!file) return;
  const key=`${empId}_${periodKey}`;
  if(!DB.timesheets[key]) return;
  const row=DB.timesheets[key].rows.find(r=>r.date===rowDate);
  if(!row) return;
  if(!row.airtableRecordId){ toast('Synchronisez d\'abord avant d\'ajouter une photo.','info'); return; }
  const span=input.closest('label')?.querySelector('span');
  if(span) span.textContent='…';
  try{
    const ab=await file.arrayBuffer();
    const bytes=new Uint8Array(ab);
    let bin=''; for(let i=0;i<bytes.length;i++) bin+=String.fromCharCode(bytes[i]);
    const b64=btoa(bin);
    const resp=await fetch('/api/uploadphoto',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({recordId:row.airtableRecordId,filename:file.name,mimeType:file.type,data:b64})});
    if(!resp.ok){ const err=await resp.json(); throw new Error(err.error||resp.status); }
    const att=await resp.json();
    if(!row.photos) row.photos=[];
    row.photos.push(att);
    save();
    const cell=document.getElementById(`arch-photo-cell-${empId}-${rowDate}`);
    if(cell){
      const a=document.createElement('a'); a.href=att.url; a.target='_blank'; a.style.cssText='display:inline-block;margin-right:2px';
      const img=document.createElement('img');
      img.src=(att.thumbnails&&att.thumbnails.small&&att.thumbnails.small.url)||att.url;
      img.style.cssText='height:36px;width:36px;object-fit:cover;border-radius:4px'; img.title=att.filename||'';
      a.appendChild(img); cell.insertBefore(a,cell.querySelector('label'));
    }
    if(span) span.textContent='+ Photo';
    input.value='';
    toast('Photo ajoutée ✓','success');
  }catch(e){
    if(span) span.textContent='+ Photo';
    console.error('uploadPhotoArchive:',e.message);
    toast(`Erreur upload: ${e.message}`,'error');
  }
}

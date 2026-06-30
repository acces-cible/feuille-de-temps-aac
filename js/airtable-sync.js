// ================================================================
//  AIRTABLE READ
// ================================================================
async function loadSheetFromAirtable(emp, periodOverride){
  if(!emp||!emp.airtableId){ console.warn('loadSheet: pas airtableId'); return; }
  const period = periodOverride || PERIOD.current();
  const ymd=d=>{ const y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,'0'),dd=String(d.getDate()).padStart(2,'0'); return `${y}-${m}-${dd}`; };
  const ps=ymd(period.start), pe=ymd(period.end);
  console.log(`loadSheet: ${emp.name} | ${ps} → ${pe}`);
  try{
    const resp=await fetch(`/api/gettimesheet?empId=${encodeURIComponent(emp.airtableId)}&periodStart=${ps}&periodEnd=${pe}&t=${Date.now()}`);
    if(!resp.ok){ console.warn('getTimesheet status:', resp.status, await resp.text()); return; }
    const json=await resp.json();
    const atRows=json.rows||[];
    console.log(`getTimesheet retourne ${atRows.length} ligne(s) pour ${emp.name}`);
    if(!atRows.length){ console.log('Aucune ligne Airtable — localStorage conservé'); return; }
    const sheet=getOrCreateSheet(DB,emp.id,period.key,period.start);
    let changed=false;
    atRows.forEach(at=>{
      const lr=sheet.rows.find(r=>r.date===at.date); if(!lr) return;
      if(at.airtableRecordId && lr.airtableRecordId!==at.airtableRecordId){lr.airtableRecordId=at.airtableRecordId;changed=true;}
      if(at.start     && at.start!==lr.start)    {lr.start=at.start;changed=true;}
      if(at.end       && at.end!==lr.end)        {lr.end=at.end;changed=true;}
      if(at.lunch     && at.lunch!==lr.lunch)    {lr.lunch=at.lunch;changed=true;}
      if(at.notes!==undefined&&at.notes!==lr.notes){lr.notes=at.notes;changed=true;}
      if(at.adminNote!==undefined&&at.adminNote!==lr.adminNote){lr.adminNote=at.adminNote;changed=true;}
    });
    const atApproved = atRows.some(at => at.approved === true);
    if(atApproved && !sheet.approved){
      sheet.approved = true;
      sheet.approvedAt = sheet.approvedAt || new Date().toISOString();
      changed = true;
    } else if(!atApproved && sheet.approved){
      sheet.approved = false;
      sheet.approvedAt = null;
      changed = true;
    }
    sheet.totalMinutes=calcSheetTotal(sheet);
    if(changed){ save(); render(); console.log(`✅ Feuille mise à jour: ${emp.name}`); }
    else{ console.log(`Feuille déjà à jour: ${emp.name}`); }
  }catch(e){ console.warn('loadSheetFromAirtable erreur:', e.message); }
}

async function loadArchivePeriod(periodKey){
  const period = PERIOD.list(24).find(p => p.key === periodKey);
  if(!period) return;
  if(_archiveLoadedPeriods.has(periodKey)){
    render();
    return;
  }
  state.archivesLoading = true; render();
  await Promise.allSettled(DB.employees.map(emp => loadSheetFromAirtable(emp, period)));
  _archiveLoadedPeriods.add(periodKey);
  state.archivesLoading = false; render();
}

async function refreshArchives(){
  const filterPeriod = state.archiveFilter.period;
  const periods = filterPeriod
    ? [PERIOD.list(24).find(p => p.key === filterPeriod)].filter(Boolean)
    : PERIOD.list(24).slice(1, 4);
  const filterEmp = state.archiveFilter.name;
  const emps = filterEmp ? [DB.employees.find(e => e.id === filterEmp)].filter(Boolean) : DB.employees;
  state.archivesLoading = true; render();
  for(const period of periods){
    await Promise.allSettled(emps.map(emp => loadSheetFromAirtable(emp, period)));
    _archiveLoadedPeriods.add(period.key);
  }
  state.archivesLoading = false; render();
}

// ================================================================
//  AIRTABLE WRITE — syncFullSheetToAirtable
// ================================================================
async function syncFullSheetToAirtable(eid, pk){
  const emp = DB.employees.find(e => e.id === eid) || currentEmp();
  if(!emp || !emp.airtableId){ console.log('syncFullSheet: pas airtableId pour', eid); return; }
  const sheetKey = pk ? `${eid}_${pk}` : `${emp.id}_${PERIOD.current().key}`;
  if(_syncLocks.has(sheetKey)){ console.log('syncFullSheet: déjà en cours, skip', sheetKey); return; }
  _syncLocks.add(sheetKey);
  const sheet = DB.timesheets[sheetKey];
  if(!sheet){ _syncLocks.delete(sheetKey); return; }
  const periodForLabel = pk
    ? (PERIOD.list(24).find(p => p.key === pk) || PERIOD.current())
    : PERIOD.current();
  const periodLabel = PERIOD.airtableLabel(periodForLabel.start, periodForLabel.end);

  const rowsWithData = sheet.rows.filter(r =>
    r.start || r.end || r.notes || r.adminNote
  );
  dbg(`Sync: ${emp.name} — ${rowsWithData.length} ligne(s)`);
  dbg(`airtableId: ${emp.airtableId||'VIDE'}`);
  if(!emp.airtableId) dbg('⚠️ airtableId manquant!', 'error');
  console.log(`syncFullSheet: ${emp.name} | ${rowsWithData.length} lignes à sync`);

  let idsCached = false;
  syncStart();
  try {
    for(const row of rowsWithData){
      const data = {
        empId:           emp.airtableId,
        date:            row.date,
        start:           row.start     || '',
        end:             row.end       || '',
        lunch:           row.lunch     || '',
        pause:           row.pause     || '',
        notes:           row.notes     || '',
        adminNote:       row.adminNote || '',
        periodeDePaie:   periodLabel,
        total:           (()=>{ const s=parseTime(row.start),e=parseTime(row.end),l=parseTime(row.lunch)||0,p=parseTime(row.pause)||0; return (s!==null&&e!==null)?fmtMins(Math.max(0,e-s-l-p)):''; })(),
        recordId:        row.airtableRecordId || undefined
      };
      SyncQueue.add(data);
      try{
        const resp = await fetch('/api/syncairtable',{
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body: JSON.stringify(data)
        });
        if(resp.ok){
          const json = await resp.json();
          if(json.recordId && row.airtableRecordId !== json.recordId){
            row.airtableRecordId = json.recordId;
            idsCached = true;
          }
          SyncQueue.remove(emp.airtableId, row.date);
          row._syncStatus = 'ok';
          updateRowSyncBadge(eid, row.date, 'ok');
          dbg(`✅ ${row.date} → ${json.recordId||'?'}`, 'ok');
          console.log(`  ✅ ${row.date} (${json.recordId})`);
        } else {
          const errTxt=await resp.text();
          row._syncStatus = 'error';
          updateRowSyncBadge(eid, row.date, 'error');
          dbg(`❌ ${row.date}: HTTP ${resp.status} ${errTxt}`, 'error');
          console.error(`  ❌ ${row.date}:`, resp.status, errTxt);
        }
      }catch(e){
        row._syncStatus = 'error';
        updateRowSyncBadge(eid, row.date, 'error');
        dbg(`❌ ${row.date}: ${e.message} — conservé en queue`, 'error');
        console.error(`  ❌ ${row.date}:`, e.message);
      }
    }
    if(idsCached) save();
    updateSyncBadge();
  } finally {
    _syncLocks.delete(sheetKey);
    syncEnd();
  }
}

async function syncRowToAirtable(eid, pk, idx){
  const emp = DB.employees.find(e => e.id === eid) || currentEmp();
  if(!emp || !emp.airtableId){
    console.log('syncRowToAirtable: pas d\'airtableId pour', eid, '— skip');
    return;
  }

  const sheetKey = pk ? `${eid}_${pk}` : `${emp.id}_${PERIOD.current().key}`;
  const sheet = DB.timesheets[sheetKey];
  if(!sheet) return;

  const row = sheet.rows[idx];
  if(!row) return;

  const period = PERIOD.current();
  const periodLabel = PERIOD.airtableLabel(period.start, period.end);

  const data = {
    empId:          emp.airtableId,
    date:           row.date,
    start:          row.start     || '',
    end:            row.end       || '',
    lunch:          row.lunch     || '',
    notes:          row.notes     || '',
    adminNote:      row.adminNote || '',
    periodeDePaie:  periodLabel
  };

  try {
    const resp = await fetch('/api/syncairtable', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if(resp.ok){
      const result = await resp.json();
      if(result.recordId && row){
        row.airtableRecordId = result.recordId;
        save();
      }
      console.log(`✅ Airtable sync: ${emp.name} / ${row.date} → ${result.recordId}`);
    } else {
      const err = await resp.text();
      console.error(`❌ Airtable sync erreur ${resp.status}:`, err);
    }
  } catch(error){
    console.error('syncRowToAirtable fetch error:', error.message);
  }
}

async function initPeriodAirtable(periodKey){
  const period = PERIOD.list(24).find(p => p.key === periodKey);
  if(!period) return;
  const emps = DB.employees.filter(e => e.airtableId && !e.archived);
  if(emps.length === 0){ toast('Aucun employé avec ID Airtable.', 'error'); return; }

  const dates = [];
  for(let i = 0; i < 14; i++){
    const d = new Date(period.start);
    d.setDate(d.getDate() + i);
    dates.push(d.toISOString().slice(0, 10));
  }

  toast('Initialisation en cours…', 'info', 8000);
  try {
    const resp = await fetch('/api/initperiod', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        employees: emps.map(e => ({ airtableId: e.airtableId, name: e.name })),
        dates
      })
    });
    const result = await resp.json();
    if(resp.ok){
      if(result.records && result.records.length > 0){
        result.records.forEach(({empId, date, recordId}) => {
          const emp = DB.employees.find(e => e.airtableId === empId);
          if(!emp) return;
          const sheet = DB.timesheets[`${emp.id}_${periodKey}`];
          if(!sheet) return;
          const row = sheet.rows.find(r => r.date === date);
          if(row) row.airtableRecordId = recordId;
        });
        save();
      }
      toast(`✅ ${result.created} créé(s), ${result.skipped} existant(s)`, 'success', 6000);
    } else {
      toast(`Erreur: ${result.error}`, 'error');
    }
  } catch(e) {
    toast('Erreur de connexion.', 'error');
  }
}

async function resyncAllToAirtable(periodKey){
  const emps = DB.employees.filter(e => e.airtableId && !e.archived);
  if(emps.length === 0){ toast('Aucun employé avec un ID Airtable.', 'error'); return; }

  _syncLocks.clear();

  const period = PERIOD.list(24).find(p => p.key === periodKey) || PERIOD.current();
  toast(`⬇️ Chargement depuis Airtable (${emps.length} employé(s))…`, 'info', 15000);
  for(const emp of emps){
    await loadSheetFromAirtable(emp, period);
  }

  toast(`⬆️ Envoi vers Airtable (${emps.length} employé(s))…`, 'info', 15000);
  let done = 0;
  for(const emp of emps){
    await syncFullSheetToAirtable(emp.id, periodKey);
    done++;
  }
  save();
  toast(`✅ Re-sync terminé pour ${done} employé(s).`, 'success');
  render();
}

async function syncApprovalToAirtable(empId, periodKey, approved){
  const emp = DB.employees.find(e => e.id === empId);
  if(!emp || !emp.airtableId) return;

  const sheetKey = `${empId}_${periodKey}`;
  const sheet = DB.timesheets[sheetKey];
  if(!sheet) return;

  const periodStart = new Date(periodKey + 'T00:00:00');
  const periodEnd   = new Date(periodStart); periodEnd.setDate(periodEnd.getDate()+13);
  const periodLabel = PERIOD.airtableLabel(periodStart, periodEnd);

  const rowsWithData = sheet.rows.filter(r => r.start || r.end || r.notes || r.adminNote);
  const filteredPromises = rowsWithData.map(row => {
    const data = {
      empId:         emp.airtableId,
      date:          row.date,
      periodeDePaie: periodLabel,
      approved:      approved,
      start: row.start || '',
      end:   row.end   || '',
      lunch: row.lunch || '',
      pause: row.pause || '',
      notes: row.notes || '',
      recordId: row.airtableRecordId || undefined
    };
    return fetch('/api/syncairtable', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    }).then(async resp => {
      if(resp.ok){
        const result = await resp.json();
        if(result.recordId && row) { row.airtableRecordId = result.recordId; }
      }
    }).catch(e => console.error('syncApproval row error:', e.message));
  });

  syncStart();
  await Promise.allSettled(filteredPromises);
  syncEnd();
  console.log(`✅ Approval synced to Airtable: ${emp.name} approved=${approved}`);
}

function clearChangeLog(){
  if(!confirm("Effacer tout l'historique des modifications?")) return;
  DB.changeLog=[];
  save();
  render();
}

function renderChangeLog(){
  const frag = document.createDocumentFragment();
  const log = DB.changeLog || [];

  const toolbar = el('div','mb-4 flex flex-wrap items-center gap-2');
  toolbar.innerHTML = `
    <span class="text-sm text-slate-500">${log.length} modification(s) enregistrée(s)</span>
    <button onclick="clearChangeLog()" class="btn btn-red text-xs ml-auto">🗑 Effacer</button>`;
  frag.appendChild(toolbar);

  if(log.length === 0){
    const empty = el('div','card p-8 text-center text-slate-400');
    empty.innerHTML = '<div class="text-3xl mb-2">📭</div><div>Aucune modification enregistrée.</div>';
    frag.appendChild(empty);
    return frag;
  }

  const fieldLabels = {start:'Début', end:'Fin', lunch:'Dîner', notes:'Notes'};

  const table = el('div','card overflow-x-auto');
  const t = document.createElement('table');
  t.innerHTML = `<thead><tr class="nav-navy">
    <th class="text-left pl-3" style="min-width:140px">Date/heure</th>
    <th class="text-left" style="min-width:160px">Employé</th>
    <th class="text-left" style="min-width:100px">Journée</th>
    <th style="min-width:80px">Champ</th>
    <th style="min-width:80px">Avant</th>
    <th style="min-width:80px">Après</th>
    <th class="text-left" style="min-width:100px">Modifié par</th>
  </tr></thead>`;
  const tbody = document.createElement('tbody');

  log.forEach(entry => {
    const emp = DB.employees.find(e => e.id === entry.empId);
    const empName = emp?.name || entry.empId;
    const d = new Date(entry.ts);
    const dateStr = d.toLocaleDateString('fr-CA',{day:'2-digit',month:'short',year:'numeric'});
    const timeStr = d.toLocaleTimeString('fr-CA',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
    const journee = entry.date ? new Date(entry.date+'T00:00:00').toLocaleDateString('fr-CA',{weekday:'short',day:'2-digit',month:'short'}) : '—';
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="text-left pl-3 text-xs text-slate-500">${dateStr} ${timeStr}</td>
      <td class="text-left text-sm font-medium">${empName}</td>
      <td class="text-left text-xs">${journee}</td>
      <td class="text-xs">${fieldLabels[entry.field]||entry.field}</td>
      <td class="mono text-xs text-slate-400">${entry.old||'—'}</td>
      <td class="mono text-xs font-semibold text-blue-700">${entry.new||'—'}</td>
      <td class="text-left text-xs">${entry.by||'—'}</td>`;
    tbody.appendChild(tr);
  });

  t.appendChild(tbody);
  table.appendChild(t);
  frag.appendChild(table);
  return frag;
}

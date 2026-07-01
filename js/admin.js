// ================================================================
//  ADMIN VIEW
// ================================================================
function renderAdmin(){
  const period=PERIOD.current();
  const wrap=el('div','min-h-screen bg-slate-100');
  const header=el('div','nav-navy text-white px-4 py-3 flex items-center justify-between flex-wrap gap-2');
  header.innerHTML=`
    <div class="flex items-center gap-3">
      <div class="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center font-bold text-sm">A</div>
      <div>
        <div class="font-semibold">Administrateur</div>
        <div class="text-xs text-blue-200">${PERIOD.label(period.start,period.end)}</div>
      </div>
    </div>
    <div class="flex items-center gap-2 flex-wrap justify-end">
      <button onclick="state.showPasswordModal=true;render()" class="btn btn-gray text-xs">🔒 Mot de passe</button>
      <label class="btn btn-blue text-xs cursor-pointer">
        📥 Importer <input type="file" accept=".json" class="hidden" onchange="handleImport(event)">
      </label>
      <button onclick="logout()" class="btn btn-red text-xs">Déconnexion</button>
    </div>`;
  const tabs=el('div','bg-white border-b flex gap-0 px-2 overflow-x-auto');
  ['overview','staff','templates','archives','history'].forEach(tab=>{
    const labels={overview:"Vue d'ensemble",staff:'Employés',templates:'Modèles',archives:'Archives',history:'📋 Historique'};
    const btn=el('button',`px-4 py-3 text-sm whitespace-nowrap ${state.adminTab===tab?'tab-active':'text-slate-500 hover:text-slate-700'}`);
    btn.textContent=labels[tab];
    btn.onclick=()=>{state.adminTab=tab;render();};
    tabs.appendChild(btn);
  });
  const content=el('div','max-w-[1600px] mx-auto px-2 py-4');
  if     (state.adminTab==='overview')  content.appendChild(renderOverview(period));
  else if(state.adminTab==='staff')     content.appendChild(renderStaff());
  else if(state.adminTab==='templates') content.appendChild(renderTemplates());
  else if(state.adminTab==='archives')  content.appendChild(renderArchives());
  else if(state.adminTab==='history')   content.appendChild(renderChangeLog());
  wrap.appendChild(header); wrap.appendChild(tabs); wrap.appendChild(content);
  return wrap;
}

function renderOverview(period){
  const frag=document.createDocumentFragment();

  const prevPeriods = PERIOD.list(12).slice(1);
  const unapprovedPrev = [];
  prevPeriods.forEach(p=>{
    sortedEmployees().forEach(emp=>{
      const sheet = DB.timesheets[`${emp.id}_${p.key}`];
      if(sheet && !sheet.approved && calcSheetTotal(sheet) > 0){
        unapprovedPrev.push({emp, period:p, sheet});
        if(emp.airtableId && !sheet._recheckedApproval){
          sheet._recheckedApproval = true;
          loadSheetFromAirtable(emp, p);
        }
      }
    });
  });
  if(unapprovedPrev.length > 0){
    const warn=el('div','mb-4 bg-red-50 border border-red-200 rounded-xl p-4');
    const byPeriod={};
    unapprovedPrev.forEach(({emp,period:p})=>{
      const lbl=PERIOD.label(p.start,p.end);
      if(!byPeriod[lbl]) byPeriod[lbl]=[];
      byPeriod[lbl].push(emp.name);
    });
    let html='<div class="flex items-start gap-2 mb-2">'
      +'<span class="text-lg">&#x26A0;</span>'
      +'<div><div class="font-semibold text-red-700 text-sm">P&#xe9;riodes pr&#xe9;c&#xe9;dentes non approuv&#xe9;es</div>'
      +'<div class="text-xs text-red-600 mt-0.5">Ces feuilles ont des heures mais ne sont pas approuv&#xe9;es.</div></div></div>';
    Object.entries(byPeriod).forEach(([lbl,names])=>{
      html+=`<div class="mt-2 flex items-start justify-between gap-2">`
        +`<div><div class="text-xs font-semibold text-red-700">${lbl}</div>`
        +`<div class="text-xs text-red-500">${names.join(', ')}</div></div>`
        +`<button onclick="state.adminTab='archives';state.archiveFilter.period='${Object.values(byPeriod)[0]?PERIOD.list(12).find(p=>PERIOD.label(p.start,p.end)===lbl)?.key:''}';render()" `
        +`class="btn btn-red text-xs flex-shrink-0">Voir</button>`
        +`</div>`;
    });
    warn.innerHTML=html;
    frag.appendChild(warn);
  }

  const sheets=sortedEmployees().map(emp=>({emp,sheet:DB.timesheets[`${emp.id}_${period.key}`]}));

  // ── Panneau Exceptions : journées incomplètes (début sans fin ou inversement)
  // et journées dépassant 10h, détectées sur la période courante.
  const todayMidnight=new Date(); todayMidnight.setHours(0,0,0,0);
  const exceptions=[];
  sheets.forEach(({emp,sheet})=>{
    if(!sheet) return;
    sheet.rows.forEach(row=>{
      const rowDate=new Date(row.date+'T00:00:00');
      const hasStart=!!row.start, hasEnd=!!row.end;
      if(rowDate<todayMidnight && ((hasStart&&!hasEnd)||(!hasStart&&hasEnd))){
        exceptions.push({emp, label:`${dayLabel(rowDate)} — ${hasStart?'début sans fin':'fin sans début'}`, kind:'incomplete'});
      }
      const w=calcWorked(parseTime(row.start),parseTime(row.end),parseTime(row.lunch),parseTime(row.pause));
      if(w!==null && w>600){
        exceptions.push({emp, label:`${dayLabel(rowDate)} — ${fmtMins(w)} (plus de 10h)`, kind:'long'});
      }
    });
  });
  if(exceptions.length>0){
    const excByEmp={};
    exceptions.forEach(x=>{ (excByEmp[x.emp.name]=excByEmp[x.emp.name]||[]).push(x.label); });
    const exc=el('div','mb-4 bg-amber-50 border border-amber-200 rounded-xl p-4');
    let exHtml='<div class="flex items-start gap-2 mb-2">'
      +'<span class="text-lg">🔍</span>'
      +'<div><div class="font-semibold text-amber-800 text-sm">Exceptions à vérifier (période courante)</div>'
      +'<div class="text-xs text-amber-700 mt-0.5">Journées avec une heure manquante ou un total supérieur à 10h.</div></div></div>';
    Object.entries(excByEmp).forEach(([name,labels])=>{
      exHtml+=`<div class="mt-1 text-xs text-amber-800"><span class="font-semibold">${name}:</span> ${labels.join(' · ')}</div>`;
    });
    exc.innerHTML=exHtml;
    frag.appendChild(exc);
  }

  const approvedCount=sheets.filter(s=>s.sheet?.approved).length;
  const total=sheets.length;
  const pct=total>0?Math.round(approvedCount/total*100):0;
  const totalApprovedMins=sheets.filter(s=>s.sheet?.approved).reduce((sum,s)=>sum+(s.sheet.totalMinutes||0),0);
  const totalPendingMins=sheets.filter(s=>!s.sheet?.approved).reduce((sum,s)=>sum+calcSheetTotal(s.sheet),0);

  const metrics=el('div','');
  metrics.innerHTML=`
    <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
      <div class="card px-5 py-4">
        <div class="field-label mb-1">Progression</div>
        <div class="flex items-center gap-2 mb-2">
          <span class="text-2xl font-bold text-slate-800">${approvedCount}/${total}</span>
          <span class="text-slate-400 text-sm">approuvé(s)</span>
        </div>
        <div class="w-full bg-slate-200 rounded-full h-3">
          <div class="progress-bar-inner bg-green-500 h-3 rounded-full" style="width:${pct}%"></div>
        </div>
        <div class="text-xs text-slate-400 mt-1">${pct}% complété</div>
      </div>
      <div class="card px-5 py-4">
        <div class="field-label mb-1">Heures approuvées</div>
        <div class="text-2xl font-bold text-green-700 mono">${fmtMins(totalApprovedMins)}</div>
      </div>
      <div class="card px-5 py-4">
        <div class="field-label mb-1">Heures en attente</div>
        <div class="text-2xl font-bold text-orange-600 mono">${fmtMins(totalPendingMins)}</div>
      </div>
    </div>`;
  frag.appendChild(metrics);

  const actions=el('div','mb-4 flex flex-wrap gap-2');
  actions.innerHTML=`
    <button onclick="approveAll('${period.key}')" class="btn btn-green">✓✓ Approuver tous</button>
    <button onclick="remindAll()" class="btn btn-orange">📣 Rappeler tous</button>
    <button onclick="resyncAllToAirtable('${period.key}')" class="btn btn-navy">🔄 Re-sync Airtable</button>
    <button onclick="initPeriodAirtable('${period.key}')" class="btn btn-navy" style="background:#7c3aed">⚡ Initialiser période</button>`;
  frag.appendChild(actions);

  sheets.forEach(({emp,sheet})=>{
    const tot=calcSheetTotal(sheet);
    const isZero=tot===0;
    const bc=isZero?(emp.partTime?'border-l-4 border-purple-400':'border-l-4 border-red-400'):'border-l-4 border-transparent';
    const card=el('div',`card mb-3 overflow-hidden ${bc}`);
    const hpCalc = calcHolidayPay(emp.id, period.key);
    const hpEff  = getHolidayPay(emp.id, period.key);
    const hpIsOverride = DB.holidayPay[emp.id]?.[period.key] !== undefined;
    const hpSources = getHolidayPaySources(emp.id, period.key);
    const ch=el('div','px-4 py-3 flex flex-wrap items-center justify-between gap-2 bg-slate-50 border-b');
    ch.innerHTML=`
      <div class="flex items-center gap-3">
        <div class="w-8 h-8 rounded-full nav-navy flex items-center justify-center text-white font-bold text-xs flex-shrink-0">
          ${emp.name.split(' ').map(n=>n[0]).join('').toUpperCase().slice(0,2)}
        </div>
        <div>
          <div class="font-semibold text-slate-800 text-sm">${emp.name}</div>
          <div class="text-xs text-slate-400">${emp.partTime?'Temps partiel':'Temps plein'} · 📧 ${emp.email||'—'} · 📱 ${emp.phone||'—'}</div>
        </div>
      </div>
      <div class="flex items-center gap-2 flex-wrap">
        <span class="mono text-sm font-semibold ${isZero?(emp.partTime?'text-purple-600':'text-red-600'):'text-slate-700'}" id="gt-${emp.id}">${fmtMins(tot)}</span>
        <button onclick="refreshEmpFromAdmin('${emp.id}')" class="btn btn-light text-xs" style="padding:3px 6px" title="Rafraîchir depuis Airtable">🔄</button>
        <div class="flex items-center gap-1 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1 relative group">
          <span class="text-xs text-amber-700 font-semibold whitespace-nowrap">🎉 Férié</span>
          <button onclick="explainHolidayPay()" class="text-amber-500 hover:text-amber-700 text-xs leading-none" title="D'où vient ce calcul?">ℹ️</button>
          <input type="text" id="hp-inp-${emp.id}-${period.key}"
            class="mono text-xs font-bold text-amber-800 bg-transparent border-none outline-none w-14 text-center"
            style="border-bottom:1px dashed #d97706;cursor:text"
            value="${fmtMins(hpEff)}"
            onchange="setHolidayPay('${emp.id}','${period.key}',this.value)"
            onblur="setHolidayPay('${emp.id}','${period.key}',this.value)"/>
          ${hpIsOverride?`<button onclick="delete DB.holidayPay['${emp.id}']['${period.key}'];save();render()" class="text-amber-400 hover:text-amber-600 text-xs" title="Réinitialiser (auto: ${fmtMins(hpCalc)})">↺</button>`:''}
          <div class="absolute top-full left-0 mt-1 z-50 hidden group-hover:block bg-slate-800 text-white text-xs rounded-lg px-3 py-2 shadow-xl whitespace-nowrap" style="min-width:280px">
            ${hpSources.map(s=>`<div class="flex justify-between gap-4"><span class="text-slate-300">${s.label}</span><span class="mono font-bold">${fmtMins(s.mins)}</span></div>`).join('')}
            <div class="border-t border-slate-600 mt-1 pt-1 flex justify-between gap-4">
              <span class="text-amber-300">Somme × 5% → arrondi 15min</span>
              <span class="mono font-bold text-amber-300">${fmtMins(hpCalc)}</span>
            </div>
            ${hpIsOverride?`<div class="text-amber-400 text-xs mt-1">✏ Valeur modifiée manuellement: ${fmtMins(hpEff)}</div>`:''}
          </div>
        </div>
        ${sheet?.approved
          ?`<span class="badge-approved">✓ Approuvé</span><button onclick="unlockSheet('${emp.id}','${period.key}')" class="btn btn-gray text-xs">🔓 Déverrouiller</button>`
          :`<span class="badge-pending">En attente</span><button onclick="approveSheet('${emp.id}','${period.key}')" class="btn btn-green text-xs">✓ Approuver</button>`}
        <button onclick="sendReminder('${emp.id}')" class="btn btn-blue text-xs">⏰ Rappel</button>
        ${isZero?`<span class="text-xs ${emp.partTime?'text-purple-600':'text-red-600'} font-semibold">⚠ 0h</span>`:''}
        ${(()=>{
          if(!emp.airtableId) return '<span class="text-xs text-red-500 font-semibold" title="Aucun ID Airtable configuré">❌ Non lié</span>';
          const firstRow = sheet?.rows?.[0];
          if(firstRow?.airtableRecordId) return '<span class="text-xs text-green-600" title="Records Airtable initialisés">✅ Airtable OK</span>';
          return '<span class="text-xs text-amber-500" title="Records Airtable non encore créés — cliquer Initialiser période">⚠️ À initialiser</span>';
        })()}
      </div>`;
    card.appendChild(ch);
    const s2=getOrCreateSheet(DB,emp.id,period.key,period.start); save();
    if(!s2._synced){ s2._synced=true; loadSheetFromAirtable(emp); }
    if(!s2._hpChecked){ s2._hpChecked=true; ensureHolidaySourcesLoaded(emp.id, period.key); }
    const sw=el('div','overflow-x-auto p-2');
    const inner=el('div','card overflow-x-auto');
    inner.appendChild(buildDesktopTable(s2,true,emp.id,period));
    sw.appendChild(inner); card.appendChild(sw);
    frag.appendChild(card);
  });
  return frag;
}

async function refreshEmpFromAdmin(empId){
  const emp=DB.employees.find(e=>e.id===empId); if(!emp) return;
  toast(`Rafraîchissement de ${emp.name}…`,'info',2000);
  await loadSheetFromAirtable(emp);
  toast(`✅ ${emp.name} à jour`,'success',2500);
}

async function approveSheet(empId,periodKey){
  const key=`${empId}_${periodKey}`;
  if(!DB.timesheets[key]){const p=PERIOD.current();getOrCreateSheet(DB,empId,periodKey,p.start);}
  DB.timesheets[key].approved=true; DB.timesheets[key].approvedAt=new Date().toISOString();
  DB.timesheets[key].totalMinutes=calcSheetTotal(DB.timesheets[key]);
  save(); autoBackup(DB,'approve'); render();
  const empName = DB.employees.find(e=>e.id===empId)?.name||'Employé';
  toast(`${empName} — feuille approuvée ✓`, 'success');
  syncApprovalToAirtable(empId, periodKey, true);
}

async function approveAll(periodKey){
  const period=PERIOD.current();
  const toSync=[];
  DB.employees.forEach(emp=>{
    const key=`${emp.id}_${periodKey}`;
    if(!DB.timesheets[key]) getOrCreateSheet(DB,emp.id,periodKey,period.start);
    if(!DB.timesheets[key].approved){
      DB.timesheets[key].approved=true; DB.timesheets[key].approvedAt=new Date().toISOString();
      DB.timesheets[key].totalMinutes=calcSheetTotal(DB.timesheets[key]);
      toSync.push(emp.id);
    }
  });
  save(); autoBackup(DB,'approve-all'); render();
  if(toSync.length > 0) toast(`${toSync.length} feuille(s) approuvée(s) ✓`, 'success');
  for(const empId of toSync){
    await syncApprovalToAirtable(empId, periodKey, true);
  }
}

function unlockSheet(empId,periodKey){
  const key=`${empId}_${periodKey}`;
  if(DB.timesheets[key]){DB.timesheets[key].approved=false;DB.timesheets[key].approvedAt=null;}
  save(); render();
  const empName = DB.employees.find(e=>e.id===empId)?.name||'Employé';
  toast(`${empName} — feuille déverrouillée`, 'info');
  syncApprovalToAirtable(empId, periodKey, false);
}

async function sendReminder(empId) {
  const emp = DB.employees.find(e => e.id === empId);
  if (!emp || !emp.airtableId) {
    toast('Erreur : ID Airtable manquant pour cet employé.', 'error');
    return;
  }
  const msg = DB.reminderTemplate.replace(/\[Prénom\]/g, firstName(emp.name));
  try {
    const resp = await fetch('/api/updateemployee', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        airtableId: emp.airtableId,
        sendReminder: true,
        phone: emp.phone || '',
        message: msg
      })
    });
    if (resp.ok) {
      const json = await resp.json();
      const smsOk = json.sms === 'sent';
      toast(`Rappel envoyé à ${emp.name}${smsOk ? ' 📱' : ' (sans SMS)'}`, smsOk ? 'success' : 'info');
    } else {
      toast("Erreur lors de l'envoi du rappel.", 'error');
    }
  } catch(e) {
    toast("Erreur de connexion.", 'error');
  }
}

async function remindAll(){
  const toRemind = DB.employees.filter(e => e.airtableId && !e.archived);
  if(toRemind.length === 0){ toast('Aucun employé avec un ID Airtable.', 'error'); return; }
  let sent = 0, smsSent = 0, errors = 0;
  for(const emp of toRemind){
    const msg = DB.reminderTemplate.replace(/\[Prénom\]/g, firstName(emp.name));
    try{
      const resp = await fetch('/api/updateemployee', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          airtableId: emp.airtableId,
          sendReminder: true,
          phone: emp.phone || '',
          message: msg
        })
      });
      if(resp.ok){
        sent++;
        const json = await resp.json();
        if(json.sms === 'sent') smsSent++;
      } else errors++;
    } catch(e){ errors++; }
  }
  if(errors > 0) toast(`Rappels: ${sent} OK, ${smsSent} SMS, ${errors} erreurs`, 'error');
  else toast(`${sent} rappel(s) envoyé(s), ${smsSent} SMS 📱`, 'success');
  render();
}

function renderStaff(){
  const frag=document.createDocumentFragment();
  const hdr=el('div','flex items-center justify-between mb-4');
  hdr.innerHTML=`
    <h2 class="text-lg font-bold text-slate-800">Gestion des employés</h2>
    <button onclick="state.showAddEmpModal=true;render()" class="btn btn-navy">+ Ajouter</button>`;
  frag.appendChild(hdr);
  sortedEmployees().forEach(emp=>{
    const modeLabel=emp.inputMode==='text'?'⌨️ Texte':'🕐 Horloge';
    const card=el('div','card mb-3 p-4');
    card.innerHTML=`
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div class="flex items-center gap-3">
          <div class="w-11 h-11 rounded-full nav-navy flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
            ${emp.name.split(' ').map(n=>n[0]).join('').toUpperCase().slice(0,2)}
          </div>
          <div>
            <div class="font-semibold text-slate-800">${emp.name}</div>
            <div class="text-xs text-slate-500 mt-0.5">📧 ${emp.email||'—'}</div>
            <div class="text-xs text-slate-500">📱 ${emp.phone||'—'}</div>
            ${emp.airtableId?`<div class="text-xs text-green-600 mt-0.5">✓ Lié Airtable</div>`:
              '<div class="text-xs text-red-400 mt-0.5">⚠ Pas d\'ID Airtable</div>'}
            <div class="mt-1">${emp.partTime?'<span class="badge-pending text-xs">Temps partiel</span>':'<span class="badge-approved text-xs">Temps plein</span>'}</div>
          </div>
        </div>
        <div class="flex flex-wrap gap-2 items-center">
          <span class="text-xs text-slate-400 mono">${emp.reminderCount} rappel(s)</span>
          ${emp.password?'<span class="text-xs text-green-600 font-medium">🔒 Mdp actif</span>':'<span class="text-xs text-slate-400">Pas de mdp</span>'}
          ${emp.autoFill?'<span class="text-xs text-blue-600 font-medium">🔄 AutoFill</span>':''}
          <span class="text-xs text-slate-500">${modeLabel}</span>
          <button onclick="state.showEditEmpModal='${emp.id}';render()" class="btn btn-light text-xs">✏ Modifier</button>
          <button onclick="resetReminderCount('${emp.id}')" class="btn btn-gray text-xs">↺ Rappels</button>
          ${emp.password?`<button onclick="state.showEmpPwResetConfirm='${emp.id}';render()" class="btn btn-orange text-xs">🔑 Réinit. mdp</button>`:''}
          <button onclick="state.showRemoveConfirm='${emp.id}';render()" class="btn btn-red text-xs">Supprimer</button>
        </div>
      </div>`;
    frag.appendChild(card);
  });

  const _arch = DB.employees.filter(e=>e.archived).sort((a,b)=>a.name.localeCompare(b.name,'fr',{sensitivity:'base'}));
  if(_arch.length > 0){
    const _h=el('div','mt-6 mb-2 flex items-center gap-2');
    _h.innerHTML='<span class="text-sm font-semibold text-slate-400">&#x1F4E6; Archives (' + _arch.length + ')</span>';
    frag.appendChild(_h);
    _arch.forEach(emp=>{
      const _ac=el('div','card mb-2 p-3 opacity-60');
      const _initials=emp.name.split(' ').map(n=>n[0]).join('').toUpperCase().slice(0,2);
      _ac.innerHTML='<div class="flex items-center justify-between gap-2">'
        +'<div class="flex items-center gap-2">'
        +'<div class="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-slate-500 font-bold text-xs">'+ _initials +'</div>'
        +'<div><div class="font-medium text-slate-500 text-sm">'+ emp.name +'</div>'
        +'<div class="text-xs text-slate-400">'+ (emp.partTime?'Temps partiel':'Temps plein') +'</div></div>'
        +'</div><div class="flex gap-2">'
        +'<button onclick="unarchiveEmployee(\''+emp.id+'\')" class="btn btn-light text-xs">&#x21A9; R&#xe9;activer</button>'
        +'<button onclick="state.showRemoveConfirm=\''+emp.id+'\';render()" class="btn btn-red text-xs">Supprimer</button>'
        +'</div></div>';
      frag.appendChild(_ac);
    });
  }

  return frag;
}

function resetReminderCount(empId){
  const emp=DB.employees.find(e=>e.id===empId);
  if(emp){emp.reminderCount=0;save();render();}
}

function renderTemplates(){
  const frag=document.createDocumentFragment();
  const card=el('div','card p-5 max-w-xl');
  card.innerHTML=`
    <h2 class="text-lg font-bold text-slate-800 mb-2">Modèle de rappel</h2>
    <p class="text-xs text-slate-500 mb-3">Utilisez <code>[Prénom]</code> pour insérer le prénom de l'employé.</p>
    <textarea id="tpl-input" rows="5" class="w-full" style="resize:vertical">${DB.reminderTemplate}</textarea>
    <div class="mt-3 flex gap-2">
      <button onclick="saveTemplate()" class="btn btn-navy">💾 Sauvegarder</button>
      <button onclick="previewTemplate()" class="btn btn-blue">👁 Aperçu</button>
    </div>
    <div id="tpl-preview" class="hidden mt-3 bg-slate-50 rounded-lg p-3 text-sm text-slate-700 italic border"></div>`;
  frag.appendChild(card);
  return frag;
}

function saveTemplate(){ DB.reminderTemplate=document.getElementById('tpl-input').value; save(); alert('Modèle sauvegardé!'); }
function previewTemplate(){
  const v=document.getElementById('tpl-input').value;
  const prev=document.getElementById('tpl-preview');
  prev.textContent=v.replace(/\[Prénom\]/g,firstName(DB.employees[0]?.name||'Employé'));
  prev.classList.remove('hidden');
}

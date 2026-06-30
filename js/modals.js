// ================================================================
//  IMPORT / MERGE
// ================================================================
function handleImport(event){
  const file=event.target.files[0]; if(!file) return;
  const reader=new FileReader();
  reader.onload=(e)=>{
    try{
      let inc=JSON.parse(e.target.result);
      if(inc.db) inc=inc.db;
      autoBackup(DB,'pre-merge');
      const conflicts=[];
      Object.keys(inc.timesheets||{}).forEach(k=>{
        if(DB.timesheets[k]&&JSON.stringify(DB.timesheets[k])!==JSON.stringify(inc.timesheets[k]))
          conflicts.push({type:'timesheet',key:k,current:DB.timesheets[k],incoming:inc.timesheets[k]});
      });
      (inc.employees||[]).forEach(e=>{
        const cur=DB.employees.find(x=>x.id===e.id);
        if(cur&&JSON.stringify(cur)!==JSON.stringify(e))
          conflicts.push({type:'employee',key:e.id,current:cur,incoming:e});
      });
      if(conflicts.length===0){mergeDB(inc);alert('Import réussi!');render();}
      else{
        state.mergePending=inc; state.mergeConflicts=conflicts;
        state.conflictResolutions={}; conflicts.forEach(c=>state.conflictResolutions[c.key]='keep');
        state.bulkOverwrite=false; state.showMergeModal=true; render();
      }
    }catch(err){alert('Erreur JSON: '+err.message);}
  };
  reader.readAsText(file); event.target.value='';
}

function mergeDB(inc){
  Object.keys(inc.timesheets||{}).forEach(k=>{if(!DB.timesheets[k])DB.timesheets[k]=inc.timesheets[k];});
  (inc.employees||[]).forEach(e=>{if(!DB.employees.find(x=>x.id===e.id))DB.employees.push(e);});
  if(inc.reminderTemplate) DB.reminderTemplate=inc.reminderTemplate;
  save();
}

function applyMerge(){
  const inc=state.mergePending; if(!inc) return;
  state.mergeConflicts.forEach(c=>{
    const res=state.bulkOverwrite?'overwrite':state.conflictResolutions[c.key];
    if(res==='overwrite'){
      if(c.type==='timesheet') DB.timesheets[c.key]=c.incoming;
      else{const idx=DB.employees.findIndex(e=>e.id===c.key);if(idx>=0)DB.employees[idx]=c.incoming;}
    }
  });
  mergeDB(inc); state.showMergeModal=false; state.mergePending=null; state.mergeConflicts=null;
  alert('Fusion terminée.'); render();
}

// ================================================================
//  MODALS
// ================================================================
function renderMergeModal(){
  const bd=el('div','fixed inset-0 modal-backdrop z-50 flex items-center justify-center p-4');
  const m=el('div','card p-6 w-full max-w-2xl max-h-screen overflow-y-auto slide-in');
  m.innerHTML=`
    <h2 class="text-lg font-bold mb-1">⚠ Conflits détectés</h2>
    <p class="text-sm text-slate-500 mb-4">Sauvegarde pré-fusion téléchargée automatiquement.</p>
    <label class="flex items-center gap-2 text-sm mb-4 cursor-pointer">
      <input type="checkbox" ${state.bulkOverwrite?'checked':''} onchange="state.bulkOverwrite=this.checked;render()"> Tout écraser
    </label>
    <div class="space-y-3 mb-5">
      ${state.mergeConflicts.map(c=>`
        <div class="border rounded-lg p-3 ${state.bulkOverwrite?'opacity-40':''}">
          <div class="text-xs font-semibold text-slate-500 uppercase mb-1">${c.type}: ${c.key}</div>
          <div class="flex gap-3 text-xs">
            <div class="flex-1 bg-blue-50 rounded p-2"><div class="font-semibold text-blue-700 mb-1">Actuel</div>
              <pre style="font-size:10px;max-height:50px;overflow:hidden">${JSON.stringify(c.current).slice(0,150)}</pre></div>
            <div class="flex-1 bg-orange-50 rounded p-2"><div class="font-semibold text-orange-700 mb-1">Importé</div>
              <pre style="font-size:10px;max-height:50px;overflow:hidden">${JSON.stringify(c.incoming).slice(0,150)}</pre></div>
          </div>
          <div class="flex gap-3 mt-2">
            <label class="flex items-center gap-1 text-xs cursor-pointer">
              <input type="radio" name="res_${c.key}" value="keep" ${state.conflictResolutions[c.key]==='keep'?'checked':''} onchange="state.conflictResolutions['${c.key}']='keep'"> Garder
            </label>
            <label class="flex items-center gap-1 text-xs cursor-pointer">
              <input type="radio" name="res_${c.key}" value="overwrite" ${state.conflictResolutions[c.key]==='overwrite'?'checked':''} onchange="state.conflictResolutions['${c.key}']='overwrite'"> Écraser
            </label>
          </div>
        </div>`).join('')}
    </div>
    <div class="flex justify-end gap-2">
      <button onclick="state.showMergeModal=false;render()" class="btn btn-gray">Annuler</button>
      <button onclick="applyMerge()" class="btn btn-navy">Appliquer</button>
    </div>`;
  bd.appendChild(m); return bd;
}

// Ouvre une modale plein écran pour éditer un champ texte d'une journée (Notes ou Note admin) —
// pratique sur mobile/desktop, le champ inline étant trop petit pour relire ou taper un texte plus long.
function openNotesModal(empId, periodKey, rowIdx, currentValue, dayLabelText, field, rowDateOverride){
  field = field || 'notes';
  const existing = document.getElementById('notes-modal-backdrop');
  if(existing) existing.remove();
  const isAdminNote = field === 'adminNote';
  const bd=el('div','fixed inset-0 modal-backdrop z-50 flex items-center justify-center p-4');
  bd.id='notes-modal-backdrop';
  const m=el('div','card p-5 w-full max-w-lg slide-in');
  m.innerHTML=`
    <h2 class="text-lg font-bold mb-1">${isAdminNote?'🔒 Note admin':'📝 Notes'}</h2>
    <p class="text-sm text-slate-500 mb-3">${dayLabelText||''}${isAdminNote?" — visible seulement par l'admin":''}</p>
    <textarea id="notes-modal-textarea" rows="8" class="w-full" style="resize:vertical;font-size:16px;${isAdminNote?'background:#fef9c3':''}">${(currentValue||'').replace(/</g,'&lt;')}</textarea>
    <div class="flex justify-end gap-2 mt-4">
      <button onclick="document.getElementById('notes-modal-backdrop').remove()" class="btn btn-gray">Annuler</button>
      <button onclick="saveNotesModal('${empId}','${periodKey}',${rowIdx===null||rowIdx===undefined?'null':rowIdx},'${field}'${rowDateOverride?`,'${rowDateOverride}'`:''})" class="btn btn-navy">Enregistrer</button>
    </div>`;
  bd.appendChild(m);
  document.body.appendChild(bd);
  setTimeout(()=>document.getElementById('notes-modal-textarea')?.focus(), 50);
}

function saveNotesModal(empId, periodKey, rowIdx, field, rowDateOverride){
  field = field || 'notes';
  const val = document.getElementById('notes-modal-textarea').value;
  if(rowDateOverride){
    // Provient des Archives — édition par date plutôt que par index
    archiveEditField(empId, periodKey, rowDateOverride, field, val);
  } else if(field === 'adminNote'){
    saveAdminNote(empId, periodKey, rowIdx, val);
  } else {
    liveCalc(empId, periodKey, rowIdx, 'notes', val);
  }
  document.getElementById('notes-modal-backdrop')?.remove();
  render();
}

function renderPasswordModal(){
  const bd=el('div','fixed inset-0 modal-backdrop z-50 flex items-center justify-center p-4');
  const m=el('div','card p-6 w-full max-w-sm slide-in');
  m.innerHTML=`
    <h2 class="text-lg font-bold mb-4">🔒 Mot de passe admin</h2>
    <div class="space-y-3">
      <div><label class="field-label block mb-1">Actuel</label><input type="password" id="pw-current" class="w-full"></div>
      <div><label class="field-label block mb-1">Nouveau</label><input type="password" id="pw-new" class="w-full"></div>
      <div><label class="field-label block mb-1">Confirmer</label><input type="password" id="pw-confirm" class="w-full"></div>
      <div id="pw-err" class="text-red-500 text-xs hidden"></div>
    </div>
    <div class="flex justify-end gap-2 mt-4">
      <button onclick="state.showPasswordModal=false;render()" class="btn btn-gray">Annuler</button>
      <button onclick="changeAdminPassword()" class="btn btn-navy">Changer</button>
    </div>`;
  bd.appendChild(m); return bd;
}

function changeAdminPassword(){
  const cur=document.getElementById('pw-current').value;
  const nw=document.getElementById('pw-new').value;
  const cf=document.getElementById('pw-confirm').value;
  const err=document.getElementById('pw-err');
  if(cur!==DB.adminPassword){err.textContent='Mot de passe actuel incorrect.';err.classList.remove('hidden');return;}
  if(nw.length<4){err.textContent='Min. 4 caractères.';err.classList.remove('hidden');return;}
  if(nw!==cf){err.textContent='Ne correspond pas.';err.classList.remove('hidden');return;}
  DB.adminPassword=nw; save(); state.showPasswordModal=false; alert('Changé!'); render();
}

function renderAddEmpModal(){
  const bd=el('div','fixed inset-0 modal-backdrop z-50 flex items-center justify-center p-4');
  const m=el('div','card p-6 w-full max-w-sm slide-in');
  const f=state.addEmpForm;
  m.innerHTML=`
    <h2 class="text-lg font-bold mb-4">+ Ajouter un employé</h2>
    <div class="space-y-3">
      <div><label class="field-label block mb-1">Nom complet</label>
        <input type="text" id="ae-name" class="w-full" value="${f.name}"></div>
      <div><label class="field-label block mb-1">Courriel</label>
        <input type="email" id="ae-email" class="w-full" value="${f.email||''}"></div>
      <div><label class="field-label block mb-1">Téléphone</label>
        <input type="tel" id="ae-phone" class="w-full" value="${f.phone||''}"></div>
      <div><label class="field-label block mb-1">ID Airtable (optionnel)</label>
        <input type="text" id="ae-atid" class="w-full font-mono text-xs" placeholder="recXXXXXXXXXXXXXX" value=""></div>
      <label class="flex items-center gap-2 text-sm cursor-pointer">
        <input type="checkbox" id="ae-pt" ${f.partTime?'checked':''}> Temps partiel
      </label>
    </div>
    <div class="flex justify-end gap-2 mt-4">
      <button onclick="state.showAddEmpModal=false;render()" class="btn btn-gray">Annuler</button>
      <button onclick="addEmployee()" class="btn btn-navy">Ajouter</button>
    </div>`;
  bd.appendChild(m); return bd;
}

function addEmployee(){
  const name=document.getElementById('ae-name').value.trim();
  const email=document.getElementById('ae-email').value.trim();
  const phone=document.getElementById('ae-phone').value.trim();
  const airtableId=document.getElementById('ae-atid').value.trim();
  const partTime=document.getElementById('ae-pt').checked;
  if(!name){toast('Le nom est requis.', 'error');return;}
  DB.employees.push({
    id:'emp'+Date.now(), name, email, phone, partTime,
    reminderCount:0, password:null, autoFill:false, inputMode:'clock',
    airtableId
  });
  save(); state.showAddEmpModal=false; state.addEmpForm={name:'',email:'',phone:'',partTime:false}; render();
  if(airtableId) initPeriodAirtable(PERIOD.current().key);
}

function renderEditEmpModal(){
  const empId=state.showEditEmpModal;
  const emp=DB.employees.find(e=>e.id===empId);
  if(!emp) return el('div','');
  const bd=el('div','fixed inset-0 modal-backdrop z-50 flex items-center justify-center p-4');
  const m=el('div','card p-6 w-full max-w-sm slide-in overflow-y-auto max-h-screen');
  const mode=emp.inputMode||'clock';
  m.innerHTML=`
    <h2 class="text-lg font-bold mb-4">✏ Modifier l'employé</h2>
    <div class="space-y-3">
      <div><label class="field-label block mb-1">Nom complet</label>
        <input type="text" id="ee-name" class="w-full" value="${emp.name}"></div>
      <div><label class="field-label block mb-1">Courriel</label>
        <input type="email" id="ee-email" class="w-full" value="${emp.email||''}"></div>
      <div><label class="field-label block mb-1">Téléphone</label>
        <input type="tel" id="ee-phone" class="w-full" value="${emp.phone||''}"></div>
      <div><label class="field-label block mb-1">ID Airtable</label>
        <input type="text" id="ee-atid" class="w-full font-mono text-xs" placeholder="recXXXXXXXXXXXXXX" value="${emp.airtableId||''}"></div>
      <label class="flex items-center gap-2 text-sm cursor-pointer">
        <input type="checkbox" id="ee-pt" ${emp.partTime?'checked':''}> Temps partiel
      </label>
      <div><label class="field-label block mb-1">Dîner par défaut (ex: 0.5 ou 1)</label>
        <input type="text" id="ee-lunch" class="w-full" placeholder="0.5" value="${emp.defaultLunch||''}"></div>
      <div class="border-t pt-3">
        <label class="flex items-start gap-2 text-sm cursor-pointer">
          <input type="checkbox" id="ee-autofill" ${emp.autoFill?'checked':''} class="mt-0.5 flex-shrink-0">
          <div>
            <div class="font-medium text-slate-700">🔄 Remplissage automatique</div>
            <div class="text-xs text-slate-400 mt-0.5">Affiche un bouton pour copier les heures de la veille.</div>
          </div>
        </label>
      </div>
      <div class="border-t pt-3">
        <div class="text-sm font-medium text-slate-700 mb-2">📱 Mode de saisie mobile par défaut</div>
        <div class="flex gap-2">
          <label class="flex items-center gap-2 text-sm cursor-pointer border rounded-lg px-3 py-2 flex-1 ${mode==='clock'?'border-blue-400 bg-blue-50':'border-slate-200'}">
            <input type="radio" name="ee-inputmode" value="clock" ${mode==='clock'?'checked':''}> 🕐 Horloge
          </label>
          <label class="flex items-center gap-2 text-sm cursor-pointer border rounded-lg px-3 py-2 flex-1 ${mode==='text'?'border-blue-400 bg-blue-50':'border-slate-200'}">
            <input type="radio" name="ee-inputmode" value="text" ${mode==='text'?'checked':''}> ⌨️ Texte
          </label>
        </div>
      </div>
    </div>
    <div class="border-t pt-3">
        <label class="field-label block mb-1">Notes administrateur</label>
        <textarea id="ee-notes" rows="4" class="w-full" style="resize:vertical;font-size:13px" placeholder="Notes internes sur l'employé…">${emp.adminNotes||''}</textarea>
        <div class="text-xs text-slate-400 mt-1">Synchronisé avec Airtable. Visible seulement par l'admin.</div>
      </div>
    <div class="flex justify-end gap-2 mt-4">
      <button onclick="state.showEditEmpModal=null;render()" class="btn btn-gray">Annuler</button>
      <button onclick="saveEditEmp('${empId}')" class="btn btn-navy">Sauvegarder</button>
    </div>`;
  bd.appendChild(m); return bd;
}

function saveEditEmp(empId){
  const emp=DB.employees.find(e=>e.id===empId); if(!emp) return;
  const name=document.getElementById('ee-name').value.trim();
  if(!name){toast('Le nom est requis.', 'error');return;}
  emp.name=name;
  emp.email=document.getElementById('ee-email').value.trim();
  emp.phone=document.getElementById('ee-phone').value.trim();
  emp.airtableId=document.getElementById('ee-atid').value.trim();
  emp.partTime=document.getElementById('ee-pt').checked;
  emp.autoFill=document.getElementById('ee-autofill').checked;
  emp.defaultLunch=document.getElementById('ee-lunch').value.trim();
  const modeEl=document.querySelector('input[name="ee-inputmode"]:checked');
  if(modeEl) emp.inputMode=modeEl.value;
  emp.adminNotes=document.getElementById('ee-notes').value;
  save(); state.showEditEmpModal=null; render();
  syncEmpPrefsToAirtable(empId);
  if(emp.airtableId){
    fetch('/api/updateemployee',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({airtableId:emp.airtableId, adminNotes:emp.adminNotes})});
  }
}

function renderEmpPwResetModal(){
  const empId=state.showEmpPwResetConfirm;
  const emp=DB.employees.find(e=>e.id===empId); if(!emp) return el('div','');
  const bd=el('div','fixed inset-0 modal-backdrop z-50 flex items-center justify-center p-4');
  const m=el('div','card p-6 w-full max-w-sm slide-in');
  m.innerHTML=`
    <h2 class="text-lg font-bold text-orange-700 mb-2">🔑 Réinitialiser le mot de passe</h2>
    <p class="text-sm text-slate-600 mb-4">Supprimer le mot de passe de <strong>${emp.name}</strong>?<br>
    L'employé pourra se connecter sans mot de passe et en créer un nouveau dans son profil.</p>
    <div class="flex justify-end gap-2">
      <button onclick="state.showEmpPwResetConfirm=null;render()" class="btn btn-gray">Annuler</button>
      <button onclick="resetEmpPassword('${empId}')" class="btn btn-orange">Réinitialiser</button>
    </div>`;
  bd.appendChild(m); return bd;
}

async function resetEmpPassword(empId){
  const emp=DB.employees.find(e=>e.id===empId);
  if(emp){ emp.password=null; save(); await syncEmpPasswordToAirtable(emp.airtableId, ''); }
  state.showEmpPwResetConfirm=null; render();
}

function renderRemoveConfirmModal(){
  const empId=state.showRemoveConfirm;
  const emp=DB.employees.find(e=>e.id===empId); if(!emp) return el('div','');
  const bd=el('div','fixed inset-0 modal-backdrop z-50 flex items-center justify-center p-4');
  const m=el('div','card p-6 w-full max-w-sm slide-in');
  let html='<h2 class="text-lg font-bold text-slate-800 mb-2">Que voulez-vous faire?</h2>'
    +'<p class="text-sm font-semibold text-slate-700 mb-4">'+emp.name+'</p>';
  if(!emp.archived){
    html+='<div class="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-3">'
      +'<div class="font-medium text-amber-800 text-sm mb-1">&#x1F4E6; Archiver (recommand&#xe9;)</div>'
      +'<div class="text-xs text-amber-700 mb-2">L\'employ&#xe9; dispara&#xee;t de la liste de connexion. Ses donn&#xe9;es sont conserv&#xe9;es et il est r&#xe9;activable en tout temps.</div>'
      +'<button onclick="archiveEmployee(\''+empId+'\')" class="btn btn-orange w-full text-sm">Archiver</button>'
      +'</div>';
  }
  html+='<div class="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">'
    +'<div class="font-medium text-red-700 text-sm mb-1">&#x1F5D1; Supprimer d&#xe9;finitivement</div>'
    +'<div class="text-xs text-red-600 mb-2">Supprime l\'employ&#xe9; de l\'application. Les feuilles restent dans Airtable.</div>'
    +'<button onclick="removeEmployee(\''+empId+'\')" class="btn btn-red w-full text-sm">Supprimer</button>'
    +'</div>'
    +'<button onclick="state.showRemoveConfirm=null;render()" class="btn btn-light w-full">Annuler</button>';
  m.innerHTML=html;
  bd.appendChild(m); return bd;
}

function archiveEmployee(empId){
  const emp=DB.employees.find(e=>e.id===empId);
  if(emp){
    emp.archived=true;
    emp.exitDate=localDateStr();
    save();
    if(emp.airtableId){
      fetch('/api/updateemployee',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({airtableId:emp.airtableId, archived:true, exitDate:emp.exitDate})});
    }
  }
  state.showRemoveConfirm=null; render();
}

function unarchiveEmployee(empId){
  const emp=DB.employees.find(e=>e.id===empId);
  if(emp){
    emp.archived=false;
    emp.exitDate='';
    save();
    if(emp.airtableId){
      fetch('/api/updateemployee',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({airtableId:emp.airtableId, archived:false, exitDate:''})});
      initPeriodAirtable(PERIOD.current().key);
    }
  }
  render();
}

function removeEmployee(empId){
  DB.employees=DB.employees.filter(e=>e.id!==empId);
  save(); state.showRemoveConfirm=null; render();
}

// ================================================================
//  UTILS
// ================================================================
function el(tag,className){ const e=document.createElement(tag); if(className)e.className=className; return e; }
function logout(){ state.currentUser=null; state.view='login'; state.adminTab='overview'; render(); }



// ================================================================
//  INIT — charge les employés depuis Airtable au démarrage
// ================================================================

function renderLoading(msg){
  const app=document.getElementById('app');
  app.innerHTML=`
    <div class="min-h-screen flex flex-col items-center justify-center bg-slate-100 gap-4">
      <div class="w-12 h-12 border-4 border-blue-200 border-t-blue-600 rounded-full" style="animation:spin 1s linear infinite"></div>
      <p class="text-slate-500 text-sm">${msg||'Chargement…'}</p>
    </div>`;
}

async function init(){
  renderLoading('Chargement des employés…');

  try {
    const resp = await fetch('/api/getemployees');
    if(resp.ok){
      const apiEmployees = await resp.json();

      const merged = apiEmployees.map(apiEmp => {
        const local = DB.employees.find(e =>
          e.airtableId === apiEmp.airtableId || e.id === apiEmp.airtableId
        );
        return {
          id:            apiEmp.airtableId,
          name:          apiEmp.name,
          email:         apiEmp.email        || '',
          phone:         apiEmp.phone        || '',
          airtableId:    apiEmp.airtableId,
          partTime:      apiEmp.partTime      ?? local?.partTime      ?? false,
          inputMode:     apiEmp.inputMode     || local?.inputMode     || 'clock',
          autoFill:      apiEmp.autoFill      ?? local?.autoFill      ?? false,
          reminderCount: DB.periodReminderResets[PERIOD.current().key]
            ? (local?.reminderCount ?? 0)
            : (apiEmp.reminderCount ?? local?.reminderCount ?? 0),
          password:      apiEmp.password !== undefined ? apiEmp.password : (local?.password ?? null),
          archived:      apiEmp.archived      ?? local?.archived      ?? false,
          _oldId:        local?.id || null,
        };
      });

      const newTimesheets = {};
      Object.entries(DB.timesheets || {}).forEach(([key, sheet]) => {
        let newKey = key;
        merged.forEach(emp => {
          if(emp._oldId && emp._oldId !== emp.id) {
            const oldPrefix = emp._oldId + '_';
            const newPrefix = emp.id + '_';
            if(key.startsWith(oldPrefix)) {
              newKey = key.replace(oldPrefix, newPrefix);
            }
          }
        });
        newTimesheets[newKey] = sheet;
      });
      DB.timesheets = newTimesheets;

      merged.forEach(e => delete e._oldId);
      DB.employees = merged;
      DataService.save(DB);
      console.log(`✅ ${merged.length} employé(s) chargé(s) depuis Airtable`);
    } else {
      console.warn(`getEmployees → ${resp.status} — utilisation du cache localStorage`);
    }
  } catch(e){
    console.warn('getEmployees inaccessible:', e.message, '— utilisation du cache localStorage');
  }

  render();
  SyncQueue.flush();
  setInterval(()=>{
    if(state.view==='employee' && currentEmp()){
      loadSheetFromAirtable(currentEmp());
    }
  }, 2 * 60 * 1000);
}

// Ajouter l'animation spin
(function(){
  const s=document.createElement('style');
  s.textContent='@keyframes spin{to{transform:rotate(360deg)}}';
  document.head.appendChild(s);
})();

init();

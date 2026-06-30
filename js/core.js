// ================================================================
//  TOAST & SPINNER
// ================================================================
function toast(msg, type='info', duration=3500){
  const container = document.getElementById('toast-container');
  if(!container) return;
  const icons = { success:'✅', error:'❌', info:'ℹ️' };
  const t = document.createElement('div');
  t.className = `toast toast-${type}`;
  t.innerHTML = `<span>${icons[type]||'ℹ️'}</span><span>${msg}</span>`;
  container.appendChild(t);
  setTimeout(()=>{
    t.style.animation = 'toastOut .2s ease forwards';
    setTimeout(()=>t.remove(), 200);
  }, duration);
}

let _syncCount = 0;
function dbg(msg, type='info'){
  const panel = document.getElementById('debug-panel');
  const log   = document.getElementById('debug-log');
  if(!panel || !log) return;
  const line = document.createElement('div');
  line.className = 'dp-line' + (type==='error'?' err':type==='ok'?' ok':'');
  const t = new Date().toLocaleTimeString('fr-CA',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
  line.textContent = `[${t}] ${msg}`;
  log.appendChild(line);
  log.scrollTop = log.scrollHeight;
}

function syncStart(){
  _syncCount++;
  const ind = document.getElementById('sync-indicator');
  if(ind) ind.style.display = 'flex';
}
function syncEnd(){
  _syncCount = Math.max(0, _syncCount - 1);
  if(_syncCount === 0){
    const ind = document.getElementById('sync-indicator');
    if(ind) ind.style.display = 'none';
  }
}

function logChange(empId, date, field, oldVal, newVal){
  if(!DB.changeLog) DB.changeLog = [];
  const who = state.currentUser === 'admin' ? 'Admin' : (DB.employees.find(e=>e.id===empId)?.name || empId);
  DB.changeLog.unshift({
    ts: new Date().toISOString(),
    empId, date, field,
    old: oldVal, new: newVal,
    by: who
  });
  if(DB.changeLog.length > 500) DB.changeLog.length = 500;
}

// ================================================================
//  VERSION — incrémentée à chaque livraison de index.html
// ================================================================
const APP_VERSION = 'v1.14 — 2026-06-30';

// ================================================================
//  DATA SERVICE
// ================================================================
const DataService = {
  KEY: 'fdt_db_v6',
  load(){ try{return JSON.parse(localStorage.getItem(this.KEY))||null;}catch(e){return null;} },
  save(db){ localStorage.setItem(this.KEY,JSON.stringify(db)); },
  getDefault(){
    return {
      adminPassword:'admin123',
      reminderTemplate:"Bonjour [Prénom], n'oublie pas de soumettre ta feuille de temps pour la période en cours. Merci!",
      employees:[
        {id:'emp1',name:'Guillaume Chiasson-Poupart',email:'',phone:'',partTime:false,reminderCount:0,password:null,autoFill:false,inputMode:'clock',airtableId:''},
        {id:'emp2',name:'Alahin Izquierdo Camejo',   email:'',phone:'',partTime:false,reminderCount:0,password:null,autoFill:false,inputMode:'clock',airtableId:''},
        {id:'emp3',name:'Aurélie Cynthia Dubeau',    email:'',phone:'',partTime:true, reminderCount:0,password:null,autoFill:false,inputMode:'clock',airtableId:''},
        {id:'emp4',name:'Daniel St-Germain',         email:'',phone:'',partTime:false,reminderCount:0,password:null,autoFill:false,inputMode:'clock',airtableId:''},
        {id:'emp5',name:'Karine Girard',             email:'',phone:'',partTime:true, reminderCount:0,password:null,autoFill:false,inputMode:'clock',airtableId:''},
        {id:'emp6',name:'Michael Lalonde',           email:'',phone:'',partTime:false,reminderCount:0,password:null,autoFill:false,inputMode:'clock',airtableId:''},
        {id:'emp7',name:'Michel Malouin',            email:'',phone:'',partTime:true, reminderCount:0,password:null,autoFill:false,inputMode:'clock',airtableId:''},
      ],
      timesheets:{},
      periodReminderResets:{},
      changeLog:[],
      holidayPay:{}
    };
  }
};

// ================================================================
//  SYNC QUEUE — retry automatique si réseau coupé (mobile)
// ================================================================
const SyncQueue = {
  KEY: 'fdt_syncqueue_v1',
  add(data){
    let q = this.getAll();
    const idx = q.findIndex(x => x.empId === data.empId && x.date === data.date);
    if(idx >= 0) q[idx] = { ...data, _ts: Date.now() };
    else q.push({ ...data, _ts: Date.now() });
    if(q.length > 200) q = q.slice(-200);
    try{ localStorage.setItem(this.KEY, JSON.stringify(q)); } catch(e){}
    updateSyncBadge();
  },
  remove(empId, date){
    const q = this.getAll().filter(x => !(x.empId === empId && x.date === date));
    try{ localStorage.setItem(this.KEY, JSON.stringify(q)); } catch(e){}
    updateSyncBadge();
  },
  getAll(){
    try{ return JSON.parse(localStorage.getItem(this.KEY) || '[]'); } catch{ return []; }
  },
  size(){ return this.getAll().length; },
  async flush(){
    const q = this.getAll();
    if(q.length === 0) return;
    console.log(`SyncQueue.flush: ${q.length} entrée(s) en attente`);
    let flushed = 0;
    for(const data of q){
      try{
        const resp = await fetch('/api/syncairtable', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        });
        if(resp.ok){
          const json = await resp.json();
          if(json.recordId){
            const emp = DB.employees.find(e => e.airtableId === data.empId);
            if(emp){
              Object.values(DB.timesheets).forEach(sheet => {
                const row = sheet?.rows?.find(r => r.date === data.date);
                if(row && !row.airtableRecordId) row.airtableRecordId = json.recordId;
              });
              DataService.save(DB);
            }
          }
          this.remove(data.empId, data.date);
          flushed++;
          dbg(`✅ Queue flush: ${data.date}`, 'ok');
        }
      } catch(e){
        dbg(`Queue flush erreur ${data.date}: ${e.message}`, 'error');
      }
    }
    if(flushed > 0) toast(`✅ ${flushed} entrée(s) synchronisée(s)`, 'success', 3000);
    updateSyncBadge();
  }
};

// Met à jour le badge de statut sur une carte mobile (ou ligne desktop)
function updateRowSyncBadge(empId, date, status){
  const el = document.getElementById(`row-sync-${empId}-${date}`);
  if(!el) return;
  const configs = {
    pending: { bg:'#f59e0b', text:'⏳ En attente',  title:'Données sauvegardées localement, envoi en cours…' },
    ok:      { bg:'#16a34a', text:'☁️ Sauvegardé',  title:'Données sauvegardées dans Airtable' },
    error:   { bg:'#dc2626', text:'❌ Erreur sync',  title:"Erreur lors de l'envoi — sera retenté automatiquement" },
  };
  const cfg = configs[status] || configs.pending;
  el.style.background = cfg.bg;
  el.textContent = cfg.text;
  el.title = cfg.title;
  el.style.display = 'inline-block';
}

function updateSyncBadge(){
  const count = SyncQueue.size();
  let badge = document.getElementById('sync-queue-badge');
  if(count > 0){
    if(!badge){
      badge = document.createElement('div');
      badge.id = 'sync-queue-badge';
      badge.style.cssText = 'position:fixed;bottom:70px;left:16px;z-index:30;background:#f59e0b;color:white;'
        + 'border-radius:20px;padding:5px 12px;font-size:12px;font-weight:600;'
        + 'box-shadow:0 2px 8px rgba(0,0,0,.2);cursor:pointer;';
      badge.title = 'Tap pour réessayer la synchronisation';
      badge.onclick = () => SyncQueue.flush();
      document.body.appendChild(badge);
    }
    badge.textContent = `⏳ ${count} non sync. — Tap pour réessayer`;
  } else {
    if(badge) badge.remove();
  }
}

// Retry au chargement + toutes les 30s + quand la connexion revient
window.addEventListener('online', () => {
  toast('Connexion rétablie — synchronisation en cours…', 'info', 3000);
  SyncQueue.flush();
});
setInterval(() => SyncQueue.flush(), 30_000);

// ================================================================
//  PERIOD LOGIC
// ================================================================
const PERIOD = {
  ANCHOR: new Date('2026-04-06T00:00:00'),
  current(){
    const today=new Date(); today.setHours(0,0,0,0);
    const diff=Math.floor((today-this.ANCHOR)/86400000);
    const num=Math.floor(diff/14);
    const start=new Date(this.ANCHOR); start.setDate(start.getDate()+num*14);
    const end=new Date(start); end.setDate(end.getDate()+13);
    return {start,end,key:this.key(start)};
  },
  key(start){
    const y=start.getFullYear(),m=String(start.getMonth()+1).padStart(2,'0'),d=String(start.getDate()).padStart(2,'0');
    return `${y}-${m}-${d}`;
  },
  airtableLabel(start,end){
    const ymdLocal=d=>{ const y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,'0'),dd=String(d.getDate()).padStart(2,'0'); return `${y}-${m}-${dd}`; };
    return `${ymdLocal(start)} – ${ymdLocal(end)}`;
  },
  label(start,end){ return `${fmt(start)} – ${fmt(end)}`; },
  getDays(start){
    const days=[];
    for(let i=0;i<14;i++){const d=new Date(start);d.setDate(d.getDate()+i);days.push(d);}
    return days;
  },
  list(numBack=24){
    const periods=[]; const cur=this.current();
    const curIdx=Math.floor((cur.start-this.ANCHOR)/86400000/14);
    for(let i=0;i<=numBack;i++){
      const idx=curIdx-i; if(idx<0)break;
      const s=new Date(this.ANCHOR); s.setDate(s.getDate()+idx*14);
      const e=new Date(s); e.setDate(e.getDate()+13);
      periods.push({start:s,end:e,key:this.key(s)});
    }
    return periods;
  }
};

function fmt(d){ return d.toLocaleDateString('fr-CA',{day:'2-digit',month:'short',year:'numeric'}); }
function dayLabel(d){ return d.toLocaleDateString('fr-CA',{weekday:'short',day:'2-digit',month:'short'}); }
function dayLabelLong(d){ return d.toLocaleDateString('fr-CA',{weekday:'long',day:'numeric',month:'long'}); }
function isWeekend(d){ const w=d.getDay(); return w===0||w===6; }

function localDateStr(d){
  const date = d || new Date();
  const y=date.getFullYear();
  const m=String(date.getMonth()+1).padStart(2,'0');
  const dd=String(date.getDate()).padStart(2,'0');
  return `${y}-${m}-${dd}`;
}
function firstName(n){ return (n||'').split(' ')[0]; }

// ================================================================
//  TIME UTILITIES
// ================================================================
function parseTime(str){
  if(!str||!str.toString().trim()) return null;
  let s=str.toString().trim().toLowerCase().replace(',','.');
  if(!s.includes('h')&&!s.includes(':')&&s.includes('.')){
    const val=parseFloat(s);
    return(isNaN(val)||val<0)?null:Math.round(val*60);
  }
  let h=0,m=0;
  if(s.includes('h')){const p=s.split('h');h=parseInt(p[0])||0;m=parseInt(p[1])||0;}
  else if(s.includes(':')){ const p=s.split(':');h=parseInt(p[0])||0;m=parseInt(p[1])||0;}
  else if(/^\d+$/.test(s)){ if(s.length<=2){h=parseInt(s);m=0;}else{h=parseInt(s.slice(0,-2));m=parseInt(s.slice(-2));} }
  else return null;
  if(h<0||h>23||m<0||m>59) return null;
  return h*60+m;
}

function fmtMins(mins){
  if(mins===null||mins===undefined||mins<0) return '—';
  return `${Math.floor(mins/60)}h${String(mins%60).padStart(2,'0')}`;
}
function calcWorked(s,e,l,p){ if(s===null||e===null)return null; const w=e-s-(l||0)-(p||0); return w<0?0:w; }

// ================================================================
//  HOLIDAY PAY HELPERS
// ================================================================
// Référence officielle (CNESST, art. 62 LNT) : l'indemnité de jour férié équivaut à 1/20 du
// salaire gagné durant les 4 semaines complètes de paie précédentes — soit, dans cette app,
// nos 2 dernières périodes de paie (14 jours x 2 = 4 semaines). Comme l'app ne connaît pas le
// taux horaire, le même ratio 1/20 (5%) est appliqué directement sur les heures travaillées.
const HOLIDAY_PAY_INFO = "Calcul basé sur la norme du Québec (CNESST, art. 62 de la Loi sur les normes du travail) : l'indemnité de jour férié équivaut à 1/20 du salaire gagné durant les 4 semaines complètes de paie précédentes — soit nos 2 dernières périodes de paie. Comme l'app ne connaît pas le taux horaire de chaque employé, elle applique ce même ratio (5%) directement sur les heures travaillées de ces 2 périodes, puis arrondit au 15 minutes supérieur.\n\nDétails officiels : https://www.cnesst.gouv.qc.ca/fr/conditions-travail/conges/jours-feries/calculer-indemnites-pour-un-jour-ferie";
function explainHolidayPay(){ alert(HOLIDAY_PAY_INFO); }

function ceilTo15(mins){
  if(!mins||mins<=0) return 0;
  return Math.ceil(mins/15)*15;
}

function calcHolidayPay(empId, periodKey){
  const allPeriods = PERIOD.list(24);
  const curIdx = allPeriods.findIndex(p=>p.key===periodKey);
  if(curIdx<0) return 0;
  const prev1 = allPeriods[curIdx+1];
  const prev2 = allPeriods[curIdx+2];
  let total = 0;
  [prev1,prev2].forEach(p=>{
    if(!p) return;
    const sheet = DB.timesheets[`${empId}_${p.key}`];
    if(sheet) total += (sheet.totalMinutes||calcSheetTotal(sheet));
  });
  return ceilTo15(Math.round(total*0.05));
}

function getHolidayPay(empId, periodKey){
  if(DB.holidayPay[empId]&&DB.holidayPay[empId][periodKey]!==undefined)
    return DB.holidayPay[empId][periodKey];
  return calcHolidayPay(empId, periodKey);
}

function setHolidayPay(empId, periodKey, rawVal){
  const parsed = parseTime(rawVal);
  if(!DB.holidayPay[empId]) DB.holidayPay[empId]={};
  if(parsed===null){ delete DB.holidayPay[empId][periodKey]; }
  else { DB.holidayPay[empId][periodKey]=ceilTo15(parsed); }
  save();
  const inp=document.getElementById(`hp-inp-${empId}-${periodKey}`);
  if(inp) inp.value=fmtMins(getHolidayPay(empId,periodKey));
  const inp2=document.getElementById(`hp-arch-inp-${empId}`);
  if(inp2) inp2.value=fmtMins(getHolidayPay(empId,periodKey));
}

function minsToHHMM(mins){
  if(!mins&&mins!==0) return '00:00';
  return `${String(Math.floor(mins/60)).padStart(2,'0')}:${String(mins%60).padStart(2,'0')}`;
}

function getHolidayPaySources(empId, periodKey){
  const allPeriods = PERIOD.list(24);
  const curIdx = allPeriods.findIndex(p=>p.key===periodKey);
  if(curIdx<0) return [];
  return [allPeriods[curIdx+1],allPeriods[curIdx+2]].filter(Boolean).map(p=>{
    const sheet = DB.timesheets[`${empId}_${p.key}`];
    const mins = sheet?(sheet.totalMinutes||calcSheetTotal(sheet)):0;
    return {label:PERIOD.label(p.start,p.end), mins};
  });
}

// Charge en arrière-plan les 2 périodes précédentes (nécessaires au calcul du congé férié)
// si elles ne sont pas déjà en mémoire. Sans ça, calcHolidayPay() retourne 0 tant que
// l'admin n'a pas ouvert manuellement l'historique/archives pour ces périodes.
const _holidaySourcesLoading = new Set();
async function ensureHolidaySourcesLoaded(empId, periodKey){
  const emp = DB.employees.find(e=>e.id===empId);
  if(!emp || !emp.airtableId) return;
  const allPeriods = PERIOD.list(24);
  const curIdx = allPeriods.findIndex(p=>p.key===periodKey);
  if(curIdx<0) return;
  const toLoad = [allPeriods[curIdx+1], allPeriods[curIdx+2]].filter(Boolean);
  let anyLoaded = false;
  for(const p of toLoad){
    const sheetKey = `${empId}_${p.key}`;
    const loadKey = `${sheetKey}_hp`;
    if(DB.timesheets[sheetKey] || _holidaySourcesLoading.has(loadKey)) continue;
    _holidaySourcesLoading.add(loadKey);
    await loadSheetFromAirtable(emp, p);
    anyLoaded = true;
  }
  if(anyLoaded) render(); // rafraîchir l'affichage une fois les sources chargées
}

function toTimeVal(str){
  const m=parseTime(str);
  if(m===null) return '';
  return `${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`;
}

// ================================================================
//  LIVE CALC
// ================================================================
const _syncTimers = {};
const _syncLocks  = new Set();
const _fieldOriginals = {};

function captureOriginal(eid,pk,idx,field,val){
  const key=`${eid}_${pk}_${idx}_${field}`;
  if(!(_fieldOriginals[key]!==undefined)) _fieldOriginals[key]=val;
}
function commitChange(eid,pk,idx,field,val){
  const key=`${eid}_${pk}_${idx}_${field}`;
  const original=_fieldOriginals[key];
  const sheet=DB.timesheets[`${eid}_${pk}`];
  if(original!==undefined && original!==val){
    logChange(eid, sheet?.rows[idx]?.date, field, original, val||'');
  }
  delete _fieldOriginals[key];
}
function liveCalc(eid,pk,idx,field,val,shouldLog=false){
  const sk=`${eid}_${pk}`;
  const sheet=DB.timesheets[sk];
  if(!sheet) return;
  sheet.rows[idx][field]=val;
  const row=sheet.rows[idx];
  const s=parseTime(row.start),e=parseTime(row.end),l=parseTime(row.lunch)||0,p=parseTime(row.pause)||0;
  const worked=(s!==null&&e!==null)?Math.max(0,e-s-l-p):null;
  const rc=document.getElementById(`row-t-${eid}-${idx}`);
  if(rc) rc.textContent=fmtMins(worked);
  const rcm=document.getElementById(`m-row-t-${eid}-${idx}`);
  if(rcm) rcm.textContent=fmtMins(worked);
  if(worked !== null && worked > 600){
    const d = new Date(sheet.rows[idx].date + 'T00:00:00');
    toast(`⚠️ ${dayLabel(d)} — ${fmtMins(worked)} dépasse 10h`, 'error', 5000);
  }

  const gt=sheet.rows.reduce((sum,r)=>{
    const rs=parseTime(r.start),re=parseTime(r.end),rl=parseTime(r.lunch)||0,rp=parseTime(r.pause)||0;
    if(rs!==null&&re!==null){const d=re-rs-rl-rp;return sum+(d<0?0:d);}
    return sum;
  },0);
  sheet.totalMinutes=gt;
  const gu=document.getElementById('gt-user');   if(gu) gu.textContent=fmtMins(gt);
  const ga=document.getElementById(`gt-${eid}`); if(ga) ga.textContent=fmtMins(gt);
  DataService.save(DB);

  // Mettre en queue immédiatement (avant le debounce)
  // Si l'onglet est fermé dans les 1.5s, la donnée est déjà protégée
  const emp = DB.employees.find(e => e.id === eid) || currentEmp();
  if(emp?.airtableId){
    const periodForLabel = pk
      ? (PERIOD.list(24).find(p => p.key === pk) || PERIOD.current())
      : PERIOD.current();
    const periodLabel = PERIOD.airtableLabel(periodForLabel.start, periodForLabel.end);
    const row = sheet.rows[idx];
    if(row.start || row.end || row.notes || row.adminNote){
      SyncQueue.add({
        empId:         emp.airtableId,
        date:          row.date,
        start:         row.start     || '',
        end:           row.end       || '',
        lunch:         row.lunch     || '',
        pause:         row.pause     || '',
        notes:         row.notes     || '',
        adminNote:     row.adminNote || '',
        periodeDePaie: periodLabel,
        total:         (()=>{ const s=parseTime(row.start),e=parseTime(row.end),l=parseTime(row.lunch)||0,p=parseTime(row.pause)||0; return (s!==null&&e!==null)?fmtMins(Math.max(0,e-s-l-p)):''; })(),
        recordId:      row.airtableRecordId || undefined
      });
      // Afficher immédiatement le badge "En attente" sur la carte mobile
      updateRowSyncBadge(eid, row.date, 'pending');
    }
  }

  const sheetTimerKey = `${eid}-${pk}`;
  clearTimeout(_syncTimers[sheetTimerKey]);
  _syncTimers[sheetTimerKey] = setTimeout(() => {
    syncFullSheetToAirtable(eid, pk);
  }, 1500);
}

// ================================================================
//  BACKUP / EXPORT
// ================================================================
function downloadJSON(data,filename){
  const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=filename; a.click();
}
function csvEscape(val){
  const s=(val===null||val===undefined)?'':String(val);
  if(/[",\n]/.test(s)) return '"'+s.replace(/"/g,'""')+'"';
  return s;
}
function downloadCSV(rows,filename){
  // BOM UTF-8 pour qu'Excel affiche correctement les accents français
  const csv='\uFEFF'+rows.map(r=>r.map(csvEscape).join(',')).join('\r\n');
  const blob=new Blob([csv],{type:'text/csv;charset=utf-8;'});
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=filename; a.click();
}
function autoBackup(db,reason='backup'){
  const ts=new Date().toISOString().replace(/[:.]/g,'-').slice(0,19);
  downloadJSON(db,`fdt_${reason}_${ts}.json`);
}

// ================================================================
//  SHEET FACTORY
// ================================================================
function makeRow(date){
  const y=date.getFullYear();
  const m=String(date.getMonth()+1).padStart(2,'0');
  const d=String(date.getDate()).padStart(2,'0');
  return {date:`${y}-${m}-${d}`,start:'',end:'',lunch:'',pause:'',notes:'',adminNote:''};
}
function getOrCreateSheet(db,empId,periodKey,periodStart){
  const key=`${empId}_${periodKey}`;
  if(!db.timesheets[key])
    db.timesheets[key]={rows:PERIOD.getDays(periodStart).map(d=>makeRow(d)),approved:false,approvedAt:null,totalMinutes:0};
  return db.timesheets[key];
}
function calcSheetTotal(sheet){
  if(!sheet) return 0;
  return sheet.rows.reduce((sum,r)=>{ const w=calcWorked(parseTime(r.start),parseTime(r.end),parseTime(r.lunch),parseTime(r.pause)); return sum+(w||0); },0);
}

// ================================================================
//  STATE
// ================================================================
let DB = DataService.load() || DataService.getDefault();

DB.employees.forEach(emp=>{
  if(emp.password===undefined)  emp.password=null;
  if(!emp.email) emp.email=(emp.contactType==='Email'?emp.contact||'':'');
  if(!emp.phone) emp.phone=(emp.contactType==='Phone'?emp.contact||'':'');
  if(emp.autoFill===undefined)  emp.autoFill=false;
  if(emp.inputMode===undefined) emp.inputMode='clock';
  if(emp.airtableId===undefined) emp.airtableId='';
  if(emp.archived===undefined) emp.archived=false;
});
Object.values(DB.timesheets||{}).forEach(sheet=>{
  (sheet.rows||[]).forEach(row=>{ if(row.adminNote===undefined) row.adminNote=''; });
});
if(!DB.holidayPay) DB.holidayPay = {};

DataService.save(DB);

let state = {
  view:'login',
  currentUser:null,
  adminTab:'overview',
  archiveFilter:{name:'',period:''},
  archiveSearch:'',
  archivesLoading:false,
  mergeConflicts:null, mergePending:null,
  showMergeModal:false, showPasswordModal:false,
  showAddEmpModal:false, showRemoveConfirm:null,
  showEditEmpModal:null, showEmpPwResetConfirm:null,
  addEmpForm:{name:'',email:'',phone:'',partTime:false},
  conflictResolutions:{}, bulkOverwrite:false,
  loginPendingEmpId:null,
  empTab:'current',
  empHistoryPeriod:null,
  showArchivedInFilter: false,
};
const _archiveLoadedPeriods = new Set();

function save(){ DataService.save(DB); }

function sortedEmployees(){
  return DB.employees
    .filter(e => !e.archived)
    .sort((a,b) => a.name.localeCompare(b.name, "fr", {sensitivity:"base"}));
}

function currentEmp(){
  if(!state.currentUser||state.currentUser==='admin') return null;
  if(typeof state.currentUser==='object') return DB.employees.find(e=>e.id===state.currentUser.id)||state.currentUser;
  return DB.employees.find(e=>e.id===state.currentUser)||null;
}

// ================================================================
//  RENDER
// ================================================================
function render(){
  const app=document.getElementById('app');
  app.innerHTML='';
  if     (state.view==='login')       app.appendChild(renderLogin());
  else if(state.view==='empPassword') app.appendChild(renderEmpPasswordScreen());
  else if(state.view==='employee')    app.appendChild(renderEmployee());
  else if(state.view==='empProfile')  app.appendChild(renderEmpProfile());
  else if(state.view==='admin')       app.appendChild(renderAdmin());
  if(state.showMergeModal)        app.appendChild(renderMergeModal());
  if(state.showPasswordModal)     app.appendChild(renderPasswordModal());
  if(state.showAddEmpModal)       app.appendChild(renderAddEmpModal());
  if(state.showRemoveConfirm)     app.appendChild(renderRemoveConfirmModal());
  if(state.showEditEmpModal)      app.appendChild(renderEditEmpModal());
  if(state.showEmpPwResetConfirm) app.appendChild(renderEmpPwResetModal());
}

// ================================================================
//  LOGIN
// ================================================================
function renderLogin(){
  const wrap=el('div','min-h-screen flex flex-col items-center justify-center bg-slate-100 px-4');
  const card=el('div','card p-7 w-full max-w-sm slide-in');
  card.innerHTML=`
    <div class="text-center mb-6">
      <div class="inline-block nav-navy text-white rounded-xl px-5 py-3 mb-3">
        <span class="text-2xl font-bold tracking-tight">Feuille de Temps</span>
      </div>
      <p class="text-slate-500 text-sm">Sélectionnez votre nom</p>
    </div>
    <div class="space-y-2">
      ${sortedEmployees().map(emp=>`
        <button onclick="startEmpLogin('${emp.id}')"
          class="w-full text-left px-4 py-3 rounded-xl border border-slate-200 hover:bg-blue-50 hover:border-blue-300 transition-all flex items-center gap-3">
          <div class="w-10 h-10 rounded-full nav-navy flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
            ${emp.name.split(' ').map(n=>n[0]).join('').toUpperCase().slice(0,2)}
          </div>
          <div class="flex-1 min-w-0">
            <div class="font-semibold text-slate-800">${emp.name}</div>
            <div class="text-xs text-slate-400">${emp.partTime?'Temps partiel':'Temps plein'}</div>
          </div>
          ${emp.password?'<span class="text-slate-300 text-sm">🔒</span>':''}
        </button>`).join('')}
    </div>
    <div class="mt-6 border-t pt-4 text-center">
      <button onclick="toggleAdminArea()" class="text-sm text-slate-400 hover:text-slate-600 underline">Accès administrateur</button>
      <div class="text-xs text-slate-300 mt-1 mono">${APP_VERSION}</div>
    </div>
    <div id="admin-login-area" class="hidden mt-3 space-y-2">
      <input type="password" id="admin-pw" placeholder="Mot de passe admin" class="w-full"
        onkeydown="if(event.key==='Enter')tryAdmin()">
      <button onclick="tryAdmin()" class="btn btn-navy w-full">Se connecter</button>
      <div id="admin-err" class="text-red-500 text-xs text-center hidden">Mot de passe incorrect.</div>
    </div>`;
  wrap.appendChild(card);
  return wrap;
}

function startEmpLogin(id){
  const emp=DB.employees.find(e=>e.id===id);
  if(!emp) return;
  if(emp.password){ state.loginPendingEmpId=id; state.view='empPassword'; render(); }
  else finishEmpLogin(emp);
}

function renderEmpPasswordScreen(){
  const emp=DB.employees.find(e=>e.id===state.loginPendingEmpId);
  if(!emp){state.view='login';return renderLogin();}
  const wrap=el('div','min-h-screen flex flex-col items-center justify-center bg-slate-100 px-4');
  const card=el('div','card p-7 w-full max-w-sm slide-in');
  card.innerHTML=`
    <div class="text-center mb-5">
      <div class="w-16 h-16 rounded-full nav-navy flex items-center justify-center text-white font-bold text-xl mx-auto mb-3">
        ${emp.name.split(' ').map(n=>n[0]).join('').toUpperCase().slice(0,2)}
      </div>
      <div class="font-bold text-slate-800 text-lg">${emp.name}</div>
      <div class="text-slate-400 text-sm mt-1">Entrez votre mot de passe</div>
    </div>
    <div class="space-y-3">
      <input type="password" id="emp-login-pw" class="w-full text-center text-lg" placeholder="••••••••"
        onkeydown="if(event.key==='Enter')tryEmpLogin()" autofocus>
      <div id="emp-login-err" class="text-red-500 text-xs text-center hidden">Mot de passe incorrect.</div>
      <button onclick="tryEmpLogin()" class="btn btn-navy w-full" style="padding:12px">Connexion</button>
      <button onclick="state.view='login';render()" class="btn btn-light w-full">← Retour</button>
    </div>`;
  wrap.appendChild(card);
  return wrap;
}

function tryEmpLogin(){
  const emp=DB.employees.find(e=>e.id===state.loginPendingEmpId);
  const pw=document.getElementById('emp-login-pw').value;
  if(pw===emp.password) finishEmpLogin(emp);
  else document.getElementById('emp-login-err').classList.remove('hidden');
}

async function finishEmpLogin(emp){
  state.currentUser=emp;
  state.view='employee';
  state.loginPendingEmpId=null;
  checkPeriodReset();
  render();
  await loadSheetFromAirtable(emp);
}

async function refreshFromAirtable(){
  const emp=currentEmp(); if(!emp) return;
  const btn=document.querySelector('[data-refresh]');
  if(btn){btn.textContent='⏳';btn.disabled=true;}
  let period=null;
  if(state.empTab==='history' && state.empHistoryPeriod){
    period=PERIOD.list(24).find(p=>p.key===state.empHistoryPeriod);
  }
  try{
    await loadSheetFromAirtable(emp, period);
    toast('✅ Données à jour','success',2500);
  }catch(e){
    toast('❌ Erreur lors du rafraîchissement','error',3500);
  }
  if(btn){btn.textContent='🔄';btn.disabled=false;}
}

function toggleAdminArea(){
  document.getElementById('admin-login-area').classList.toggle('hidden');
}

function tryAdmin(){
  const pw=document.getElementById('admin-pw').value;
  if(pw===DB.adminPassword){ state.currentUser='admin'; state.view='admin'; checkPeriodResetAdmin(); render(); }
  else document.getElementById('admin-err').classList.remove('hidden');
}

function checkPeriodResetAdmin(){
  const p=PERIOD.current();
  if(!DB.periodReminderResets[p.key]){
    DB.periodReminderResets[p.key]=true;
    DB.employees.forEach(e=>{e.reminderCount=0;});
    save();
    DB.employees.forEach(e=>{ if(e.airtableId) syncEmpPrefsToAirtable(e.id); });
  }
}

function checkPeriodReset(){
  const p=PERIOD.current();
  if(!DB.periodReminderResets[p.key]){
    DB.periodReminderResets[p.key]=true;
    DB.employees.forEach(e=>{e.reminderCount=0;});
    save();
    DB.employees.forEach(e=>{ if(e.airtableId) syncEmpPrefsToAirtable(e.id); });
  }
}

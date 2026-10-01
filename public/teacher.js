const $ = selector => document.querySelector(selector);
const api = async (url, options = {}) => {
  const response = await fetch(url, { credentials:'same-origin', headers:{'content-type':'application/json'}, ...options });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Не удалось выполнить действие');
  return data;
};
let classes = [], selectedClassId = null;
const statusText = { not_started:'Не начал', in_progress:'Выполняет', needs_help:'Нужна помощь', completed:'Готово' };

function toast(text) { const el=document.createElement('div'); el.className='toast'; el.textContent=text; document.body.append(el); setTimeout(()=>el.remove(),2600); }
function currentClass() { return classes.find(c => c.id === Number(selectedClassId)); }
function render() {
  const allStudents=classes.flatMap(c=>c.students), total=allStudents.length, needs=allStudents.filter(s=>s.weak_skill).length, completed=allStudents.reduce((n,s)=>n+Number(s.completed||0),0);
  $('#metrics').innerHTML=`<article class="card metric"><span class="muted">Учеников</span><b>${total}</b></article><article class="card metric"><span class="muted">Нужна помощь</span><b>${needs}</b></article><article class="card metric"><span class="muted">Завершено работ</span><b>${completed}</b></article>`;
  $('#classSelect').innerHTML=classes.length?classes.map(c=>`<option value="${c.id}">${escapeHtml(c.name)}</option>`).join(''):'<option value="">Сначала создайте класс</option>';
  if (!selectedClassId && classes[0]) selectedClassId=classes[0].id;
  $('#classSelect').value=selectedClassId||'';
  const c=currentClass();
  $('#studentForm').classList.toggle('hidden',!c); $('#assignmentForm').classList.toggle('hidden',!c);
  if(!c){$('#classInfo').textContent='Нет классов';$('#results').innerHTML='<div class="empty">Создайте первый класс</div>';return}
  $('#classInfo').innerHTML=`Код для входа: <span class="class-code">${c.code}</span> · учеников: ${c.students.length} · работ: ${c.assignments.length}`;
  const assignmentById=Object.fromEntries(c.assignments.map(a=>[a.id,a]));
  $('#results').innerHTML=c.students.length?`<table class="table"><thead><tr><th>Ученик</th><th>Статус</th><th>Работы</th><th>Попытки</th><th>Подсказки</th><th>Трудный навык</th><th>Последняя активность</th></tr></thead><tbody>${c.students.map(s=>{const status=s.completed&&Number(s.completed)===Number(s.works)?'completed':s.weak_skill?'needs_help':s.works?'in_progress':'not_started';return `<tr><td><b>${escapeHtml(s.display_name)}</b></td><td><span class="status ${status}">${statusText[status]}</span></td><td>${s.completed||0}/${c.assignments.length}</td><td>${s.attempts||0}</td><td>${s.hints||0}</td><td>${escapeHtml(s.weak_skill||'—')}</td><td>${s.last_activity?new Date(s.last_activity+'Z').toLocaleString('ru-RU'):'—'}</td></tr>`}).join('')}</tbody></table>`:'<div class="empty">В этом классе пока нет учеников</div>';
}
function escapeHtml(value){return String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));}
async function load(){const data=await api('api/teacher/overview');classes=data.classes;if(!classes.some(c=>c.id===Number(selectedClassId)))selectedClassId=classes[0]?.id||null;render();}
function showDashboard(){ $('#login').classList.add('hidden');$('#dashboard').classList.remove('hidden');$('#logout').classList.remove('hidden');load().catch(e=>toast(e.message)); }

$('#loginForm').onsubmit=async e=>{e.preventDefault();$('#loginError').textContent='';try{await api('api/teacher/login',{method:'POST',body:JSON.stringify(Object.fromEntries(new FormData(e.currentTarget)))});showDashboard()}catch(err){$('#loginError').textContent=err.message}};
$('#classSelect').onchange=e=>{selectedClassId=Number(e.target.value);render()};
$('#classForm').onsubmit=async e=>{e.preventDefault();try{await api('api/classes',{method:'POST',body:JSON.stringify(Object.fromEntries(new FormData(e.currentTarget)))});e.currentTarget.reset();await load();toast('Класс создан')}catch(err){toast(err.message)}};
$('#studentForm').onsubmit=async e=>{e.preventDefault();const body=Object.fromEntries(new FormData(e.currentTarget));body.classId=selectedClassId;try{const data=await api('api/students',{method:'POST',body:JSON.stringify(body)});e.currentTarget.reset();$('#studentNotice').innerHTML=`<div class="notice"><b>PIN для ${escapeHtml(data.name)}: ${data.pin}</b><br><small>Покажите его ученику. Позже PIN не отображается.</small></div>`;await load()}catch(err){toast(err.message)}};
$('#assignmentForm').onsubmit=async e=>{e.preventDefault();const body=Object.fromEntries(new FormData(e.currentTarget));body.classId=selectedClassId;try{await api('api/assignments',{method:'POST',body:JSON.stringify(body)});e.currentTarget.reset();await load();toast('Работа назначена')}catch(err){toast(err.message)}};
$('#refresh').onclick=()=>load().then(()=>toast('Данные обновлены')).catch(e=>toast(e.message));
$('#logout').onclick=async()=>{await api('api/logout',{method:'POST',body:'{}'});location.reload()};
api('api/teacher/overview').then(showDashboard).catch(()=>{});

(()=>{
  const {catalog,build,math,frac}=window.RAZBOR_TRAINING,$=s=>document.querySelector(s),form=$('#builder');
  let current=null,includeHints=false;
  const historyKey='razbor_tracked_assignments_v1';
  const escape=s=>String(s).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const topicsFor=grade=>Object.entries(catalog).filter(([,v])=>v.grade===Number(grade));
  function refreshSkills(){const info=catalog[form.topic.value],level=Number(form.level.value),items=info?.skills[level]||[];form.skill.innerHTML='<option value="">Все навыки темы</option>'+items.map((name,i)=>'<option value="'+i+'">'+escape(name)+'</option>').join('')}
  function refreshTopics(){form.topic.innerHTML=topicsFor(form.grade.value).map(([id,v])=>'<option value="'+id+'">'+escape(v.name)+'</option>').join('');refreshSkills()}
  function unwrap(v){v=v.trim();return v.startsWith('(')&&v.endsWith(')')?v.slice(1,-1):v}
  function topSlash(v){let d=0;for(let i=0;i<v.length;i++){if(v[i]==='(')d++;else if(v[i]===')')d--;else if(v[i]==='/'&&d===0)return i}return-1}
  function answerHtml(raw){return String(raw).split(';').map(part=>{let prefix='',v=part.trim();const rel=[...v.matchAll(/(?:=|≠)/g)].pop();if(rel){const cut=rel.index+rel[0].length;prefix=v.slice(0,cut)+' ';v=v.slice(cut).trim()}const slash=topSlash(v);return slash<0?math(prefix+v):math(prefix)+frac(unwrap(v.slice(0,slash)),unwrap(v.slice(slash+1)))}).join('; ')}
  function render(){
    const {student,grade,topic,level,count,exercises}=current,topicInfo=catalog[topic];
    $('#sheet').classList.toggle('include-hints',includeHints);
    $('#sheet').innerHTML='<header class="sheet-head"><h1>Самостоятельная работа над ошибками</h1><div class="sheet-meta"><strong>'+escape(student)+' · '+grade+' класс</strong><span>'+escape(topicInfo.name)+' · '+level+'.0</span></div></header>'+exercises.map((p,i)=>'<section class="exercise"><h3>'+(i+1)+'. '+escape(p.title)+'</h3><div class="prompt">'+escape(p.instruction)+'</div><div class="formula">'+p.formula+'</div><div class="answer-space"></div></section>').join('')+'<section class="hints-page"><h2>Подсказки и алгоритмы</h2><p>Эту страницу можно отделить от работы и выдать ребёнку только при необходимости.</p>'+exercises.map((p,i)=>'<article class="hint-item"><h3>Задание '+(i+1)+' · '+escape(p.title)+'</h3><ol>'+p.steps.map(s=>'<li><strong>'+escape(s.title)+'.</strong> '+escape(s.why)+'</li>').join('')+'</ol><div><strong>Ответ для проверки:</strong> '+answerHtml(p.finalStep.answer)+'</div></article>').join('')+'</section>';
    $('#sheet').hidden=false;$('#printBar').hidden=false;$('#printMode').textContent=includeHints?'Будут напечатаны задания и страница подсказок.':'Будут напечатаны только задания.';$('#toggleHints').textContent=includeHints?'Не печатать подсказки':'Добавить подсказки к печати';
  }
  form.grade.onchange=refreshTopics;form.topic.onchange=refreshSkills;form.level.onchange=refreshSkills;refreshTopics();
  form.onsubmit=e=>{e.preventDefault();const data=Object.fromEntries(new FormData(form)),skills=catalog[data.topic].skills[Number(data.level)],seed=Date.now()%100000,selected=data.skill===''?null:Number(data.skill),indexes=selected===null?skills.map((_,i)=>i):[selected];includeHints=!!form.includeHints.checked;current={...data,skill:selected,seed,grade:Number(data.grade),level:Number(data.level),count:Number(data.count),exercises:Array.from({length:Number(data.count)},(_,i)=>build(data.topic,Number(data.level),indexes[i%indexes.length],seed+i))};render();$('#sheet').scrollIntoView({behavior:'smooth',block:'start'})};
  $('#toggleHints').onclick=()=>{includeHints=!includeHints;form.includeHints.checked=includeHints;render()};
  $('#print').onclick=()=>window.print();
  async function copyUrl(page,params,message){if(!current)return;const url=new URL(page,location.href);url.search=new URLSearchParams(params);try{await navigator.clipboard.writeText(url.href);$('#shareStatus').textContent=message}catch{$('#shareStatus').textContent='Скопируйте ссылку: '+url.href}$('#shareStatus').hidden=false}
  $('#copyLink').onclick=()=>copyUrl('work.html',{student:current.student,grade:String(current.grade),topic:current.topic,level:String(current.level),count:String(current.count),seed:String(current.seed),hints:includeHints?'1':'0'},'Ссылка на печатную работу скопирована.');
  const readHistory=()=>{try{return JSON.parse(localStorage.getItem(historyKey)||'[]')}catch{return[]}};
  const saveHistory=items=>localStorage.setItem(historyKey,JSON.stringify(items.slice(0,80)));
  async function createTrackedLink(data,message){
    $('#shareStatus').hidden=false;$('#shareStatus').textContent='Создаю персональную ссылку…';
    try{
      const response=await fetch('api/shared/assignments',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({student:data.student,grade:data.grade,topic:data.topic,level:data.level,count:data.count,seed:data.seed,skill:data.skill})});
      const payload=await response.json();if(!response.ok)throw Error(payload.error||'Не удалось создать ссылку');
      const records=readHistory();records.unshift({id:payload.assignmentId,teacherKey:payload.teacherKey,createdAt:new Date().toISOString()});saveHistory(records);
      const params={student:data.student,grade:String(data.grade),topic:data.topic,level:String(data.level),count:String(data.count),seed:String(data.seed),assignment:payload.assignmentId,access:payload.studentKey};if(data.skill!==null&&data.skill!==undefined)params.skill=String(data.skill);
      const url=new URL('assigned.html',location.href);url.search=new URLSearchParams(params);
      try{await navigator.clipboard.writeText(url.href);$('#shareStatus').textContent=message}catch{$('#shareStatus').textContent='Скопируйте ссылку: '+url.href}
      await loadResults();
    }catch(error){$('#shareStatus').textContent='Не получилось создать отслеживаемую ссылку: '+error.message}
  }
  $('#copyTrainingLink').onclick=()=>current&&createTrackedLink(current,'Ссылка скопирована. Результат появится в журнале ниже.');
  const statusText={not_started:'Не открывал',started:'Выполняет тест',needs_work:'Есть ошибки',working_on_errors:'Разбирает ошибки',completed:'Всё выполнено верно',remediated:'Работа над ошибками завершена'};
  const dateText=value=>value?new Date(value.replace(' ','T')+'Z').toLocaleString('ru-RU',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}):'ещё не открывал';
  async function getRecord(record){const response=await fetch('api/shared/assignments/'+encodeURIComponent(record.id),{headers:{'x-teacher-key':record.teacherKey}});if(!response.ok)throw Error('Результат недоступен');return {...await response.json(),record}}
  function resultCard(data){const {assignment:a,result:r,mistakes}=data,skills=catalog[a.topic]?.skills[a.level]||[],article=document.createElement('article');article.className='result-entry';const wrong=r.wrongSkills||[];article.innerHTML='<div><span class="status-pill '+escape(r.status)+'">'+escape(statusText[r.status]||r.status)+'</span><h3>'+escape(a.student)+'</h3><p>'+escape(a.topicName)+' · '+a.level+'.0'+(a.skill!==null?' · '+escape(skills[a.skill]||'один навык'):'')+'</p><p>Последнее действие: '+escape(dateText(r.updatedAt))+'</p>'+(wrong.length?'<div class="result-skills">'+wrong.map(i=>'<span class="skill-chip">'+escape(skills[i]||('Навык '+(i+1)))+'</span>').join('')+'</div>':'')+'</div><div class="score">'+(r.testTotal?r.testCorrect+'/'+r.testTotal:'—')+'</div>'+(mistakes.length?'<ul class="result-mistakes">'+mistakes.slice(0,5).map(m=>'<li>'+escape(skills[m.skill_index]||'Навык')+': выбран ответ «'+escape(m.answer_text||'—')+'»</li>').join('')+'</ul>':'')+'<div class="result-actions"></div>';
    const actions=article.querySelector('.result-actions');wrong.forEach(index=>{const button=document.createElement('button');button.type='button';button.className='secondary';button.textContent='Дать ещё: '+(skills[index]||('навык '+(index+1)));button.onclick=()=>createTrackedLink({...a,skill:index,count:Math.max(3,Math.min(6,a.count)),seed:(Date.now()%10000000)+index},'Новая ссылка на этот навык скопирована.');actions.append(button)});if(!wrong.length)actions.remove();return article;
  }
  async function loadResults(){const list=$('#resultsList'),records=readHistory();if(!records.length){list.innerHTML='<div class="empty-results">Пока нет отправленных тренировок.</div>';return}list.innerHTML='<div class="empty-results">Загружаю результаты…</div>';const loaded=await Promise.all(records.map(record=>getRecord(record).catch(()=>null)));const cards=loaded.filter(Boolean).map(resultCard);list.replaceChildren(...(cards.length?cards:[Object.assign(document.createElement('div'),{className:'empty-results',textContent:'Результаты пока недоступны. Нажмите «Обновить» чуть позже.'})]))}
  $('#refreshResults').onclick=loadResults;loadResults();
})();

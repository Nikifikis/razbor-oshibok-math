(()=>{
  const {catalog,build,math,frac}=window.RAZBOR_TRAINING,$=s=>document.querySelector(s),form=$('#builder');
  let current=null,includeHints=false;
  const escape=s=>String(s).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const topicsFor=grade=>Object.entries(catalog).filter(([,v])=>v.grade===Number(grade));
  function refreshTopics(){form.topic.innerHTML=topicsFor(form.grade.value).map(([id,v])=>'<option value="'+id+'">'+escape(v.name)+'</option>').join('')}
  function unwrap(v){v=v.trim();return v.startsWith('(')&&v.endsWith(')')?v.slice(1,-1):v}
  function topSlash(v){let d=0;for(let i=0;i<v.length;i++){if(v[i]==='(')d++;else if(v[i]===')')d--;else if(v[i]==='/'&&d===0)return i}return-1}
  function answerHtml(raw){return String(raw).split(';').map(part=>{let prefix='',v=part.trim();const rel=[...v.matchAll(/(?:=|≠)/g)].pop();if(rel){const cut=rel.index+rel[0].length;prefix=v.slice(0,cut)+' ';v=v.slice(cut).trim()}const slash=topSlash(v);return slash<0?math(prefix+v):math(prefix)+frac(unwrap(v.slice(0,slash)),unwrap(v.slice(slash+1)))}).join('; ')}
  function render(){
    const {student,grade,topic,level,count,exercises}=current,topicInfo=catalog[topic];
    $('#sheet').classList.toggle('include-hints',includeHints);
    $('#sheet').innerHTML='<header class="sheet-head"><h1>Самостоятельная работа над ошибками</h1><div class="sheet-meta"><strong>'+escape(student)+' · '+grade+' класс</strong><span>'+escape(topicInfo.name)+' · '+level+'.0</span></div></header>'+exercises.map((p,i)=>'<section class="exercise"><h3>'+(i+1)+'. '+escape(p.title)+'</h3><div class="prompt">'+escape(p.instruction)+'</div><div class="formula">'+p.formula+'</div><div class="answer-space"></div></section>').join('')+'<section class="hints-page"><h2>Подсказки и алгоритмы</h2><p>Эту страницу можно отделить от работы и выдать ребёнку только при необходимости.</p>'+exercises.map((p,i)=>'<article class="hint-item"><h3>Задание '+(i+1)+' · '+escape(p.title)+'</h3><ol>'+p.steps.map(s=>'<li><strong>'+escape(s.title)+'.</strong> '+escape(s.why)+'</li>').join('')+'</ol><div><strong>Ответ для проверки:</strong> '+answerHtml(p.finalStep.answer)+'</div></article>').join('')+'</section>';
    $('#sheet').hidden=false;$('#printBar').hidden=false;$('#printMode').textContent=includeHints?'Будут напечатаны задания и страница подсказок.':'Будут напечатаны только задания.';$('#toggleHints').textContent=includeHints?'Не печатать подсказки':'Добавить подсказки к печати';
  }
  form.grade.onchange=refreshTopics;refreshTopics();
  form.onsubmit=e=>{e.preventDefault();const data=Object.fromEntries(new FormData(form)),skills=catalog[data.topic].skills[Number(data.level)],seed=Date.now()%100000;includeHints=!!form.includeHints.checked;current={...data,seed,grade:Number(data.grade),level:Number(data.level),count:Number(data.count),exercises:Array.from({length:Number(data.count)},(_,i)=>build(data.topic,Number(data.level),i%skills.length,seed+i))};render();$('#sheet').scrollIntoView({behavior:'smooth',block:'start'})};
  $('#toggleHints').onclick=()=>{includeHints=!includeHints;form.includeHints.checked=includeHints;render()};
  $('#print').onclick=()=>window.print();
  $('#copyLink').onclick=async()=>{if(!current)return;const url=new URL('work.html',location.href);url.search=new URLSearchParams({student:current.student,grade:String(current.grade),topic:current.topic,level:String(current.level),count:String(current.count),seed:String(current.seed),hints:includeHints?'1':'0'});try{await navigator.clipboard.writeText(url.href);$('#shareStatus').textContent='Ссылка на этот вариант скопирована.'}catch{$('#shareStatus').textContent='Скопируйте ссылку из адресной строки: '+url.href}$('#shareStatus').hidden=false};
})();

(()=>{
  const {catalog,build,math,frac}=window.RAZBOR_TRAINING,$=s=>document.querySelector(s),q=new URLSearchParams(location.search);
  const esc=s=>String(s).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const grade=Number(q.get('grade')),topic=q.get('topic'),level=Number(q.get('level')),count=Number(q.get('count')),seed=Number(q.get('seed')),student=(q.get('student')||'Ученик').slice(0,80),includeHints=q.get('hints')==='1';
  function unwrap(v){v=v.trim();return v.startsWith('(')&&v.endsWith(')')?v.slice(1,-1):v}
  function topSlash(v){let d=0;for(let i=0;i<v.length;i++){if(v[i]==='(')d++;else if(v[i]===')')d--;else if(v[i]==='/'&&d===0)return i}return-1}
  function answerHtml(raw){return String(raw).split(';').map(part=>{let prefix='',v=part.trim();const rel=[...v.matchAll(/(?:=|≠)/g)].pop();if(rel){const cut=rel.index+rel[0].length;prefix=v.slice(0,cut)+' ';v=v.slice(cut).trim()}const slash=topSlash(v);return slash<0?math(prefix+v):math(prefix)+frac(unwrap(v.slice(0,slash)),unwrap(v.slice(slash+1)))}).join('; ')}
  const valid=catalog[topic]?.grade===grade&&catalog[topic]?.skills[level]&&Number.isInteger(count)&&count>=1&&count<=10&&Number.isInteger(seed)&&student.length;
  if(!valid){$('#sheet').hidden=true;$('#error').hidden=false;$('#error').textContent='Ссылка на работу неполная или повреждена. Попроси учителя прислать её ещё раз.';return}
  const skills=catalog[topic].skills[level],exercises=Array.from({length:count},(_,i)=>build(topic,level,i%skills.length,seed+i));
  $('#welcome').textContent=student+', твоя работа готова';document.title=student+' · работа над ошибками';
  $('#sheet').innerHTML='<header class="sheet-head"><h1>Самостоятельная работа над ошибками</h1><div class="sheet-meta"><strong>'+esc(student)+' · '+grade+' класс</strong><span>'+esc(catalog[topic].name)+' · '+level+'.0</span></div></header>'+exercises.map((p,i)=>'<section class="exercise"><h3>'+(i+1)+'. '+esc(p.title)+'</h3><div class="prompt">'+esc(p.instruction)+'</div><div class="formula">'+p.formula+'</div><div class="answer-space"></div></section>').join('')+(includeHints?'<details class="student-hints"><summary>Подсказки — открывай только если трудно</summary>'+exercises.map((p,i)=>'<article class="hint-item"><h3>Задание '+(i+1)+'</h3><ol>'+p.steps.map(s=>'<li><strong>'+esc(s.title)+'.</strong> '+esc(s.why)+'</li>').join('')+'</ol><div><strong>Ответ для самопроверки:</strong> '+answerHtml(p.finalStep.answer)+'</div></article>').join('')+'</details>':'');
  $('#print').onclick=()=>window.print();
})();

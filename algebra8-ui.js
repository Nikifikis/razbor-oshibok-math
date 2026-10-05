(() => {
  const is8 = () => !!GRADE8_TOPICS[state.topic];
  const topicsForGrade = grade => Number(grade) === 8 ? ['fractions','fraction_sum'] : ['numeric','model','linear'];
  const baseSetTopic = setTopic, baseRenderTasks = renderTasks, baseGenerate = generatePractice;
  const baseLoad = loadPractice, baseShowStep = prepShowStep, baseProgress = updateProgress, baseReport = renderReport;
  const baseNext = prepNext.onclick, baseWorksheet = worksheetTask, baseSheetClick = $('#generateSheet').onclick;
  let printedTasks = [];
  state.g8Results = state.g8Results || {};
  state.topicByGrade = state.topicByGrade || {};
  state.g8Seed = state.g8Seed || 0;
  const resultKey = i => state.topic + '-' + state.level + '-' + i;
  const work = $('#work');
  const originalCoachText=$$('#work .coachcard p')[0].textContent;
  const rule = document.createElement('div'); rule.className = 'g8-rule'; rule.hidden = true;
  prepProblem.insertBefore(rule, prepWorked);
  const choices = document.createElement('div'); choices.className = 'g8-choices';
  prepBox.insertBefore(choices, $('#feedback'));
  const help = document.createElement('button'); help.type='button';help.className='secondary g8-help hidden';help.textContent='Разобрать похожее задание по шагам';
  prepBox.append(help);
  const continueButton = document.createElement('button');continueButton.type='button';continueButton.className='primary hidden';continueButton.style.marginTop='16px';
  $('#report .reportgrid .card').append(continueButton);

  function refreshTopics(){
    const ids=topicsForGrade(state.grade);
    $('#topicSelect').innerHTML=ids.map(id=>'<option value="'+id+'">'+g8Escape(TOPICS[id].name)+'</option>').join('');
    $('#topicBtns').classList.toggle('grade8-topics',state.grade===8);
    $('#topicBtns').innerHTML=ids.map((id,i)=>'<button class="topic-btn" type="button" data-topic="'+id+'" role="radio" aria-checked="false"><span class="topic-num">'+(state.grade===8?'А'+(i+1):'0'+(i+1))+'</span><span class="topic-name">'+g8Escape(TOPICS[id].name.replace(/^А\d · /,''))+'</span></button>').join('');
    $$('#topicBtns button').forEach(b=>b.onclick=()=>setTopic(b.dataset.topic));
    $$('#gradeBtns button').forEach(b=>{const active=Number(b.dataset.grade)===state.grade;b.classList.toggle('active',active);b.setAttribute('aria-pressed',active);});
  }
  function refreshLevel(){
    const missing=TOPICS[state.topic].tasks[3].length===0;
    const card=$('.level-card[data-level="3"]');
    card.classList.toggle('g8-disabled',missing);card.setAttribute('aria-disabled',missing);
    $('#level3Text').textContent=missing?'Материалы А1 уровня 3.0 пока не предоставлены. Доступна подготовка 2.0.':'Применить навык в новой форме и объяснить решение.';
    if(missing&&state.level===3)setLevel(2);
    $('#diagnosticBlock h2').textContent=is8()?TOPICS[state.topic].tasks[state.level].length+' типов заданий · без оценки':'5 заданий · около 7 минут';
    $('#diagnosticText').textContent=is8()?'Попробуй по одному новому примеру каждого типа. Если трудно, перейди к подробному разбору.':'Начнём с простого действия и дойдём до задания, где нужно объяснить ход мысли.';
  }
  setTopic=function(topic){
    if(!TOPICS[topic])return;
    const grade=GRADE8_TOPICS[topic]?8:7;
    if(state.grade!==grade){state.grade=grade;refreshTopics();}
    state.g8Skill=0;state.g8Route=[];
    state.topicByGrade[state.grade]=topic;
    state.prepCompleted=false;
    baseSetTopic(topic);refreshLevel();save();renderReport();
  };
  $$('#gradeBtns button').forEach(b=>b.onclick=()=>{
    state.topicByGrade[state.grade]=state.topic;state.grade=Number(b.dataset.grade);
    refreshTopics();setTopic(state.topicByGrade[state.grade]||topicsForGrade(state.grade)[0]);
  });
  $$('.level-card:not(.mode-card)').forEach(c=>c.onclick=()=>{state.g8Skill=0;state.g8Route=[];setLevel(c.dataset.level);refreshLevel();});
  $('#topicSelect').onchange=e=>setTopic(e.target.value);

  renderTasks=function(){
    if(!is8()){baseRenderTasks();return;}
    const tasks=TOPICS[state.topic].tasks[state.level];
    $('#taskList').innerHTML=tasks.map((t,i)=>{
      const status=state.hard[key(i)]||'',done=state.g8Results[resultKey(i)];
      return '<div class="taskrow"><div class="tasknum">'+(i+1)+'</div><div><strong>'+g8Escape(t[0])+'</strong><small>'+g8Escape(t[1])+'</small>'+(done?'<br><span class="g8-badge">✓ Самостоятельный пример решён</span>':'')+'</div><div class="g8-skill"><div class="difficulty"><button class="diffbtn '+(status==='ok'?'active':'')+'" data-skill="'+i+'" data-v="ok">Понял</button><button class="diffbtn '+(status==='hard'?'active':'')+'" data-skill="'+i+'" data-v="hard">Было трудно</button></div><button class="micro" data-start="'+i+'">Разобрать пример →</button></div></div>';
    }).join('');
    $$('#taskList [data-v]').forEach(b=>b.onclick=()=>{state.hard[key(Number(b.dataset.skill))]=b.dataset.v;save();renderTasks();});
    $$('#taskList [data-start]').forEach(b=>b.onclick=()=>{state.extraActive=false;state.g8Route=[Number(b.dataset.start)];startSkill(Number(b.dataset.start),false);});
    const marked=tasks.filter((_,i)=>state.hard[key(i)]).length;
    $('#ringText').textContent=marked+' / '+tasks.length;
  };
  function startSkill(index,independent){
    state.g8Skill=index;state.g8Phase=independent?'independent':'guided';
    loadPractice();showScreen('work');
  }
  generatePractice=function(){
    if(!is8())return baseGenerate();
    const count=TOPICS[state.topic].tasks[state.level].length;
    const index=state.extraActive?state.extraSolved%count:Math.min(state.g8Skill||0,count-1);
    state.g8Skill=index;
    const seed=state.g8Seed++;
    const p=g8Build(state.topic,state.level,index,seed);
    p.skill=index;p.guidedSteps=p.steps;p.worked=g8Build(state.topic,state.level,index,seed+1);
    if(state.g8Phase==='independent')p.steps=[p.finalStep];
    return p;
  };
  prepShowStep=function(){
    baseShowStep();choices.innerHTML='';
    if(!is8()){$$('#work .coachcard p')[0].textContent=originalCoachText;$$('#work .coachcard h3')[1].textContent='Важно';return;}
    const s=state.current.steps[state.prepIndex];
    const opts=[...new Set(s.choices)].sort(()=>Math.random()-.5);
    opts.forEach(value=>{
      const b=document.createElement('button');b.type='button';b.className='g8-choice';b.dataset.answer=value;b.innerHTML=g8Math(value);
      b.onclick=()=>{
        if($('#checkAnswer').disabled)return;
        $('#answer').value=value;$('#checkAnswer').click();
        if($('#feedback').classList.contains('good')){b.classList.add('correct');choices.querySelectorAll('button').forEach(x=>x.disabled=true);}
        else {b.classList.add('wrong');b.disabled=true;state.g8Wrong++;}
        if($('#feedback').classList.contains('good')&&state.current.graph&&state.prepIndex===state.current.steps.length-1){const plot=document.createElement('div');plot.innerHTML=g8Graph(state.current.graph);$('#feedback').append(plot);}
      };
      choices.append(b);
    });
    const independent=state.g8Phase==='independent';
    $('#hintBtn').classList.toggle('hidden',independent);
    help.classList.toggle('hidden',!independent);
    if(independent)$('#prepWhy').textContent='Сначала реши на бумаге. Затем выбери результат. В этом режиме подсказок нет; к разбору можно вернуться кнопкой ниже.';
  };
  loadPractice=function(){
    work.classList.toggle('grade8-work',is8());
    work.classList.toggle('g8-independent',is8()&&state.g8Phase==='independent');
    work.dataset.learningPhase=is8()?state.g8Phase||'guided':'grade7';
    $('#hintBtn').classList.remove('hidden');help.classList.add('hidden');rule.hidden=!is8();
    baseLoad();
    if(!is8())return;
    state.g8Wrong=0;
    const p=state.current;
    $('#problemText').innerHTML=p.html;
    rule.innerHTML='<strong>Правило, которое пригодится</strong><p>'+g8Escape(p.theory)+'</p>';
    $('#workedBody').innerHTML='<p class="g8-worked-math">'+p.worked.html+'</p><ol>'+p.worked.steps.map(s=>'<li><strong>'+g8Escape(s.title)+':</strong> '+g8Math(s.answers[0])+'<br>'+g8Escape(s.why)+'</li>').join('')+'</ol>'+(p.worked.graph?g8Graph(p.worked.graph):'');
    prepWorked.open=state.g8Phase!=='independent';
    $$('#work .coachcard p')[0].textContent=p.error;
    $$('#work .coachcard h3')[1].textContent='Частая ошибка';
    $('#problemTitle').textContent=(state.g8Phase==='independent'?'Теперь самостоятельно · ':'Подробный разбор · ')+p.title;
  };
  help.onclick=()=>{startSkill(state.g8Skill,false);};
  updateProgress=function(){baseProgress();if(is8())$('#workEyebrow').textContent='8 класс · '+TOPICS[state.topic].name.split(' · ')[0]+' · '+(state.g8Phase==='independent'?'самостоятельная проверка':'шаг '+Math.min(state.prepIndex+1,state.current.steps.length)+' из '+state.current.steps.length);};
  prepNext.onclick=function(){
    if(!is8()){baseNext();return;}
    if(state.g8Phase!=='independent'){
      if(state.prepIndex<state.current.steps.length-1){baseNext();return;}
      startSkill(state.g8Skill,true);return;
    }
    state.g8Results[resultKey(state.g8Skill)]={completed:true,firstTry:state.g8Wrong===0,date:Date.now()};
    if(state.g8Route&&state.g8Route[0]===state.g8Skill)state.g8Route.shift();
    baseNext();renderTasks();
  };
  const oldBuild=$('#buildRoute').onclick;
  $('#buildRoute').onclick=()=>{
    if(!is8()){oldBuild();return;}
    state.extraActive=false;
    const tasks=TOPICS[state.topic].tasks[state.level];
    const hard=tasks.map((_,i)=>i).filter(i=>state.hard[key(i)]==='hard');
    state.g8Route=state.mode==='known'&&hard.length?hard:tasks.map((_,i)=>i);
    startSkill(state.g8Route[0],state.mode==='diagnostic');
  };
  renderReport=function(){
    baseReport();continueButton.classList.toggle('hidden',!is8());
    if(!is8())return;
    $('#mastery').innerHTML=TOPICS[state.topic].tasks[state.level].map((t,i)=>{const result=state.g8Results[resultKey(i)];return '<div class="g8-report-row '+(result?'done':'')+'"><strong>'+g8Escape(t[0])+'</strong><span>'+(result?(result.firstTry?'✓ Решён с первой попытки':'✓ Решён после исправления'):'Ещё не проверено')+'</span></div>';}).join('');
    $('#teacherNote').innerHTML='<strong>Учителю:</strong> отметка означает один самостоятельный пример выбранного типа. Для устойчивого освоения полезно повторить навык позже на новых заданиях.';
    continueButton.textContent=state.g8Route&&state.g8Route.length?'Следующий навык →':'Выбрать другой навык';
  };
  continueButton.onclick=()=>{if(state.g8Route&&state.g8Route.length)startSkill(state.g8Route[0],state.mode==='diagnostic');else showScreen('setup');};

  function teacherTopics(){
    const grade=Number($('#teacherGrade').value),ids=topicsForGrade(grade);
    $('#teacherTopic').innerHTML=ids.map(id=>'<option value="'+id+'">'+g8Escape(TOPICS[id].name)+'</option>').join('');teacherLevel();
  }
  function teacherLevel(){
    const missing=TOPICS[$('#teacherTopic').value].tasks[3].length===0;
    $('#teacherLevel option[value="3"]').disabled=missing;
    if(missing)$('#teacherLevel').value='2';
    $('#taskCount').value=String(GRADE8_TOPICS[$('#teacherTopic').value]?TOPICS[$('#teacherTopic').value].tasks[Number($('#teacherLevel').value)].length:4);
  }
  const six=document.createElement('option');six.value='6';six.textContent='6';$('#taskCount').append(six);
  $('#teacherGrade').onchange=teacherTopics;$('#teacherTopic').onchange=teacherLevel;
  $('#teacherLevel').onchange=teacherLevel;
  worksheetTask=function(topic,level,i){
    if(!GRADE8_TOPICS[topic])return baseWorksheet(topic,level,i);
    const p=g8Build(topic,Number(level),i%GRADE8_TOPICS[topic].tasks[Number(level)].length,state.g8Seed++);
    printedTasks.push(p);
    return {q:p.instruction+' '+p.text,h:p.steps.map(s=>s.title+'. '+s.hints[0]+' '+s.why),a:p.result+(p.result===p.domain?'':'; '+p.domain)};
  };
  $('#generateSheet').onclick=()=>{
    printedTasks=[];baseSheetClick();
    if(printedTasks.length){
      $$('#teacherPreview .print-task>div:first-child').forEach((el,i)=>{el.innerHTML='<b>'+(i+1)+'.</b> <strong>'+g8Escape(printedTasks[i].instruction)+'</strong><br>'+printedTasks[i].html+(printedTasks[i].graph?g8Graph(printedTasks[i].graph,true):'');});
      $('#teacherPreview .hint-page .sub').textContent='Сначала реши самостоятельно. Если трудно, используй алгоритм следующего шага. Ограничения исходных знаменателей сохраняются после сокращения.';
    }
  };
  state.grade=is8()?8:7;refreshTopics();setTopic(state.topic);teacherTopics();renderTasks();renderReport();
})();

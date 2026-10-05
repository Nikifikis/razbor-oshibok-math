(() => {
  const flow=document.createElement('nav');flow.className='mobile-flow';flow.setAttribute('aria-label','Навигация по работе');
  flow.innerHTML='<button type="button" data-view="setup">1 · Выбор</button><button type="button" data-view="work">2 · Разбор</button><button type="button" data-view="report">3 · Итог</button>';
  $('.main').prepend(flow);
  const labels={setup:'Выбрать задания',work:'Разобрать пример',report:'Мой результат'};
  $$('.nav button').forEach(b=>{if(labels[b.dataset.screen])b.innerHTML='<span class="num">'+({setup:1,work:2,report:3}[b.dataset.screen])+'</span>'+labels[b.dataset.screen];});
  $('#setup .hero h1').innerHTML='Разберись в теме.<br>Шаг за шагом.';
  $('#setup .hero p').textContent='Выбери класс, тему и уровень. Разбери трудный навык с подсказками или сначала проверь себя на новом примере.';
  $('#setup>.notice .icon').textContent='✓';
  $('#setup>.notice strong').textContent='Здесь можно ошибаться и пробовать снова.';
  $('#setup>.notice p').textContent='Подсказки помогут разобраться в каждом действии.';
  $('#setup .section-title h2').textContent='Выбери класс и тему';
  $$('#setup>.section-title h2')[1].textContent='Выбери уровень';
  $('#knownBlock h2').textContent='Что хочешь разобрать?';
  $('.mode-card[data-mode="known"] p').textContent='Выберу трудные навыки и разберу их с подсказками.';
  $('.mode-card[data-mode="diagnostic"] p').textContent='Попробую самостоятельно. Если будет трудно, перейду к разбору.';
  prepWorked.querySelector('summary').textContent='Посмотреть разобранный образец';
  $('#restart').textContent='К выбору заданий';
  $('#feedback').setAttribute('role','status');$('#feedback').setAttribute('aria-live','polite');$('#feedback').setAttribute('aria-atomic','true');
  $('#questionLabel').tabIndex=-1;
  const controls=document.createElement('div');controls.className='prep-controls';
  prepBox.insertBefore(controls,prepNext);controls.append($('#hintBtn'),prepNext);
  const actions=$('#setup>.actions');actions.className='setup-launch';
  const summary=document.createElement('div');summary.className='launch-summary';summary.setAttribute('aria-live','polite');actions.prepend(summary);
  const toolbar=document.createElement('div');toolbar.className='screen-toolbar';
  toolbar.innerHTML='<button class="back-link" type="button">← К темам и заданиям</button><span class="screen-context"></span>';
  $('#work').prepend(toolbar);toolbar.querySelector('button').onclick=()=>showScreen('setup');
  const stages=document.createElement('div');stages.className='learning-stages';stages.setAttribute('aria-label','Этапы подготовки');
  $('#work .routehead').after(stages);
  const originalShow=showScreen,originalLoad=loadPractice,originalStep=prepShowStep,originalTasks=renderTasks;
  const originalMode=setMode,originalLevel=setLevel,originalTopic=setTopic,originalReport=renderReport;
  const context=()=>state.grade+'-'+state.topic+'-'+state.level;
  const is8=()=>!!GRADE8_TOPICS[state.topic];
  const availableWork=()=>!!state.current&&state.workContext===context()&&state.prepIndex<state.current.steps.length;
  let active='setup';
  function sync(){
    const count=TOPICS[state.topic].tasks[state.level].length;
    const hard=TOPICS[state.topic].tasks[state.level].filter((_,i)=>state.hard[key(i)]==='hard').length;
    const short=TOPICS[state.topic].name.replace(/^А\d · /,'');
    summary.innerHTML='<strong>'+state.grade+' класс · '+g8Escape(short)+' · '+state.level+'.0</strong><span>'+(state.mode==='diagnostic'?'Начнём с самостоятельной проверки':hard?'Выбрано трудных навыков: '+hard:'Можно начать с любого навыка или пройти тему по порядку')+'</span>';
    $('#buildRoute').textContent=state.mode==='diagnostic'?'Проверить себя →':hard?'Начать разбор →':'Разобрать тему →';
    toolbar.querySelector('.screen-context').textContent=state.grade+' класс · '+TOPICS[state.topic].name+' · '+state.level+'.0';
    const canWork=availableWork();
    const hasResults=state.prepCompleted||(is8()&&Array.from({length:count},(_,i)=>state.g8Results[state.topic+'-'+state.level+'-'+i]).some(Boolean));
    [...$$('.nav button'),...flow.querySelectorAll('button')].forEach(b=>{
      const view=b.dataset.screen||b.dataset.view;b.disabled=view==='work'?!canWork:view==='report'?!hasResults:false;
      b.classList.toggle('active',view===active);
      if(view===active)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');
    });
    $$('.level-card').forEach(c=>{c.setAttribute('aria-pressed',c.classList.contains('selected'));});
    $$('#topicBtns button').forEach(b=>{b.tabIndex=b.getAttribute('aria-checked')==='true'?0:-1;});
    $$('#taskList [data-v]').forEach(b=>{b.textContent=b.dataset.v==='ok'?'Умею':'Нужна практика';b.setAttribute('aria-pressed',b.classList.contains('active'));});
    $$('#taskList [data-start]').forEach(b=>{b.textContent='Начать разбор →';});
  }
  showScreen=function(name){
    if(name==='work'&&!availableWork())return;
    if(name==='report')renderReport();
    active=name;originalShow(name);sync();
  };
  flow.querySelectorAll('button').forEach(b=>b.onclick=()=>showScreen(b.dataset.view));
  $$('.nav button').forEach(b=>b.onclick=()=>showScreen(b.dataset.screen));
  $$('.level-card').forEach(c=>{c.tabIndex=0;c.setAttribute('role','button');c.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();c.click();}});c.addEventListener('click',e=>{if(c.dataset.level&&Number(c.dataset.level)===state.level)e.stopImmediatePropagation();},true);});
  $('#topicBtns').addEventListener('keydown',e=>{
    if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(e.key))return;
    const buttons=$$('#topicBtns button'),i=buttons.indexOf(document.activeElement);if(i<0)return;e.preventDefault();
    const next=e.key==='Home'?0:e.key==='End'?buttons.length-1:(i+(['ArrowLeft','ArrowUp'].includes(e.key)?-1:1)+buttons.length)%buttons.length;
    buttons[next].click();buttons[next].focus();
  });
  function stripOuter(s){s=s.trim();if(s[0]!=='('||s[s.length-1]!==')')return s;let depth=0;for(let i=0;i<s.length-1;i++){if(s[i]==='(')depth++;if(s[i]===')')depth--;if(depth===0)return s;}return s.slice(1,-1);}
  function formula(s){
    if(s.includes(' и '))return s.split(' и ').map(formula).join(' <span class="math-op">и</span> ');
    if(/[=≠]/.test(s))return g8Math(s);
    let depth=0;for(let i=0;i<s.length;i++){if(s[i]==='(')depth++;if(s[i]===')')depth--;if(s[i]==='/'&&depth===0)return g8Fraction(stripOuter(s.slice(0,i)),stripOuter(s.slice(i+1)));}
    return g8Math(s);
  }
  prepShowStep=function(){
    originalStep();
    stages.innerHTML=is8()?'<span class="'+(state.g8Phase==='independent'?'':'active')+'"><b>1</b> Разбор с поддержкой</span><span class="'+(state.g8Phase==='independent'?'active':'')+'"><b>2</b> Самостоятельно</span>':'<span class="active">Разбор по шагам</span>';
    $('#work .routehead h1').textContent=is8()&&state.g8Phase==='independent'?'Теперь попробуй самостоятельно':'Разбираем пример по шагам';
    if(is8()){
      $('#questionLabel').removeAttribute('for');
      $('.g8-choices').setAttribute('role','group');$('.g8-choices').setAttribute('aria-labelledby','questionLabel');
      if(state.g8Phase!=='independent')$('#prepWhy').textContent='Выбери одну запись ниже — ответ проверится сразу. Если трудно, открой подсказку.';
      $$('.g8-choice').forEach((b,i)=>{const chunks=b.dataset.answer.split('; ');const main=chunks.shift();b.innerHTML='<span class="choice-letter" aria-hidden="true">'+['А','Б','В','Г','Д'][i]+'</span><span class="choice-content"><span class="choice-equation">'+formula(main)+'</span>'+(chunks.length?'<span class="choice-domain">'+g8Math(chunks.join('; '))+'</span>':'')+'</span>';});
    }else $('#questionLabel').setAttribute('for','answer');
    if(!$('#hintBtn').classList.contains('hidden'))$('#hintBtn').textContent='Подсказка к этому шагу';
  };
  loadPractice=function(){state.workContext=context();originalLoad();prepWorked.open=false;sync();};
  renderTasks=function(){originalTasks();sync();};
  setMode=function(mode){if(mode!==state.mode){state.current=null;state.prepCompleted=false;}originalMode(mode);sync();};
  setLevel=function(level){if(Number(level)!==state.level){state.current=null;state.prepCompleted=false;}originalLevel(level);sync();};
  setTopic=function(topic){if(topic===state.topic){sync();return;}state.current=null;state.prepCompleted=false;originalTopic(topic);sync();};
  renderReport=function(){originalReport();sync();};
  document.addEventListener('click',e=>{
    if(e.target.id==='checkAnswer'&&$('#feedback').classList.contains('good')){
      if(is8()&&state.g8Phase!=='independent'&&state.prepIndex===state.current.steps.length-1)prepNext.textContent='Перейти к самостоятельному примеру →';
      prepNext.focus({preventScroll:true});sync();
    }
  });
  sync();
})();

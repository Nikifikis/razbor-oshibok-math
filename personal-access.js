const crypto=require('node:crypto');
const {catalog,build}=require('./training');
module.exports=function createPersonalAccess(env){
  const {db,json,readJson,requireRole,sessionFor,createSession,hashSecret,normalizeName,randomCode,rateLimited}=env;
  const add=(table,name,sql)=>{if(!db.prepare('PRAGMA table_info('+table+')').all().some(c=>c.name===name))db.exec('ALTER TABLE '+table+' ADD COLUMN '+name+' '+sql);};
  add('students','access_code_hash','TEXT');
  add('assignments','student_id','INTEGER REFERENCES students(id)');add('assignments','skills','TEXT NOT NULL DEFAULT \'[]\'');add('assignments','active','INTEGER NOT NULL DEFAULT 1');
  for(const [name,sql] of [['step_index','INTEGER'],['phase','TEXT'],['answer_text','TEXT'],['prompt','TEXT']])add('attempts',name,sql);
  db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_student_access_code ON students(access_code_hash);
    CREATE TABLE IF NOT EXISTS practice_tasks(id TEXT PRIMARY KEY,student_id INTEGER NOT NULL REFERENCES students(id),assignment_id INTEGER NOT NULL REFERENCES assignments(id),skill_index INTEGER NOT NULL,phase TEXT NOT NULL,payload TEXT NOT NULL,step_index INTEGER NOT NULL DEFAULT 0,hint_stage INTEGER NOT NULL DEFAULT 0,step_passed INTEGER NOT NULL DEFAULT 0,completed INTEGER NOT NULL DEFAULT 0,created_at INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS idx_practice_owner ON practice_tasks(student_id,assignment_id);`);
  const digest=code=>crypto.createHash('sha256').update(String(code).toUpperCase().replace(/[\s-]/g,'')).digest('hex');
  const codeFor=id=>{const code=randomCode(12);db.prepare('UPDATE students SET access_code_hash=? WHERE id=?').run(digest(code),id);db.prepare("DELETE FROM sessions WHERE role='student' AND ref_id=?").run(id);return code.match(/.{4}/g).join('-');};
  const skillsFor=a=>{try{const xs=JSON.parse(a.skills);return Array.isArray(xs)?xs.filter(x=>Number.isInteger(x)&&!!catalog[a.topic]?.skills[a.level]?.[x]):[];}catch{return[];}};
  const targetFor=(a,skill)=>{const keys=skillsFor(a),i=keys.indexOf(skill);return Math.floor(a.task_count/keys.length)+(i<a.task_count%keys.length?1:0);};
  const finishedFor=(a,studentId,skill)=>db.prepare("SELECT COUNT(*) total FROM practice_tasks WHERE assignment_id=? AND student_id=? AND skill_index=? AND phase='independent' AND completed=1").get(a.id,studentId,skill).total;
  const learner=(req,res)=>{const ses=requireRole(req,res,'student');if(!ses)return null;const s=db.prepare('SELECT * FROM students WHERE id=? AND active=1').get(ses.ref_id);if(!s){json(res,401,{error:'Доступ ученика закрыт'});return null;}return s;};
  const assignment=(id,student)=>{const a=db.prepare('SELECT * FROM assignments WHERE id=? AND class_id=? AND active=1 AND (student_id IS NULL OR student_id=?)').get(id,student.class_id,student.id);return a&&skillsFor(a).length?a:null;};
  const taskFor=(id,student)=>{const task=db.prepare('SELECT * FROM practice_tasks WHERE id=? AND student_id=?').get(id,student.id);if(!task||Date.now()-task.created_at>86400000)return null;const a=assignment(task.assignment_id,student);if(!a||!skillsFor(a).includes(task.skill_index))return null;return task;};
  function record(task,event,correct,answer='',prompt=''){
    db.prepare('INSERT INTO attempts(assignment_id,student_id,task_index,event_type,correct,hint_stage,skill,step_index,phase,answer_text,prompt) VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(task.assignment_id,task.student_id,0,event,correct,task.hint_stage,catalog[JSON.parse(task.payload).topic].skills[JSON.parse(task.payload).level][task.skill_index],task.step_index,task.phase,String(answer).slice(0,500),String(prompt).slice(0,500));
  }
  function packet(task){
    const p=JSON.parse(task.payload),step=p.activeSteps[task.step_index];
    const result={id:task.id,title:p.title,instruction:p.instruction,formula:p.formula,phase:task.phase,skill:catalog[p.topic].skills[p.level][task.skill_index],stepIndex:task.step_index,stepCount:p.activeSteps.length,question:step.question,stepTitle:step.title,choices:step.options.map(x=>({id:x.id,text:x.text})),hintStage:task.hint_stage,passed:!!task.step_passed,completed:!!task.completed};
    if(task.phase==='guided'){result.rule=p.rule;result.sample=p.sample;}
    return result;
  }
  function overview(){
    return db.prepare('SELECT id,name,code FROM classes ORDER BY id DESC').all().map(c=>({
      ...c,students:db.prepare(`SELECT s.id,s.display_name,s.active,COUNT(p.id) works,COALESCE(SUM(p.status='completed'),0) completed,COALESCE(SUM(p.attempts_count),0) attempts,COALESCE(SUM(p.hints_used),0) hints,MAX(p.weak_skill) weak_skill,MAX(p.updated_at) last_activity,(SELECT COUNT(*) FROM assignments a WHERE a.class_id=s.class_id AND a.active=1 AND a.skills!='[]' AND (a.student_id IS NULL OR a.student_id=s.id)) assigned_works FROM students s LEFT JOIN progress p ON p.student_id=s.id WHERE s.class_id=? GROUP BY s.id ORDER BY s.display_name`).all(c.id),
      assignments:db.prepare('SELECT a.*,s.display_name target_name FROM assignments a LEFT JOIN students s ON s.id=a.student_id WHERE a.class_id=? ORDER BY a.id DESC').all(c.id).map(a=>({...a,skills:skillsFor(a)}))
    }));
  }
  return async function handle(req,res,url){
    const route=url.pathname,method=req.method;
    if(method==='GET'&&route==='/api/health'){json(res,200,{ok:true,personalAccess:true,role:sessionFor(req)?.role||null});return true;}
    if(method==='GET'&&route==='/api/teacher/catalog'){if(requireRole(req,res,'teacher'))json(res,200,{catalog});return true;}
    if(method==='GET'&&route==='/api/teacher/overview'){if(requireRole(req,res,'teacher'))json(res,200,{classes:overview()});return true;}
    let preview=route.match(/^\/api\/teacher\/assignments\/(\d+)\/worksheet$/);
    if(method==='GET'&&preview){
      if(!requireRole(req,res,'teacher'))return true;
      const a=db.prepare('SELECT a.*,s.display_name student_name FROM assignments a LEFT JOIN students s ON s.id=a.student_id WHERE a.id=?').get(Number(preview[1]));
      if(!a||!skillsFor(a).length){json(res,404,{error:'Назначение не найдено'});return true;}
      const keys=skillsFor(a),seed=crypto.randomInt(1000000),exercises=Array.from({length:a.task_count},(_,i)=>{const p=build(a.topic,a.level,keys[i%keys.length],seed+i);return {title:p.title,formula:p.formula,question:p.instruction+' Запиши ход решения и ответ.',steps:p.steps.map(x=>({title:x.title,answer:x.answer,why:x.why})),answer:p.finalStep.answer};});
      json(res,200,{title:a.title,student:a.student_name||'Весь класс',topic:catalog[a.topic].name,level:a.level,exercises});return true;
    }
    if(method==='POST'&&route==='/api/students'){
      if(!requireRole(req,res,'teacher'))return true;
      const body=await readJson(req),classId=Number(body.classId),name=String(body.name||'').trim();
      if(!db.prepare('SELECT id FROM classes WHERE id=?').get(classId)||name.length<2||name.length>80){json(res,400,{error:'Проверьте класс и имя ученика'});return true;}
      let id;try{id=Number(db.prepare('INSERT INTO students(class_id,display_name,name_key,pin_hash) VALUES(?,?,?,?)').run(classId,name,normalizeName(name),hashSecret(randomCode(20))).lastInsertRowid);}catch{json(res,409,{error:'Такой ученик уже есть в классе'});return true;}
      json(res,201,{id,name,code:codeFor(id)});return true;
    }
    let match=route.match(/^\/api\/students\/(\d+)\/access-code$/);
    if(method==='POST'&&match){if(!requireRole(req,res,'teacher'))return true;const id=Number(match[1]);if(!db.prepare('SELECT id FROM students WHERE id=?').get(id)){json(res,404,{error:'Ученик не найден'});return true;}json(res,200,{code:codeFor(id)});return true;}
    if(method==='POST'&&route==='/api/assignments'){
      if(!requireRole(req,res,'teacher'))return true;
      const b=await readJson(req),classId=Number(b.classId),studentId=b.studentId===null?null:Number(b.studentId),level=Number(b.level),topic=String(b.topic||''),title=String(b.title||'').trim(),skills=[...new Set(Array.isArray(b.skills)?b.skills:[])],count=Number(b.taskCount);
      const eligible=catalog[topic]?.skills[level];
      const explicitTarget=studentId===null?b.audience==='class':Number.isInteger(studentId)&&studentId>0;
      if(!explicitTarget||!db.prepare('SELECT id FROM classes WHERE id=?').get(classId)||title.length<3||title.length>120||!eligible||!skills.length||skills.some(x=>!Number.isInteger(x)||!eligible[x])||!Number.isInteger(count)||count<skills.length||count>20||(studentId&&!db.prepare('SELECT id FROM students WHERE id=? AND class_id=? AND active=1').get(studentId,classId))){json(res,400,{error:'Выберите ученика и навыки; примеров должно быть не меньше числа выбранных навыков'});return true;}
      const id=Number(db.prepare('INSERT INTO assignments(class_id,student_id,title,topic,level,skills,task_count,due_date) VALUES(?,?,?,?,?,?,?,?)').run(classId,studentId,title,topic,level,JSON.stringify(skills),count,b.dueDate||null).lastInsertRowid);
      json(res,201,{id});return true;
    }
    match=route.match(/^\/api\/assignments\/(\d+)\/revoke$/);
    if(method==='POST'&&match){if(requireRole(req,res,'teacher')){db.prepare('UPDATE assignments SET active=0 WHERE id=?').run(Number(match[1]));json(res,200,{ok:true});}return true;}
    match=route.match(/^\/api\/teacher\/students\/(\d+)\/attempts$/);
    if(method==='GET'&&match){if(requireRole(req,res,'teacher'))json(res,200,{attempts:db.prepare('SELECT a.*,w.title assignment_title FROM attempts a JOIN assignments w ON w.id=a.assignment_id WHERE a.student_id=? ORDER BY a.id DESC LIMIT 200').all(Number(match[1]))});return true;}
    if(method==='POST'&&route==='/api/student/login'){
      const b=await readJson(req),code=String(b.code||'').toUpperCase().replace(/[\s-]/g,'');
      if(rateLimited(req,'student',150)||rateLimited(req,'student:'+digest(code),8)){json(res,429,{error:'Слишком много попыток. Попробуйте позже.'});return true;}
      const student=/^[A-HJ-NP-Z2-9]{12}$/.test(code)?db.prepare('SELECT id FROM students WHERE access_code_hash=? AND active=1').get(digest(code)):null;
      if(!student){json(res,401,{error:'Код не найден. Проверь его у учителя.'});return true;}
      json(res,200,{ok:true},{'set-cookie':createSession(res,'student',student.id)});return true;
    }
    if(method==='GET'&&route==='/api/student/me'){
      const s=learner(req,res);if(!s)return true;
      const assignments=db.prepare(`SELECT a.*,COALESCE(p.status,'not_started') status,COALESCE(p.correct_count,0) correct_count FROM assignments a LEFT JOIN progress p ON p.assignment_id=a.id AND p.student_id=? WHERE a.class_id=? AND a.active=1 AND (a.student_id IS NULL OR a.student_id=?) ORDER BY a.id DESC`).all(s.id,s.class_id,s.id).filter(a=>skillsFor(a).length).map(a=>({id:a.id,title:a.title,topicName:catalog[a.topic].name,grade:catalog[a.topic].grade,level:a.level,taskCount:a.task_count,correctCount:a.correct_count,status:a.status,skills:skillsFor(a).map(i=>({id:i,name:catalog[a.topic].skills[a.level][i],completed:finishedFor(a,s.id,i),target:targetFor(a,i)}))}));
      json(res,200,{student:{id:s.id,name:s.display_name},assignments});return true;
    }
    if(method==='POST'&&route==='/api/student/progress'){const s=learner(req,res);if(s)json(res,405,{error:'Результат проверяется сервером через ответы на задания'});return true;}
    if(method==='POST'&&route==='/api/student/tasks'){
      const s=learner(req,res);if(!s)return true;const b=await readJson(req),a=assignment(Number(b.assignmentId),s),skill=Number(b.skillId),phase=b.phase==='independent'?'independent':'guided';
      if(!a||!skillsFor(a).includes(skill)||(b.topic!==undefined&&b.topic!==a.topic)||(b.level!==undefined&&Number(b.level)!==a.level)){json(res,403,{error:'Эта тема, уровень или навык не назначены'});return true;}
      if(finishedFor(a,s.id,skill)>=targetFor(a,skill)){json(res,409,{error:'Этот навык выполнен. Перейди к другому назначенному навыку.'});return true;}
      if(phase==='independent'&&!db.prepare("SELECT id FROM practice_tasks WHERE student_id=? AND assignment_id=? AND skill_index=? AND phase='guided' AND completed=1 LIMIT 1").get(s.id,a.id,skill)){json(res,409,{error:'Сначала пройди разбор этого навыка по шагам'});return true;}
      const progress=db.prepare('SELECT correct_count,status FROM progress WHERE assignment_id=? AND student_id=?').get(a.id,s.id);
      if(progress?.status==='completed'){json(res,409,{error:'Работа выполнена. Новую работу открывает учитель.'});return true;}
      const existing=db.prepare('SELECT * FROM practice_tasks WHERE student_id=? AND assignment_id=? AND skill_index=? AND phase=? AND completed=0 AND created_at>? ORDER BY created_at DESC LIMIT 1').get(s.id,a.id,skill,phase,Date.now()-86400000);
      if(existing){json(res,200,packet(existing));return true;}
      db.prepare(`INSERT INTO progress(assignment_id,student_id,status,started_at) VALUES(?,?,'in_progress',CURRENT_TIMESTAMP) ON CONFLICT(assignment_id,student_id) DO NOTHING`).run(a.id,s.id);
      let seed=crypto.randomInt(0,1000000),p=build(a.topic,a.level,skill,seed);
      const previous=db.prepare('SELECT payload FROM practice_tasks WHERE student_id=? AND assignment_id=? AND skill_index=? ORDER BY created_at DESC LIMIT 1').get(s.id,a.id,skill);
      const recent=previous?JSON.parse(previous.payload):null;
      for(let i=0;i<30&&recent&&(p.formula===recent.formula||p.formula===recent.sample?.formula);i++){seed++;p=build(a.topic,a.level,skill,seed);}
      let sample=build(a.topic,a.level,skill,seed+7);for(let i=0;i<30&&(sample.formula===p.formula||sample.formula===recent?.formula||sample.formula===recent?.sample?.formula);i++)sample=build(a.topic,a.level,skill,seed+8+i);
      p.topic=a.topic;p.level=a.level;p.activeSteps=phase==='independent'?[p.finalStep]:p.steps;
      p.activeSteps.forEach(step=>{step.options=step.choices.map(text=>({id:crypto.randomBytes(12).toString('hex'),text}));for(let i=step.options.length-1;i>0;i--){const j=crypto.randomInt(i+1);[step.options[i],step.options[j]]=[step.options[j],step.options[i]];}});
      p.sample={formula:sample.formula,steps:sample.steps.map(x=>({title:x.title,answer:x.answer,why:x.why})),...(sample.graph?{graph:sample.graph}:{})};
      const id=crypto.randomBytes(24).toString('base64url');db.prepare('INSERT INTO practice_tasks(id,student_id,assignment_id,skill_index,phase,payload,created_at) VALUES(?,?,?,?,?,?,?)').run(id,s.id,a.id,skill,phase,JSON.stringify(p),Date.now());
      json(res,201,packet(db.prepare('SELECT * FROM practice_tasks WHERE id=?').get(id)));return true;
    }
    match=route.match(/^\/api\/student\/tasks\/([\w-]+)\/(answer|hint|next)$/);
    if(method==='POST'&&match){
      const s=learner(req,res);if(!s)return true;const task=taskFor(match[1],s);if(!task){json(res,403,{error:'Задание недоступно или доступ отозван'});return true;}
      const p=JSON.parse(task.payload),step=p.activeSteps[task.step_index],action=match[2];
      if(action==='hint'){
        if(task.phase!=='guided'||task.step_passed||task.completed){json(res,409,{error:'Подсказка сейчас недоступна'});return true;}
        if(task.hint_stage>=3){json(res,200,{stage:3,text:'Все подсказки этого шага уже открыты.'});return true;}
        task.hint_stage++;db.prepare('UPDATE practice_tasks SET hint_stage=? WHERE id=?').run(task.hint_stage,task.id);record(task,'hint',null,'',step.question);
        db.prepare('UPDATE progress SET hints_used=hints_used+1,updated_at=CURRENT_TIMESTAMP WHERE assignment_id=? AND student_id=?').run(task.assignment_id,s.id);
        json(res,200,{stage:task.hint_stage,text:task.hint_stage===1?p.rule:task.hint_stage===2?step.why:'На этом шаге получается: '+step.answer});return true;
      }
      if(action==='answer'){
        if(task.step_passed||task.completed){json(res,409,{error:'Этот шаг уже проверен'});return true;}
        const b=await readJson(req),fresh=taskFor(task.id,s);
        if(!fresh||fresh.completed||fresh.step_passed||fresh.step_index!==task.step_index){json(res,409,{error:'Шаг уже изменился или был проверен'});return true;}
        const choice=step.options.find(x=>x.id===b.choiceId);if(!choice){json(res,400,{error:'Выберите предложенную запись'});return true;}
        const correct=choice.text===step.answer;record(task,'answer',correct?1:0,choice.text,step.question);
        const complete=correct&&task.step_index===p.activeSteps.length-1;
        db.prepare('UPDATE practice_tasks SET step_passed=?,completed=? WHERE id=?').run(correct?1:0,complete?1:0,task.id);
        const increment=complete&&task.phase==='independent'?1:0;
        const a=assignment(task.assignment_id,s),current=db.prepare('SELECT correct_count FROM progress WHERE assignment_id=? AND student_id=?').get(a.id,s.id),count=Math.min(a.task_count,current.correct_count+increment);
        const done=count>=a.task_count&&skillsFor(a).every(i=>finishedFor(a,s.id,i)>=targetFor(a,i));
        db.prepare(`UPDATE progress SET correct_count=?,attempts_count=attempts_count+1,status=?,weak_skill=CASE WHEN ?=0 THEN ? ELSE weak_skill END,completed_at=CASE WHEN ? THEN CURRENT_TIMESTAMP ELSE completed_at END,updated_at=CURRENT_TIMESTAMP WHERE assignment_id=? AND student_id=?`).run(count,done?'completed':correct?'in_progress':'needs_help',correct?1:0,catalog[a.topic].skills[a.level][task.skill_index],done?1:0,a.id,s.id);
        json(res,200,{correct,feedback:correct?'Верно. '+step.why:'Пока неверно. Проверь действие и знак; при необходимости вернись к разбору.',lastStep:complete,workCompleted:done,...(complete&&p.graph?{graph:p.graph}:{})});return true;
      }
      if(!task.step_passed){json(res,409,{error:'Сначала выполни текущий шаг'});return true;}
      if(task.completed){json(res,200,{finished:true,phase:task.phase});return true;}
      db.prepare('UPDATE practice_tasks SET step_index=step_index+1,hint_stage=0,step_passed=0 WHERE id=?').run(task.id);json(res,200,packet(db.prepare('SELECT * FROM practice_tasks WHERE id=?').get(task.id)));return true;
    }
    return false;
  };
};

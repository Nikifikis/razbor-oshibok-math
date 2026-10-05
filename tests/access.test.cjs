const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const directory=fs.mkdtempSync(path.join(os.tmpdir(),'razbor-access-test-'));
process.env.DATA_DIR=directory;process.env.NODE_ENV='test';process.env.ADMIN_USERNAME='test-teacher';const salt=crypto.randomBytes(16).toString('hex'),password=crypto.randomBytes(20).toString('hex');process.env.ADMIN_PASSWORD_HASH=salt+':'+crypto.scryptSync(password,salt,32).toString('hex');
const {server,db}=require('../server');
(async()=>{await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port;
  async function req(route,body,cookie){const response=await fetch(base+route,{...(body!==undefined?{method:'POST',body:JSON.stringify(body),headers:{'content-type':'application/json',...(cookie?{cookie}:{})}}:{headers:cookie?{cookie}:{}})});return {status:response.status,data:await response.json().catch(()=>null),cookie:response.headers.get('set-cookie')?.split(';')[0]};}
  try{
    const admin=await req('/api/teacher/login',{username:'test-teacher',password});assert.equal(admin.status,200);const teacher=admin.cookie;
    process.env.NODE_ENV='production';const loginBody=JSON.stringify({username:'test-teacher',password});assert.equal((await fetch(base+'/api/teacher/login',{method:'POST',headers:{'content-type':'application/json'},body:loginBody})).status,426);assert.equal((await fetch(base+'/api/teacher/login',{method:'POST',headers:{'content-type':'application/json','x-forwarded-proto':'https'},body:loginBody})).status,200);process.env.NODE_ENV='test';
    assert.equal((await req('/api/teacher/catalog')).status,401);
    const c=(await req('/api/classes',{name:'Тестовый класс'},teacher)).data;
    const one=(await req('/api/students',{classId:c.id,name:'Первый тестовый ученик'},teacher)).data;
    const two=(await req('/api/students',{classId:c.id,name:'Второй тестовый ученик'},teacher)).data;
    const a=(await req('/api/assignments',{classId:c.id,studentId:one.id,title:'Только один навык А1 2.0',topic:'fractions',level:2,skills:[0],taskCount:1},teacher)).data;
    const legacy=Number(db.prepare('INSERT INTO assignments(class_id,title,topic,level,task_count) VALUES(?,?,?,?,?)').run(c.id,'Старое назначение без ограничений','fractions',3,4).lastInsertRowid);
    const login1=await req('/api/student/login',{code:one.code}),login2=await req('/api/student/login',{code:two.code});assert.equal(login1.status,200);assert.equal(login2.status,200);const first=login1.cookie,second=login2.cookie;
    assert.equal((await req('/api/student/me',undefined,first)).data.assignments.length,1);assert.equal((await req('/api/student/me',undefined,second)).data.assignments.length,0);
    assert.equal((await req('/api/student/tasks',{assignmentId:a.id,skillId:0},second)).status,403);
    assert.equal((await req('/api/student/tasks',{assignmentId:a.id,skillId:1},first)).status,403);
    assert.equal((await req('/api/student/tasks',{assignmentId:a.id,skillId:0,level:3},first)).status,403);
    assert.equal((await req('/api/student/tasks',{assignmentId:a.id,skillId:0,topic:'fraction_sum'},first)).status,403);
    assert.equal((await req('/api/student/tasks',{assignmentId:legacy,skillId:0},first)).status,403);
    assert.equal((await req('/api/teacher/catalog',undefined,first)).status,401);
    assert.equal((await req('/api/teacher/assignments/'+a.id+'/worksheet',undefined,first)).status,401);
    assert.equal((await req('/api/teacher/assignments/'+a.id+'/worksheet',undefined,teacher)).data.exercises.length,1);
    assert.equal((await req('/api/student/progress',{assignmentId:a.id,correct:true},first)).status,405);
    assert.equal((await req('/api/student/tasks',{assignmentId:a.id,skillId:0,phase:'independent'},first)).status,409,'independent check requires the algorithmic steps first');
    assert.equal((await req('/training.js',undefined,first)).status,404);assert.equal((await req('/algebra8-content.js',undefined,first)).status,404);
    let task=(await req('/api/student/tasks',{assignmentId:a.id,skillId:0,phase:'guided'},first)).data;
    assert.ok(task.sample);assert.equal(task.answer,undefined);assert.equal(task.steps,undefined);assert.equal(task.result,undefined);
    assert.equal((await req('/api/student/tasks/'+task.id+'/next',{},first)).status,409);
    assert.equal((await req('/api/student/tasks/'+task.id+'/answer',{correct:true,answer:'верно'},first)).status,400);
    assert.equal((await req('/api/student/tasks/'+task.id+'/hint',{},second)).status,403);
    const formula=task.formula;
    while(true){const payload=JSON.parse(db.prepare('SELECT payload FROM practice_tasks WHERE id=?').get(task.id).payload),step=payload.activeSteps[task.stepIndex],choice=task.choices.find(x=>x.text===step.answer);const right=await req('/api/student/tasks/'+task.id+'/answer',{choiceId:choice.id},first);assert.equal(right.data.correct,true);const next=(await req('/api/student/tasks/'+task.id+'/next',{},first)).data;if(next.finished)break;task=next;}
    assert.equal((await req('/api/student/me',undefined,first)).data.assignments[0].correctCount,0,'guided steps are not completed independent examples');
    const independent=(await req('/api/student/tasks',{assignmentId:a.id,skillId:0,phase:'independent'},first)).data;assert.notEqual(independent.formula,formula);assert.equal(independent.sample,undefined);assert.equal(independent.rule,undefined);
    assert.equal((await req('/api/student/tasks/'+independent.id+'/hint',{},first)).status,409);
    const stored=JSON.parse(db.prepare('SELECT payload FROM practice_tasks WHERE id=?').get(independent.id).payload),option=independent.choices.find(x=>x.text===stored.activeSteps[0].answer);
    const race=await Promise.all([req('/api/student/tasks/'+independent.id+'/answer',{choiceId:option.id},first),req('/api/student/tasks/'+independent.id+'/answer',{choiceId:option.id},first)]);assert.ok(race.some(r=>r.status===200));assert.ok(race.some(r=>r.status===409));assert.equal((await req('/api/student/me',undefined,first)).data.assignments[0].correctCount,1);
    assert.equal((await req('/api/student/tasks',{assignmentId:a.id,skillId:0},first)).status,409);
    const log=(await req('/api/teacher/students/'+one.id+'/attempts',undefined,teacher)).data.attempts;assert.ok(log.some(x=>x.phase==='guided'&&x.prompt&&x.answer_text));assert.ok(log.some(x=>x.phase==='independent'));
    assert.equal((await req('/api/teacher/students/'+one.id+'/attempts',undefined,first)).status,401);
    assert.equal((await req('/api/assignments',{classId:c.id,studentId:one.id,title:'Два обязательных навыка',topic:'fractions',level:2,skills:[0,1],taskCount:1},teacher)).status,400);
    const both=(await req('/api/assignments',{classId:c.id,studentId:one.id,title:'Два обязательных навыка',topic:'fractions',level:2,skills:[0,1],taskCount:2},teacher)).data;
    async function completeSkill(id,skillId){for(const phase of ['guided','independent']){let t=(await req('/api/student/tasks',{assignmentId:id,skillId,phase},first)).data;while(true){const payload=JSON.parse(db.prepare('SELECT payload FROM practice_tasks WHERE id=?').get(t.id).payload),right=t.choices.find(x=>x.text===payload.activeSteps[t.stepIndex].answer);assert.equal((await req('/api/student/tasks/'+t.id+'/answer',{choiceId:right.id},first)).data.correct,true);const next=(await req('/api/student/tasks/'+t.id+'/next',{},first)).data;if(next.finished)break;t=next;}}}
    await completeSkill(both.id,0);let pair=(await req('/api/student/me',undefined,first)).data.assignments.find(x=>x.id===both.id);assert.notEqual(pair.status,'completed');assert.equal(pair.skills[0].completed,1);assert.equal(pair.skills[1].completed,0);assert.equal((await req('/api/student/tasks',{assignmentId:both.id,skillId:0},first)).status,409);
    await completeSkill(both.id,1);pair=(await req('/api/student/me',undefined,first)).data.assignments.find(x=>x.id===both.id);assert.equal(pair.status,'completed');
    await req('/api/assignments/'+a.id+'/revoke',{},teacher);assert.equal((await req('/api/student/me',undefined,first)).data.assignments.some(x=>x.id===a.id),false);assert.equal((await req('/api/student/tasks/'+task.id+'/hint',{},first)).status,403);
    const replacement=await req('/api/students/'+one.id+'/access-code',{},teacher);assert.equal((await req('/api/student/me',undefined,first)).status,401);assert.equal((await req('/api/student/login',{code:one.code})).status,401);assert.equal((await req('/api/student/login',{code:replacement.data.code})).status,200);
    console.log('Access tests passed: personal code, individual assignment, skill/level isolation, server grading, race protection, revocation and teacher step log.');
  }finally{await new Promise(resolve=>server.close(resolve));db.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});

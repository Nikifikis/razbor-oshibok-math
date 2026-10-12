const crypto=require('node:crypto');

module.exports=function createSharedResults({db,json,readJson,catalog,rateLimited}){
  db.exec(`
    CREATE TABLE IF NOT EXISTS shared_assignments(
      id TEXT PRIMARY KEY,
      teacher_key_hash TEXT NOT NULL,
      student_key_hash TEXT NOT NULL,
      student_name TEXT NOT NULL,
      grade INTEGER NOT NULL,
      topic TEXT NOT NULL,
      level INTEGER NOT NULL,
      task_count INTEGER NOT NULL,
      seed INTEGER NOT NULL,
      skill_index INTEGER,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS shared_results(
      assignment_id TEXT PRIMARY KEY REFERENCES shared_assignments(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'not_started',
      test_correct INTEGER NOT NULL DEFAULT 0,
      test_total INTEGER NOT NULL DEFAULT 0,
      wrong_skills TEXT NOT NULL DEFAULT '[]',
      completed_skills TEXT NOT NULL DEFAULT '[]',
      repeats INTEGER NOT NULL DEFAULT 0,
      started_at TEXT,
      completed_at TEXT,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS shared_events(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      assignment_id TEXT NOT NULL REFERENCES shared_assignments(id) ON DELETE CASCADE,
      event_type TEXT NOT NULL,
      task_index INTEGER,
      skill_index INTEGER,
      correct INTEGER,
      answer_text TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_shared_events_assignment ON shared_events(assignment_id,id);
  `);
  const digest=value=>crypto.createHash('sha256').update(String(value||'')).digest('hex');
  const token=()=>crypto.randomBytes(24).toString('base64url');
  const cleanArray=value=>[...new Set(Array.isArray(value)?value.filter(Number.isInteger):[])].slice(0,20);
  const assignment=id=>db.prepare('SELECT * FROM shared_assignments WHERE id=?').get(id);
  const validKey=(provided,expected)=>{
    const actual=Buffer.from(digest(provided),'hex'),stored=Buffer.from(String(expected||''),'hex');
    return actual.length===stored.length&&crypto.timingSafeEqual(actual,stored);
  };
  const publicAssignment=row=>({id:row.id,student:row.student_name,grade:row.grade,topic:row.topic,topicName:catalog[row.topic]?.name||row.topic,level:row.level,count:row.task_count,seed:row.seed,skill:row.skill_index,createdAt:row.created_at,updatedAt:row.updated_at});
  return async function handle(req,res,url){
    const route=url.pathname,method=req.method;
    if(method==='POST'&&route==='/api/shared/assignments'){
      if(rateLimited(req,'shared-create',80))return json(res,429,{error:'Слишком много новых ссылок. Попробуйте позже.'}),true;
      const b=await readJson(req),student=String(b.student||'').trim().slice(0,80),grade=Number(b.grade),topic=String(b.topic||''),level=Number(b.level),count=Number(b.count),seed=Number(b.seed),skill=b.skill===null||b.skill===''||b.skill===undefined?null:Number(b.skill),skills=catalog[topic]?.skills[level];
      if(!student||catalog[topic]?.grade!==grade||!skills||!Number.isInteger(count)||count<3||count>10||!Number.isInteger(seed)||seed<0||seed>99999999||(skill!==null&&(!Number.isInteger(skill)||!skills[skill])))return json(res,400,{error:'Проверьте параметры задания'}),true;
      const id=crypto.randomBytes(12).toString('base64url'),teacherKey=token(),studentKey=token();
      db.prepare('INSERT INTO shared_assignments(id,teacher_key_hash,student_key_hash,student_name,grade,topic,level,task_count,seed,skill_index) VALUES(?,?,?,?,?,?,?,?,?,?)').run(id,digest(teacherKey),digest(studentKey),student,grade,topic,level,count,seed,skill);
      db.prepare('INSERT INTO shared_results(assignment_id) VALUES(?)').run(id);
      json(res,201,{assignmentId:id,teacherKey,studentKey});return true;
    }
    let match=route.match(/^\/api\/shared\/assignments\/([\w-]+)$/);
    if(method==='GET'&&match){
      const row=assignment(match[1]);
      if(!row||!validKey(req.headers['x-teacher-key'],row.teacher_key_hash))return json(res,404,{error:'Результат не найден'}),true;
      const result=db.prepare('SELECT * FROM shared_results WHERE assignment_id=?').get(row.id);
      const events=db.prepare("SELECT event_type,task_index,skill_index,correct,answer_text,created_at FROM shared_events WHERE assignment_id=? AND (event_type!='test_answer' OR correct=0) ORDER BY id DESC LIMIT 80").all(row.id);
      json(res,200,{assignment:publicAssignment(row),result:{status:result.status,testCorrect:result.test_correct,testTotal:result.test_total,wrongSkills:JSON.parse(result.wrong_skills),completedSkills:JSON.parse(result.completed_skills),repeats:result.repeats,startedAt:result.started_at,completedAt:result.completed_at,updatedAt:result.updated_at},mistakes:events.filter(x=>x.event_type==='test_answer'&&x.correct===0)});return true;
    }
    match=route.match(/^\/api\/shared\/assignments\/([\w-]+)\/events$/);
    if(method==='POST'&&match){
      const row=assignment(match[1]);
      if(!row||!validKey(req.headers['x-student-key'],row.student_key_hash))return json(res,403,{error:'Ссылка на задание недействительна'}),true;
      const b=await readJson(req),type=String(b.type||''),allowed=new Set(['started','test_answer','test_completed','fix_started','skill_completed','work_completed','repeat_started']);
      if(!allowed.has(type))return json(res,400,{error:'Неизвестное событие'}),true;
      const payload=b.payload&&typeof b.payload==='object'?b.payload:{},taskIndex=Number.isInteger(payload.taskIndex)?payload.taskIndex:null,skillIndex=Number.isInteger(payload.skill)?payload.skill:null,correct=typeof payload.correct==='boolean'?(payload.correct?1:0):null,answer=String(payload.answer||'').slice(0,500);
      if(skillIndex!==null&&!catalog[row.topic]?.skills[row.level]?.[skillIndex])return json(res,400,{error:'Неизвестный навык'}),true;
      if(type==='test_answer'&&(taskIndex===null||skillIndex===null||correct===null))return json(res,400,{error:'Неполные данные ответа'}),true;
      if(type==='skill_completed'&&skillIndex===null)return json(res,400,{error:'Не указан навык'}),true;
      db.prepare('INSERT INTO shared_events(assignment_id,event_type,task_index,skill_index,correct,answer_text) VALUES(?,?,?,?,?,?)').run(row.id,type,taskIndex,skillIndex,correct,answer);
      if(type==='started')db.prepare("UPDATE shared_results SET status=CASE WHEN status='not_started' THEN 'started' ELSE status END,started_at=COALESCE(started_at,CURRENT_TIMESTAMP),updated_at=CURRENT_TIMESTAMP WHERE assignment_id=?").run(row.id);
      if(type==='test_completed'){
        const total=Number(payload.total),score=Number(payload.correct),wrong=cleanArray(payload.wrongSkills).filter(x=>catalog[row.topic]?.skills[row.level]?.[x]);
        if(Number.isInteger(total)&&total>=1&&total<=20&&Number.isInteger(score)&&score>=0&&score<=total)db.prepare("UPDATE shared_results SET status=?,test_correct=?,test_total=?,wrong_skills=?,completed_at=CASE WHEN ? THEN CURRENT_TIMESTAMP ELSE completed_at END,updated_at=CURRENT_TIMESTAMP WHERE assignment_id=?").run(wrong.length?'needs_work':'completed',score,total,JSON.stringify(wrong),wrong.length?0:1,row.id);
      }
      if(type==='fix_started')db.prepare("UPDATE shared_results SET status='working_on_errors',updated_at=CURRENT_TIMESTAMP WHERE assignment_id=?").run(row.id);
      if(type==='skill_completed'){
        const current=db.prepare('SELECT completed_skills FROM shared_results WHERE assignment_id=?').get(row.id),done=cleanArray([...JSON.parse(current.completed_skills),skillIndex]);
        db.prepare('UPDATE shared_results SET completed_skills=?,updated_at=CURRENT_TIMESTAMP WHERE assignment_id=?').run(JSON.stringify(done),row.id);
      }
      if(type==='work_completed')db.prepare("UPDATE shared_results SET status='remediated',completed_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE assignment_id=?").run(row.id);
      if(type==='repeat_started')db.prepare("UPDATE shared_results SET repeats=repeats+1,status='started',updated_at=CURRENT_TIMESTAMP WHERE assignment_id=?").run(row.id);
      db.prepare('UPDATE shared_assignments SET updated_at=CURRENT_TIMESTAMP WHERE id=?').run(row.id);
      json(res,200,{ok:true});return true;
    }
    return false;
  };
};

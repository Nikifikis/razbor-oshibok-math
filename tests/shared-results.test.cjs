const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const directory=fs.mkdtempSync(path.join(os.tmpdir(),'razbor-shared-test-'));
process.env.DATA_DIR=directory;process.env.NODE_ENV='test';
const {server,db}=require('../server');
(async()=>{await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port;
  async function request(route,{method='GET',body,headers={}}={}){const response=await fetch(base+route,{method,headers:{...(body?{'content-type':'application/json'}:{}),...headers},...(body?{body:JSON.stringify(body)}:{})});return {status:response.status,data:await response.json().catch(()=>null)}}
  try{
    const created=await request('/api/shared/assignments',{method:'POST',body:{student:'Иван',grade:7,topic:'numeric',level:2,count:4,seed:1234,skill:null}});assert.equal(created.status,201);const {assignmentId,teacherKey,studentKey}=created.data;
    assert.equal((await request('/api/shared/assignments/'+assignmentId)).status,404);
    assert.equal((await request('/api/shared/assignments/'+assignmentId,{headers:{'x-teacher-key':'wrong'}})).status,404);
    assert.equal((await request('/api/shared/assignments/'+assignmentId+'/events',{method:'POST',headers:{'x-student-key':'wrong'},body:{type:'started'}})).status,403);
    assert.equal((await request('/api/shared/assignments/'+assignmentId+'/events',{method:'POST',headers:{'x-student-key':studentKey},body:{type:'test_answer',payload:{taskIndex:0,skill:1,correct:false,answer:'ошибочный ответ'}}})).status,200);
    await request('/api/shared/assignments/'+assignmentId+'/events',{method:'POST',headers:{'x-student-key':studentKey},body:{type:'test_completed',payload:{correct:3,total:4,wrongSkills:[1]}}});
    let journal=(await request('/api/shared/assignments/'+assignmentId,{headers:{'x-teacher-key':teacherKey}})).data;assert.equal(journal.result.status,'needs_work');assert.equal(journal.result.testCorrect,3);assert.deepEqual(journal.result.wrongSkills,[1]);assert.equal(journal.mistakes[0].answer_text,'ошибочный ответ');
    assert.equal((await request('/api/shared/assignments/'+assignmentId+'/events',{method:'POST',headers:{'x-student-key':studentKey},body:{type:'skill_completed',payload:{}}})).status,400);
    await request('/api/shared/assignments/'+assignmentId+'/events',{method:'POST',headers:{'x-student-key':studentKey},body:{type:'fix_started'}});
    await request('/api/shared/assignments/'+assignmentId+'/events',{method:'POST',headers:{'x-student-key':studentKey},body:{type:'skill_completed',payload:{skill:1}}});
    await request('/api/shared/assignments/'+assignmentId+'/events',{method:'POST',headers:{'x-student-key':studentKey},body:{type:'work_completed'}});
    journal=(await request('/api/shared/assignments/'+assignmentId,{headers:{'x-teacher-key':teacherKey}})).data;assert.equal(journal.result.status,'remediated');assert.deepEqual(journal.result.completedSkills,[1]);
    assert.equal((await request('/api/shared/assignments',{method:'POST',body:{student:'Иван',grade:7,topic:'numeric',level:2,count:4,seed:2,skill:99}})).status,400);
    const focused=await request('/api/shared/assignments',{method:'POST',body:{student:'Иван',grade:7,topic:'numeric',level:2,count:3,seed:99,skill:2}});assert.equal(focused.status,201);
    for(const topic of ['geometry_angles','geometry_triangles']){
      const geometry=await request('/api/shared/assignments',{method:'POST',body:{student:'Проверка',grade:7,topic,level:2,count:3,seed:2026,skill:null}});
      assert.equal(geometry.status,201,`Отслеживаемая ссылка должна создаваться для ${topic}`);
    }
    console.log('Shared result tracking tests passed.');
  }finally{await new Promise(resolve=>server.close(resolve));db.close();fs.rmSync(directory,{recursive:true,force:true})}
})().catch(error=>{console.error(error);process.exitCode=1});

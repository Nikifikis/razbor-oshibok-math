const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
const c=vm.createContext({});vm.runInContext(fs.readFileSync(require('node:path').join(__dirname,'..','algebra8-content.js'),'utf8'),c);
function calc(expr,vars){
  let s=expr.replace(/[−–]/g,'-').replace(/²/g,'^2').replace(/³/g,'^3').replace(/\s+/g,'');
  s=s.replace(/(\d)([a-z(])/g,'$1*$2').replace(/([a-z)])\(/g,'$1*(').replace(/\)([a-z\d])/g,')*$1');
  for(let i=0;i<3;i++)s=s.replace(/([a-z])([a-z])/g,'$1*$2');
  s=s.replace(/\^/g,'**');
  assert.match(s,/^[a-z0-9+*/().\-]+$/);
  return Function(...Object.keys(vars),'return ('+s+')')(...Object.values(vars));
}
let count=0;
for(const topic of ['fractions','fraction_sum'])for(const level of [2,3]){
  const skills=vm.runInContext('GRADE8_TOPICS.'+topic+'.tasks['+level+'].length',c);
  for(let skill=0;skill<skills;skill++)for(let seed=0;seed<15;seed++){
    const p=c.g8Build(topic,level,skill,seed);
    for(const s of [...p.steps,p.finalStep]){assert.ok(s.choices.includes(s.answers[0]));assert.ok(new Set(s.choices).size>=2);assert.equal(s.hints.length,3);}
    for(let sample=0;sample<10;sample++){
      const vars={a:1.31+sample,b:2.83+sample,x:1.73+sample,y:3.21+sample,m:2.13+sample,n:4.47+sample,k:1.63+sample,d:5.18+sample,p:1.44+sample};
      if(p.original){const original=calc(p.original,vars);const answer=p.graph?p.graph.slope*vars.x+p.graph.intercept:calc(p.result,vars);assert.ok(Math.abs(original-answer)<1e-7*Math.max(1,Math.abs(original)),p.title+' seed '+seed+' got '+original+' vs '+answer);}
      if(p.result.includes(' и ')){const old=p.text.split(' и '),next=p.result.split(' и ');old.forEach((expr,i)=>assert.ok(Math.abs(calc(expr,vars)-calc(next[i],vars))<1e-7,p.title+' paired fractions'));}
      if(topic==='fractions'&&level===2&&skill===5){const old=p.text.split(' → ')[0];assert.ok(Math.abs(calc(old,vars)-calc(p.result,vars))<1e-7);}
      if(p.graph)assert.ok(!Number.isFinite(calc(p.original,{...vars,x:p.graph.holeX})),'graph must retain the excluded point');
      if(topic==='fractions'&&level===2&&skill===1){const root=Number(p.result.replace('x = ','').replace('−','-'));assert.ok(Math.abs(calc(p.text,{...vars,x:root}))<1e-9,'zero fraction root');}
      if(topic==='fractions'&&level===3&&skill===1){const root=Number(p.result.replace('x = ','').replace('−','-'));assert.ok(Math.abs(calc(p.text.split(' = ')[0],{...vars,x:root}))<1e-9,'rational zero equation');}
      if(topic==='fraction_sum'&&level===3&&skill===3){const [left,right]=p.text.split(' = '),root=Number(p.result.replace('x = ',''));assert.ok(Math.abs(calc(left,{...vars,x:root})-calc(right,{...vars,x:root}))<1e-9,'rational equation root');}
      if(topic==='fractions'&&level===3&&skill===2&&seed%2){const [left,right]=p.text.split(' = ');assert.ok(Math.abs(calc(left,vars)-Number(right))<1e-9,'identity on its domain');}
    }
    count++;
  }
}
console.log('Passed: '+count+' generated tasks, choice/hint structure and 10 independent numerical equivalence checks per algebraic transformation.');


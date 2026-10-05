const assert=require('node:assert/strict');
const {catalog,build}=require('../training');
function calc(expr,vars){let s=expr.replace(/[−–]/g,'-').replace(/²/g,'^2').replace(/³/g,'^3').replace(/\s+/g,'');s=s.replace(/(\d)([a-zA-Z(])/g,'$1*$2').replace(/([a-zA-Z)])\(/g,'$1*(').replace(/\)([a-zA-Z\d])/g,')*$1');for(let i=0;i<3;i++)s=s.replace(/([a-zA-Z])([a-zA-Z])/g,'$1*$2');s=s.replace(/\^/g,'**');assert.match(s,/^[a-zA-Z0-9+*/().\-]+$/);return Function(...Object.keys(vars),'return ('+s+')')(...Object.values(vars));}
function fractions(html){return [...html.matchAll(/<span class="fraction"><span>(.*?)<\/span><span>(.*?)<\/span><\/span>/g)].map(m=>[m[1],m[2]].map(s=>s.replace(/<sup>(\d+)<\/sup>/g,'^$1')));}
let total=0;
for(const [topic,c] of Object.entries(catalog))for(const level of [2,3])for(let skill=0;skill<c.skills[level].length;skill++)for(let seed=0;seed<30;seed++){
  const p=build(topic,level,skill,seed);assert.ok(p.formula&&p.rule&&p.steps.length>=3);for(const s of [...p.steps,p.finalStep]){assert.ok(s.choices.includes(s.answer));assert.ok(s.choices.length>=2);assert.ok(s.why);}
  const fs=fractions(p.formula);
  for(let i=0;i<10;i++){
    const vars={x:1.73+i,y:3.21+i,a:1.31+i,b:2.83+i,m:2.13+i,n:4.47+i,u:2.16+i};
    if(p.expression){const value=calc(p.expression,vars),answer=p.graph?p.graph.slope*vars.x+p.graph.intercept:calc(p.result,vars);assert.ok(Math.abs(value-answer)<1e-7*Math.max(1,Math.abs(value)),topic+'/'+level+'/'+skill+' '+seed);}
    if(p.graph&&p.graph.holeX!==null&&p.expression)assert.ok(!Number.isFinite(calc(p.expression,{...vars,x:p.graph.holeX})));
    if(topic==='fractions'&&level===2&&skill===1){const x=Number(p.result.replace('x = ',''));assert.equal(calc(fs[0][0],{...vars,x}),0);assert.notEqual(calc(fs[0][1],{...vars,x}),0);}
    if(topic==='fractions'&&level===2&&skill===4){p.result.split('; ').forEach((result,j)=>assert.ok(Math.abs(calc(result,vars)-calc('('+fs[j][0]+')/('+fs[j][1]+')',vars))<1e-8));}
    if(topic==='fractions'&&level===2&&skill===5){const N=calc(p.result.replace('N = ',''),vars);assert.ok(Math.abs(calc('('+fs[0][0]+')/('+fs[0][1]+')',vars)-calc('N/('+fs[1][1]+')',{...vars,N}))<1e-8);}
    if(topic==='fractions'&&level===3&&skill===1){const x=calc(p.result.replace('x = ',''),vars);assert.ok(Math.abs(calc(fs[0][0],{...vars,x}))<1e-8);assert.notEqual(calc(fs[0][1],{...vars,x}),0);}
    if(topic==='fraction_sum'&&level===3&&skill===3){for(const root of p.result.matchAll(/x = (\d+)/g)){const x=Number(root[1]);assert.ok(Math.abs(calc('('+fs[0][0]+')/('+fs[0][1]+')',{...vars,x})-calc('('+fs[1][0]+')/('+fs[1][1]+')',{...vars,x}))<1e-8);}}
  }
  total++;
}
console.log('Validated '+total+' practice variants, choices, algebraic transformations and admissible roots.');

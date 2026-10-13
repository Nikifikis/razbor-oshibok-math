const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const qrcode=require('../qrcode-generator');

const root=path.join(__dirname,'..');
const html=fs.readFileSync(path.join(root,'teacher.html'),'utf8');
const script=fs.readFileSync(path.join(root,'teacher-static.js'),'utf8');
assert.match(html,/id="shareCard"/);
assert.match(html,/qrcode-generator\.js\?v=1\.4\.4/);
assert.match(script,/form\.onsubmit=async/);
assert.match(script,/createTrackedLink\(current[^\n]+true\)/);
assert.match(script,/showShareCard\(url\.href\)/);

const url='https://nikita-math.ru/razbor/assigned.html?student=%D0%98%D0%B2%D0%B0%D0%BD&grade=8&topic=parallelogram&level=3&count=10&seed=50130&assignment=1234567890abcdef&access=abcdef1234567890';
const qr=qrcode(0,'M');qr.addData(url,'Byte');qr.make();
const svg=qr.createSvgTag({cellSize:5,margin:10,scalable:true,title:{text:'QR-код варианта ученика'}});
assert.match(svg,/^<svg/);
assert.match(svg,/viewBox=/);
assert.match(svg,/<title[^>]*>QR-код варианта ученика<\/title>/);
assert.ok(qr.getModuleCount()>21,'long assignment URL should select a larger QR version');
console.log('Teacher share flow and local QR generation tests passed.');

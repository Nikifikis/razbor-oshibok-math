const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.join(__dirname,'..');
const serverExport='module.exports={catalog,build:assignedPractice,escape,math,frac};';
const browserExport='window.RAZBOR_TRAINING={catalog,build:assignedPractice,escape,math,frac};';
const source=fs.readFileSync(path.join(root,'training.js'),'utf8');
const browser=fs.readFileSync(path.join(root,'training-browser.js'),'utf8');
assert.equal(browser,source.replace(serverExport,browserExport),'training-browser.js must be regenerated from training.js');
console.log('Browser training bundle matches the server source.');

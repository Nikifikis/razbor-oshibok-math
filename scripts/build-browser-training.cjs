const fs=require('node:fs');
const path=require('node:path');

const root=path.join(__dirname,'..');
const source=fs.readFileSync(path.join(root,'training.js'),'utf8');
const serverExport='module.exports={catalog,build:assignedPractice,escape,math,frac};';
const browserExport='window.RAZBOR_TRAINING={catalog,build:assignedPractice,escape,math,frac};';
if(!source.includes(serverExport))throw new Error('training.js export marker not found');
fs.writeFileSync(path.join(root,'training-browser.js'),source.replace(serverExport,browserExport));

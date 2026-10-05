const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),envFile=path.join(root,'.env'),accessFile=path.join(root,'teacher-access.txt');
if(fs.existsSync(envFile)||fs.existsSync(accessFile))throw Error('Настройки уже существуют. Скрипт не перезаписывает пароль или доступ.');
const password=crypto.randomBytes(24).toString('base64url'),salt=crypto.randomBytes(16).toString('hex');
const hash=salt+':'+crypto.scryptSync(password,salt,32).toString('hex');
fs.writeFileSync(envFile,'ADMIN_USERNAME=teacher\nADMIN_PASSWORD_HASH='+hash+'\nPORT=3000\nDATA_DIR=/app/data\n',{flag:'wx',mode:0o600});
fs.writeFileSync(accessFile,'Логин учителя: teacher\nПароль: '+password+'\nНе передавайте ученикам. Файл имеет права 600.\n',{flag:'wx',mode:0o600});
console.log('Созданы .env и закрытый файл teacher-access.txt. Пароль не выводится в журнал.');

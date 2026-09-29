import {randomBytes,scryptSync} from 'node:crypto';

if(!process.stdin.isTTY)throw new Error('Run this script in an interactive terminal.');
process.stdout.write('Choose an admin password: ');
process.stdin.setRawMode(true);
let password='';
process.stdin.on('data',chunk=>{
  for(const key of String(chunk)){
  if(key==='\r'||key==='\n'){
    process.stdin.setRawMode(false);process.stdin.pause();process.stdout.write('\n');
    if(password.length<12)throw new Error('Use at least 12 characters.');
    const salt=randomBytes(16).toString('hex');
    process.stdout.write(`CHAKAR_ADMIN_PASSWORD_HASH=${salt}:${scryptSync(password,salt,32).toString('hex')}\n`);
    process.stdout.write(`CHAKAR_SESSION_SECRET=${randomBytes(32).toString('hex')}\n`);
    return;
  }
  if(key==='\u0003'){process.stdin.setRawMode(false);process.exit(130);}
  if(key==='\u007f'||key==='\b'){password=password.slice(0,-1);continue;}
  password+=key;
  }
});

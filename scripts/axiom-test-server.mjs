// Isolated build preview only. Does not edit, copy or disclose production env.
import { readFileSync,openSync,writeFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { spawn } from 'node:child_process';
const env=parseEnv(readFileSync('/home/builder/command-central/.env.local','utf8'));
const log=openSync('/tmp/axiom-live-server.log','a',0o600);
const child=spawn(process.execPath,['node_modules/next/dist/bin/next','start','-H','127.0.0.1','-p','3101'],{
 cwd:'/home/builder/command-central-axiom',env:{...process.env,...env,APP_AUTH_MODE:'trusted-network',APP_ALLOWED_ORIGINS:'http://127.0.0.1:3101'},stdio:['ignore',log,log],detached:true
});
writeFileSync('/tmp/axiom-live-server.pid',String(child.pid),{mode:0o600});
child.unref();
console.log('Isolated loopback preview started.');

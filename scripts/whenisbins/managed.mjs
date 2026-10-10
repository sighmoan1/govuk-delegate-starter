// A stable, checkout-specific process-group owner; Next.js may rename its own process.
import {spawn} from 'node:child_process';
const [, , name, ...args]=process.argv;
if(!name||!args.length)throw Error('Managed process requires a name and Node arguments');
const child=spawn(process.execPath,args,{stdio:'inherit',env:process.env});
child.on('error',error=>{console.error(error.message);process.exitCode=1;});
child.on('exit',code=>process.exit(code??1));

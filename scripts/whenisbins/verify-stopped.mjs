import {createConnection} from 'node:net';
for(const port of [5700,5701,5702,5703,5710])await new Promise((resolve,reject)=>{const socket=createConnection({host:'127.0.0.1',port});socket.once('connect',()=>{socket.destroy();reject(Error(`Managed demo port ${port} is still open`));});socket.once('error',error=>{if(error.code==='ECONNREFUSED')resolve();else reject(error);});socket.setTimeout(1000,()=>{socket.destroy();reject(Error(`Could not verify closed port ${port}`));});});
console.log('All five managed application ports are closed.');

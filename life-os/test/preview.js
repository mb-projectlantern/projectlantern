// Loopback-only development adapter. Uses real Worker handler and persistent SQLite.
// No production credentials; never expose this process through a tunnel.
import { createServer } from 'node:http';
import { mkdirSync } from 'node:fs';
import worker from '../worker.js';
import { database } from './database.js';
import { synthetic } from '../synthetic.js';
mkdirSync('test-output',{recursive:true});
const env={DB:database('test-output/preview.sqlite'),DASHBOARD_USER:'preview',DASHBOARD_PASSWORD:'local-preview-password-only',INGEST_TOKEN:'local-preview-ingest-token-only-32'};
const fixture={...synthetic(),external_id:'local-preview-synthetic'};
await worker.fetch(new Request('http://127.0.0.1/life-os/api/results',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+env.INGEST_TOKEN},body:JSON.stringify(fixture)}),env);
createServer(async(req,res)=>{
  try {
    const url=new URL(req.url,'http://127.0.0.1:8787');
    const request=new Request(url,{method:req.method,headers:req.headers,...(!['GET','HEAD'].includes(req.method)?{body:req,duplex:'half'}:{})});
    const response=await worker.fetch(request,env);
    res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
  } catch { res.writeHead(500);res.end('Local adapter failure'); }
}).listen(8787,'127.0.0.1',()=>console.log('Local synthetic preview: http://127.0.0.1:8787/life-os/ (user preview, password local-preview-password-only)'));

import {createServer} from 'node:http';
import {fileURLToPath} from 'node:url';
import {serveSearch} from './index.mjs';
const MAX_BODY_BYTES=3500;
async function getBody(req) {
  const chunks=[]; let bytes=0;
  for await (const chunk of req) {
    bytes+=chunk.byteLength;
    if (bytes>MAX_BODY_BYTES) {
      const error=new Error('Request body too large');
      error.status=413; throw error;
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}
export function createFlightServer(env=process.env) {
  return createServer(async(req,res)=>{
    try {
      const url=new URL(req.url||'/', 'http://localhost');
      const method=req.method||'GET';
      const body=['GET','HEAD','OPTIONS'].includes(method)?undefined:await getBody(req);
      const headers=new Headers();
      for(const [key,value] of Object.entries(req.headers)) {
        if(typeof value==='string') headers.set(key,value);
        else if(Array.isArray(value)) headers.set(key,value.join(', '));
      }
      const request=new Request(url.toString(),{method,headers,...(body!==undefined?{body,duplex:'half'}:{})});
      const response=await serveSearch(request,env);
      res.statusCode=response.status;
      response.headers.forEach((value,key)=>res.setHeader(key,value));
      res.end(await response.text());
    } catch(e) {
      res.statusCode=Number(e?.status)||500;
      res.setHeader('content-type','application/json; charset=utf-8');
      res.setHeader('cache-control','no-store');
      res.end(JSON.stringify({error:res.statusCode===413?'Request body too large':'Unexpected API error'}));
    }
  });
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]) {
  const port=Number(process.env.PORT||3000);
  createFlightServer().listen(port,'0.0.0.0',()=>{
    console.log('La Dolce Vita flight API listening on port',port);
  });
}

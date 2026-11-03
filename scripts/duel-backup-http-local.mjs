// Reuse pinned LOCAL images, pointing new Auth/PostgREST at a disposable restored
// DB. Bind only loopback. Existing services and their database are never replaced.
import {spawnSync} from 'node:child_process';import {createServer,request as httpRequest} from 'node:http';
import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';
export async function startBackupHttp(database){
 assert.match(database,/^jungle65_drain_final_[a-f0-9]{8}$/);
 const tag=randomUUID().slice(0,8),owned=[],api='http://127.0.0.1:55520';
 const docker=args=>{const r=spawnSync('docker',args,{encoding:'utf8',windowsHide:true,maxBuffer:4*1024*1024});assert.equal(r.status,0,'LOCAL_HTTP_CONTAINER_COMMAND_FAILED (values withheld)');return r.stdout;};
 const inspect=role=>JSON.parse(docker(['inspect','supabase_'+role+'_wiki-next-goal-release-20261029']))[0];
 const envOf=d=>Object.fromEntries(d.Config.Env.map(s=>[s.slice(0,s.indexOf('=')),s.slice(s.indexOf('=')+1)]));
 const rest=inspect('rest'),auth=inspect('auth'),realtime=inspect('realtime');
 const config={ANON_KEY:'',SERVICE_ROLE_KEY:''};
 const cli=spawnSync(process.execPath,['node_modules/supabase/dist/supabase.js','status','--workdir','C:/Project/wiki-jungle65/.temp/next-goal-20261014/jungle65-release-20261102/project','--output','json'],{encoding:'utf8',windowsHide:true});
 assert.equal(cli.status,0,'LOCAL_STATUS_FAILED');const status=JSON.parse(cli.stdout);assert.equal(status.API_URL,'http://127.0.0.1:55421');Object.assign(config,{ANON_KEY:status.ANON_KEY,SERVICE_ROLE_KEY:status.SERVICE_ROLE_KEY});
 const sockets=new Set();
 async function stop(){for(const s of sockets)s.destroy();if(server){server.closeAllConnections();await new Promise(r=>server.close(r));}for(const name of owned){assert.match(name,/^jungle65_backup_(rest|auth|realtime)_[a-f0-9]{8}$/);docker(['rm','-f',name]);}}
 let server;
 try{
  // Managed backups omit this LOCAL platform schema; no app rows are changed.
  const platform=spawnSync('docker',['exec','-i','supabase_db_wiki-next-goal-release-20261029','psql','-U','supabase_admin','-d',database,'-X','-v','ON_ERROR_STOP=1'],{input:'create schema if not exists _realtime authorization supabase_admin;',encoding:'utf8',windowsHide:true});
  assert.equal(platform.status,0,'LOCAL_REALTIME_SCHEMA_FAILED');
  for(const [role,d,port,inner] of [['rest',rest,55525,3000],['auth',auth,55526,9999],['realtime',realtime,55527,4000]]){
   const env=envOf(d),key=role==='rest'?'PGRST_DB_URI':'GOTRUE_DB_DATABASE_URL';
   // Keep the Windows Docker client's PATH; the image supplies its own PATH.
   delete env.PATH;
   if(role==='realtime'){assert.equal(env.DB_HOST,'supabase_db_wiki-next-goal-release-20261029');env.DB_NAME=database;env.SLOT_NAME_SUFFIX=tag;env.APP_NAME='jungle65_backup_'+tag;}
   else {const uri=new URL(env[key]);assert.equal(uri.hostname,'supabase_db_wiki-next-goal-release-20261029');uri.pathname='/'+database;env[key]=uri.toString();}
   if(role==='auth'){env.API_EXTERNAL_URL=api;env.GOTRUE_SITE_URL='http://127.0.0.1:5250';env.GOTRUE_JWT_ISSUER=api+'/auth/v1';}
   const name='jungle65_backup_'+role+'_'+tag,network=Object.keys(d.NetworkSettings.Networks)[0];assert.equal(network,'supabase_network_wiki-next-goal-release-20261029');
   const r=spawnSync('docker',['run','-d','--name',name,'--network',network,'-p','127.0.0.1:'+port+':'+inner,...Object.keys(env).flatMap(k=>['-e',k]),d.Config.Image],{env:{...process.env,...env},encoding:'utf8',windowsHide:true});
   assert.equal(r.status,0,'LOCAL_HTTP_START_FAILED (values withheld)');owned.push(name);
  }
  server=createServer(async(req,res)=>{
   const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'GET,POST,PATCH,DELETE,OPTIONS','Access-Control-Expose-Headers':'Content-Range,Preference-Applied'};
   if(req.method==='OPTIONS'){res.writeHead(204,cors);res.end();return;}
   const prefix=req.url.startsWith('/auth/v1')?'/auth/v1':req.url.startsWith('/rest/v1')?'/rest/v1':null;
   if(!prefix){res.writeHead(404,cors);res.end();return;}
   try{const chunks=[];for await(const c of req)chunks.push(c);const headers={...req.headers};delete headers.host;delete headers.connection;delete headers['content-length'];const r=await fetch('http://127.0.0.1:'+(prefix==='/auth/v1'?55526:55525)+(req.url.slice(prefix.length)||'/'),{method:req.method,headers,...(!['GET','HEAD'].includes(req.method)?{body:Buffer.concat(chunks)}:{})});const responseHeaders={...cors};for(const k of ['content-type','content-range','preference-applied'])if(r.headers.has(k))responseHeaders[k]=r.headers.get(k);res.writeHead(r.status,responseHeaders);res.end(Buffer.from(await r.arrayBuffer()));}
   catch{res.writeHead(503,cors);res.end('Local backend unavailable');}
  });
  server.on('upgrade',(req,socket,head)=>{
   if(!req.url.startsWith('/realtime/v1/')){socket.destroy();return;}
   socket.on('error',()=>socket.destroy());
   sockets.add(socket);socket.on('close',()=>sockets.delete(socket));
   const upstream=httpRequest({hostname:'127.0.0.1',port:55527,path:'/socket/'+req.url.slice('/realtime/v1/'.length),headers:{...req.headers,host:'realtime-dev.localhost'}});
   upstream.on('upgrade',(response,remote,remoteHead)=>{sockets.add(remote);remote.on('error',()=>{remote.destroy();socket.destroy();});remote.on('close',()=>{sockets.delete(remote);socket.destroy();});socket.on('close',()=>remote.destroy());socket.write('HTTP/1.1 101 Switching Protocols\r\n'+Object.entries(response.headers).map(([k,v])=>k+': '+v).join('\r\n')+'\r\n\r\n');if(head.length)remote.write(head);if(remoteHead.length)socket.write(remoteHead);socket.pipe(remote).pipe(socket);});
   upstream.on('response',()=>socket.destroy());upstream.on('error',()=>socket.destroy());upstream.end();
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(55520,'127.0.0.1',resolve);});
  let ready=false;for(let i=0;i<80;i++){try{const a=await fetch(api+'/auth/v1/health'),r=await fetch(api+'/rest/v1/',{headers:{apikey:config.ANON_KEY,Authorization:'Bearer '+config.ANON_KEY}});if(a.ok&&r.ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,250));}assert(ready,'RESTORED_HTTP_NOT_READY');
  return {api,config,stop};
 }catch(e){await stop();throw e;}
}

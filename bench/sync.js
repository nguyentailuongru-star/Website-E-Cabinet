// Chạy với tài khoản chủ trì có quyền trên cuộc họp và tài liệu.
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const {performance}=require('node:perf_hooks');
const {io}=require('socket.io-client');
const {createCanvas}=require('@napi-rs/canvas');

const base=(process.env.BENCH_URL||'http://127.0.0.1:3000').replace(/\/$/,'');
const cookie=process.env.BENCH_COOKIE,meetingId=process.env.BENCH_MEETING_ID,documentId=process.env.BENCH_DOCUMENT_ID;
const n=Math.max(1,Math.min(100,Number(process.env.BENCH_CLIENTS)||10));
if(!cookie||!meetingId||!documentId){console.error('Cần BENCH_COOKIE, BENCH_MEETING_ID, BENCH_DOCUMENT_ID.');process.exit(2);}
const sockets=[],samples=[];let reported=false;
const cpu0=process.cpuUsage(),mem0=process.memoryUsage();
function percentile(values,p){if(!values.length)return 0;const a=[...values].sort((x,y)=>x-y);return a[Math.ceil(p*a.length)-1];}
function csvEscape(s){return '"'+String(s).replaceAll('"','""')+'"';}
function writeReport(){
 const ok=samples.filter(x=>x.ok),lat=ok.map(x=>x.ms),summary={clients:n,success:ok.length,errors:n-ok.length,median_ms:+percentile(lat,.5).toFixed(2),p95_ms:+percentile(lat,.95).toFixed(2),max_ms:+percentile(lat,1).toFixed(2),cpu_user_ms:Math.round((process.cpuUsage(cpu0).user)/1000),rss_mb:+(process.memoryUsage().rss/1048576).toFixed(2),rss_delta_mb:+((process.memoryUsage().rss-mem0.rss)/1048576).toFixed(2)};
 const dir=path.resolve(process.env.BENCH_OUT||'bench/results');fs.mkdirSync(dir,{recursive:true});const stamp=new Date().toISOString().replaceAll(':','-');
 fs.writeFileSync(path.join(dir,`sync-${stamp}.csv`),['client,latency_ms,ok,error',...samples.map(x=>`${x.client},${x.ms??''},${x.ok},${csvEscape(x.error||'')}`),`SUMMARY,${summary.median_ms},${summary.success},${summary.errors}`].join('\n'));
 const c=createCanvas(960,540),ctx=c.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,960,540);ctx.fillStyle='#123b59';ctx.font='bold 22px Arial';ctx.fillText(`Độ trễ đồng bộ và tải ảnh trang (${n} client)`,40,40);ctx.strokeStyle='#ccd5dc';ctx.beginPath();ctx.moveTo(60,470);ctx.lineTo(920,470);ctx.moveTo(60,70);ctx.lineTo(60,470);ctx.stroke();const max=Math.max(1,...lat);ctx.fillStyle='#1683a5';ok.forEach((x,i)=>{const h=x.ms/max*360;ctx.fillRect(72+i* (830/Math.max(1,n)),470-h,Math.max(2,Math.min(10,830/n-2)),h);});ctx.fillStyle='#333';ctx.font='16px Arial';ctx.fillText(`median ${summary.median_ms} ms · p95 ${summary.p95_ms} ms · max ${summary.max_ms} ms · lỗi ${summary.errors}`,60,510);fs.writeFileSync(path.join(dir,`sync-${stamp}.png`),c.toBuffer('image/png'));console.log(JSON.stringify(summary,null,2));
}
function finish(){if(reported||samples.length<n)return;reported=true;writeReport();for(const s of sockets)s.disconnect();}
for(let i=0;i<n;i++){
 const s=io(base,{extraHeaders:{cookie},transports:['websocket'],reconnection:false,timeout:10000});sockets.push(s);let joined=false,pending=null;
 s.on('connect',()=>s.emit('meeting:join',meetingId,ack=>{if(!ack?.ok){errors.push(ack?.error||'join failed');finish();return;}joined=true;}));
 s.on('presentation:state',async state=>{if(!pending||state.meetingId!==meetingId||state.pageNumber!==pending.page)return;const start=pending.start;pending=null;try{const res=await fetch(`${base}/api/documents/${documentId}/pages/${state.pageNumber}`,{headers:{cookie}});if(!res.ok)throw Error(`page HTTP ${res.status}`);await res.arrayBuffer();samples.push({client:i+1,ms:performance.now()-start,ok:true});}catch(e){samples.push({client:i+1,ms:performance.now()-start,ok:false,error:e.message});}finish();});
 s.on('connect_error',e=>{if(!samples.some(x=>x.client===i+1))samples.push({client:i+1,ok:false,error:e.message});finish();});
 setTimeout(()=>{if(joined){const page=1;pending={page,start:performance.now()};s.emit('presentation:page',{meetingId,pageNumber:page},ack=>{if(!ack?.ok&&pending){samples.push({client:i+1,ok:false,error:ack?.error||'page event rejected'});pending=null;finish();}});}else if(!samples.some(x=>x.client===i+1)){samples.push({client:i+1,ok:false,error:'join timeout'});finish();}},1500);
}

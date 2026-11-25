import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {createInterface as prompt} from 'node:readline/promises';
import {fileURLToPath} from 'node:url';

const child = spawn(process.execPath,[fileURLToPath(new URL('./server.js',import.meta.url))],{stdio:['pipe','pipe','inherit']});
const replies = createInterface({input:child.stdout})[Symbol.asyncIterator]();
const terminal = prompt({input:process.stdin,output:process.stdout});
let id = 0;
function send(message) { child.stdin.write(JSON.stringify({jsonrpc:'2.0',...message})+'\n'); }
async function call(method,params) {
  send({id:++id,method,params});
  const next = await replies.next();
  if (next.done) throw Error('Server closed. Check settings.json and database path.');
  const response = JSON.parse(next.value);
  if (response.error) throw Error(response.error.message);
  return response.result;
}
try {
  await call('initialize',{protocolVersion:'2025-11-25',capabilities:{},clientInfo:{name:'windows-console',version:'0.1'}});
  send({method:'notifications/initialized'});
  console.log('ถามรายงาน | /sample ทดลองฐานข้อมูล | /new เริ่มรายงานใหม่ | /exit จบ');
  let sessionId;
  while (true) {
    const message = (await terminal.question('> ')).trim();
    if (!message) continue;
    if (message === '/exit') break;
    if (message === '/new') { sessionId = undefined; continue; }
    const args = message === '/sample'
      ? {name:'report_run',arguments:{report:'pressure_count',filters:{subdistrict:'สาธิต',systolic:139,diastolic:89,join:'both',period:'latest'}}}
      : {name:'report_ask',arguments:{message,sessionId}};
    const reply = await call('tools/call',args);
    if (reply.isError) { console.log(reply.content[0].text); continue; }
    const value = reply.structuredContent;
    if (value.sessionId) sessionId = value.sessionId;
    console.log(value.question ?? value.explanation ?? JSON.stringify({report:value.report,filters:value.filters,rows:value.rows},null,2));
  }
} catch (e) { console.error(e.message); process.exitCode = 1; }
finally { terminal.close(); child.stdin.end(); }

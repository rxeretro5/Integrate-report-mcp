import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,copyFileSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {open} from '../adapters/sqlite.js';
import {assistant} from '../assistant.js';

test('SQLite report, MCP lifecycle, follow-up and provider errors',async t => {
  const dir = mkdtempSync(join(tmpdir(),'report-mcp-'));
  let adapter;
  t.after(()=>{ adapter?.close(); rmSync(dir,{recursive:true,force:true}); });
  copyFileSync('demo/create.js',join(dir,'create.mjs'));
  const seed = spawnSync(process.execPath,[join(dir,'create.mjs')]);
  assert.equal(seed.status,0,seed.stderr.toString());
  // Windows PowerShell can write UTF-8 with a byte order mark.
  writeFileSync(join(dir,'catalog.json'),'\uFEFF' + readFileSync('demo/catalog.json','utf8'));
  const settings = {model:'test',apiKey:'test',catalog:'catalog.json',database:'sample.sqlite',adapter:resolve('adapters/sqlite.js')};
  const config = join(dir,'settings.json');
  writeFileSync(config,JSON.stringify(settings));
  const filters = {subdistrict:'สาธิต',systolic:139,diastolic:89,join:'both',period:'latest'};
  const messages = [
    {id:1,method:'initialize',params:{protocolVersion:'2025-11-25',capabilities:{},clientInfo:{name:'test',version:'1'}}},
    {method:'notifications/initialized'}, {id:2,method:'tools/list'},
    {id:3,method:'tools/call',params:{name:'report_run',arguments:{report:'pressure_count',filters}}},
    {id:4,method:'tools/call',params:{name:'report_catalog',arguments:null}},
    {id:5,method:'tools/call',params:{name:'report_run',arguments:{report:42,filters}}},
    {id:6,method:'ping'}
  ];
  const stdio = spawnSync(process.execPath,['server.js'],{env:{...process.env,REPORT_SETTINGS:config},
    input:messages.map(m=>JSON.stringify({jsonrpc:'2.0',...m})).join('\n')+'\n',encoding:'utf8'});
  assert.equal(stdio.status,0,stdio.stderr);
  const packets = stdio.stdout.trim().split('\n').map(line=>JSON.parse(line));
  const responses = packets.map(packet=>packet.result);
  assert.equal(responses[0].protocolVersion,'2025-11-25');
  assert.equal(responses[1].tools.length,3);
  assert.equal(responses[2].structuredContent.rows[0].people,1);
  assert.equal(packets[3].error.code,-32602);
  assert.equal(packets[4].error.code,-32602);
  assert.deepEqual(responses[5],{});

  await t.test('Windows console processes piped commands and exits on EOF from another directory',()=>{
    const cli = spawnSync(process.execPath,[resolve('client.js')],{cwd:dir,
      env:{...process.env,REPORT_SETTINGS:config},input:'/sample\n/sample\n',encoding:'utf8',timeout:5000});
    assert.equal(cli.status,0,cli.error?.message ?? cli.stderr);
    assert.equal(cli.stdout.match(/"people": 1/g)?.length,2);
  });

  adapter = open(settings,dir);
  let step = 0;
  const service = assistant(adapter,settings,async (_url,options)=>{
    const history = JSON.parse(options.body).messages;
    step++;
    if (step === 2) assert.match(history[2].content,/latest or any/);
    if (step === 3) {
      assert.equal(Object.hasOwn(JSON.parse(history.at(-2).content),'rows'),false);
      assert.match(history.at(-2).content,/pressure_count/);
      return Response.json({error:{code:402}},{status:402});
    }
    const plan = step === 1 ? {question:'latest or any?'} : {report:'pressure_count',filters};
    return Response.json({choices:[{message:{content:JSON.stringify(plan)}}]});
  });
  const first = await service.ask({message:'count people in สาธิต above both thresholds 139/89'});
  const second = await service.ask({message:'latest',sessionId:first.sessionId});
  assert.equal(second.rows[0].people,1);
  await assert.rejects(service.ask({message:'อีกครั้ง',sessionId:first.sessionId}),/เครดิต/);
  for (const [change,count] of [[{period:'any'},2],[{join:'either'},2],[{subdistrict:"' OR 1=1 --"},0]]) {
    assert.equal((await service.run('pressure_count',{...filters,...change})).rows[0].people,count);
  }
  await assert.rejects(service.run('pressure_count',{...filters,period:'guess'}),/Invalid filter/);
});

test('ambiguous model output never runs a report and a provider error preserves the session',async () => {
  const replies = [
    Response.json({choices:[{message:{content:'{"question":"ช่วงไหน?"}'}}]}),
    Response.json({error:{code:'rate_limit'}},{status:429}),
    Response.json({choices:[{message:{content:'{"question":"ช่วงไหน?","report":"sales","filters":{}}'}}]}),
    Response.json({choices:[{message:{content:'{"report":"sales","filters":{}}'}}]})
  ];
  let runs = 0;
  const service = assistant({manual:'Sales',reports:[{id:'sales',parameters:{}}],
    run(){ runs++; return [{count:3}]; }},{apiKey:'test',model:'test'},async()=>replies.shift());
  const {sessionId} = await service.ask({message:'ยอดขาย'});
  const repeat = () => service.ask({message:'ทั้งหมด',sessionId});
  await assert.rejects(repeat(),/quota limit/);
  await assert.rejects(repeat(),/Invalid model response/);
  assert.equal(runs,0);
  assert.deepEqual((await repeat()).rows,[{count:3}]);
});

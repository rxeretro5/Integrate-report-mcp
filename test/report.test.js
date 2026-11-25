import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,copyFileSync,writeFileSync,rmSync} from 'node:fs';
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
  const settings = {model:'test',apiKey:'test',catalog:resolve('demo/catalog.json'),database:'sample.sqlite',adapter:resolve('adapters/sqlite.js')};
  const config = join(dir,'settings.json');
  writeFileSync(config,JSON.stringify(settings));
  const filters = {subdistrict:'สาธิต',systolic:139,diastolic:89,join:'both',period:'latest'};
  const messages = [
    {id:1,method:'initialize',params:{protocolVersion:'2025-11-25',capabilities:{},clientInfo:{name:'test',version:'1'}}},
    {method:'notifications/initialized'}, {id:2,method:'tools/list'},
    {id:3,method:'tools/call',params:{name:'report_run',arguments:{report:'pressure_count',filters}}}
  ];
  const stdio = spawnSync(process.execPath,['server.js'],{env:{...process.env,REPORT_SETTINGS:config},
    input:messages.map(m=>JSON.stringify({jsonrpc:'2.0',...m})).join('\n')+'\n',encoding:'utf8'});
  assert.equal(stdio.status,0,stdio.stderr);
  const responses = stdio.stdout.trim().split('\n').map(line=>JSON.parse(line).result);
  assert.equal(responses[0].protocolVersion,'2025-11-25');
  assert.equal(responses[1].tools.length,3);
  assert.equal(responses[2].structuredContent.rows[0].people,1);

  adapter = open(settings,dir);
  let step = 0;
  const service = assistant(adapter,settings,async (_url,options)=>{
    const history = JSON.parse(options.body).messages;
    step++;
    if (step === 2) assert.match(history[2].content,/latest or any/);
    if (step === 3) {
      assert.ok(!JSON.stringify(history).includes('"rows"'));
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

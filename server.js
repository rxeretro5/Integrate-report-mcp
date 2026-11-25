import { createInterface } from 'node:readline';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { assistant } from './assistant.js';

const root = dirname(fileURLToPath(import.meta.url));
const path = resolve(process.env.REPORT_SETTINGS || resolve(root, 'settings.json'));
let adapter;
try {
  const settings = JSON.parse(readFileSync(path, 'utf8').replace(/^\uFEFF/,''));
  const module = await import(pathToFileURL(resolve(dirname(path), settings.adapter)).href);
  adapter = await module.open(settings, dirname(path));
  await serve(assistant(adapter, settings));
} catch (error) {
  console.error('Report MCP:', error.message);
  process.exitCode = 1;
} finally { await adapter?.close?.(); }

async function serve(service) {
  const schema = (properties, required = []) => ({type:'object', properties, required, additionalProperties:false});
  const string = {type:'string'};
  const tools = [
    {name:'report_catalog', description:'Read the application manual and available reports.', inputSchema:schema({})},
    {name:'report_ask', description:'Ask a report question in Thai or English. Reuse sessionId for follow-ups.', inputSchema:schema({message:string,sessionId:string}, ['message'])},
    {name:'report_run', description:'Run a catalog report locally with explicit validated filters.', inputSchema:schema({report:string,filters:{type:'object'}}, ['report','filters'])}
  ];
  const send = (id, payload) => process.stdout.write(JSON.stringify({jsonrpc:'2.0', id, ...payload}) + '\n');
  let phase = 'new';
  for await (const line of createInterface({input:process.stdin, crlfDelay:Infinity})) {
    let msg;
    try { msg = JSON.parse(line); } catch { send(null,{error:{code:-32700,message:'Parse error'}}); continue; }
    if (msg?.jsonrpc !== '2.0' || typeof msg.method !== 'string') {
      send(null,{error:{code:-32600,message:'Invalid request'}}); continue;
    }
    const {id, method, params} = msg;
    if (id === undefined) {
      if (method === 'notifications/initialized' && phase === 'initializing') phase = 'ready';
      continue;
    }
    let result;
    if (method === 'initialize' && phase === 'new') {
      phase = 'initializing';
      result = {protocolVersion:'2025-11-25', capabilities:{tools:{}}, serverInfo:{name:'report-assistant', version:'0.1.0'}};
    } else if (method === 'ping') result = {};
    else if (phase !== 'ready') { send(id,{error:{code:-32002,message:'Initialize first'}}); continue; }
    else if (method === 'tools/list') result = {tools};
    else if (method === 'tools/call') {
      const tool = tools.find(t => t.name === params?.name);
      const args = params?.arguments ?? {};
      if (!tool || !args || typeof args !== 'object' || Array.isArray(args) ||
          Object.keys(args).some(k => !Object.hasOwn(tool.inputSchema.properties,k)) ||
          tool.inputSchema.required.some(k => !Object.hasOwn(args,k))) {
        send(id,{error:{code:-32602,message:'Invalid tool or arguments'}}); continue;
      }
      try {
        const value = tool.name === 'report_catalog' ? service.catalog :
          tool.name === 'report_run' ? await service.run(args.report,args.filters) : await service.ask(args);
        result = {content:[{type:'text',text:JSON.stringify(value)}], structuredContent:value};
      } catch (e) { result = {isError:true,content:[{type:'text',text:e.message}]}; }
    } else { send(id,{error:{code:-32601,message:'Method not found'}}); continue; }
    send(id,{result});
  }
}

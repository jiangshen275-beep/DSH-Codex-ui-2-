import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const root=new URL('../',import.meta.url);
const files=['src/review-log-ui.js','lib/client.js'];
let previous;
for(const file of files){
 const source=readFileSync(new URL(file,root),'utf8');
 const match=source.match(/记录目录：\$\{([^\n]+?)\}；最多保留最近 200 条。/);
 assert.ok(match, file+' footer exists');
 if(previous) assert.equal(match[1],previous,'source and bundle agree');
 previous=match[1];
 const cases=[
  [{loading:true,dir:'',error:''},'正在读取…'],
  [{loading:false,dir:'',error:'HTTP 404'},'读取失败，尚未确认'],
  [{loading:false,dir:'',error:''},'DSH_HOME 未设置'],
  [{loading:false,dir:'D:/known',error:'HTTP 500'},'D:/known']
 ];
 for(const [state,expected] of cases) test(file+' '+expected,()=>assert.equal(vm.runInNewContext(match[1],{state}),expected));
}
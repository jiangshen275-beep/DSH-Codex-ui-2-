import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import {mkdtempSync,mkdirSync,symlinkSync,rmSync,writeFileSync} from 'node:fs';
import {flashToolDenial as deny} from '../src/flash-policy.js';
const base=mkdtempSync(path.join(os.tmpdir(),'flash-policy-'));
const owned=path.join(base,'owned'),other=path.join(base,'other');
mkdirSync(owned);mkdirSync(other);
const job={role:'A',cwd:base,branch:{write_paths:[owned]}};
const call=(name,args)=>({name,arguments:args});
test.after(()=>rmSync(base,{recursive:true,force:true}));
test('permits explicit writes within owned directory including new descendants',()=>{
 for(const name of ['write','edit']) assert.equal(deny(job,call(name,{file_path:path.join(owned,'new','a.txt')})),undefined);
 assert.equal(deny(job,call('write',{file_path:'owned/a.txt'})),undefined);
 assert.equal(typeof deny(job,call('ops_replace',{path:owned,pattern:'a',replacement:'b'})),'string');
 const file=path.join(owned,'replace.txt');writeFileSync(file,'a');
 assert.equal(deny(job,call('ops_replace',{path:file,pattern:'a',replacement:'b'})),undefined);
});
test('rejects sibling ownership, textual prefix collisions and dot traversal',()=>{
 for(const target of [path.join(other,'a'),owned+'-other/a',path.join(owned,'..','other','a')]) assert.equal(typeof deny(job,call('write',{file_path:target})),'string');
});
test('rejects missing parameters and executable bypasses for write branches',()=>{
 for(const name of ['write','edit','ops_replace','pwsh','ops_bash','computer','run_code','workflow','sidebar_rail','agent_diary']) assert.equal(typeof deny(job,call(name,{})),'string');
});
test('read-only branches and C never write even when C receives ownership',()=>{
 for(const j of [{role:'B',branch:{write_paths:[]}},{...job,role:'C'}]) {
 assert.equal(typeof deny(j,call('write',{file_path:path.join(owned,'a')})),'string');
 if(j.role==='C')assert.equal(typeof deny(j,call('read',{file_path:path.join(other,'evidence')})),'string');else assert.equal(deny(j,call('read',{file_path:path.join(other,'evidence')})),undefined);
 }
 assert.equal(typeof deny(job,call('working_directory',{cd:owned})),'string');
});
test('rejects junction or symlink escape from owned directory',()=>{
 const link=path.join(owned,'escape');symlinkSync(other,link,process.platform==='win32'?'junction':'dir');
 assert.equal(typeof deny(job,call('edit',{file_path:path.join(link,'target.txt')})),'string');
});
test('ownership grants exactly one file without permitting siblings',()=>{
 const f=path.join(owned,'one.txt');writeFileSync(f,'test');const j={...job,branch:{write_paths:[f]}};
 assert.equal(deny(j,call('edit',{file_path:f})),undefined);
 assert.equal(typeof deny(j,call('write',{file_path:path.join(owned,'two.txt')})),'string');
});
test('rejects alternate Windows streams and ambiguous path namespace',()=>{
 for(const file_path of ['D:/code/x.txt:stream','\\\\?\\D:\\code\\x','D:/code/x.']) assert.equal(typeof deny({role:'A',branch:{write_paths:['D:/code']}},call('write',{file_path})),'string');
});
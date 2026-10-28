import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { cgHostClassAliases, cgPermissionItems, cgPermissionTree } from '../src/upgrade-compat.js';
import { createReactShim } from './react-shim.mjs';

test('module identity restores updated conversation, layout and input classes', () => {
 const entries = [
  {id:'@deepseek-ai/dsh-client-ui-layout/AppFrame.module.css',css:'.mP3x-q_frame{}.mP3x-q_sidebarCol{}'},
  {id:'@deepseek-ai/dsh-client-ui-conversation/ConversationRoot.module.css',css:'.an3WzG_root{}.an3WzG_composerHero{}'},
  {id:'@deepseek-ai/dsh-client-ui-conversation/InputBar.module.css',css:'.GRgSLq_root{}.GRgSLq_hero{}'},
  {id:'@deepseek-ai/dsh-client-ui-message-feedback/MessageFeedbackActions.module.css',css:'.Hyy-Wa_action{}'},
 ];
 const result=cgHostClassAliases(entries);
 assert.equal(result.get('mP3x-q_frame'),'BynINW_frame');
 assert.equal(result.get('an3WzG_root'),'Dc7zOa_root');
 assert.equal(result.get('GRgSLq_hero'),'RlGAzG_hero');
 assert.equal(result.get('Hyy-Wa_action'),'vpunvW_action');
});
test('unrelated modules and ambiguous suffixes never get mapped',()=>{
 assert.equal(cgHostClassAliases([{id:'other/Root.module.css',css:'.other_root{}'}]).size,0);
 assert.equal(cgHostClassAliases([{id:'@deepseek-ai/dsh-client-ui-layout/AppFrame.module.css',css:'.first_frame{}.second_frame{}'}]).size,0);
 assert.equal(cgHostClassAliases([{id:'@deepseek-ai/dsh-client-ui-layout/AppFrame.module.css',css:'.BynINW_frame{}'}]).size,0);
});
test('permission ordering hides only retired option and preserves custom host permissions',()=>{
 const original=['read-only','danger-full-access','workspace-write','auto','review','custom-safe'].map(id=>({id}));
 assert.deepEqual(cgPermissionItems(original).map(x=>x.id),['workspace-write','review','auto','danger-full-access','custom-safe']);
 assert.equal(original.length,6);
});
test('native menu callbacks and confirmation gates remain unchanged',()=>{
 const R=createReactShim();const Menu=()=>null;const Confirmation=()=>null;
 const select=()=>{},confirm=()=>{},close=()=>{};
 const anchor=R.createElement('button',{disabled:true},R.createElement('span',{className:'_86kJGG_triggerLabel'},'完全访问权限'));
 const menu=R.createElement(Menu,{items:['read-only','danger-full-access','workspace-write','auto'].map(id=>({id})),selectedId:'danger-full-access',onSelect:select,onClose:close,anchor});
 const gate=R.createElement(Confirmation,{acknowledged:false,disabled:true,onConfirm:confirm});
 const tree=R.createElement(R.Fragment,{},menu,gate);
 const result=cgPermissionTree(tree,R);
 const wrapper=result.props.children[0],changed=wrapper.props.children;
 assert.deepEqual(changed.props.items.map(x=>x.id),['workspace-write','auto','danger-full-access']);
 assert.equal(changed.props.onSelect,select);assert.equal(changed.props.onClose,close);
 assert.equal(changed.props.anchor.props.disabled,true);
 assert.equal(changed.props.anchor.props['aria-label'],'更改权限，当前：完全访问');
 assert.equal(result.props.children[1].props.onConfirm,confirm);
 assert.equal(result.props.children[1].props.acknowledged,false);
 assert.equal(result.props.children[1].props.disabled,true);
});
test('stylesheet retains explicit dark surfaces and semantic feedback hiding',async()=>{
 const css=await readFile(new URL('../src/style.css',import.meta.url),'utf8');
 assert.match(css,/--cg-main-bg:\s*#181818/);
 assert.match(css,/--cg-sidebar-bg:\s*#171717/);
 assert.match(css,/\[aria-label="好的回答"\]/);
 assert.match(css,/\[aria-label="有问题的回答"\]/);
 assert.match(css,/cg-permission-description/);
});
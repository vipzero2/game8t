import test from 'node:test';
import assert from 'node:assert/strict';
import {BOT_LANGUAGES,languagePicker,t,codeKeyboard,planLabel} from '../functions/_lib/telegram-bot-ui.js';

test('the language picker offers one distinct country flag and only one Arabic option',()=>{
 const picker=languagePicker().inline_keyboard.flat();
 assert.equal(picker.length,12);
 assert.deepEqual(picker[0],{text:'🇸🇦 العربية',callback_data:'lang:ar'});
 assert.deepEqual(picker[1],{text:'🇬🇧 English',callback_data:'lang:en'});
 assert.deepEqual(new Set(BOT_LANGUAGES.map(x=>x.code)).size,12);
 assert.deepEqual(new Set(BOT_LANGUAGES.map(x=>x.flag)).size,12);
 assert.equal(picker.filter(x=>/العربية/.test(x.text)).length,1);
 assert.ok(picker.every(x=>x.callback_data.startsWith('lang:')));
});
test('each listed language has localized plans, code protection and copy button',()=>{
 const code='A8-'+'a'.repeat(28);
 for(const l of BOT_LANGUAGES){
  assert.ok(t(l.code,'intro').length>20,l.code);
  assert.ok(t(l.code,'quarter').length>0,l.code);
  assert.ok(t(l.code,'half').length>0,l.code);
  assert.ok(t(l.code,'year').length>0,l.code);
  assert.ok(t(l.code,'paid').length>5,l.code);
  assert.ok(t(l.code,'replacement').length>5,l.code);
  assert.ok(t(l.code,'rules').includes('/recover'),l.code);
  assert.ok(t(l.code,'rules').includes('24') || /۲۴|٢٤/.test(t(l.code,'rules')),l.code);
  assert.ok(t(l.code,'rules').length>130,l.code);
  assert.ok(t(l.code,'confirm').length>20,l.code);
  assert.ok(t(l.code,'invoice',{days:90}).includes('90'),l.code);
  assert.ok(planLabel(l.code,'quarter'),l.code);
  const button=codeKeyboard(l.code,code).inline_keyboard[0][0];
  assert.equal(button.copy_text.text,code,l.code);
  assert.ok(button.text.length>2,l.code);
 }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {telegramText,isArabicTelegram} from '../functions/_lib/telegram-locale.js';

const source=readFileSync(new URL('../public/assets/i18n.js',import.meta.url),'utf8');

function load(lang){
  const nodes=[];
  const child={nodeType:3,nodeValue:'الرئيسية'};
  const doc={nodeType:1,tagName:'HTML',lang:'ar',dir:'rtl',
    childNodes:[],hasAttribute:()=>false};
  child.parentElement=doc;
  doc.childNodes=[child];
  const context={navigator:{language:lang},document:{documentElement:doc},
    window:{},MutationObserver:class{constructor(callback){nodes.push(callback)} observe(){} }};
  vm.runInNewContext(source,context,{filename:'i18n.js'});
  return {doc,child,lang:context.window.AIM8_I18N.lang,t:context.window.AIM8_I18N.translate,callbacks:nodes};
}
test('English locale switches LTR and translates old and dynamic content',()=>{
  const x=load('en-US');
  assert.equal(x.doc.dir,'ltr');assert.equal(x.doc.lang,'en');assert.equal(x.child.nodeValue,'Home');
  assert.equal(x.t('6 أشهر'),'6 Months');
  assert.equal(x.t('3 أشهر · 90 يوم · 150 ⭐'),'3 Months · 90 days · 150 ⭐');
  x.child.nodeValue='جارٍ التفعيل...';
  x.callbacks[0]([{type:'characterData',target:x.child}]);
  assert.equal(x.child.nodeValue,'Activating...');
});
test('Arabic locale stays RTL with original text and no observer',()=>{
  const x=load('ar-IQ');
  assert.equal(x.doc.dir,'rtl');assert.equal(x.doc.lang,'ar');assert.equal(x.child.nodeValue,'الرئيسية');
  assert.equal(x.t('3 أشهر'),'3 أشهر');assert.equal(x.callbacks.length,0);
});
test('Non-Arabic device languages fall back to English',()=>{
  for(const lang of ['tr-TR','fr-FR','de-DE']){const x=load(lang);assert.equal(x.doc.lang,'en');assert.equal(x.t('سنة كاملة'),'1 Year');}
});
test('Telegram bot follows language_code automatically',()=>{
  assert.equal(isArabicTelegram({language_code:'ar-IQ'}),true);
  assert.equal(isArabicTelegram({language_code:'en-US'}),false);
  assert.equal(telegramText('3 أشهر',{language_code:'ar'}),'3 أشهر');
  assert.equal(telegramText('3 أشهر',{language_code:'en'}),'3 Months');
  assert.equal(telegramText('اشتراكات النجوم غير مفعلة بعد.',{language_code:'en'}),'Stars subscriptions are not available yet.');
  assert.match(telegramText('تم الدفع بنجاح ✅\nكود AIM8 الخاص بحسابك:\nA8-TEST',{language_code:'en'}),/Payment successful/);
});

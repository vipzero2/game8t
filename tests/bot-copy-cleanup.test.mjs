import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {BOT_LANGUAGES,t} from '../functions/_lib/telegram-bot-ui.js';

test('Telegram bot removes free and website sign-up copy across all supported languages',()=>{
 const keys=['intro','recover','replacement','rules','confirm','yes'];
 const costWords=/مجان|for free|\bfree\b|gratis|gratuit|kostenlos|ücretsiz|бесплат|رایگان|मुफ्त|مفت/i;
 const accountWords=/ما تحتاج تسجّل بحساب بالموقع|no website account|cuenta web|compte web|Website-Konto|conta no site|Site hesabı|Учётная запись на сайте|حساب سایت لازم نیست|वेबसाइट खाता|akun situs|ویب سائٹ اکاؤنٹ/i;
 for(const {code} of BOT_LANGUAGES){
  for(const key of keys){
   const text=t(code,key);
   assert.doesNotMatch(text,costWords,code+'.'+key+' must not advertise free');
   assert.doesNotMatch(text,accountWords,code+'.'+key+' must not discuss website sign-up');
  }
  assert.match(t(code,'recover'),/^♻️ /,code+' should still have recover entry');
 }
});
test('Arabic bot subscription and recovery messages keep activation instructions, with neutral wording',()=>{
 assert.equal(t('ar','recover'),'♻️ استرجاع التفعيل');
 assert.equal(t('ar','paid'),'✅ تم الدفع بنجاح!');
 assert.equal(t('ar','replacement'),'✅ تم إصدار كود تفعيل بديل!');
 assert.match(t('ar','rules'),/الكود يُستخدم مرة واحدة/);
 assert.match(t('ar','rules'),/جهاز واحد فقط/);
 assert.match(t('ar','rules'),/\/recover/);
 assert.match(t('ar','rules'),/24 ساعة/);
 assert.match(t('ar','confirm'),/سيُحرق الكود السابق/);
 assert.match(t('ar','confirm'),/يُفصل الهاتف القديم/);
 const bot=readFileSync(new URL('../functions/_lib/telegram.js',import.meta.url),'utf8');
 assert.doesNotMatch(bot,/كود جديد مجاناً/);
 const messages=readFileSync(new URL('../functions/_lib/telegram-locale.js',import.meta.url),'utf8');
 assert.doesNotMatch(messages,/مجاناً|for free|free replacement/);
});

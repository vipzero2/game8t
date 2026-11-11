import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=p=>readFileSync(new URL('../public/'+p,import.meta.url),'utf8');
test('public purchase flow shows one account-bound bot button, not prices',()=>{
  const home=read('index.html'),dashboard=read('dashboard.html'),legacy=read('checkout.html');
  assert.match(home,/الحصول على كود التفعيل عبر بوت تيليجرام/);
  assert.match(dashboard,/id="starsStart"/);
  assert.doesNotMatch(home,/checkout\.html\?plan=|150\s*⭐|250\s*⭐|450\s*⭐|Telegram Stars|نجوم/);
  assert.doesNotMatch(dashboard,/id="starsPlan"|Telegram Stars|نجوم|⭐/);
  assert.doesNotMatch(legacy,/150\s*⭐|Telegram Stars|نجوم/);
  assert.match(legacy,/dashboard\.html#telegramActivation/);
});
test('browser code requests a link without plan selection',()=>{
  const js=read('assets/main.js');
  assert.match(js,/post\('\/telegram\/link',\{\}\)/);
  assert.doesNotMatch(js,/post\('\/telegram\/link',\{planId/);
});

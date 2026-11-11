import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../public/assets/main.js',import.meta.url),'utf8');
const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const dash=readFileSync(new URL('../public/dashboard.html',import.meta.url),'utf8');
const flush=()=>new Promise(resolve=>setImmediate(resolve));

function bootstrap(page='home',status=200){
  const clicks=new Map();
  const elem=(id,tagName='A')=>{
    const e={id,tagName,href:'https://8aim.site/'+(id==='starsStart'?'auth.html?next=dashboard.html':'dashboard.html#telegramActivation'),dataset:{},
      textContent:'الحصول على كود التفعيل',hidden:id.includes('Backup'),classList:{add(){},remove(){}},
      addEventListener(event,callback){clicks.set(id+':'+event,callback)}};
    return e;
  };
  const elements={
    botActivateHome:elem('botActivateHome'),
    botLinkBackupHome:elem('botLinkBackupHome'),
    botLaunchStatusHome:elem('botLaunchStatusHome','P'),
    starsStart:elem('starsStart'),
    botLinkBackupDash:elem('botLinkBackupDash'),
    starsRedeem:elem('starsRedeem','BUTTON'),
    starsResult:elem('starsResult','P')
  };
  const nav=[];
  let requested=0;
  const loc={search:'',href:'https://8aim.site/index.html',assign(url){nav.push(url)}};
  const context={
    window:{AIM8_I18N:{lang:'ar',translate:x=>x},addEventListener(){}},
    location:loc,URL,URLSearchParams,Date,
    document:{body:{dataset:{page}},getElementById:id=>elements[id]||null,querySelectorAll:()=>[]},
    fetch:async(url)=>{
      requested++;
      if(status!==200)return Response.json({ok:false,error:'UNAUTHORIZED',message:'يرجى تسجيل الدخول'}, {status});
      return Response.json({ok:true,url:'https://t.me/AIM8_test_bot?start=012345678901234567890123',expiresIn:600});
    },console,setTimeout,clearTimeout
  };
  vm.runInNewContext(source,context,{filename:'assets/main.js'});
  return {elements,clicks,nav,get requested(){return requested}};
}
test('home page prepares a genuine Telegram hyperlink; clicking it needs no async redirect',async()=>{
  const x=bootstrap('home');
  await flush();
  assert.equal(x.requested,1);
  assert.match(x.elements.botActivateHome.href,/^https:\/\/t\.me\/AIM8_test_bot\?start=/);
  assert.ok(x.clicks.has('botActivateHome:click'));
  let prevented=false;
  x.clicks.get('botActivateHome:click')({preventDefault(){prevented=true}});
  assert.equal(prevented,false);
  assert.equal(x.nav.length,0);
});
test('dashboard prepares the same direct hyperlink before clicking',async()=>{
  const x=bootstrap('dashboard');
  await flush();
  assert.equal(x.requested,1);
  assert.match(x.elements.starsStart.href,/^https:\/\/t\.me\/AIM8_test_bot\?start=/);
  assert.ok(x.clicks.has('starsStart:click'));
});
test('website always includes a fallback open-Telegram link and success status',()=>{
 assert.match(html,/id="botLinkBackupHome"/);
 assert.match(dash,/id="botLinkBackupDash"/);
 assert.match(source,/showBotDirectLink\(button,url\)/);
 assert.match(source,/location\.assign\(url\)/);
});

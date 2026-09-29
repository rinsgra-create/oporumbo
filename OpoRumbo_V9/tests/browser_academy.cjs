const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL||'msedge',headless:true});
 try{
  const context=await browser.newContext({serviceWorkers:'block'});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  const base=process.env.TEST_BASE_URL||'http://127.0.0.1:8765';
  const email='academy-'+Date.now()+'@example.com',password='Local-test-123!';
  const reg=await context.request.post(base+'/api/register',{data:{email,password}});
  assert.equal(reg.status(),200);const token=(await reg.json()).token;
  const headers={Authorization:'Bearer '+token};
  const opposition={name:'Academia test',boe_id:'local-academy',topics:Array.from({length:5},(_,i)=>({name:'Materia '+(i+1),blocks:['Bloque '+(i+1)]}))};
  const setup=await context.request.post(base+'/api/setup',{headers,data:{opposition,exam_date:'2027-12-01',minutes_per_day:180,mode:'free'}});
  assert.equal(setup.status(),200);
  await page.goto(base);await page.locator('#email').fill(email);await page.locator('#pass').fill(password);await page.locator('#signin').click();
  await page.locator('#tasks .task').first().waitFor();
  async function select(topics){
   await page.locator('[data-screen=Profile]').click();
   await page.locator('#studyMode').selectOption('academy');
   for(const input of await page.locator('#academyTopics input').all()){
    await input.setChecked(topics.includes(Number(await input.getAttribute('value'))));
   }
  }
  async function apply(){
   await page.getByRole('button',{name:'Aplicar y reorganizar Hoy'}).click();
   await page.locator('#screenToday').waitFor({state:'visible'});
  }
  await select([2]);await apply();
  await page.locator('#tasks').getByText('Academia · Tema 3 · Materia 3',{exact:true}).waitFor();
  // A failed request must leave both persisted settings and plan unchanged.
  await select([3]);
  await page.route('**/api/plan/today',route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({detail:'Fallo simulado'})}),{times:1});
  await page.getByRole('button',{name:'Aplicar y reorganizar Hoy'}).click();
  await page.getByText('Fallo simulado',{exact:true}).waitFor();
  const failed=await (await context.request.get(base+'/api/progress',{headers})).json();
  assert.deepEqual(failed.academy_selected,[2]);
  assert(failed.tasks.some(t=>t.kind==='academy'&&t.topic_index===2));
  const writes=[];page.on('request',r=>{if(['PUT','POST'].includes(r.method()))writes.push(r.url());});
  await apply();
  await page.locator('#tasks').getByText('Academia · Tema 4 · Materia 4',{exact:true}).waitFor();
  assert.equal(await page.locator('#tasks').getByText('Academia · Tema 3 · Materia 3',{exact:true}).count(),0);
  assert.equal(writes.length,1);assert(writes[0].endsWith('/api/plan/today'));
  await page.reload();await page.locator('#tasks').getByText('Academia · Tema 4 · Materia 4',{exact:true}).waitFor();
  // Complete Theme 3, then select Theme 4: checks and measured time survive.
  await select([2]);await apply();
  await page.locator('.task').filter({hasText:'Academia · Tema 3'}).locator('button').click();
  await page.locator('#actualMinutes').fill('10');await page.locator('#saveTime').click();
  await page.getByText('Hecho hoy',{exact:true}).waitFor();
  await select([3]);await apply();
  assert.equal(await page.locator('.task.completed').filter({hasText:'Academia · Tema 3'}).count(),1);
  assert.equal(await page.locator('.task:not(.completed)').filter({hasText:'Academia · Tema 4'}).count(),1);
  const second=await browser.newContext({serviceWorkers:'block'}),other=await second.newPage();
  await other.goto(base);await other.locator('#email').fill(email);await other.locator('#pass').fill(password);await other.locator('#signin').click();
  await other.locator('.task.completed').filter({hasText:'Academia · Tema 3'}).waitFor();
  assert.equal(await other.locator('.task:not(.completed)').filter({hasText:'Academia · Tema 4'}).count(),1);
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({passed:true,checks:['Theme 3 -> Theme 4 via Apply','single atomic write','failed write changes neither selection nor plan','reload','completed Theme 3 retained','independent second login'],pageErrors:errors}));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});

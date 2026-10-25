import {test,expect} from '@playwright/test';
import {Pool} from 'pg';
const API=process.env.API_URL || 'http://localhost:3001';
const WEB=process.env.FRONTEND_URL || 'http://localhost:5173';
test('real signup UI, reload, project URL, team, settings and server-side logout',async({page,request})=>{
  test.skip(!process.env.DATABASE_URL,'requires an isolated native PostgreSQL test database');
  const stamp=Date.now();
  const name=`UI Owner ${stamp}`;
  const email=`ui-${stamp}@example.test`;
  const password='UI-Password-12345!';
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto(WEB);
  await expect(page.locator('input[type=email]')).toBeVisible();
  await page.getByRole('button',{name:'ثبت‌نام',exact:true}).first().click();
  await page.locator('form input[type=text]').fill(name);
  await page.locator('form input[type=email]').fill(email);
  await page.locator('form input[type=password]').fill(password);
  await page.locator('form button[type=submit]').click();
  await expect(page.getByRole('button',{name:'خروج',exact:true})).toBeVisible();
  const token=await page.evaluate(()=>localStorage.getItem('rankforge_token'));
  expect(token).toBeTruthy();
  const headers={Authorization:`Bearer ${token}`};
  const me=await request.get(`${API}/api/v1/auth/me`,{headers});expect(me.ok()).toBeTruthy();
  const identity=(await me.json()).data.user;
  // Fixture entitlement; payment lifecycle has its own signed-webhook tests.
  const pool=new Pool({connectionString:process.env.DATABASE_URL});
  try{await pool.query("UPDATE organizations SET plan='STARTER' WHERE id=$1",[identity.organizationId]);}finally{await pool.end();}
  const ids:string[]=[];
  for(const label of ['first','second']){
    const response=await request.post(`${API}/api/v1/projects`,{headers,data:{name:`${label}-${stamp}`,domain:`${label}-${stamp}.example.test`}});
    expect(response.status()).toBe(201);ids.push((await response.json()).data.id);
  }
  await page.goto(`${WEB}/#/projects/${ids[1]}/audit`);
  await expect(page.locator('header').getByText(`second-${stamp}.example.test`,{exact:true})).toBeVisible();
  await page.reload();
  await expect(page.locator('header').getByText(`second-${stamp}.example.test`,{exact:true})).toBeVisible();
  await page.getByRole('link',{name:'تیم',exact:true}).click();
  await expect(page.locator('main').getByText(email,{exact:true})).toBeVisible();
  await page.goto(`${WEB}/#/settings`);
  await page.getByLabel('نام سازمان',{exact:true}).fill(`Saved ${stamp}`);
  await page.getByRole('button',{name:'ذخیره تنظیمات',exact:true}).click();
  await expect(page.getByText('تنظیمات ذخیره شد.',{exact:true})).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('نام سازمان',{exact:true})).toHaveValue(`Saved ${stamp}`);
  await page.getByRole('button',{name:'خروج',exact:true}).click();
  await expect(page.locator('form input[type=email]')).toBeVisible();
  expect((await request.get(`${API}/api/v1/auth/me`,{headers})).status()).toBe(401);
  expect(errors).toEqual([]);
});

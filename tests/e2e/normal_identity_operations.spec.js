import { test, expect } from '@playwright/test';
import { goToTab } from './helpers/franchise.js';
import { getAssetValue } from '../../src/core/trades/assetValuation.js';
import { buildTeamIntelligence } from '../../src/ui/utils/teamIntelligence.js';
import { rankTradePartners } from '../../src/ui/utils/tradeFinder.js';

test.setTimeout(120000);
async function launch(page,year) {
  await page.goto('/');
  await page.getByTestId('start-new-franchise-cta').first().click();
  await page.locator('.team-card').filter({hasText:'Buffalo'}).click();
  await page.getByTestId('onboarding-continue-button').click();
  await page.locator('.settings-group').filter({has:page.locator('label',{hasText:'Starting Year'})}).locator('input').fill(String(year));
  await page.getByText('Advanced Settings',{exact:true}).click();
  await page.locator('.settings-group').filter({has:page.locator('label',{hasText:'Salary Cap ($M)',exact:true})}).locator('input').fill('500');
  await page.getByTestId('onboarding-continue-button').click();
  await page.getByTestId('start-dynasty-button').click();
  await expect(page.getByTestId('franchise-hq')).toBeVisible({timeout:60000});
  await page.reload();
  await expect(page.getByTestId('franchise-hq')).toBeVisible({timeout:60000});
  return read(page);
}
async function read(page) {
  return page.evaluate(async()=>{
    const name=`FootballGM_League_${window.state.league.activeLeagueId}`;
    const db=await new Promise((resolve,reject)=>{const r=indexedDB.open(name);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
    const all=store=>new Promise((resolve,reject)=>{const r=db.transaction(store).objectStore(store).getAll();r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
    const result={name,meta:(await all('meta')).find(r=>r.id==='league'),players:await all('players'),teams:await all('teams'),transactions:await all('transactions')};
    db.close();return result;
  });
}
async function patchFresh(page,snapshot,patch) {
  // Remove the app document/worker before editing controlled fixtures in this
  // test's brand-new, isolated save. Existing browser/user profiles are unused.
  await page.goto('/sw.js');
  await page.evaluate(async({name,patch})=>{
    const db=await new Promise((resolve,reject)=>{const r=indexedDB.open(name);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
    const tx=db.transaction(['players','teams'],'readwrite');
    for(const row of patch.players??[])tx.objectStore('players').put(row);
    for(const row of patch.teams??[])tx.objectStore('teams').put(row);
    await new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});db.close();
  },{name:snapshot.name,patch});
  await page.goto('/');
  await expect(page.getByTestId('franchise-hq')).toBeVisible({timeout:60000});
}
const core=p=>({id:p.id,name:p.name,pos:p.pos,age:p.age,teamId:p.teamId,ratings:p.ratings,contract:p.contract,stats:p.stats,careerStats:p.careerStats});
function stableOthers(before,after,changed) {
  const old=new Map(before.map(p=>[p.id,core(p)]));
  for(const p of after)if(!changed.includes(p.id))expect(core(p)).toEqual(old.get(p.id));
}
async function teamTab(page,tab) {
  await page.locator('[data-testid="nav-team"], [data-testid="primary-nav-team"]').first().click();
  await page.getByTestId(`section-tab-${tab}`).click();
}

test('2026 normal UI releases two players and shows accurate controlled injury readiness after reload',async({page})=>{
  const start=await launch(page,2026);
  expect(start.meta.generationDiagnostics.source).toBe('normal');
  const own=start.players.filter(p=>p.teamId===start.meta.userTeamId);
  const selected=own.filter(p=>p.pos==='WR').sort((a,b)=>(b.depthChart?.order??99)-(a.depthChart?.order??99)).slice(0,2);
  await goToTab(page,'roster');
  await page.getByRole('button',{name:/bulk cut mode off/i}).click();
  for(const p of selected)await page.getByRole('checkbox',{name:`Select ${p.name}`,exact:true}).check();
  await page.getByRole('button',{name:/preview bulk release/i}).click();
  const modal=page.getByRole('dialog',{name:'Bulk release preview'});
  await expect(modal.getByText('Selected players').locator('..')).toContainText('2');
  await modal.getByRole('button',{name:'Cancel',exact:true}).click();
  expect((await read(page)).players.filter(p=>p.teamId===start.meta.userTeamId)).toHaveLength(53);
  await page.getByRole('button',{name:/preview bulk release/i}).click();
  await modal.getByRole('button',{name:'Confirm Bulk Release'}).click();
  await expect(modal).toBeHidden();
  const cut=await read(page);
  expect(cut.players.filter(p=>p.teamId===start.meta.userTeamId)).toHaveLength(51);
  expect(cut.transactions.filter(t=>t.type==='RELEASE').map(t=>t.details.playerId).sort()).toEqual(selected.map(p=>p.id).sort());
  stableOthers(start.players,cut.players,selected.map(p=>p.id));
  await page.reload();await expect(page.getByTestId('app-shell-ready')).toBeVisible({timeout:60000});
  const saved=await read(page);
  expect(saved.transactions.filter(t=>t.type==='RELEASE')).toEqual(cut.transactions.filter(t=>t.type==='RELEASE'));
  const roster=saved.players.filter(p=>p.teamId===start.meta.userTeamId);
  const injuries=['P','QB','RB','WR'].map(pos=>roster.filter(p=>p.pos===pos).sort((a,b)=>(a.depthChart?.order??99)-(b.depthChart?.order??99))[pos==='P'?0:2]);
  expect(injuries.every(Boolean)).toBe(true);
  await patchFresh(page,saved,{players:injuries.map(p=>({...p,injuryWeeksRemaining:1,injury:{type:'Controlled one-week strain',weeksRemaining:1}}))});
  await teamTab(page,'injuries');
  await expect(page.getByText('Needs Attention',{exact:true}).first()).toBeVisible();
  await expect(page.getByText('Replacement Risk',{exact:true}).first().locator('..').locator('strong')).toHaveText('1');
  await expect(page.getByText('Injured Starters',{exact:true}).first().locator('..').locator('strong')).toHaveText('1');
  await expect(page.getByText('Critical',{exact:true})).toHaveCount(0);
  stableOthers(saved.players,(await read(page)).players,injuries.map(p=>p.id));
});

test('2031 normal Finder suggests an unselected asset, preserves workspace and commits a real trade',async({page})=>{
  const start=await launch(page,2031);
  expect(start.meta.generationDiagnostics.source).toBe('normal');
  const uid=start.meta.userTeamId;
  const all=start.teams.map(t=>({...t,roster:start.players.filter(p=>p.teamId===t.id)}));
  const own=[...all.find(t=>t.id===uid).roster].sort((a,b)=>b.ovr-a.ovr).slice(0,32).filter(p=>p.age<=26&&!['K','P'].includes(p.pos)).sort((a,b)=>getAssetValue(b,null,{})-getAssetValue(a,null,{})).slice(0,2);
  expect(own).toHaveLength(2);
  const market=all.map(t=>t.id===uid?t:{...t,wins:0,losses:10});
  const ranked=rankTradePartners({teams:market.map(t=>({...t,teamIntel:buildTeamIntelligence(t,{week:1})})),userTeamId:uid,outgoingPlayers:own,week:1}).slice(0,8);
  let candidate;
  for(const row of ranked) {
    const team=market.find(t=>t.id===row.teamId);
    const eligible=team.roster.filter(p=>!['QB','K','P'].includes(p.pos)&&p.age<=26&&p.potential>=p.ovr).sort((a,b)=>getAssetValue(a,null,{})-getAssetValue(b,null,{})).slice(0,2);
    if(eligible.length===2&&own.reduce((s,p)=>s+getAssetValue(p,null,{}),0)>eligible.reduce((s,p)=>s+getAssetValue(p,null,{}),0)*1.4) {candidate={team,players:eligible};break;}
  }
  expect(candidate,'a legal generated rebuilding-market fixture').toBeTruthy();
  const {team,players:targets}=candidate;
  const patches=team.roster.map(p=>({...p,tradeStatus:targets.some(t=>t.id===p.id)?'available':'not_available'}));
  await patchFresh(page,start,{teams:market.filter(t=>t.id!==uid).map(({roster,...t})=>t),players:patches});
  const baseline=await read(page);
  await goToTab(page,'transactions');
  await page.getByRole('button',{name:'Builder',exact:true}).click();
  await page.locator('select').filter({has:page.locator(`option[value="${team.id}"]`)}).first().selectOption(String(team.id));
  for(const p of own)await page.getByRole('checkbox',{name:`Add to Trade ${p.name}`,exact:true}).check();
  await page.getByRole('checkbox',{name:`Add to Trade ${targets[0].name}`,exact:true}).check();
  await page.getByRole('button',{name:'Finder',exact:true}).click();
  const ranks=page.locator('.card-premium').filter({has:page.getByText('Likely Trade Partners',{exact:true})});
  await ranks.getByText(team.name,{exact:true}).locator('../..').getByRole('button',{name:'Make this deal work',exact:true}).click();
  await expect(page.getByText(/Package note:.*younger controllable/)).toBeVisible();
  await page.getByRole('button',{name:'Builder',exact:true}).click();
  for(const p of [...own,...targets])await expect(page.getByRole('checkbox',{name:`Remove ${p.name}`,exact:true})).toBeChecked();
  await page.getByRole('button',{name:'Summary',exact:true}).click();
  await page.getByRole('button',{name:'Builder',exact:true}).click();
  for(const p of [...own,...targets])await expect(page.getByRole('checkbox',{name:`Remove ${p.name}`,exact:true})).toBeChecked();
  await page.getByRole('button',{name:'Propose Trade',exact:true}).first().click();
  await expect(page.getByText('Trade Accepted!',{exact:true})).toBeVisible({timeout:30000});
  const result=await read(page);
  const trade=result.transactions.find(t=>t.type==='TRADE');
  expect(new Set(trade.details.offering.playerIds)).toEqual(new Set(own.map(p=>p.id)));
  expect(new Set(trade.details.receiving.playerIds)).toEqual(new Set(targets.map(p=>p.id)));
  for(const p of own)expect(result.players.find(row=>row.id===p.id).teamId).toBe(team.id);
  for(const p of targets)expect(result.players.find(row=>row.id===p.id).teamId).toBe(uid);
  stableOthers(baseline.players,result.players,[...own,...targets].map(p=>p.id));
  await page.reload();await expect(page.getByTestId('app-shell-ready')).toBeVisible({timeout:60000});
  const loaded=await read(page);
  expect(loaded.transactions.find(t=>t.id===trade.id)).toEqual(trade);
  for(const p of [...own,...targets])expect(core(loaded.players.find(row=>row.id===p.id))).toEqual(core(result.players.find(row=>row.id===p.id)));
});

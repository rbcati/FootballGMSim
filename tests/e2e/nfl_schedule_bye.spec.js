import { test, expect } from '@playwright/test';
import { launchFranchise, goToTab } from './helpers/franchise.js';

for (const mobile of [false, true]) {
  test.describe(mobile ? 'NFL schedule at 390px' : 'NFL schedule on desktop', () => {
    test.use(mobile ? {viewport:{width:390,height:844},isMobile:true,hasTouch:true} : {viewport:{width:1280,height:900}});
    test('Pittsburgh has real rivalries, distinct opponents, and a readable bye', async ({page}) => {
      await launchFranchise(page);
      const close=page.getByLabel('Close changelog');
      if(await close.isVisible()) await close.click();
      const pit=await page.evaluate(()=>{
        const league=window.state.league;
        const id=side=>Number(side?.id??side);
        const games=league.schedule.weeks.flatMap(w=>w.games).filter(g=>id(g.home)===7||id(g.away)===7);
        const counts={};for(const g of games) {const opp=id(g.home)===7?id(g.away):id(g.home);counts[opp]=(counts[opp]??0)+1;}
        return {counts,games:games.length,byes:league.schedule.weeks.filter(w=>w.teamsWithBye?.includes(7)).map(w=>w.week)};
      });
      expect(pit.games).toBe(17);expect(pit.byes).toHaveLength(1);
      expect(Object.keys(pit.counts)).toHaveLength(14);
      for(const id of [4,5,6]) expect(pit.counts[id]).toBe(2);
      for(const [id,count] of Object.entries(pit.counts)) if(![4,5,6].includes(Number(id))) expect(count).toBe(1);
      await goToTab(page,'schedule');
      await page.getByLabel('Schedule view mode').selectOption('selected_team');
      await page.getByLabel('Schedule team filter').selectOption('7');
      await page.getByRole('tablist',{name:'Week selector'}).getByRole('tab',{name:String(pit.byes[0]),exact:true}).click();
      await expect(page.getByText('Pittsburgh Steelers — Bye week',{exact:true})).toBeVisible();
      await expect(page.getByText(`No regular-season game in Week ${pit.byes[0]}.`,{exact:true})).toBeVisible();
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1)).toBe(true);
      await page.screenshot({path:test.info().outputPath('pittsburgh-bye.png'),fullPage:true});
    });
  });
}

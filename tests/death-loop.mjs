import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { createServer } from 'vite';
import { chromium } from '@playwright/test';

const server=await createServer({server:{host:'127.0.0.1',port:5216},logLevel:'error'});await server.listen();
const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH||'/usr/bin/chromium'});
mkdirSync('test-results/death-loop',{recursive:true});
try {
  for(const [width,atlas,theme] of [[390,true,'medieval'],[1100,false,'neon']]) {
    const page=await browser.newPage({viewport:{width,height:850}}),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.clock.install({time:new Date('2026-11-19T18:00:00Z')});
    await page.addInitScript(()=>{
      globalThis.__handHeld=true;globalThis.__handStartsPaused=true;
      const s=sessionStorage.getItem('__deathFixture');if(s){localStorage.setItem('towerdelve.v1',s);sessionStorage.removeItem('__deathFixture');}
    });
    const ready=async()=>{await page.locator('#boot-loading').waitFor({state:'hidden',timeout:120000});await page.locator('#hp').waitFor();};
    await page.goto(server.resolvedUrls.local[0]);await ready();
    const seed=async(kind='fallen',reduced=false)=>{
      await page.clock.resume();
      await page.evaluate(async({kind,reduced,atlas,theme})=>{
        const {defaults}=await import('/src/save/save.ts'),{Game}=await import('/src/state.ts');
        const s=defaults();Object.keys(s.tutorials).forEach(k=>s.tutorials[k]=true);s.themes.push('neonUi','medievalUi');
        Object.assign(s.settings,{experimentalAtlas:atlas,uiTheme:theme,reduceMotion:reduced,spriteAnimations:false,transition:'instant',weatherSound:false});
        const g=new Game(s);g.newRun({seed:7,outside:kind.startsWith('trial')});
        if(kind.startsWith('trial')){
          const {startTrial}=await import('/src/proving-grounds/trial.ts');
          const trial=startTrial(g.run.player,'manual',g.hand,7);if(kind==='trial'){trial.player.hp=0;trial.status='lost';}g.save.provingGrounds=trial;
        }else if(kind!=='early'){
          let spot;
          for(let y=1;y<16&&!spot;y++)for(let x=1;x<16&&!spot;x++)if(g.world.tile(x,y).kind==='enemy'&&g.world.tile(x,y-1).kind==='floor')spot={x,y:y-1};
          Object.assign(g.run.player,{...spot,hp:1});g.move(0,1,true);
          if(!g.fallen)throw Error('Fixture did not fall');
        }
        sessionStorage.setItem('__deathFixture',JSON.stringify(g.save));
      },{kind,reduced,atlas,theme});
      await page.reload();await ready();
      await page.locator(kind.startsWith('trial')?'#trial-leave':kind==='early'?'#end-run':'#defeat-accept').waitFor({state:kind==='early'?'attached':'visible'});
      await page.clock.pauseAt(await page.evaluate(()=>Date.now()+10000));
    };
    const click=selector=>page.locator(selector).evaluate(e=>e.click());
    const saved=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('towerdelve.v1')));
    const pixelCount=()=>page.locator('.death-loop-symbol').evaluate(c=>[...c.getContext('2d').getImageData(0,0,96,40).data].filter((v,i)=>i%4===3&&v).length);
    await seed();await click('#defeat-accept');await page.clock.runFor(100);
    assert.ok(await page.locator('#modal.death-loop[open]').count());
    const cover=await page.locator('#modal').evaluate(e=>{const b=e.getBoundingClientRect(),s=getComputedStyle(e);return [b.x,b.y,b.width,b.height,innerWidth,innerHeight,getComputedStyle(e.querySelector('.death-loop-curtain')).backgroundColor,s.borderTopWidth,s.borderImageSource,s.outlineStyle,getComputedStyle(e,"::before").display,getComputedStyle(e,"::after").display];});
    assert.deepEqual(cover,[0,0,width,850,width,850,'rgb(0, 0, 0)','0px','none','none','none','none']);
    assert.equal(await pixelCount(),0,'the symbol stays hidden during fade-in');
    let opacity=Number(await page.locator('#modal').evaluate(e=>getComputedStyle(e).opacity));
    assert.ok(opacity>0&&opacity<1,'the old world fades to black gradually');
    await page.clock.runFor(450);
    assert.equal(Number(await page.locator('#modal').evaluate(e=>getComputedStyle(e).opacity)),1);
    assert.equal(await pixelCount(),0,'the trace waits for full black');
    await page.clock.runFor(900);
    const partial=await pixelCount();assert.ok(partial>0&&partial<400);
    assert.ok((await saved()).tower.fall,'return is not paid while the trace is drawing');
    await page.screenshot({path:`test-results/death-loop/drawing-${width}.png`});
    await page.clock.runFor(1000);
    const complete=await pixelCount();assert.ok(complete>partial);
    assert.equal(await page.locator('.death-loop-symbol').getAttribute('data-frame'),'47');
    await page.screenshot({path:`test-results/death-loop/complete-${width}.png`});
    await page.clock.runFor(300);
    assert.equal((await saved()).tower.run.outside,true);
    assert.equal((await saved()).tower.fall,null);
    assert.ok(await page.locator('#modal[open]').count(),'input remains blocked through the reveal fade');
    assert.equal(await page.locator('#modal').getAttribute('data-death-loop-phase'),'burst');
    assert.equal(Number(await page.locator('.death-loop-pixels').getAttribute('data-particles')),complete,'every visible texel bursts');
    await page.screenshot({path:`test-results/death-loop/burst-${width}.png`});
    await page.clock.runFor(600);
    opacity=Number(await page.locator('.death-loop-curtain').evaluate(e=>getComputedStyle(e).opacity));
    assert.ok(opacity>0&&opacity<1,'the returned world fades back gradually');
    assert.equal(await page.locator('#modal').getAttribute('data-death-loop-phase'),'absorb');
    const destination=await page.evaluate(async()=>{
      const {Game}=await import('/src/state.ts'),{Renderer}=await import('/src/render/rendering.ts');
      const g=new Game(JSON.parse(localStorage.getItem('towerdelve.v1')));
      const r=new Renderer(document.querySelector('#world'),g),p=r.heroClientPoint();
      const c=document.querySelector('.death-loop-pixels');
      return [p.x,p.y,Number(c.dataset.targetX),Number(c.dataset.targetY)];
    });
    assert.deepEqual(destination.slice(0,2),destination.slice(2),'pixels converge on the returned hero');
    await page.screenshot({path:`test-results/death-loop/absorb-${width}.png`});
    await page.clock.runFor(700);
    assert.equal(await page.locator('#modal[open], #modal.death-loop').count(),0);
    await page.screenshot({path:`test-results/death-loop/returned-${width}.png`});
    const gold=(await saved()).gold;await page.clock.runFor(1000);assert.equal((await saved()).gold,gold,'return pays once');

    await seed('fallen',true);await click('#defeat-accept');await page.clock.runFor(112);
    assert.equal(await page.locator('.death-loop-symbol').getAttribute('data-frame'),'47','Reduce motion uses the completed still symbol');
    await page.clock.runFor(450);assert.equal(await page.locator('#modal[open]').count(),0);
    assert.equal((await saved()).tower.run.outside,true);

    await seed();await click('#defeat-retry');await page.clock.runFor(32);
    await page.keyboard.press('Escape');await page.clock.runFor(32);
    assert.equal(await page.locator('#modal[open]').count(),0,'Escape safely skips');
    assert.equal((await saved()).tower.fall,null);
    assert.ok(!(await saved()).tower.run.outside,'Retry still begins a fresh run inside');

    await seed('trial');await click('#trial-leave');await page.clock.runFor(1000);
    assert.ok(await page.locator('#modal.death-loop[open]').count(),'trial knockout uses the same loop');
    await page.locator('#modal').dispatchEvent('pointerdown');await page.clock.runFor(32);
    assert.equal(await page.locator('#modal[open]').count(),0,'tap safely skips');
    assert.equal((await saved()).provingGrounds,undefined);
    assert.equal((await saved()).tower.run.outside,true);
    await seed('early');await click('#end-run');await click('#cancel');await page.clock.runFor(32);
    assert.equal(await page.locator('#modal.death-loop').count(),0,'keeping the run does not play the loop');
    assert.ok(!(await saved()).tower.run.outside);
    await click('#end-run');await click('#confirm');await page.clock.runFor(100);
    assert.equal(await page.locator('#modal').getAttribute('data-death-loop-phase'),'fade-in');
    await page.locator('#modal').dispatchEvent('close');
    assert.ok(await page.locator('#modal.death-loop[open]').count(),'a stale close event cannot dismiss the reopened interlude');
    assert.ok(!(await saved()).tower.run.outside,'early end is not committed before the loop');
    await page.clock.runFor(2700);
    assert.equal((await saved()).tower.run.outside,true);
    assert.ok(await page.locator('#modal[open]').count());
    await page.clock.runFor(1200);assert.equal(await page.locator('#modal[open]').count(),0);

    await seed('early');await click('#end-run');await click('#retry');await page.clock.runFor(100);
    assert.ok(await page.locator('#modal.death-loop[open]').count(),'early Retry uses the same sequence');
    await page.keyboard.press('Enter');await page.clock.runFor(32);
    assert.equal(await page.locator('#modal[open]').count(),0);
    assert.ok(!(await saved()).tower.run.outside);
    assert.equal((await saved()).tower.fall,null);

    await seed('trial-early');await click('#trial-leave');await page.clock.runFor(100);
    assert.equal(await page.locator('#modal').getAttribute('data-death-loop-phase'),'fade-in','leaving an active trial plays the loop');
    assert.ok((await saved()).provingGrounds);
    await page.keyboard.press('Escape');await page.clock.runFor(32);
    assert.equal((await saved()).provingGrounds,undefined);
    assert.equal((await saved()).tower.run.outside,true);
    assert.deepEqual(errors,[]);await page.close();
    console.log(`Fade-in/trace/fade-out, death and early return/retry, cancellation, trial exits, reduced motion and skips passed at ${width}px (atlas=${atlas}, theme=${theme}).`);
  }
}finally{await browser.close();await server.close();}

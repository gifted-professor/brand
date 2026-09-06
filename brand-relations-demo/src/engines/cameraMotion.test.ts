import {describe,it,expect} from 'vitest';
import {stepCamera} from './cameraMotion';
describe('camera motion',()=>{
  it('converges without overshoot and stops instead of leaving an idle animation',()=>{
    const target={x:350,y:-210,zoom:1.8};let current={x:0,y:0,zoom:.8},settled=false;
    for(let frame=0;frame<120;frame++){
      const next=stepCamera(current,target,1000/60);
      expect(next.view.x).toBeGreaterThanOrEqual(current.x);expect(next.view.x).toBeLessThanOrEqual(target.x);
      expect(next.view.y).toBeLessThanOrEqual(current.y);expect(next.view.y).toBeGreaterThanOrEqual(target.y);
      current=next.view;if(next.settled){settled=true;break;}
    }
    expect(settled).toBe(true);expect(current).toEqual(target);
  });
  it('has the same progress at 60 and 120 Hz and safely changes target mid-flight',()=>{
    const target={x:200,y:-100,zoom:1.5};
    const advance=(hz:number)=>{let view={x:0,y:0,zoom:.8};for(let frame=0;frame<hz/5;frame++)view=stepCamera(view,target,1000/hz).view;return view;};
    expect(advance(60).x).toBeCloseTo(advance(120).x,8);
    const reversed=stepCamera(advance(60),{x:0,y:0,zoom:.8},1000/60);
    expect(reversed.view.x).toBeLessThan(advance(60).x);expect(reversed.view.x).toBeGreaterThan(0);
  });
});

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent, PointerEvent as ReactPointerEvent, RefObject } from 'react';
import { VIEW_CONFIG, VIEWPORT_LOD_CONFIG } from '../config';
import type { Viewport, ViewportSize } from '../domain/types';
import { constrainViewport, zoomAt } from '../engines/viewport';
import { stepCamera } from '../engines/cameraMotion';
import { createThrottledUpdater } from './throttledUpdater';

export type CameraMemory = RefObject<{view:Viewport;resetKey:number}|null>;
const initialView = (): Viewport => ({ x:0,y:0,zoom:window.matchMedia('(max-width: 640px)').matches?VIEW_CONFIG.narrowInitialZoom:VIEW_CONFIG.initialZoom });
const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
interface Pointer {x:number;y:number}
interface Gesture {id:number;x:number;y:number;view:Viewport;moved:boolean;brandId?:string}

export function useViewport(resetKey:number,onBrandSelect:(id:string)=>void,memory?:CameraMemory) {
  const canvasRef=useRef<HTMLDivElement>(null), worldRef=useRef<HTMLDivElement>(null);
  const [snapshot,setSnapshot]=useState<{view:Viewport;size:ViewportSize}>(()=>({view:initialView(),size:{width:1000,height:800}}));
  const liveView=useRef(snapshot.view), liveSize=useRef(snapshot.size);
  const cameraFrame=useRef<number|null>(null), pointerFrame=useRef<number|null>(null);
  const targetView=useRef<Viewport|null>(null), pendingView=useRef<Viewport|null>(null);
  const previousReset=useRef(resetKey);
  const activeReset=useRef(resetKey);
  const initialized=useRef(false), gesture=useRef<Gesture|null>(null);
  const pointers=useRef(new Map<number,Pointer>());
  const pinch=useRef<{distance:number;center:Pointer;view:Viewport}|null>(null);
  const [dragging,setDragging]=useState(false);
  const updater=useMemo(()=>createThrottledUpdater(()=>setSnapshot({view:liveView.current,size:liveSize.current}),VIEWPORT_LOD_CONFIG.updateIntervalMs),[]);
  const writeView=useCallback((next:Viewport)=>{
    liveView.current=constrainViewport(next,liveSize.current);
    const {x,y,zoom}=liveView.current;
    if(memory) memory.current={view:liveView.current,resetKey:activeReset.current};
    if(canvasRef.current) {
      // A repeating screen-sized layer never exposes a finite background edge.
      const grid = 28 * zoom;
      canvasRef.current.style.backgroundSize = `${grid}px ${grid}px`;
      canvasRef.current.style.backgroundPosition = `${(liveSize.current.width / 2 + x) % grid}px ${(liveSize.current.height / 2 + y) % grid}px`;
    }
    if(worldRef.current) {
      worldRef.current.style.transform=`translate3d(${x}px,${y}px,0) scale(${zoom})`;
      worldRef.current.style.setProperty('--node-counter-scale',String(1/zoom));
      worldRef.current.style.setProperty('--marker-scale',String(Math.max(1,1/zoom)));
    }
  },[memory]);
  const stopCamera=useCallback(()=>{
    if(cameraFrame.current!==null) cancelAnimationFrame(cameraFrame.current);
    cameraFrame.current=null; targetView.current=null;
  },[]);
  const flushPointer=useCallback(()=>{
    if(pointerFrame.current!==null)cancelAnimationFrame(pointerFrame.current);
    pointerFrame.current=null;
    if(pendingView.current)writeView(pendingView.current);
    pendingView.current=null;
  },[writeView]);
  const movePointer=useCallback((view:Viewport)=>{
    pendingView.current=view;
    if(pointerFrame.current===null)pointerFrame.current=requestAnimationFrame(()=>{flushPointer();updater.schedule();});
  },[flushPointer,updater]);
  const animateTo=useCallback((view:Viewport)=>{
    targetView.current=constrainViewport(view,liveSize.current);
    if(reduced()){stopCamera();writeView(view);updater.flush();return;}
    if(cameraFrame.current!==null)return;
    let previous=performance.now();
    const intervals:number[]=[];
    const tick=(now:number)=>{
      if(!targetView.current){cameraFrame.current=null;return;}
      const elapsed=now-previous;
      if(import.meta.env.DEV)intervals.push(elapsed);
      const result=stepCamera(liveView.current,targetView.current,elapsed);previous=now;
      writeView(result.view);
      if(result.settled){
        if(import.meta.env.DEV&&worldRef.current){
          const sorted=[...intervals].sort((a,b)=>a-b);
          worldRef.current.dataset.cameraTiming=JSON.stringify({frames:intervals.length,p95Ms:Math.round(sorted[Math.floor(sorted.length*.95)]*10)/10,maxMs:Math.round(Math.max(...intervals)*10)/10});
        }
        cameraFrame.current=null;targetView.current=null;updater.flush();
      }
      else{updater.schedule();cameraFrame.current=requestAnimationFrame(tick);}
    };
    cameraFrame.current=requestAnimationFrame(tick);
  },[stopCamera,updater,writeView]);
  useLayoutEffect(()=>{
    activeReset.current=resetKey;
    stopCamera();flushPointer();gesture.current=null;pointers.current.clear();pinch.current=null;setDragging(false);
    if(!initialized.current){
      const restored=memory?.current?.resetKey===resetKey?memory.current.view:initialView();
      initialized.current=true;writeView(restored);updater.flush();
    }else if(previousReset.current!==resetKey)animateTo(initialView());
    else{writeView(liveView.current);updater.flush();}
    previousReset.current=resetKey;
    return stopCamera;
  },[resetKey,memory,stopCamera,writeView,updater,animateTo,flushPointer]);
  useEffect(()=>{
    const canvas=canvasRef.current;if(!canvas)return;
    const observer=new ResizeObserver(([entry])=>{
      const rect=canvas.getBoundingClientRect();
      const overlays=canvas.parentElement?.querySelectorAll('.canvas-intro, .field-key, .zoom-controls')??[];
      const occlusions=[...overlays].filter(overlay=>overlay.getBoundingClientRect().width>0).map(overlay=>{
        const bounds=overlay.getBoundingClientRect();return {left:bounds.left-rect.left,right:bounds.right-rect.left,top:bounds.top-rect.top,bottom:bounds.bottom-rect.top};
      });
      liveSize.current={width:entry.contentRect.width,height:entry.contentRect.height,occlusions};
      writeView(liveView.current);updater.flush();
    });observer.observe(canvas);
    const wheel=(event:WheelEvent)=>{
      event.preventDefault();if(pointers.current.size)return;
      const rect=canvas.getBoundingClientRect();
      const unit=event.deltaMode===1?16:event.deltaMode===2?rect.height:1;
      if(event.shiftKey){const current=targetView.current??liveView.current;animateTo({...current,x:current.x-(event.deltaX||event.deltaY)*unit});return;}
      const delta=Math.max(-180,Math.min(180,event.deltaY*unit));
      animateTo(zoomAt(targetView.current??liveView.current,Math.exp(-delta*.0018),event.clientX-rect.left-rect.width/2,event.clientY-rect.top-rect.height/2));
    };
    canvas.addEventListener('wheel',wheel,{passive:false});
    return ()=>{observer.disconnect();canvas.removeEventListener('wheel',wheel);stopCamera();if(pointerFrame.current!==null)cancelAnimationFrame(pointerFrame.current);updater.cancel();};
  },[animateTo,stopCamera,updater,writeView]);
  const zoom=useCallback((factor:number)=>animateTo(zoomAt(targetView.current??liveView.current,factor)),[animateTo]);
  const flyTo=useCallback((x:number,y:number)=>{
    const zoom=Math.max(.9,liveView.current.zoom);animateTo({x:-x*zoom,y:-y*zoom,zoom});
  },[animateTo]);
  const onPointerDown=(event:ReactPointerEvent<HTMLDivElement>)=>{
    if(event.button!==0||(event.target as Element).closest('[data-no-pan]'))return;
    stopCamera();flushPointer();pointers.current.set(event.pointerId,{x:event.clientX,y:event.clientY});
    if(pointers.current.size===2){
      const [a,b]=[...pointers.current.values()];pinch.current={distance:Math.max(1,Math.hypot(a.x-b.x,a.y-b.y)),center:{x:(a.x+b.x)/2,y:(a.y+b.y)/2},view:liveView.current};
      if(gesture.current)gesture.current.moved=true;setDragging(true);
    }else if(pointers.current.size===1){
      gesture.current={id:event.pointerId,x:event.clientX,y:event.clientY,view:liveView.current,moved:false,brandId:(event.target as Element).closest<HTMLElement>('[data-brand-id]')?.dataset.brandId};
    }
    if(event.pointerType==='touch')event.currentTarget.setPointerCapture(event.pointerId);
  };
  const onPointerMove=(event:ReactPointerEvent<HTMLDivElement>)=>{
    if(!pointers.current.has(event.pointerId))return;
    pointers.current.set(event.pointerId,{x:event.clientX,y:event.clientY});
    if(pinch.current&&pointers.current.size>=2){
      const [a,b]=[...pointers.current.values()],start=pinch.current,rect=event.currentTarget.getBoundingClientRect();
      const next=zoomAt(start.view,Math.hypot(a.x-b.x,a.y-b.y)/start.distance,start.center.x-rect.left-rect.width/2,start.center.y-rect.top-rect.height/2);
      movePointer({...next,x:next.x+(a.x+b.x)/2-start.center.x,y:next.y+(a.y+b.y)/2-start.center.y});return;
    }
    const start=gesture.current;if(!start||start.id!==event.pointerId)return;
    const dx=event.clientX-start.x,dy=event.clientY-start.y;
    if(start.moved||Math.hypot(dx,dy)>VIEW_CONFIG.dragThreshold){
      if(!start.moved){event.currentTarget.setPointerCapture(event.pointerId);setDragging(true);}
      start.moved=true;movePointer({...start.view,x:start.view.x+dx,y:start.view.y+dy});
    }
  };
  const onPointerUp=(event:ReactPointerEvent<HTMLDivElement>)=>{
    if(!pointers.current.has(event.pointerId))return;
    flushPointer();const start=gesture.current;
    const wasPinch=Boolean(pinch.current);pointers.current.delete(event.pointerId);pinch.current=null;
    if(!wasPinch&&start?.id===event.pointerId){
      if(start.moved)writeView({...start.view,x:start.view.x+event.clientX-start.x,y:start.view.y+event.clientY-start.y});
      else if(start.brandId)onBrandSelect(start.brandId);
    }
    const remaining=[...pointers.current.entries()][0];
    gesture.current=remaining?{id:remaining[0],x:remaining[1].x,y:remaining[1].y,view:liveView.current,moved:true}:null;
    setDragging(Boolean(remaining));updater.flush();
    if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);
  };
  const cancelGesture=()=>{flushPointer();pointers.current.clear();pinch.current=null;gesture.current=null;setDragging(false);updater.flush();};
  const onLostPointerCapture=(event:ReactPointerEvent<HTMLDivElement>)=>{if(event.target===event.currentTarget&&pointers.current.has(event.pointerId))cancelGesture();};
  const onKeyDown=(event:KeyboardEvent<HTMLDivElement>)=>{
    if(event.target!==event.currentTarget)return;
    const current=targetView.current??liveView.current;
    if(event.key==='+'||event.key==='='){event.preventDefault();zoom(VIEW_CONFIG.zoomStep);}
    else if(event.key==='-'){event.preventDefault();zoom(1/VIEW_CONFIG.zoomStep);}
    else if(event.key==='Home'){event.preventDefault();animateTo(initialView());}
    else if(event.key.startsWith('Arrow')){event.preventDefault();animateTo({...current,x:current.x+(event.key==='ArrowLeft'?100:event.key==='ArrowRight'?-100:0),y:current.y+(event.key==='ArrowUp'?100:event.key==='ArrowDown'?-100:0)});}
  };
  return {canvasRef,worldRef,...snapshot,dragging,zoom,flyTo,handlers:{onPointerDown,onPointerMove,onPointerUp,onPointerCancel:cancelGesture,onLostPointerCapture,onKeyDown}};
}

const assert = require('node:assert/strict');
const test = require('node:test');
const { loadSource, effectHooks } = require('./load-source.cjs');

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes,no) => { resolve=yes;reject=no; });
  return { promise,resolve,reject };
}
const tick = () => new Promise((resolve) => setImmediate(resolve));
const coords = { latitude:14,longitude:121,accuracy:5 };
function environment(t, { holdLocation=false }={}) {
  t.mock.timers.enable({ apis:['setTimeout'] });
  const state = effectHooks();
  let userId='viewer', event, appChange, removed=0;
  const queries=[], locations=[], writes=[], heard=[];
  const appState={currentState:'active',addEventListener(_,cb){appChange=cb;return {remove(){removed++;}};}};
  const channel={ on(_,__,cb){event=cb;return this;},subscribe(){return this;} };
  const { NearbyReportsProvider } = loadSource('src/hooks/use-nearby-reports.tsx',{
    react:state.react,
    'expo-location':{ Accuracy:{Balanced:3},getCurrentPositionAsync(options){
      assert.equal(options.accuracy,3);
      const call=deferred();locations.push(call);
      if(!holdLocation) call.resolve({coords});return call.promise;
    },getLastKnownPositionAsync:async()=>null },
    'react-native':{AppState:appState},
    '@/hooks/use-session':{useSession:()=>({session:userId?{user:{id:userId}}:null})},
    '@/lib/alerts':{saveLastPlace:(...args)=>writes.push(args)},
    '@/lib/sounds':{playSound:(...args)=>heard.push(args)},
    '@/lib/nearby':{DEFAULT_RADIUS_M:5000,fetchNearbyReports(place,radius,signal){
      const call={...deferred(),place,radius,signal};queries.push(call);return call.promise;
    }},
    '@/lib/supabase':{supabase:{channel:()=>channel,removeChannel(){removed++;}}},
  });
  const render=()=>state.render(NearbyReportsProvider,{}).props.value;
  render();
  return {render,queries,locations,writes,heard,
    event:(payload={eventType:'UPDATE',new:{id:'moved'}})=>event(payload),
    app:(next)=>{appState.currentState=next;appChange(next);},switch(next='next'){userId=next;render();return render();},
    unmount:()=>state.unmount(),removed:()=>removed,
    async seed(){const work=render().refresh();await tick();queries.at(-1).resolve([{id:'complete'}]);await work;render();},
  };
}
test('identical concurrent explicit refreshes share location and complete query',async(t)=>{
  const e=environment(t);
  const first=e.render().refresh(),second=e.render().refresh();await tick();
  assert.equal(e.locations.length,1);assert.equal(e.queries.length,1);
  e.queries[0].resolve([{id:'all'}]);await Promise.all([first,second]);
  assert.deepEqual(e.render().reports,[{id:'all'}]);e.unmount();
});
test('identical reloads share work; foreground refresh still reads fresh location',async(t)=>{
  const e=environment(t);await e.seed();
  const first=e.render().reload(),second=e.render().reload();await tick();
  assert.equal(e.queries.length,2);e.queries[1].resolve([{id:'new'}]);await Promise.all([first,second]);
  const fresh=e.render().refresh();await tick();assert.equal(e.locations.length,2);
  e.queries[2].resolve([]);await fresh;e.unmount();
});
test('radius supersession aborts previous pages and ignores late response without error sound',async(t)=>{
  const e=environment(t);await e.seed();
  const old=e.render().reload();await tick();const call=e.queries.at(-1);
  e.render().setRadius(10000);await tick();
  assert.equal(call.signal.aborted,true);assert.equal(e.queries.at(-1).radius,10000);
  e.queries.at(-1).resolve([{id:'latest'}]);await tick();
  call.reject(Object.assign(new Error('cancelled'),{name:'AbortError'}));await old;
  assert.deepEqual(e.render().reports,[{id:'latest'}]);assert.deepEqual(e.heard,[]);e.unmount();
});
test('quiet/manual overlap cannot drop manual loading state or create cancellation errors',async(t)=>{
  const e=environment(t);await e.seed();
  const quiet=e.render().reload();await tick();const old=e.queries.at(-1);
  const manual=e.render().refresh();await tick();
  assert.equal(old.signal.aborted,true);assert.equal(e.render().status,'loading');
  old.resolve([{id:'stale'}]);await quiet;
  e.queries.at(-1).resolve([{id:'fresh'}]);await manual;
  assert.deepEqual(e.render().reports,[{id:'fresh'}]);assert.deepEqual(e.heard,[]);e.unmount();
});
test('quiet reload cannot supersede an in-flight explicit refresh at same place/radius',async(t)=>{
  const e=environment(t);await e.seed();
  const manual=e.render().refresh();await tick();const call=e.queries.at(-1);
  const quiet=e.render().reload();await tick();
  assert.equal(e.queries.length,2);assert.equal(call.signal.aborted,false);
  assert.equal(e.render().status,'loading');call.resolve([{id:'manual-complete'}]);
  await Promise.all([manual,quiet]);assert.deepEqual(e.render().reports,[{id:'manual-complete'}]);e.unmount();
});
test('ten-event burst uses one query and preserves every INSERT cue before debounce',async(t)=>{
  const e=environment(t);await e.seed();
  for(let i=0;i<10;i++) e.event({eventType:'INSERT',new:{id:String(i)}});
  assert.equal(e.heard.length,10);assert.equal(e.queries.length,1);
  t.mock.timers.tick(499);await tick();assert.equal(e.queries.length,1);
  t.mock.timers.tick(1);await tick();assert.equal(e.queries.length,2);
  e.queries.at(-1).resolve([]);await tick();e.unmount();
});
test('INSERT UPDATE DELETE during paged read coalesce one complete follow-up, not superseding read',async(t)=>{
  const e=environment(t);await e.seed();
  const pending=e.render().reload();await tick();const first=e.queries.at(-1);
  for(const eventType of ['INSERT','UPDATE','DELETE']) e.event({eventType,new:{id:'change'},old:{id:'change'}});
  t.mock.timers.tick(2000);await tick();assert.equal(e.queries.length,2);
  assert.equal(first.signal.aborted,false);
  first.resolve([{id:'first-complete'}]);await pending;await tick();
  assert.equal(e.queries.length,3);e.queries[2].resolve([{id:'reconciled'}]);await tick();
  assert.deepEqual(e.render().reports,[{id:'reconciled'}]);assert.equal(e.heard.length,1);e.unmount();
});
test('continuous events cannot postpone reload beyond two seconds',async(t)=>{
  const e=environment(t);await e.seed();
  for(let i=0;i<20;i++){e.event();t.mock.timers.tick(100);await tick();}
  assert.equal(e.queries.length,2);
  e.queries[1].resolve([]);await tick();e.unmount();
});
test('60 seconds background suppresses quiet/manual work; resume reconciles exactly once',async(t)=>{
  const e=environment(t);await e.seed();e.app('background');
  for(let i=0;i<60;i++){e.event();t.mock.timers.tick(1000);await tick();}
  assert.equal(e.queries.length,1);assert.equal(e.locations.length,1);
  await e.render().reload();await e.render().refresh();
  e.app('active');e.app('active');await tick();t.mock.timers.tick(500);await tick();
  assert.equal(e.queries.length,2);e.queries[1].resolve([]);await tick();e.unmount();
});
test('background cancels current pages while preserving last complete result',async(t)=>{
  const e=environment(t);await e.seed();const pending=e.render().refresh();await tick();
  const request=e.queries.at(-1);e.app('background');assert.equal(request.signal.aborted,true);
  request.resolve([{id:'background-stale'}]);await pending;
  assert.deepEqual(e.render().reports,[{id:'complete'}]);assert.equal(e.render().status,'ready');
  assert.deepEqual(e.heard,[]);e.unmount();
});
test('resume restarts authorized initial GPS once at latest radius; old GPS cannot save',async(t)=>{
  const e=environment(t,{holdLocation:true});const pending=e.render().refresh();
  e.app('background');await pending;
  e.render().setRadius(10000);e.render();
  assert.equal(e.locations.length,1);assert.equal(e.render().status,'idle');
  e.app('active');e.app('active');await tick();
  assert.equal(e.locations.length,2);assert.equal(e.render().status,'loading');
  e.locations[0].resolve({coords:{...coords,latitude:15}});await tick();assert.equal(e.writes.length,0);
  e.locations[1].resolve({coords});await tick();
  assert.equal(e.queries.length,1);assert.equal(e.queries[0].radius,10000);
  e.queries[0].resolve([{id:'initial-complete'}]);await tick();
  assert.deepEqual(e.render().reports,[{id:'initial-complete'}]);assert.equal(e.render().status,'ready');
  assert.equal(e.writes.length,1);assert.deepEqual(e.heard,[]);e.unmount();
});
test('resume restarts authorized first RPC once without discarding its fresh place',async(t)=>{
  const e=environment(t);const pending=e.render().refresh();await tick();const first=e.queries[0];
  e.app('background');assert.equal(first.signal.aborted,true);
  e.app('active');e.app('active');await tick();
  assert.equal(e.queries.length,2);assert.equal(e.locations.length,1);assert.equal(e.render().status,'loading');
  first.resolve([{id:'cancelled-initial'}]);await pending;assert.deepEqual(e.render().reports,[]);
  e.queries[1].resolve([{id:'resumed-complete'}]);await tick();
  assert.deepEqual(e.render().reports,[{id:'resumed-complete'}]);assert.equal(e.render().failure,null);
  assert.deepEqual(e.heard,[]);e.unmount();
});
test('resume never starts GPS for an account without a prior authorized pending search',async(t)=>{
  const e=environment(t);e.app('background');e.event();e.app('active');await tick();
  assert.deepEqual(e.locations,[]);assert.deepEqual(e.queries,[]);assert.equal(e.render().status,'idle');e.unmount();
});
for(const boundary of ['account','unmount']){
  test(`${boundary} clears interrupted initial search authorization`,async(t)=>{
    const e=environment(t,{holdLocation:true});const pending=e.render().refresh();
    e.app('background');await pending;
    if(boundary==='account')e.switch();else e.unmount();
    e.app('active');await tick();
    assert.equal(e.locations.length,1);assert.deepEqual(e.queries,[]);
    e.locations[0].resolve({coords});await tick();assert.deepEqual(e.writes,[]);e.unmount();
  });
}
test('account change cancels pages, clears results, prevents old callbacks and old location saves',async(t)=>{
  const e=environment(t);await e.seed();const pending=e.render().reload();await tick();
  const request=e.queries.at(-1);e.switch();assert.equal(request.signal.aborted,true);
  request.resolve([{id:'old'}]);await pending;assert.deepEqual(e.render().reports,[]);
  assert.equal(e.render().place,null);assert.equal(e.writes[0][2](),false);e.unmount();
});
test('superseded GPS read settles, clears timeout and cannot save old location',async(t)=>{
  const e=environment(t,{holdLocation:true});const pending=e.render().refresh();
  e.render().setRadius(10000);await pending;e.locations[1].resolve({coords});await tick();
  e.queries.at(-1).resolve([]);await tick();
  e.locations[0].resolve({coords:{...coords,latitude:15}});await pending;
  assert.equal(e.writes.length,1);assert.equal(e.writes[0][1].latitude,14);e.unmount();
});
test('unmount cancels pending RPC page and ignores a transport that resolves late',async(t)=>{
  const e=environment(t);const pending=e.render().refresh();await tick();const call=e.queries[0];
  e.unmount();assert.equal(call.signal.aborted,true);call.resolve([{id:'late'}]);await pending;
  assert.deepEqual(e.render().reports,[]);assert.deepEqual(e.heard,[]);
});
test('unmount cancels pages and GPS without late writes, errors, or retained timers',async(t)=>{
  const e=environment(t,{holdLocation:true});const pending=e.render().refresh();e.unmount();
  e.locations[0].resolve({coords});await pending;
  assert.deepEqual(e.writes,[]);assert.deepEqual(e.queries,[]);assert.deepEqual(e.heard,[]);
  assert.equal(e.removed(),2);
});
test('later-page network failure preserves complete list; manual failure sounds once, quiet failure silent',async(t)=>{
  const e=environment(t);await e.seed();const quiet=e.render().reload();await tick();
  e.queries.at(-1).reject(new Error('later page offline'));await quiet;
  assert.deepEqual(e.render().reports,[{id:'complete'}]);assert.deepEqual(e.heard,[]);
  const manual=e.render().refresh();await tick();e.queries.at(-1).reject(new Error('later page offline'));await manual;
  assert.deepEqual(e.render().reports,[{id:'complete'}]);assert.equal(e.render().failure,'network');
  assert.deepEqual(e.heard,[['error']]);e.unmount();
});

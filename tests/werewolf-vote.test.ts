import game from '../games/werewolf/game.js';
const fail=(m:string)=>{console.error('FAIL:',m);process.exit(1)};
let seed=1; const random=()=>((seed=seed*1103515245+12345&0x7fffffff)/0x7fffffff);
const players=[0,1,2,3,4].map(i=>({id:'p'+i,name:'P'+i,avatar:'x'}));
let s:any=(game.setup as any)({players,random,now:0,group:{},config:{}});
const ctx=(i:number,now=0)=>({playerId:'p'+i,role:'hand',now,random});
// everyone ready -> night
for(let i=0;i<5;i++) s=(game.moves as any).ready(s,ctx(i));
if(s.phase!=='night') fail('expected night, got '+s.phase);
// wolves pick, seer peeks -> day
const wolves=s.roles.map((r:string,i:number)=>r==='wolf'?i:-1).filter((i:number)=>i>=0);
const seer=s.roles.indexOf('seer');
const victim=s.roles.findIndex((r:string,i:number)=>r!=='wolf');
for(const w of wolves) s=(game.moves as any).wolfPick(s,ctx(w),victim);
if(s.phase==='night') s=(game.moves as any).seerPeek(s,ctx(seer),wolves[0]);
if(s.phase!=='day') fail('expected day, got '+s.phase);
const aliveCount=s.alive.filter(Boolean).length;
const need=Math.floor(aliveCount/2)+1;
console.log('day with',aliveCount,'alive, need',need,'calls');
const aliveSeats=s.alive.map((a:boolean,i:number)=>a?i:-1).filter((i:number)=>i>=0);
// a dead player cannot call
const dead=s.alive.findIndex((a:boolean)=>!a);
if(dead>=0 && (game.moves as any).callVote(s,ctx(dead))!==s) fail('a dead player called the vote');
// one short of a majority must NOT trigger
for(let k=0;k<need-1;k++) s=(game.moves as any).callVote(s,ctx(aliveSeats[k]));
if(s.phase!=='day') fail('vote started before a majority asked');
let v=(game.playerView as any)(s,{playerId:'p'+aliveSeats[0],role:'hand'});
if(v.callers!==need-1) fail('callers '+v.callers+' != '+(need-1));
if(v.callsNeeded!==need) fail('callsNeeded wrong');
if(!v.iCalled) fail('iCalled should be true');
// taking it back
s=(game.moves as any).callVote(s,ctx(aliveSeats[0]));
v=(game.playerView as any)(s,{playerId:'p'+aliveSeats[0],role:'hand'});
if(v.callers!==need-2||v.iCalled) fail('could not take the call back');
// majority triggers (callVote is a toggle — only tap seats that have not called)
for(const seat of aliveSeats){
  if(s.phase!=='day') break;
  if(!s.callers[seat]) s=(game.moves as any).callVote(s,ctx(seat));
}
if(s.phase!=='vote') fail('majority did not start the vote, phase='+s.phase);
console.log('ok: callVote needs a majority, is revocable, dead players excluded');
// role mix is public and adds up
v=(game.playerView as any)(s,{playerId:'p'+aliveSeats[0],role:'hand'});
if(v.wolfCount+v.villagerCount+1!==5) fail('role mix does not add up: '+JSON.stringify([v.wolfCount,v.villagerCount]));
// the mix must NOT reveal who
const leak=(game.playerView as any)(s,{playerId:'p'+aliveSeats[0],role:'hand'});
if(JSON.stringify(leak).includes('"roles"')) fail('playerView leaked the roles array');
console.log('ok: role mix public ('+v.wolfCount+' wolves, '+v.villagerCount+' villagers), identities still hidden');
// hostile: table device and unknown player cannot call
if((game.moves as any).callVote(s,{playerId:'p0',role:'table',now:0,random})!==s) fail('table called the vote');
console.log('ALL WEREWOLF TESTS PASSED');

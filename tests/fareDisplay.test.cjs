/* eslint-disable @typescript-eslint/no-require-imports */
process.env.ROUTEWISE_PUBLIC_PRICING_ENABLED='false';
const fs=require('fs'),path=require('path'),Module=require('module'),ts=require('typescript'),{test}=require('node:test'),assert=require('node:assert/strict');
for(const ext of ['.ts','.tsx'])require.extensions[ext]=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,f);
const resolve=Module._resolveFilename;Module._resolveFilename=function(r,...args){return resolve.call(this,r.startsWith('@/')?path.join(__dirname,'../src',r.slice(2)):r,...args);};
const React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
const FarePrice=require('../src/components/FarePrice.tsx').default;
const Results=require('../src/components/LongDistanceResults.tsx').default;
const RideshareCard=require('../src/components/RideshareCard.tsx').default;
const {sumJourneyCost,rankLongDistanceJourneys}=require('../src/server/services/longDistancePlanning.ts');
const fare=(overrides={})=>({provider:'LYFT',currency:'USD',priceLow:24,priceHigh:32,sourceType:'MODELED',confidence:'LOW',label:'Estimated fare',kind:'RANGE',appliesToTrip:true,retrievedAt:'2026-10-11T12:00:00Z',...overrides});
const html=(Component,props)=>renderToStaticMarkup(React.createElement(Component,props));
test('one fare display handles exact, range, from/day, unavailable, and local loading without false zero',()=>{
 assert.match(html(FarePrice,{fare:fare({kind:'EXACT',exactPrice:79,sourceType:'OFFICIAL'})}),/\$79/);
 assert.match(html(FarePrice,{fare:fare()}),/\$24.*\$32/);
 assert.match(html(FarePrice,{fare:fare({kind:'FROM',priceLow:54,appliesToTrip:false}),unit:'/day'}),/From \$54\/day/);
 const missing=html(FarePrice,{fare:fare({kind:'UNAVAILABLE',sourceType:'UNAVAILABLE',priceLow:undefined,priceHigh:undefined})});assert.match(missing,/Price unavailable/);assert.ok(!missing.includes('$0'));
 assert.match(html(FarePrice,{loading:true}),/Checking price/);
});
test('normal and stranded rideshare cards prioritize normalized fares over stale compatibility prices',()=>{
 for(const variant of ['results','stranded'])for(const provider of ['UBER','LYFT','WAYMO']){
 const text=html(RideshareCard,{variant,option:{id:provider,provider,available:true,origin:'Origin',destination:'Destination',estimatedPriceLow:999,estimatedPriceHigh:999,estimatedTotalMinutes:65,fare:fare({provider})}});
 assert.match(text,/\$24.*\$32/);assert.ok(!text.includes('$999'));assert.match(text,/Estimated fare/);assert.match(text,/1 hr 5 min/);assert.match(text,/rideshare-provider-logo/);
 }
});
test('journey costs sum ranges once, keep missing/reference fares unknown, and exclude overlapping cheapest claims',()=>{
 const known=sumJourneyCost([{label:'First ride',amountUsd:32,source:'estimated',fare:fare()},{label:'Rail',amountUsd:79,source:'official',fare:fare({kind:'EXACT',exactPrice:79,sourceType:'OFFICIAL',confidence:'HIGH'})}]);
 assert.equal(known.priceLowUsd,103);assert.equal(known.priceHighUsd,111);assert.equal(known.totalUsd,111);
 const unknown=sumJourneyCost([{label:'Fare',amountUsd:999,source:'estimated',fare:fare({kind:'FROM',appliesToTrip:false})}]);assert.equal(unknown.complete,false);assert.equal(unknown.totalUsd,null);assert.equal(unknown.knownSubtotalUsd,0);
 const base={mode:'RAIL',status:'configured_service',durationMinutes:100,labels:[],warnings:[]};
 const other={...known,totalUsd:110,priceLowUsd:100,priceHighUsd:110};
 assert.equal(rankLongDistanceJourneys([{...base,id:'a',cost:known},{...base,id:'b',cost:other}],{}).cheapest,null);
});
test('rail/flight/rental UI retains unavailable options, ranges, logos, and correct partial totals',()=>{
 const hubs={id:'MCO',name:'Airport',kind:'AIRPORT',coordinates:{latitude:28.43,longitude:-81.3},sourceUrl:'https://example.com/'};
 const cost=sumJourneyCost([{label:'First ride',amountUsd:32,source:'estimated',fare:fare()},{label:'Airfare',amountUsd:null,source:'unavailable'}]);
 const plan={routes:[],longDistance:{journeys:['Brightline','Amtrak','Tri-Rail','SunRail','Flight'].map((provider,i)=>({id:String(i),mode:i===4?'FLIGHT':'RAIL',provider,destinationHub:hubs,durationMinutes:135,rideMinutes:65,bufferMinutes:30,labels:[],warnings:[],status:'configured_service',bookingUrl:'https://example.com/',sourceUrl:'https://example.com/',cost,fare:i===1?undefined:fare(),rentals:[{id:'hertz',provider:'Hertz',logo:'/providers/hertz.svg',pickup:'Airport',bookingUrl:'https://example.com/',sourceUrl:'https://example.com/',priceUsdPerDay:null,fare:fare({provider:'RENTAL_CAR',appliesToTrip:false,metadata:{priceUnit:'DAY'}})}]})),warnings:[]}};
 const text=html(Results,{plan,origin:hubs.coordinates,destination:hubs.coordinates,onEditTrip(){}});
 for(const name of ['Brightline','Amtrak','Tri-Rail','SunRail','Flight','Hertz'])assert.ok(text.includes(name));
 assert.match(text,/Fare unavailable/);assert.match(text,/\/day/);assert.match(text,/Known cost/);assert.match(text,/total unavailable/);assert.ok(!text.includes('$0'));
 assert.match(text,/2 hr 15 min/);assert.ok(!text.includes('135 min'));
});

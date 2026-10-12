/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), ts = require('typescript');
process.env.ROUTEWISE_PUBLIC_PRICING_ENABLED = 'false';
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, filename);
const { PricingService } = require('../src/server/pricing/pricingService.ts');
const { getPricingTimeContext } = require('../src/server/pricing/timeContext.ts');
const { RAIL_PROVIDERS, AIRPORTS } = require('../src/server/services/travelProviders.ts');
const { amadeusFlightPricing } = require('../src/server/pricing/flightPricing.ts');
const { fareSchema } = require('../src/lib/pricing.ts');
const station = id => RAIL_PROVIDERS.flatMap(p => p.stations).find(s => s.id === id);
const railRequest = (provider, a, b, departureTime = '2026-10-14T16:00:00Z') => ({ provider, origin: station(a).coordinates, destination: station(b).coordinates, departureTime, providerMetadata: { originStationId: a, destinationStationId: b } });
const service = () => new PricingService({ publicEnabled: false });

test('Brightline model preserves stations/date/time, remains a range, and does not invent departures', async () => {
  const pricing = service();
  const daytime = await pricing.getFare(railRequest('BRIGHTLINE','bl-miami','bl-orlando'));
  const peak = await pricing.getFare(railRequest('BRIGHTLINE','bl-miami','bl-orlando','2026-10-14T12:00:00Z'));
  const weekend = await pricing.getFare(railRequest('BRIGHTLINE','bl-orlando','bl-miami','2026-10-17T16:00:00Z'));
  assert.equal(daytime.sourceType,'MODELED'); assert.equal(daytime.kind,'RANGE'); assert.ok(peak.priceHigh > daytime.priceHigh);
  assert.ok(weekend.priceHigh > daytime.priceHigh); assert.equal(daytime.metadata.originStation,'bl-miami'); assert.equal(daytime.metadata.departureTime,undefined); fareSchema.parse(daytime);
  assert.equal((await pricing.getFare({ ...railRequest('BRIGHTLINE','bl-miami','bl-orlando'), origin: { latitude: 0, longitude: 0 } })).sourceType,'UNAVAILABLE');
});
test('Amtrak keeps real station pairs and returns unavailable when no supported public price exists', async () => {
  for(const [a,b] of [['am-miami','am-orlando'],['am-tampa','am-jacksonville']]) {
    const fare = await service().getFare(railRequest('AMTRAK',a,b)); assert.equal(fare.sourceType,'UNAVAILABLE'); assert.equal(fare.exactPrice,undefined);
  }
});
test('Tri-Rail uses date-effective official zones, weekend/holiday pass, and passenger count', async () => {
  const pricing = service();
  const old = await pricing.getFare(railRequest('TRIRAIL','tr-miami','tr-wpb','2026-09-30T16:00:00Z'));
  const current = await pricing.getFare(railRequest('TRIRAIL','tr-miami','tr-wpb'));
  assert.equal(old.exactPrice,8.75); assert.equal(current.exactPrice,10); assert.equal(current.sourceType,'OFFICIAL'); assert.equal(current.metadata.zonesTraveled,6);
  assert.equal((await pricing.getFare(railRequest('TRIRAIL','tr-miami','tr-wpb','2026-10-17T16:00:00Z'))).exactPrice,5);
  assert.equal((await pricing.getFare(railRequest('TRIRAIL','tr-miami','tr-wpb','2026-12-25T16:00:00Z'))).exactPrice,5);
  assert.equal((await pricing.getFare({ ...railRequest('TRIRAIL','tr-miami','tr-wpb'), passengers:2 })).exactPrice,20);
  assert.equal((await pricing.getFare(railRequest('TRIRAIL','tr-wpb','tr-mangonia'))).exactPrice,3);
  assert.equal((await pricing.getFare(railRequest('TRIRAIL','tr-miami','tr-fll'))).exactPrice,4); fareSchema.parse(current);
});
test('SunRail official county-zone prices distinguish a short trip from a full corridor trip', async () => {
  const pricing = service();
  assert.equal((await pricing.getFare(railRequest('SUNRAIL','sr-poinciana','sr-orlando'))).exactPrice,3);
  const fare = await pricing.getFare(railRequest('SUNRAIL','sr-poinciana','sr-deland')); assert.equal(fare.exactPrice,5); assert.equal(fare.sourceType,'OFFICIAL'); fareSchema.parse(fare);
  const invalid = { ...railRequest('SUNRAIL','sr-poinciana','sr-orlando'), destination: { latitude: 28, longitude: -82 } };
  assert.equal((await pricing.getFare(invalid)).sourceType,'UNAVAILABLE');
});
test('Uber/Lyft use separate models, factual short/long trips and local day/night context', async () => {
  const pricing = service(), origin = { latitude:25.77,longitude:-80.19 }, destination = { latitude:25.78,longitude:-80.2 };
  const request = { origin,destination,departureTime:'2026-10-14T16:00:00Z',distanceMeters:4000,durationMinutes:10 };
  for(const provider of ['UBER','LYFT']) {
    const day = await pricing.getFare({ ...request,provider });
    const night = await pricing.getFare({ ...request,provider,departureTime:'2026-10-15T03:00:00Z' });
    const long = await pricing.getFare({ ...request,provider,distanceMeters:40000,durationMinutes:65 });
    assert.equal(day.sourceType,'MODELED'); assert.equal(day.kind,'RANGE'); assert.ok(night.priceHigh > day.priceHigh); assert.ok(long.priceLow > day.priceLow);
  }
  const uber = await pricing.getFare({ ...request,provider:'UBER',distanceMeters:40000,durationMinutes:65 }), lyft = await pricing.getFare({ ...request,provider:'LYFT',distanceMeters:40000,durationMinutes:65 }); assert.notDeepEqual([uber.priceLow,uber.priceHigh],[lyft.priceLow,lyft.priceHigh]);
  assert.equal(getPricingTimeContext('2026-10-14T16:00:00Z',origin).timeBand,'MIDDAY');
  assert.equal(getPricingTimeContext('2026-10-15T03:00:00Z',origin).timeBand,'LATE_NIGHT');
});
test('Waymo coverage and pricing are separate: unavailable zones never call a fare adapter', async () => {
  let calls=0;
  const pricing = new PricingService({ publicEnabled:false,liveAdapters:{WAYMO:async()=>{calls++;throw Error('not connected');}} });
  const valid={provider:'WAYMO',origin:{latitude:25.76,longitude:-80.19},destination:{latitude:25.78,longitude:-80.19},distanceMeters:5000,durationMinutes:15};
  assert.equal((await pricing.getFare(valid)).sourceType,'MODELED');
  assert.equal((await pricing.getFare({...valid,destination:{latitude:28.54,longitude:-81.38}})).sourceType,'UNAVAILABLE'); assert.equal(calls,1);
});
test('arrival rental models use actual hub providers, dates, daily units, and optional duration totals', async () => {
  const pricing=service(), mco=AIRPORTS.find(a=>a.id==='MCO'), atl=AIRPORTS.find(a=>a.id==='ATL');
  for(const rentalProvider of ['hertz','enterprise','avis']) {
    const fare=await pricing.getFare({provider:'RENTAL_CAR',origin:mco.coordinates,destination:mco.coordinates,departureTime:'2026-10-14T16:00:00Z',providerMetadata:{rentalProvider,pickupHubId:'MCO',rentalDays:3}});
    assert.equal(fare.sourceType,'MODELED'); assert.equal(fare.kind,'RANGE'); assert.equal(fare.metadata.priceUnit,'DAY'); assert.equal(fare.metadata.rentalTotalLow,fare.priceLow*3); assert.equal(fare.appliesToTrip,false); fareSchema.parse(fare);
  }
  const req={provider:'RENTAL_CAR',origin:atl.coordinates,destination:atl.coordinates,providerMetadata:{rentalProvider:'hertz',pickupHubId:'ATL'}};
  const jan=await pricing.getFare({...req,departureTime:'2027-01-14T16:00:00Z'}),oct=await pricing.getFare({...req,departureTime:'2026-10-14T16:00:00Z'});assert.ok(oct.priceLow>jan.priceLow);
  const rail=await pricing.getFare({provider:'RENTAL_CAR',origin:station('bl-orlando').coordinates,destination:mco.coordinates,departureTime:'2026-10-17T16:00:00Z',providerMetadata:{rentalProvider:'hertz',pickupHubId:'MCO'}});assert.equal(rail.sourceType,'MODELED');
  assert.equal((await pricing.getFare({...req,providerMetadata:{rentalProvider:'invented',pickupHubId:'ATL'}})).sourceType,'UNAVAILABLE');
});
const flightRequest={provider:'FLIGHT',origin:{latitude:25.7959,longitude:-80.287},destination:{latitude:28.4312,longitude:-81.3081},departureTime:'2026-10-14T12:00:00Z',passengers:2,providerMetadata:{departureAirport:'MIA',arrivalAirport:'MCO'}};
const flightOffer={id:'offer-1',price:{currency:'USD',grandTotal:'258.00'},travelerPricings:[{},{}],itineraries:[{duration:'PT1H10M',segments:[{departure:{iataCode:'MIA',at:'2026-10-14T09:00:00'},arrival:{iataCode:'MCO',at:'2026-10-14T10:10:00'},carrierCode:'AA'}]}]};
test('configured documented flight API normalizes actual offers and preserves passengers, carrier, times, stops', async () => {
  let calls=0;
  const fetchImpl=async(url,init)=>{calls++;if(url.includes('oauth2'))return new Response(JSON.stringify({access_token:'test-token'}));const query=new URL(url).searchParams;assert.equal(query.get('adults'),'2');assert.equal(query.get('departureDate'),'2026-10-14');assert.equal(init.headers.Authorization,'Bearer test-token');return new Response(JSON.stringify({data:[flightOffer]}));};
  const fare=await amadeusFlightPricing(flightRequest,{apiKey:'fixture',apiSecret:'fixture',environment:'production',fetchImpl}); assert.equal(calls,2);assert.equal(fare.sourceType,'LIVE_API');assert.equal(fare.exactPrice,258);assert.equal(fare.metadata.airline,'AA');assert.equal(fare.metadata.stops,0);assert.equal(fare.metadata.durationMinutes,70);assert.equal(fare.appliesToTrip,true);fareSchema.parse(fare);
  const sandbox=await amadeusFlightPricing(flightRequest,{apiKey:'fixture',apiSecret:'fixture',environment:'test',fetchImpl});assert.equal(sandbox.appliesToTrip,false);assert.match(sandbox.label,/sandbox/);
});
test('missing/failed flight access falls through; invalid currency, dates, or passenger offers are rejected', async () => {
  assert.equal((await service().getFare(flightRequest)).sourceType,'UNAVAILABLE');
  const options={apiKey:'fixture',apiSecret:'fixture',environment:'production'};
  assert.equal(await amadeusFlightPricing(flightRequest,{...options,fetchImpl:async()=>{throw Error('offline');}}),null);
  for(const offer of [{...flightOffer,price:{currency:'EUR',grandTotal:'258'}},{...flightOffer,travelerPricings:[{}]}]) {
    assert.equal(await amadeusFlightPricing(flightRequest,{...options,fetchImpl:async url=>new Response(JSON.stringify(url.includes('oauth2')?{access_token:'token'}:{data:[offer]}))}),null);
  }
});

test('generic local Tri-Rail fallback cannot misstate a weekday zone fare', () => {
  const { lookupTransitFare } = require('../src/server/services/transitFares.ts');
  assert.equal(lookupTransitFare({ lines: ['Tri-Rail'], origin: station('tr-miami').coordinates }).fareAvailable, false);
});

test('Amtrak public extraction preserves the requested station/date/time window and declines wrong-time fares', async () => {
  const { validateExtractedFare } = require('../src/server/pricing/geminiPriceExtractor.ts');
  const request=railRequest('AMTRAK','am-miami','am-orlando','2026-10-14T16:00:00Z');
  const text='Miami Amtrak Station to Orlando Amtrak Station 2026-10-14 12:30 fare $49';
  const pricing=new PricingService({publicEnabled:true,fetchImpl:async()=>new Response(text,{headers:{'content-type':'text/html'}}),extract:async(req,source)=>validateExtractedFare({sourceFound:true,currency:'USD',fareLabel:'exact',exactPrice:49,departureTime:'12:30',evidence:text},req,source)});
  const fare=await pricing.getFare(request);assert.equal(fare.sourceType,'GEMINI_GROUNDED');assert.equal(fare.appliesToTrip,true);assert.equal(fare.exactPrice,49);
  const source={url:'https://www.amtrak.com/',text:text.replace('12:30','22:30')};
  const reference=validateExtractedFare({sourceFound:true,currency:'USD',fareLabel:'exact',exactPrice:49,departureTime:'22:30',evidence:source.text},{...request,providerMetadata:{originName:'Miami Amtrak Station',destinationName:'Orlando Amtrak Station'}},source);
  assert.equal(reference.appliesToTrip,false);
});

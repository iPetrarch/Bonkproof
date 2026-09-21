import test from 'node:test';
import assert from 'node:assert/strict';
import { TRACKKIN_HANDOFF_SCHEMA, buildTrackKinHandoff, sendTrackKinHandoff } from '../trackkin-handoff.js';

const routePoints = [
  { id:'overture/shop-1#pass-2', name:'Supermarkt', description:'24h', lat:53.1, lon:7.4, routeKm:42.1234, categoryId:'supermarket', categoryLabel:'Supermarkt', selected:true, sourceIdentity:{provider:'overture',id:'shop-1'}, passIdentity:{physicalPoiId:'overture/shop-1',passId:'pass-2',passIndex:2,passCount:2} },
  { id:'overture/fuel-1#pass-1', name:'Tankstelle', lat:53.2, lon:7.5, routeKm:12, categoryId:'fuel', categoryLabel:'Tankstelle', selected:true, passIdentity:{physicalPoiId:'overture/fuel-1',passId:'pass-1',passIndex:1,passCount:1} },
  { id:'ignored', name:'Nicht gewählt', lat:0, lon:0, routeKm:5, selected:false },
];

test('builds versioned route-order payload compatible with TrackKin routebook input', () => {
  const payload=buildTrackKinHandoff({sourceGpx:'<gpx><trk/></gpx>',fileName:'tour.gpx',routeName:'Tour',routeDistanceMeters:100000,routePoints},{createdAt:'2026-09-21T20:00:00.000Z'});
  assert.equal(payload.schema, TRACKKIN_HANDOFF_SCHEMA);
  assert.equal(payload.routebook.length, 2);
  assert.deepEqual(payload.routebook[0], {name:'Tankstelle',route_distance_km:12,planned_break_minutes:0});
  assert.equal(payload.routebook[1].route_distance_km, 42.123);
  assert.equal(payload.source_stops[1].source_id, 'overture/shop-1#pass-2');
  assert.equal(payload.source_stops[1].pass_identity.passIndex, 2);
});

test('rejects collisions after canonical metre rounding', () => {
  assert.throws(() => buildTrackKinHandoff({sourceGpx:'<gpx/>',routeDistanceMeters:10000,routePoints:[
    {id:'a',name:'A',lat:1,lon:1,routeKm:1.0001,selected:true},
    {id:'b',name:'B',lat:1,lon:1,routeKm:1.0004,selected:true},
  ]}), /same route metre/);
});

test('posts JSON with same-origin credentials', async () => {
  let captured;
  const result=await sendTrackKinHandoff('/trackkin/api/bonkproof-import.php',{schema:TRACKKIN_HANDOFF_SCHEMA},{fetchImpl:async (url,options)=>{captured={url,options};return {ok:true,status:200,json:async()=>({ok:true,redirect_url:'/trackkin/'})};}});
  assert.equal(captured.options.method,'POST');
  assert.equal(captured.options.credentials,'same-origin');
  assert.match(captured.options.body,/bonkproof-trackkin-handoff\/v1/);
  assert.equal(result.redirect_url,'/trackkin/');
});

test('fails closed when receiver is unavailable', async () => {
  await assert.rejects(() => sendTrackKinHandoff('/trackkin/api/bonkproof-import.php',{schema:TRACKKIN_HANDOFF_SCHEMA},{fetchImpl:async()=>({ok:false,status:404,json:async()=>({ok:false,error:'not_ready'})})}),/not_ready/);
});

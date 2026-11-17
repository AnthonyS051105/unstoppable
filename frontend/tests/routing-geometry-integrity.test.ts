import assert from 'node:assert/strict';
import test from 'node:test';
import { routeLinesToLeaflet } from '../src/lib/geo';
test('GeoJSON longitude-latitude converts once and preserves all road bends', () => {
  assert.deepEqual(routeLinesToLeaflet({type:'LineString',coordinates:[[110,-7],[110.001,-7.001],[110.002,-7]]}), [[[-7,110],[-7.001,110.001],[-7,110.002]]]);
});
test('MultiLineString parts stay separate without an invented connector', () => {
  assert.deepEqual(routeLinesToLeaflet({type:'MultiLineString',coordinates:[[[110,-7],[110.001,-7]],[[110.1,-7],[110.2,-7]]]}), [[[-7,110],[-7,110.001]],[[-7,110.1],[-7,110.2]]]);
});
test('invalid vertices break a line instead of bridging missing survey geometry', () => {
  assert.deepEqual(routeLinesToLeaflet({type:'LineString',coordinates:[[110,-7],[110.001,-7],[null,-7],[110.1,-7],[110.2,-7]]}), [[[-7,110],[-7,110.001]],[[-7,110.1],[-7,110.2]]]);
});
test('one-point, invalid, unknown and same-node geometry do not become route dots', () => {
  for (const geometry of [undefined, {type:'Point',coordinates:[110,-7]}, {type:'LineString',coordinates:[[110,-7]]}, {type:'LineString',coordinates:[[-7,110],[-7,111]]}, {type:'LineString',coordinates:[[110,-7],[110,-7]]}]) assert.deepEqual(routeLinesToLeaflet(geometry), []);
});

const { test, mock } = require('node:test');
const assert = require('node:assert/strict');
const { mockModule } = require('./helpers/mockModule.js');

mockModule('../data/scripts/log.js', mock.fn());
const { isNewer } = require('../data/services/version.js');

test('isNewer compares major, minor and patch numerically', () => {
	assert.equal(isNewer('3.4.0', '3.3.2'), true);
	assert.equal(isNewer('3.10.0', '3.9.9'), true);
	assert.equal(isNewer('4.0.0', '3.99.99'), true);
	assert.equal(isNewer('3.3.2', '3.3.2'), false);
	assert.equal(isNewer('3.3.1', '3.3.2'), false);
});

test('isNewer ignores invalid versions', () => {
	assert.equal(isNewer('latest', '3.3.2'), false);
	assert.equal(isNewer('3.4', '3.3.2'), false);
	assert.equal(isNewer(undefined, '3.3.2'), false);
});

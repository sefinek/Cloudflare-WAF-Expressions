const Module = require('node:module');
const path = require('node:path');

const resolve = relPath => require.resolve(path.join(__dirname, '..', relPath));

const mockModule = (relPath, exports) => {
	const filename = resolve(relPath);
	const mod = new Module(filename, module);
	mod.filename = filename;
	mod.loaded = true;
	mod.exports = exports;
	require.cache[filename] = mod;
	return exports;
};

const unloadModule = relPath => {
	delete require.cache[resolve(relPath)];
};

module.exports = { mockModule, unloadModule };

const axios = require('axios');
const { version, homepage } = require('../package.json');

let requestCount = 0;

axios.defaults.baseURL = 'https://api.cloudflare.com/client/v4';
axios.defaults.headers.common = {
	'User-Agent': `Mozilla/5.0 (compatible; Cloudflare-WAF-Rules/${version}; +${homepage})`,
	'Authorization': `Bearer ${process.env.CF_API_TOKEN}`,
	'Accept': 'application/json',
	'Content-Type': 'application/json',
	'Accept-Encoding': 'gzip, deflate, br',
	'Accept-Language': 'en;q=0.9',
	'Cache-Control': 'no-cache',
	'Connection': 'keep-alive',
};

axios.defaults.timeout = 40000;

axios.interceptors.request.use(cfg => {
	requestCount++;
	return cfg;
}, err => Promise.reject(err));

module.exports = {
	axios,
	getRequestCount: () => {
		const count = requestCount;
		requestCount = 0;
		return count;
	},
};
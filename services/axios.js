const axios = require('axios');
const { version, homepage } = require('../package.json');

let requestCount = 0;

axios.defaults.baseURL = 'https://api.cloudflare.com/client/v4';
axios.defaults.timeout = 40000;
axios.defaults.headers.common = {
	'User-Agent': `Mozilla/5.0 (compatible; Cloudflare-WAF-Rules/${version}; +${homepage})`,
	'Authorization': `Bearer ${process.env.CF_API_TOKEN}`,
	'Accept': 'application/json',
	'Content-Type': 'application/json',
	'Cache-Control': 'no-cache',
	'Connection': 'keep-alive',
	'DNT': '1',
};

axios.interceptors.request.use(
	config => {
		requestCount++;
		return config;
	},
	error => Promise.reject(error)
);

module.exports = {
	axios,
	getRequestCount: () => {
		const count = requestCount;
		requestCount = 0;
		return count;
	},
};
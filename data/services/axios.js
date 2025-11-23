const axios = require('axios');
const axiosRetry = require('axios-retry').default;
const log = require('../scripts/log.js');
const { version } = require('../../package.json');

let requestCount = 0;

const api = axios.create({
	baseURL: 'https://api.cloudflare.com/client/v4',
	timeout: 30000,
	headers: {
		'User-Agent': `Mozilla/5.0 (compatible; Cloudflare-WAF-Expressions/${version}; +https://github.com/sefinek/Cloudflare-WAF-Expressions)`,
		'Authorization': `Bearer ${process.env.CF_API_TOKEN}`,
		'Accept': 'application/json',
		'Cache-Control': 'no-cache',
		'Connection': 'keep-alive',
	},
});

axiosRetry(api, {
	retries: 3,
	retryDelay: retryCount => retryCount * 7000,
	retryCondition: error => {
		return error.code === 'ECONNABORTED' || error.code === 'ENOTFOUND' || (error.response && error.response.status >= 500);
	},
	onRetry: (retryCount, err, requestConfig) => {
		const status = err.response?.status ? `Status ${err.response.status}` : (err.code || err.message || 'Unknown error');
		log(`${status} - retry #${retryCount} for ${requestConfig.url}\n${err.response.data ? JSON.stringify(err.response.data) : err.message}`, 2);
	},
});

api.interceptors.request.use(config => {
	requestCount++;
	return config;
});

module.exports = {
	axios: api,
	getRequestCount: () => {
		const count = requestCount;
		requestCount = 0;
		return count;
	},
};
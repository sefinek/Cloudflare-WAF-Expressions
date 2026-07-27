const axios = require('axios');
const axiosRetry = require('axios-retry').default;
const log = require('../scripts/log.js');
const { version } = require('../../package.json');

const USER_AGENT = `Mozilla/5.0 (compatible; Cloudflare-WAF-Expressions/${version}; +https://github.com/sefinek/Cloudflare-WAF-Expressions)`;

let requestCfCount = 0, requestScCount = 0, requestAbCount = 0;

const apiCf = axios.create({
	baseURL: 'https://api.cloudflare.com/client/v4',
	timeout: 30000,
	headers: {
		'User-Agent': USER_AGENT,
		'Authorization': `Bearer ${process.env.CF_API_TOKEN}`,
		'Accept': 'application/json',
		'Cache-Control': 'no-cache',
		'Connection': 'keep-alive',
	},
});

const apiSc = axios.create({
	baseURL: 'https://api.sniffcat.com',
	timeout: 15000,
	headers: {
		'User-Agent': USER_AGENT,
		'X-Secret-Token': process.env.SNIFFCAT_API_TOKEN,
		'Accept': 'application/json',
		'Cache-Control': 'no-cache',
		'Connection': 'keep-alive',
	},
});

const apiAb = axios.create({
	baseURL: 'https://api.abuseipdb.com/api/v2',
	timeout: 20000,
	headers: {
		'User-Agent': USER_AGENT,
		'Key': process.env.ABUSEIPDB_API_KEY,
		'Accept': 'application/json',
		'Cache-Control': 'no-cache',
		'Connection': 'keep-alive',
	},
});

const retryOptions = {
	retries: 3,
	retryDelay: retryCount => retryCount * 7000,
	retryCondition: error => error.code === 'ECONNABORTED' || error.code === 'ENOTFOUND' || (error.response && error.response.status >= 500),
	onRetry: (retryCount, err, requestConfig) => {
		const status = err.response?.status ? `Status ${err.response.status}` : (err.code || err.message || 'Unknown error');
		log(`${status} - retry #${retryCount} for ${requestConfig.url}\n${err.response?.data ? JSON.stringify(err.response.data) : err.message}`, 2);
	},
};

axiosRetry(apiCf, retryOptions);
axiosRetry(apiSc, retryOptions);
axiosRetry(apiAb, retryOptions);

apiCf.interceptors.request.use(config => {
	requestCfCount++;
	return config;
});

apiSc.interceptors.request.use(config => {
	requestScCount++;
	return config;
});

apiAb.interceptors.request.use(config => {
	requestAbCount++;
	return config;
});

module.exports = {
	axiosCf: apiCf,
	axiosSc: apiSc,
	axiosAb: apiAb,
	getRequestCfCount: () => {
		const count = requestCfCount;
		requestCfCount = 0;
		return count;
	},
	getRequestScCount: () => {
		const count = requestScCount;
		requestScCount = 0;
		return count;
	},
	getRequestAbCount: () => {
		const count = requestAbCount;
		requestAbCount = 0;
		return count;
	},
};

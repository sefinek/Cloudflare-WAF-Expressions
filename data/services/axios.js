const axios = require('axios');
const { version, homepage } = require('../../package.json');

const USER_AGENT = `Mozilla/5.0 (compatible; Cloudflare-WAF-Expressions/${version}; +${homepage})`;

const createApi = (baseURL, timeout, authHeaders) => {
	let requests = 0;

	const instance = axios.create({
		baseURL,
		timeout,
		headers: {
			'User-Agent': USER_AGENT,
			...authHeaders,
			'Accept': 'application/json',
			'Cache-Control': 'no-cache',
			'Connection': 'keep-alive',
		},
	});

	instance.interceptors.request.use(config => {
		requests++;
		return config;
	});

	const takeRequestCount = () => {
		const count = requests;
		requests = 0;
		return count;
	};

	return [instance, takeRequestCount];
};

const [axiosCf, getRequestCfCount] = createApi('https://api.cloudflare.com/client/v4', 30000, { 'Authorization': `Bearer ${process.env.CF_API_TOKEN}` });
const [axiosSc, getRequestScCount] = createApi('https://api.sniffcat.com', 15000, { 'X-Secret-Token': process.env.SNIFFCAT_API_TOKEN });
const [axiosAb, getRequestAbCount] = createApi('https://api.abuseipdb.com/api/v2', 20000, { 'Key': process.env.ABUSEIPDB_API_KEY });

module.exports = { axiosCf, axiosSc, axiosAb, getRequestCfCount, getRequestScCount, getRequestAbCount };

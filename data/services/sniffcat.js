const axios = require('axios');
const log = require('../scripts/log.js');

const CONFIDENCE_MIN = process.env.SNIFFCAT_CONFIDENCE_MIN || '70';
const LIMIT = process.env.SNIFFCAT_LIMIT || '1000';

module.exports = async () => {
	const token = process.env.SNIFFCAT_API_TOKEN;
	if (!token) return [];

	try {
		log(`Fetching SniffCat blacklist (confidenceMin: ${CONFIDENCE_MIN}, limit: ${LIMIT})...`);

		const { data } = await axios.get('https://api.sniffcat.com/api/v1/blacklist', {
			params: { type: 'txt', confidenceMin: CONFIDENCE_MIN, limit: LIMIT },
			headers: { 'X-Secret-Token': token },
			responseType: 'text',
			timeout: 15000,
		});

		const ips = data.split('\n').map(line => line.trim()).filter(Boolean);
		log(`Fetched ${ips.length} IPs from SniffCat`, 1);
		return ips;
	} catch (err) {
		log(`Failed to fetch SniffCat blacklist: ${err.response?.data || err.message}`, 2);
		return [];
	}
};

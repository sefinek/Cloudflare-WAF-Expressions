const { axiosSc } = require('./axios.js');
const log = require('../scripts/log.js');

const CONFIDENCE_MIN = process.env.SNIFFCAT_CONFIDENCE_MIN || '80';
const LIMIT = process.env.SNIFFCAT_LIMIT || '2000';

module.exports = async () => {
	if (!process.env.SNIFFCAT_API_TOKEN) return [];

	try {
		log(`Fetching SniffCat blacklist (confidenceMin: ${CONFIDENCE_MIN}, limit: ${LIMIT})...`);

		const { data } = await axiosSc.get('/api/v1/blacklist', {
			params: { type: 'txt', confidenceMin: CONFIDENCE_MIN, limit: LIMIT },
			responseType: 'text',
		});

		const ips = data.split('\n').map(line => line.trim()).filter(Boolean);
		log(`Fetched ${ips.length} IPs from SniffCat`, 1);
		return ips;
	} catch (err) {
		log(`Failed to fetch SniffCat blacklist: ${err.response?.data || err.message}`, 2);
		return [];
	}
};

const { axiosAb } = require('./axios.js');
const log = require('../scripts/log.js');

const CONFIDENCE_MIN = process.env.ABUSEIPDB_CONFIDENCE_MIN || '75';
const LIMIT = process.env.ABUSEIPDB_LIMIT || '8000';

module.exports = async () => {
	if (!process.env.ABUSEIPDB_API_KEY) return [];

	try {
		log(`Fetching AbuseIPDB blacklist (confidenceMin: ${CONFIDENCE_MIN}, limit: ${LIMIT})...`);

		const { data } = await axiosAb.get('/blacklist', {
			params: { confidenceMinimum: CONFIDENCE_MIN, limit: LIMIT },
		});

		const ips = (data.data || []).map(entry => entry.ipAddress).filter(Boolean);
		log(`Fetched ${ips.length} IPs from AbuseIPDB`, 1);
		return ips;
	} catch (err) {
		log(`Failed to fetch AbuseIPDB blacklist: ${err.response?.data ? JSON.stringify(err.response.data) : err.message}`, 2);
		return [];
	}
};

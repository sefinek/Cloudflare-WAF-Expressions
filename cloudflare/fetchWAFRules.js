const log = require('../scripts/log.js');
const { axios } = require('../services/axios.js');

module.exports = async zoneId => {
	log(0, 'Fetching WAF rules...');

	try {
		const { data } = await axios.get(`/zones/${zoneId}/firewall/rules`);
		if (!data.success) throw new Error(`Failed to fetch rules: ${data?.errors}`);

		return data.result;
	} catch (err) {
		log(3, JSON.stringify(err.response?.data) || err.message);
		throw err;
	}
};
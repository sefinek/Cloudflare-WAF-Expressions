const log = require('../../scripts/log.js');
const { axios } = require('../axios.js');

module.exports = async zoneId => {
	log('Fetching WAF rules...');

	try {
		const { data } = await axios.get(`/zones/${zoneId}/firewall/rules`);
		if (!data.success) throw new Error(`Failed to fetch rules: ${data?.errors}`);

		return data.result;
	} catch (err) {
		log(JSON.stringify(err.response?.data) || err.stack, 3);
		throw err;
	}
};
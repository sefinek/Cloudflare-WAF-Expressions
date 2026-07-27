module.exports = (count, singular, plural = `${singular}s`) => count === 1 ? singular : plural;

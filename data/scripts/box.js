const USE_COLOR = !('pm_id' in process.env);
const CYAN = '\x1b[36m';
const RESET = '\x1b[0m';

module.exports = (lines, color = CYAN) => {
	const width = Math.max(...lines.map(l => l.length));
	const top = `╔${'═'.repeat(width + 2)}╗`;
	const bottom = `╚${'═'.repeat(width + 2)}╝`;
	const mid = lines.map(l => `║ ${l.padEnd(width)} ║`).join('\n');
	const frame = `${top}\n${mid}\n${bottom}`;
	console.log(USE_COLOR ? `${color}${frame}${RESET}` : frame);
};

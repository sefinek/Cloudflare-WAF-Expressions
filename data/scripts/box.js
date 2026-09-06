const USE_COLOR = !('pm_id' in process.env);
const CYAN = '\x1b[36m';
const RESET = '\x1b[0m';
// eslint-disable-next-line no-control-regex
const OSC8_REGEX = /\x1b]8;;.*?\x07/g;

// Lines may contain invisible OSC 8 hyperlink escapes (see hyperlink.js) - strip them before measuring/padding
// so the box border still lines up, but keep them in the printed text so the link stays clickable.
const visibleLength = line => line.replace(OSC8_REGEX, '').length;

module.exports = (lines, color = CYAN) => {
	const width = Math.max(...lines.map(visibleLength));
	const top = `╔${'═'.repeat(width + 2)}╗`;
	const bottom = `╚${'═'.repeat(width + 2)}╝`;
	const mid = lines.map(l => `║ ${l}${' '.repeat(width - visibleLength(l))} ║`).join('\n');
	const frame = `${top}\n${mid}\n${bottom}`;
	console.log(USE_COLOR ? `${color}${frame}${RESET}` : frame);
};

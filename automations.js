import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const run = promisify(execFile);
const LABEL_PREFIX = 'com.dsh.kanban.';
const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

/** launchd is macOS-only; every entry point degrades to "unsupported" elsewhere. */
export const SUPPORTED = process.platform === 'darwin';

/** Where the shipped helper scripts are copied to, so launchd can run them by absolute path. */
export function notifyDir() {
	return path.join(os.homedir(), '.dsh', 'kanban', 'notify');
}

/** Friendly names for the jobs this plugin ships; anything else keeps its label. */
const KNOWN = {
	digest: { title: '每日摘要', description: '每天早上把今天到期的卡片按时间排好推一条通知' },
	duesoon: { title: '临近提醒', description: '每隔一段时间检查一次，只在有卡片 2 小时内到期时提醒（同一条不重复）' },
	weekly: { title: '周回顾', description: '每周一统计上周完成情况、进行中与逾期' }
};

export function agentsDir() {
	return path.join(os.homedir(), 'Library', 'LaunchAgents');
}

const DEFAULT_JOBS = {
	digest: { script: 'digest.py', schedule: { Hour: 9, Minute: 0 } },
	duesoon: { script: 'due-soon.py', schedule: { StartInterval: 1800 } },
	weekly: { script: 'weekly.py', schedule: { Weekday: 1, Hour: 9, Minute: 30 } }
};

/** Absolute path of a shipped script inside this package. */
function packagedScript(name, pluginDir) {
	return path.join(pluginDir, 'scripts', name);
}

/**
 * Copy the shipped helper scripts into ~/.dsh/kanban/notify on install or upgrade, so
 * the launchd jobs always run the code that belongs to this plugin version.
 */
export async function syncScripts(pluginDir, version) {
	if (!SUPPORTED) return;
	const dir = notifyDir();
	await fs.mkdir(dir, { recursive: true });
	const stampFile = path.join(dir, '.scripts-version');
	let current = '';
	try {
		current = (await fs.readFile(stampFile, 'utf8')).trim();
	} catch {
		current = '';
	}
	if (current === version) return;
	for (const [id, job] of Object.entries(DEFAULT_JOBS)) {
		try {
			await fs.copyFile(packagedScript(job.script, pluginDir), path.join(dir, job.script));
		} catch {
			// A missing packaged script must not stop the plugin from loading.
		}
	}
	await fs.writeFile(stampFile, version, 'utf8');
}

/** Create any shipped job that is not installed yet, pointing at this vault. */
export async function ensureDefaultAutomations(vaultDir) {
	if (!SUPPORTED) return;
	for (const [id, job] of Object.entries(DEFAULT_JOBS)) {
		const file = plistPathFor(id);
		let exists = true;
		try {
			await fs.access(file);
		} catch {
			exists = false;
		}
		if (exists) {
			// Keep an existing job's schedule, but make sure it can find this vault.
			try {
				const data = await readPlist(file);
				const current = (data.EnvironmentVariables || {}).DSH_KANBAN_VAULT;
				if (current !== vaultDir) {
					data.EnvironmentVariables = { ...(data.EnvironmentVariables || {}), DSH_KANBAN_VAULT: vaultDir };
					await fs.writeFile(file, writePlistXml(data), 'utf8');
					await bootstrap(file);
				}
			} catch {
				// An unreadable plist is left alone; the panel reports it.
			}
			continue;
		}
		const data = {
			Label: `${LABEL_PREFIX}${id}`,
			ProgramArguments: ['/usr/bin/python3', path.join(notifyDir(), job.script)],
			...(job.schedule.StartInterval ? { StartInterval: job.schedule.StartInterval } : { StartCalendarInterval: job.schedule }),
			RunAtLoad: false,
			StandardOutPath: path.join(notifyDir(), `${id}.out`),
			StandardErrorPath: path.join(notifyDir(), `${id}.err`),
			EnvironmentVariables: { DSH_KANBAN_VAULT: path.dirname(path.join(vaultDir, '看板.md')) }
		};
		await fs.mkdir(agentsDir(), { recursive: true });
		await fs.writeFile(file, writePlistXml(data), 'utf8');
		await bootstrap(file);
	}
}

function plistPathFor(id) {
	return path.join(agentsDir(), `${LABEL_PREFIX}${id}.plist`);
}

function idFromLabel(label) {
	return String(label).startsWith(LABEL_PREFIX) ? String(label).slice(LABEL_PREFIX.length) : '';
}

async function readPlist(file) {
	const { stdout } = await run('/usr/bin/plutil', ['-convert', 'json', '-o', '-', file]);
	return JSON.parse(stdout);
}

/** True when launchd currently has the job registered (it may still be temporarily off). */
async function isLoaded(id) {
	try {
		await run('/bin/launchctl', ['print', `gui/${process.getuid()}/${LABEL_PREFIX}${id}`]);
		return true;
	} catch {
		return false;
	}
}

function describeInterval(seconds) {
	const minutes = Math.max(1, Math.round(seconds / 60));
	return { kind: 'interval', text: `每 ${minutes} 分钟`, minutes };
}

function describeSchedule(interval) {
	if (interval === undefined || interval === null) return { kind: 'unknown', text: '未知' };
	if (Array.isArray(interval)) return { kind: 'unknown', text: `${interval.length} 个时间点` };
	const { Hour = 0, Minute = 0, Weekday, Day, Month } = interval;
	const clock = `${String(Hour).padStart(2, '0')}:${String(Minute).padStart(2, '0')}`;
	if (Weekday !== undefined) return { kind: 'weekly', text: `每${WEEKDAYS[Weekday % 7] || Weekday} ${clock}`, hour: Hour, minute: Minute, weekday: Weekday };
	if (Day !== undefined) return { kind: 'once', text: `${Month ? `${Month} 月 ` : ''}${Day} 日 ${clock}`, hour: Hour, minute: Minute, day: Day, month: Month };
	return { kind: 'daily', text: `每天 ${clock}`, hour: Hour, minute: Minute };
}

/** Every kanban LaunchAgent on this Mac, with its schedule and live state. */
export async function listAutomations() {
	if (!SUPPORTED) return [];
	const dir = agentsDir();
	let names = [];
	try {
		names = await fs.readdir(dir);
	} catch {
		return [];
	}
	const out = [];
	for (const name of names) {
		if (!name.startsWith(LABEL_PREFIX) || !name.endsWith('.plist')) continue;
		const id = idFromLabel(name.slice(0, -'.plist'.length));
		if (id === '') continue;
		let data;
		try {
			data = await readPlist(path.join(dir, name));
		} catch {
			continue;
		}
		const schedule = Number.isInteger(data.StartInterval)
			? describeInterval(data.StartInterval)
			: describeSchedule(data.StartCalendarInterval);
		const known = KNOWN[id] || {};
		out.push({
			id,
			label: data.Label,
			title: known.title || `提醒 ${id}`,
			description: known.description || '自定义定时通知',
			script: (data.ProgramArguments || []).slice(-1)[0] || '',
			enabled: await isLoaded(id),
			kind: schedule.kind,
			text: schedule.text,
			hour: schedule.hour ?? 9,
			minute: schedule.minute ?? 0,
			weekday: schedule.weekday,
			day: schedule.day,
			month: schedule.month,
			minutes: schedule.minutes
		});
	}
	out.sort((a, b) => (a.id === 'digest' ? -1 : b.id === 'weekly' ? 1 : a.id.localeCompare(b.id)));
	return out;
}

function xmlEscape(text) {
	return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function writePlistXml(data) {
	const interval = data.StartCalendarInterval || {};
	const intervalKeys = Object.entries(interval)
		.map(([key, value]) => `\t\t<key>${key}</key>\n\t\t<integer>${value}</integer>`)
		.join('\n');
	const schedule = Number.isInteger(data.StartInterval)
		? `\t<key>StartInterval</key>\n\t<integer>${data.StartInterval}</integer>`
		: `\t<key>StartCalendarInterval</key>\n\t<dict>\n${intervalKeys}\n\t</dict>`;
	const args = (data.ProgramArguments || []).map((arg) => `\t\t<string>${xmlEscape(arg)}</string>`).join('\n');
	const optional = ['StandardOutPath', 'StandardErrorPath']
		.filter((key) => typeof data[key] === 'string')
		.map((key) => `\t<key>${key}</key>\n\t<string>${xmlEscape(data[key])}</string>`)
		.join('\n');
	const envEntries = Object.entries(data.EnvironmentVariables || {});
	const env = envEntries.length === 0
		? ''
		: `\t<key>EnvironmentVariables</key>\n\t<dict>\n${envEntries.map(([key, value]) => `\t\t<key>${xmlEscape(key)}</key>\n\t\t<string>${xmlEscape(value)}</string>`).join('\n')}\n\t</dict>`;
	return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>Label</key>
	<string>${xmlEscape(data.Label)}</string>
	<key>ProgramArguments</key>
	<array>
${args}
	</array>
${schedule}
	<key>RunAtLoad</key>
	<false/>
${optional}
${env}
</dict>
</plist>
`;
}

async function bootstrap(file) {
	const uid = process.getuid();
	try {
		await run('/bin/launchctl', ['bootout', `gui/${uid}`, file]);
	} catch {
		// Not currently registered: nothing to remove.
	}
	await run('/bin/launchctl', ['bootstrap', `gui/${uid}`, file]);
}

async function bootout(file, id) {
	const uid = process.getuid();
	try {
		await run('/bin/launchctl', ['bootout', `gui/${uid}`, file]);
	} catch {
		try {
			await run('/bin/launchctl', ['bootout', `gui/${uid}/${LABEL_PREFIX}${id}`]);
		} catch {
			// Already gone.
		}
	}
}

/**
 * Change one job's schedule and/or its registration. Only the schedule keys and the
 * loaded/disabled state are touched: the program the job runs stays exactly as it was.
 */
export async function updateAutomation(id, patch) {
	if (!SUPPORTED) throw new Error('定时通知目前只支持 macOS');
	const file = plistPathFor(id);
	const data = await readPlist(file);
	const interval = { ...(data.StartCalendarInterval || {}) };
	const timed = patch.hour !== undefined || patch.minute !== undefined || patch.weekday !== undefined || patch.intervalMinutes !== undefined;
	if (Number.isInteger(patch.intervalMinutes)) {
		delete data.StartCalendarInterval;
		data.StartInterval = Math.max(1, patch.intervalMinutes) * 60;
	} else {
		if (Number.isInteger(patch.hour)) interval.Hour = patch.hour;
		if (Number.isInteger(patch.minute)) interval.Minute = patch.minute;
		if (Number.isInteger(patch.weekday)) interval.Weekday = patch.weekday;
		if (Object.keys(interval).length > 0) data.StartCalendarInterval = interval;
	}
	if (timed) await fs.writeFile(file, writePlistXml(data), 'utf8');
	if (patch.enabled === true) await bootstrap(file);
	else if (patch.enabled === false) await bootout(file, id);
	else if (timed) await bootstrap(file);
	return listAutomations();
}

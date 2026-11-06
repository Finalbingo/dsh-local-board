import { ensureLayout, loadBoard, saveBoard, renderArchiveBlock, newItemId, projectIdOf, normalizeDue, CARD_COLORS, today, pathsOf } from './store.js';
import { listAutomations, updateAutomation, syncScripts, ensureDefaultAutomations, SUPPORTED } from './automations.js';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

/** Cordis plugin name. */
export const name = 'kanban';
/** The route carrier, the trust fence guarding every route, and the agent tool registry. */
export const inject = ['webServer', 'connection', 'tools'];

const ROUTE = '/kanban/api';
const MAX_BODY_BYTES = 128 * 1024;
/** Where the panel remembers the folder the user picked, independent of any profile config. */
const SETTINGS_PATH = process.env.DSH_KANBAN_SETTINGS || path.join(os.homedir(), '.dsh', 'kanban', 'settings.json');
/**
 * LaunchAgents fire outside this app's TCC grant, so a job cannot read a vault under
 * ~/Documents. Every save also drops a copy here, where those jobs can always read it.
 */
const SNAPSHOT_PATH = path.join(os.homedir(), '.dsh', 'kanban', 'board-snapshot.md');
/** This package's own directory: the shipped helper scripts live under it. */
const PLUGIN_DIR = import.meta.dirname ?? path.dirname(fileURLToPath(import.meta.url));
const STATUSES = ['todo', 'doing', 'done'];

/**
 * Resolve the data folder, in order: explicit profile config, environment override,
 * then the folder chosen in the panel. Nothing configured means the board must ask.
 */
async function vaultDirOf(config) {
	const fromEnv = process.env.DSH_KANBAN_VAULT;
	if (typeof fromEnv === 'string' && fromEnv.trim() !== '') return fromEnv.trim();
	if (config && typeof config.vaultDir === 'string' && config.vaultDir.trim() !== '') return config.vaultDir.trim();
	try {
		const settings = JSON.parse(await fs.readFile(SETTINGS_PATH, 'utf8'));
		if (typeof settings.vaultDir === 'string' && settings.vaultDir.trim() !== '') return settings.vaultDir.trim();
	} catch {
		// No settings file yet: the user has not picked a folder.
	}
	return null;
}

async function rememberVaultDir(vaultDir) {
	await fs.mkdir(path.dirname(SETTINGS_PATH), { recursive: true });
	await fs.writeFile(SETTINGS_PATH, JSON.stringify({ vaultDir }, null, 2), 'utf8');
}

function sendJson(res, status, payload) {
	res.statusCode = status;
	res.setHeader('content-type', 'application/json; charset=utf-8');
	res.setHeader('cache-control', 'no-store');
	res.end(JSON.stringify(payload));
}

async function readBody(req) {
	const chunks = [];
	let size = 0;
	for await (const chunk of req) {
		size += chunk.length;
		if (size > MAX_BODY_BYTES) return null;
		chunks.push(chunk);
	}
	return Buffer.concat(chunks).toString('utf8');
}

function findProject(projects, id) {
	const project = projects.find((candidate) => candidate.id === id);
	if (project === undefined) throw new Error(`项目不存在: ${id}`);
	return project;
}

function findItem(project, itemId) {
	const item = project.items.find((candidate) => candidate.id === itemId);
	if (item === undefined) throw new Error(`条目不存在: ${itemId}`);
	return item;
}

function assign(target, patch, fields) {
	if (patch === undefined || patch === null || typeof patch !== 'object') return;
	for (const field of fields) {
		if (Object.prototype.hasOwnProperty.call(patch, field)) {
			const value = patch[field];
			target[field] = value === null || value === undefined ? '' : value;
		}
	}
}

function stampNow() {
	const now = new Date();
	const pad = (n) => String(n).padStart(2, '0');
	return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
}

const execFileAsync = promisify(execFile);

/** Open the data folder in the OS file manager (Finder / Explorer / file manager). */
async function revealFolder(dir) {
	const [command, args] = process.platform === 'darwin'
		? ['/usr/bin/open', [dir]]
		: process.platform === 'win32'
			? ['explorer', [dir]]
			: ['xdg-open', [dir]];
	await execFileAsync(command, args);
	return dir;
}

/** This package's version, used to decide whether to refresh the shipped scripts. */
async function packageVersion() {
	try {
		return JSON.parse(await fs.readFile(path.join(PLUGIN_DIR, 'package.json'), 'utf8')).version || '0';
	} catch {
		return '0';
	}
}

/** Only the keys the caller actually supplied, so an omitted field never blanks a value. */
function pick(source, keys) {
	const out = {};
	for (const key of keys) {
		if (source[key] !== undefined && source[key] !== null) out[key] = source[key];
	}
	return out;
}

/** Compact one-line rendering of a project for tool output. */
function projectLine(project) {
	const counts = STATUSES.map((status) => `${status}:${project.items.filter((item) => item.status === status).length}`).join(' ');
	return `${project.name} (${project.role || '—'}, ${counts})`;
}

/**
 * Host half: owns the single markdown board, serves the panel over one route, and
 * exposes the same operations to the agent as one tool. Every mutation re-reads the
 * document, applies the change, and writes it back, retrying if the file moved under
 * it (someone saved it in Obsidian), so no edit is silently overwritten.
 */
export function apply(ctx, config) {
	let vaultDir = null;

	/** Resolve the folder and make sure it holds a board; throws when nothing is chosen. */
	const requireVault = async () => {
		if (vaultDir === null) vaultDir = await vaultDirOf(config);
		if (vaultDir === null) throw new Error('还没有选择存放数据的文件夹');
		await ensureLayout(vaultDir);
		return vaultDir;
	};

	let cachedVersion = null;
	const snapshot = async () => {
		const board = await loadBoard(vaultDir);
		if (cachedVersion === null) cachedVersion = await packageVersion();
		return { vaultDir, boardPath: pathsOf(vaultDir).board, today: today(), projects: board.projects, needsSetup: false, version: cachedVersion };
	};

	const refreshSnapshot = async () => {
		if (vaultDir === null) return;
		try {
			await fs.mkdir(path.dirname(SNAPSHOT_PATH), { recursive: true });
			await fs.copyFile(pathsOf(vaultDir).board, SNAPSHOT_PATH);
		} catch {
			// A missing snapshot only degrades the notifications, never the board.
		}
	};

	const mutate = async (mutator) => {
		await requireVault();
		for (let attempt = 0; attempt < 3; attempt += 1) {
			const board = await loadBoard(vaultDir);
			await mutator(board);
			const written = await saveBoard(vaultDir, board, { expectedMtime: board.mtimeMs });
			if (written) {
				await refreshSnapshot();
				return snapshot();
			}
		}
		throw new Error('看板文件正在被其他程序修改，请稍后重试');
	};

	const actions = {
		async state() {
			const resolved = await vaultDirOf(config);
			if (resolved === null) return { vaultDir: null, boardPath: null, today: today(), projects: [], needsSetup: true };
			vaultDir = resolved;
			await ensureLayout(vaultDir);
			return snapshot();
		},

		async openFolder() {
			await requireVault();
			const opened = await revealFolder(vaultDir);
			return { ...(await snapshot()), opened };
		},

		/** The panel's folder picker lands here; the choice is remembered outside the profile. */
		async configureVault(payload) {
			const target = String(payload.path || '').trim();
			if (target === '') throw new Error('没有选择文件夹');
			if (!path.isAbsolute(target)) throw new Error('请选择一个绝对路径');
			const info = await fs.stat(target).catch(() => null);
			if (info === null || !info.isDirectory()) throw new Error('这个路径不是一个文件夹');
			vaultDir = target;
			await rememberVaultDir(target);
			await ensureLayout(target);
			await refreshSnapshot();
			await syncScripts(PLUGIN_DIR, await packageVersion()).catch(() => {});
			await ensureDefaultAutomations(target).catch(() => {});
			return snapshot();
		},

		async list() {
			await requireVault();
			const board = await loadBoard(vaultDir);
			return {
				vaultDir,
				boardPath: pathsOf(vaultDir).board,
				today: today(),
				projects: board.projects,
				overview: board.projects.map(projectLine).join('\n')
			};
		},

		async createProject(payload) {
			const name = String(payload.name || '').trim();
			if (name === '') throw new Error('项目名称不能为空');
			return mutate(async (board) => {
				if (board.projects.some((project) => project.name === name)) throw new Error('同名项目已存在');
				board.projects.push({
					id: projectIdOf(name, board.projects.map((project) => project.id)),
					name,
					role: payload.role || '需跟进进度',
					status: '进行中',
					owner: payload.owner || '',
					items: []
				});
			});
		},

		async updateProject(payload) {
			return mutate(async (board) => {
				const project = findProject(board.projects, payload.id);
				const patch = payload.patch || {};
				if (Object.prototype.hasOwnProperty.call(patch, 'name')) {
					const next = String(patch.name || '').trim();
					if (next === '') throw new Error('项目名称不能为空');
					if (board.projects.some((other) => other !== project && other.name === next)) throw new Error('同名项目已存在');
					patch.name = next;
				}
				assign(project, patch, ['name', 'role', 'status', 'owner']);
			});
		},

		async deleteProject(payload) {
			return mutate(async (board) => {
				const index = board.projects.findIndex((project) => project.id === payload.id);
				if (index < 0) throw new Error(`项目不存在: ${payload.id}`);
				const [removed] = board.projects.splice(index, 1);
				const block = renderArchiveBlock(removed, stampNow());
				board.archive = board.archive ? `${board.archive}\n\n${block}` : block;
			});
		},

		async addItem(payload) {
			return mutate(async (board) => {
				const project = findProject(board.projects, payload.projectId);
				const title = String(payload.title || '').trim();
				if (title === '') throw new Error('条目内容不能为空');
				if (payload.status && !STATUSES.includes(payload.status)) throw new Error(`未知状态: ${payload.status}`);
				project.items.push({
					id: newItemId(),
					title,
					status: payload.status || 'todo',
					owner: payload.owner || '',
					priority: payload.priority || '',
					due: normalizeDue(payload.due),
					note: payload.note || '',
					color: CARD_COLORS.includes(payload.color) ? payload.color : '',
					hidden: Boolean(payload.hidden),
					doneAt: payload.status === 'done' ? today() : '',
					projectId: project.id
				});
			});
		},

		async updateItem(payload) {
			return mutate(async (board) => {
				const project = findProject(board.projects, payload.projectId);
				const item = findItem(project, payload.itemId);
				assign(item, payload.patch, ['title', 'owner', 'priority', 'due', 'note']);
				if (payload.patch && Object.prototype.hasOwnProperty.call(payload.patch, 'color')) {
					item.color = CARD_COLORS.includes(payload.patch.color) ? payload.patch.color : '';
				}
				item.due = normalizeDue(item.due);
				if (payload.patch && Object.prototype.hasOwnProperty.call(payload.patch, 'hidden')) item.hidden = Boolean(payload.patch.hidden);
			});
		},

		async moveItem(payload) {
			return mutate(async (board) => {
				const project = findProject(board.projects, payload.projectId);
				const item = findItem(project, payload.itemId);
				if (!STATUSES.includes(payload.status)) throw new Error(`未知状态: ${payload.status}`);
				item.status = payload.status;
				item.doneAt = payload.status === 'done' ? (item.doneAt || today()) : '';
			});
		},

		async assignItem(payload) {
			return mutate(async (board) => {
				const from = findProject(board.projects, payload.fromProjectId);
				const to = findProject(board.projects, payload.toProjectId);
				if (from === to) return;
				const index = from.items.findIndex((item) => item.id === payload.itemId);
				if (index < 0) throw new Error(`条目不存在: ${payload.itemId}`);
				const [item] = from.items.splice(index, 1);
				item.projectId = to.id;
				to.items.push(item);
			});
		},

		async automations() {
			return { items: await listAutomations(), supported: SUPPORTED };
		},

		async updateAutomation(payload) {
			if (typeof payload.id !== 'string' || payload.id === '') throw new Error('缺少自动化任务 id');
			return { supported: SUPPORTED, items: await updateAutomation(payload.id, {
				hour: Number.isInteger(payload.hour) ? payload.hour : undefined,
				minute: Number.isInteger(payload.minute) ? payload.minute : undefined,
				weekday: Number.isInteger(payload.weekday) ? payload.weekday : undefined,
				enabled: typeof payload.enabled === 'boolean' ? payload.enabled : undefined
			}) };
		},

		async deleteItem(payload) {
			return mutate(async (board) => {
				const project = findProject(board.projects, payload.projectId);
				project.items = project.items.filter((item) => item.id !== payload.itemId);
			});
		}
	};

	const handler = async (req, res) => {
		const rejection = ctx.connection.requestRejection(req);
		if (rejection !== undefined) {
			res.statusCode = rejection;
			res.end();
			return;
		}
		if (req.method !== 'POST') {
			res.statusCode = 405;
			res.setHeader('allow', 'POST');
			res.end();
			return;
		}
		const body = await readBody(req);
		if (body === null) {
			sendJson(res, 413, { ok: false, error: '请求体过大' });
			return;
		}
		let request;
		try {
			request = JSON.parse(body || '{}');
		} catch {
			sendJson(res, 400, { ok: false, error: '请求不是合法 JSON' });
			return;
		}
		const action = actions[request.action];
		if (action === undefined) {
			sendJson(res, 400, { ok: false, error: `未知操作: ${String(request.action)}` });
			return;
		}
		try {
			const state = await action(request);
			sendJson(res, 200, { ok: true, state });
		} catch (error) {
			sendJson(res, 200, { ok: false, error: error instanceof Error ? error.message : String(error) });
		}
	};

	ctx.effect(() => ctx.webServer.register({ kind: 'exact', path: ROUTE, handler }), `kanban: POST ${ROUTE}`);

	// The agent drives the same actions the panel uses; nothing here edits the file directly.
	const tool = {
		name: 'kanban',
		description: 'Read and edit the user\'s local task board: projects, each holding Todo/Doing/Done cards, stored in one markdown file. Call action "list" first to learn project names and card ids. Card ids are the ^k-… block ids.',
		parameters: {
			type: 'object',
			additionalProperties: false,
			required: ['action'],
			properties: {
				action: { type: 'string', enum: ['list', 'add', 'update', 'move', 'delete', 'assign', 'project_create', 'project_update', 'project_delete'] },
				project: { type: 'string', description: 'Project name (or id).' },
				item: { type: 'string', description: 'Card id, e.g. k-a1.' },
				target: { type: 'string', description: 'Destination project name for action assign.' },
				title: { type: 'string' },
				note: { type: 'string' },
				owner: { type: 'string' },
				priority: { type: 'string' },
				due: { type: 'string', description: 'YYYY-MM-DD.' },
				status: { type: 'string', enum: STATUSES },
				hidden: { type: 'boolean', description: 'Mask this card by default in the board UI.' },
				color: { type: 'string', enum: ['red', 'orange', 'yellow', 'green', 'blue', 'purple', 'gray'], description: 'Card color stripe.' },
				role: { type: 'string', description: 'Project meta: 我负责 | 需跟进进度 | 仅知晓.' },
				name: { type: 'string', description: 'New project name for project_update or the name for project_create.' }
			}
		},
		output: {
			schema: { type: 'object', additionalProperties: false, required: ['ok', 'text'], properties: { ok: { type: 'boolean' }, text: { type: 'string' } } },
			render: (_args, value) => [{ type: 'text', text: value.text }]
		},
		async execute(args) {
			const run = async (action, payload) => {
				try {
					const state = await actions[action](payload);
					return { ok: true, state };
				} catch (error) {
					return { ok: false, error: error instanceof Error ? error.message : String(error) };
				}
			};
			const projectId = args.project;
			let result;
			switch (args.action) {
				case 'list': {
					const state = await actions.list();
					if (state.projects.length === 0) return { ok: true, text: '（看板里还没有项目）' };
					const lines = [];
					for (const project of state.projects) {
						lines.push(`## ${project.name}（${project.role || '—'}）`);
						for (const status of STATUSES) {
							const items = project.items.filter((item) => item.status === status);
							if (items.length === 0) continue;
							lines.push(`  ${status}:`);
							for (const item of items) {
								const bits = [item.due ? `📅${item.due}` : '', item.owner ? `@${item.owner}` : '', item.priority ? `#${item.priority}` : '', item.hidden ? '🙈' : ''].filter(Boolean).join(' ');
								lines.push(`    ${item.id}  ${item.title}${bits ? `  ${bits}` : ''}`);
							}
						}
					}
					return { ok: true, text: lines.join('\n') };
				}
				case 'project_create':
					result = await run('createProject', { name: args.name || args.title || args.project, role: args.role });
					break;
				case 'project_update':
					result = await run('updateProject', { id: projectId, patch: pick(args, ['name', 'role', 'status']) });
					break;
				case 'project_delete':
					result = await run('deleteProject', { id: projectId });
					break;
				case 'add':
					result = await run('addItem', { projectId, status: args.status || 'todo', title: args.title, note: args.note, owner: args.owner, priority: args.priority, due: args.due, color: args.color, hidden: args.hidden });
					break;
				case 'update':
					result = await run('updateItem', { projectId, itemId: args.item, patch: pick(args, ['title', 'note', 'owner', 'priority', 'due', 'color', 'hidden']) });
					break;
				case 'move':
					result = await run('moveItem', { projectId, itemId: args.item, status: args.status });
					break;
				case 'delete':
					result = await run('deleteItem', { projectId, itemId: args.item });
					break;
				case 'assign':
					result = await run('assignItem', { fromProjectId: projectId, itemId: args.item, toProjectId: args.target });
					break;
				default:
					return { ok: false, text: `未知操作: ${String(args.action)}` };
			}
			if (!result.ok) return { ok: false, text: `失败：${result.error}` };
			const state = result.state;
			const text = 'projects' in state && Array.isArray(state.projects) ? state.projects.map(projectLine).join('\n') : 'ok';
			return { ok: true, text };
		}
	};

	try {
		ctx.tools.register(tool);
	} catch (error) {
		ctx.logger?.warn?.(`kanban: 无法注册 kanban 工具: ${error instanceof Error ? error.message : String(error)}`);
	}

	void (async () => {
		vaultDir = await vaultDirOf(config);
		// Without a chosen folder the board itself asks; the shipped scripts still update.
		await syncScripts(PLUGIN_DIR, await packageVersion()).catch(() => {});
		if (vaultDir === null) return;
		try {
			await ensureLayout(vaultDir);
			await ensureDefaultAutomations(vaultDir);
			await refreshSnapshot();
		} catch (error) {
			ctx.logger?.warn?.(`kanban: 无法初始化数据目录 ${vaultDir}: ${error instanceof Error ? error.message : String(error)}`);
		}
	})();

	// Keep the snapshot close to the file even when the edit came from Obsidian.
	ctx.effect(() => {
		const timer = setInterval(refreshSnapshot, 10 * 60 * 1000);
		// Do not keep a host process (or a test runner) alive just for this timer.
		timer.unref?.();
		return () => clearInterval(timer);
	}, 'kanban: board snapshot');
}

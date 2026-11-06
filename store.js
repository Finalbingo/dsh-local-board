import fs from 'node:fs/promises';
import path from 'node:path';

/** Kanban column identity: the `###` heading in the document ↔ internal status. */
const COLUMNS = [
	{ status: 'todo', title: 'Todo', aliases: ['todo', '待办', '待做', '待办事项'] },
	{ status: 'doing', title: 'Doing', aliases: ['doing', '进行中', '在做', '处理中'] },
	{ status: 'done', title: 'Done', aliases: ['done', '已完成', '完成'] }
];

const STATUS_BY_ALIAS = new Map();
for (const column of COLUMNS) for (const alias of column.aliases) STATUS_BY_ALIAS.set(alias.toLowerCase(), column.status);

/** Meta keys written under a project heading, in the order they are rendered. */
const META_KEYS = [
	['role', '角色'],
	['status', '状态'],
	['owner', '负责人']
];
const META_BY_LABEL = new Map(META_KEYS.map(([key, label]) => [label, key]));

const ITEM_RE = /^\s*[-*]\s+\[([ xX])\]\s+(.*)$/;
const H2_RE = /^##\s+(.+?)\s*$/;
const H3_RE = /^###\s+(.+?)\s*$/;
const META_RE = /^\s*[-*]\s*([^:：]+)[:：]\s*(.*)$/;
const TOKEN_SEP = ' · ';
/** Named card colors; the name is what lives in the markdown. */
export const CARD_COLORS = ['red', 'orange', 'yellow', 'green', 'blue', 'purple', 'gray'];
/** Everything under this heading is the delete log: parsed as raw text and written back verbatim. */
const ARCHIVE_HEADING = '🗄 归档';
const ARCHIVE_RE = /^##\s*🗄\s*归档\s*$/;

export function today() {
	const now = new Date();
	const pad = (n) => String(n).padStart(2, '0');
	return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function newItemId() {
	const stamp = Date.now().toString(36).slice(-5);
	const salt = Math.random().toString(36).slice(2, 5);
	return `k-${stamp}${salt}`;
}

/** Project id is its heading, made safe to use as a key; the pool keeps its fixed id. */
export function projectIdOf(name, taken) {
	const base = String(name).trim().replace(/[\\/:*?"<>|#^[\]]/g, '-').replace(/\s+/g, ' ').replace(/^[.\s]+|[.\s]+$/g, '') || '未命名项目';
	if (!taken || !taken.includes(base)) return base;
	let index = 2;
	while (taken.includes(`${base} ${index}`)) index += 1;
	return `${base} ${index}`;
}

const ESCAPED_SEP = /\\·/g;

/** Normalize `2026-11-12 9:30` to `2026-11-12 09:30`; unknown shapes are left alone. */
export function normalizeDue(value) {
	const text = String(value || '').trim();
	if (text === '') return '';
	const date = /^(\d{4}-\d{2}-\d{2})/.exec(text);
	// Not a date at all: keep whatever the user wrote rather than destroying it.
	if (date === null) return text;
	const rest = text.slice(date[1].length).trim().replace(/^[T\s]+/, '');
	const clock = /^(\d{1,2}):(\d{2})$/.exec(rest);
	// A malformed clock loses only the clock; the day stills parses and sorts.
	if (clock === null) return date[1];
	return `${date[1]} ${String(clock[1]).padStart(2, '0')}:${clock[2]}`;
}

/** A title or note may contain the separator; it is escaped on write and restored on read. */
function escapeSep(text) {
	return String(text).replace(/ · /g, ' \\· ');
}

function unescapeSep(text) {
	return String(text).replace(ESCAPED_SEP, '·');
}

function parseItem(body, status) {
	let text = body.trim();
	let id = '';
	const blockId = /\s\^([A-Za-z0-9-]+)\s*$/.exec(text);
	if (blockId !== null) {
		id = blockId[1];
		text = text.slice(0, blockId.index).trim();
	}
	const parts = text.split(TOKEN_SEP);
	const item = { id, title: (parts.shift() || '').trim(), status, owner: '', priority: '', due: '', doneAt: '', hidden: false, note: '', color: '' };
	let inNote = false;
	for (const part of parts) {
		const token = part.trim();
		if (token === '') continue;
		// The note runs to the end of the line, so any later token belongs to it.
		if (inNote) {
			item.note = `${item.note}${TOKEN_SEP}${token}`;
			continue;
		}
		if (token.startsWith('🎨')) {
			const color = token.slice(2).trim();
			if (CARD_COLORS.includes(color)) item.color = color;
		}
		else if (token.startsWith('📝')) {
			item.note = token.slice(2).trim();
			inNote = true;
		}
		// 🙈 marks a card the board masks by default; it is a UI-level veil, not encryption.
		else if (token === '🙈') item.hidden = true;
		else if (token.startsWith('@')) item.owner = token.slice(1).trim();
		else if (token.startsWith('#')) item.priority = token.slice(1).trim();
		else if (token.startsWith('📅')) item.due = token.slice(2).trim();
		else if (token.startsWith('✅')) item.doneAt = token.slice(1).trim();
		else item.title = item.title === '' ? token : `${item.title}${TOKEN_SEP}${token}`;
	}
	item.title = unescapeSep(item.title);
	item.note = unescapeSep(item.note);
	item.due = normalizeDue(item.due);
	return item;
}

function renderItem(item) {
	const parts = [escapeSep(item.title)];
	if (item.color) parts.push(`🎨${item.color}`);
	if (item.hidden) parts.push('🙈');
	if (item.owner) parts.push(`@${item.owner}`);
	if (item.priority) parts.push(`#${item.priority}`);
	if (item.due) parts.push(`📅${item.due}`);
	if (item.status === 'done' && item.doneAt) parts.push(`✅${item.doneAt}`);
	if (item.note) parts.push(`📝${escapeSep(item.note)}`);
	const mark = item.status === 'done' ? 'x' : ' ';
	return `- [${mark}] ${parts.join(TOKEN_SEP)} ^${item.id || newItemId()}`;
}

/** Parse the single board document into the project list the UI consumes. */
export function parseBoard(text) {
	const lines = text.split(/\r?\n/);
	const projects = [];
	let project = null;
	let column = null;
	let intro = [];
	const archive = [];
	let inArchive = false;
	for (const line of lines) {
		if (ARCHIVE_RE.test(line)) {
			inArchive = true;
			project = null;
			column = null;
			continue;
		}
		if (inArchive) {
			archive.push(line);
			continue;
		}
		const h2 = H2_RE.exec(line);
		if (h2 !== null) {
			project = {
				id: '',
				name: h2[1].trim(),
				kind: 'project',
				role: '',
				status: '进行中',
				owner: '',
				items: []
			};
			projects.push(project);
			column = null;
			continue;
		}
		const h3 = H3_RE.exec(line);
		if (h3 !== null) {
			column = STATUS_BY_ALIAS.get(h3[1].trim().toLowerCase()) || null;
			continue;
		}
		if (project === null) {
			intro.push(line);
			continue;
		}
		if (column === null) {
			const meta = META_RE.exec(line);
			if (meta !== null) {
				const key = META_BY_LABEL.get(meta[1].trim());
				if (key !== undefined) {
					const value = meta[2].trim();
					project[key] = value;
				}
			}
			continue;
		}
		const item = ITEM_RE.exec(line);
		if (item === null) continue;
		const parsed = parseItem(item[2], column);
		if (item[1] !== ' ' && column !== 'done') parsed.status = 'done';
		parsed.projectId = project.name;
		project.items.push(parsed);
	}
	for (const candidate of projects) {
		candidate.id = candidate.name;
		for (const item of candidate.items) {
			item.projectId = candidate.id;
			if (!item.id) item.id = newItemId();
		}
	}
	return { projects, intro, archive: archive.join('\n').replace(/^\s+|\s+$/g, '') };
}

/** Serialize the project list back into the single board document. */
export function renderBoard(projects, intro, archive) {
	const lines = [];
	const head = (intro || []).join('\n').replace(/\s*$/, '');
	lines.push(head.trim() === '' ? '# 看板\n\n所有任务都在这一个文件里，直接在 Obsidian 里改也可以。' : head);
	lines.push('');
	for (const project of projects) {
		lines.push(`## ${project.name}`);
		lines.push('');
		const meta = [];
		for (const [key, label] of META_KEYS) {
			const value = project[key];
			if (typeof value === 'string' && value.trim() !== '') meta.push(`- ${label}: ${value.trim()}`);
			else if (key === 'status') meta.push(`- ${label}: ${project.status || '进行中'}`);
		}
		lines.push(...meta);
		lines.push('');
		for (const column of COLUMNS) {
			lines.push(`### ${column.title}`);
			const items = project.items.filter((item) => item.status === column.status);
			for (const item of items) lines.push(renderItem(item));
			lines.push('');
		}
		lines.push('');
	}
	const body = lines.join('\n').replace(/\n{3,}/g, '\n\n').replace(/\s*$/, '');
	const tail = typeof archive === 'string' && archive.trim() !== ''
		? `\n\n---\n\n## ${ARCHIVE_HEADING}\n\n${archive.trim()}\n`
		: '';
	return `${body}${tail}\n`;
}

/** Render one deleted project as an archive block: its cards stay readable, its id is gone. */
export function renderArchiveBlock(project, when) {
	const lines = [`### ${when} 删除项目「${project.name}」`, ''];
	const meta = [];
	for (const [key, label] of META_KEYS) {
		const value = project[key];
		if (typeof value === 'string' && value.trim() !== '') meta.push(`- ${label}: ${value.trim()}`);
	}
	if (meta.length > 0) lines.push(...meta, '');
	for (const column of COLUMNS) {
		const items = project.items.filter((item) => item.status === column.status);
		if (items.length === 0) continue;
		lines.push(`#### ${column.title}`);
		for (const item of items) lines.push(renderItem(item));
		lines.push('');
	}
	if (project.items.length === 0) lines.push('（没有条目）', '');
	return lines.join('\n').trim();
}

/** The vault layout this plugin owns: one board document plus its readme. */
export function pathsOf(vaultDir) {
	return {
		root: vaultDir,
		board: path.join(vaultDir, '看板.md'),
		readme: path.join(vaultDir, 'README.md'),
		archive: path.join(vaultDir, '归档')
	};
}

const README = `# 看板

这个目录由 DSH 的「任务看板」插件读写；文件是纯 Markdown，用任何编辑器打开都能看能改。

- 所有数据都在 \`看板.md\` 一个文件里：\`## 项目名\` 是一节，\`### Todo\` / \`### Doing\` / \`### Done\` 是那一节的三列。
- 项目属性写在 \`## 项目名\` 下面，形如 \`- 角色: 需跟进进度\`、\`- 进度: 40\`。
- 条目格式：\`- [ ] 标题 · @负责人 · #优先级 · 📅截止日 ^k-xxxxx\`
- \`^k-xxxxx\` 是稳定 ID，改标题或换列都不会丢，请勿删；\`🙈\` 表示这条在看板上默认打码。
- 完成时把 \`[ ]\` 改成 \`[x]\`，插件下一次读取会自动把它归到 Done。
- 删除项目不会丢数据：它会被原样写进文件末尾的 \`## 🗄 归档\` 区，想恢复就把那几行搬回上面的项目里。
`;

/** Legacy single-bucket files this plugin used before the one-document layout. */
const LEGACY_FILES = ['收件箱.md', '待办池.md', '看板总览.md'];

function parseLegacyFile(text) {
	// The old layout was one project per file: `## Todo` at h2, everything else prose.
	const lines = text.split(/\r?\n/);
	let name = '';
	let role = '';
	let status = '进行中';
	let owner = '';
	let related = '';
	let goalText = '';
	const items = [];
	const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
	if (frontmatter !== null) {
		for (const line of frontmatter[1].split(/\r?\n/)) {
			const kv = /^([A-Za-z0-9_-]+)\s*:\s*(.*)$/.exec(line);
			if (kv === null) continue;
			const key = kv[1];
			const value = kv[2].trim();
			if (key === 'project') name = value;
			else if (key === 'role') role = value;
			else if (key === 'status') status = value;
			else if (key === 'owner') owner = value;
			else if (key === 'related') related = value;
		}
	}
	let column = null;
	const goalLines = [];
	let inGoal = false;
	for (const line of lines) {
		const h2 = H2_RE.exec(line);
		if (h2 !== null) {
			const heading = h2[1].trim();
			inGoal = /^(一句话目标|目标|goal)$/i.test(heading);
			const alias = STATUS_BY_ALIAS.get(heading.toLowerCase());
			column = alias === undefined ? null : alias;
			continue;
		}
		if (inGoal) {
			goalLines.push(line);
			continue;
		}
		if (column === null) {
			if (/^#\s+/.test(line) && name === '') name = line.replace(/^#\s+/, '').trim();
			continue;
		}
		const item = ITEM_RE.exec(line);
		if (item === null) continue;
		items.push(parseItem(item[2], column));
	}
	goalText = goalLines.join('\n').trim();
	return { name, role, status, owner, related, goal: goalText, items };
}

async function exists(target) {
	try {
		await fs.access(target);
		return true;
	} catch {
		return false;
	}
}

/** Fold the pre-single-file vault (待办池.md + 项目/*.md) into 看板.md, then park the old files. */
async function migrateLegacy(paths) {
	const collected = [];
	for (const file of LEGACY_FILES) {
		const target = path.join(paths.root, file);
		if (!(await exists(target))) continue;
		if (file === '看板总览.md') continue;
		const text = await fs.readFile(target, 'utf8');
		const parsed = parseLegacyFile(text);
		if (parsed.name === '') parsed.name = file.replace(/\.md$/, '');
		collected.push(parsed);
	}
	const projectDir = path.join(paths.root, '项目');
	if (await exists(projectDir)) {
		for (const entry of await fs.readdir(projectDir)) {
			if (!entry.endsWith('.md')) continue;
			const text = await fs.readFile(path.join(projectDir, entry), 'utf8');
			const parsed = parseLegacyFile(text);
			if (parsed.name === '') parsed.name = entry.replace(/\.md$/, '');
			collected.push(parsed);
		}
	}
	if (collected.length === 0) return false;

	const projects = collected
		.filter((project) => project.name !== '')
		.map((project) => ({
			...project,
			id: project.name
		}));
	await fs.writeFile(paths.board, renderBoard(projects, []), 'utf8');

	await fs.mkdir(paths.archive, { recursive: true });
	for (const file of LEGACY_FILES) {
		const target = path.join(paths.root, file);
		if (await exists(target)) await fs.rename(target, path.join(paths.archive, file));
	}
	if (await exists(projectDir)) {
		for (const entry of await fs.readdir(projectDir)) {
			await fs.rename(path.join(projectDir, entry), path.join(paths.archive, entry));
		}
		await fs.rm(projectDir, { recursive: true, force: true });
	}
	return true;
}

export async function ensureLayout(vaultDir) {
	const paths = pathsOf(vaultDir);
	await fs.mkdir(paths.root, { recursive: true });
	if (!(await exists(paths.board))) {
		const migrated = await migrateLegacy(paths);
		if (!migrated) await fs.writeFile(paths.board, renderBoard([], []), 'utf8');
	}
	if (!(await exists(paths.readme))) await fs.writeFile(paths.readme, README, 'utf8');
	return paths;
}

export async function loadBoard(vaultDir) {
	const paths = await ensureLayout(vaultDir);
	let text = '';
	let mtimeMs = 0;
	try {
		text = await fs.readFile(paths.board, 'utf8');
		mtimeMs = (await fs.stat(paths.board)).mtimeMs;
	} catch {
		text = '';
	}
	return { ...parseBoard(text), mtimeMs };
}

/**
 * Write the board back. When `expectedMtime` is given and the file changed since
 * it was read, nothing is written and false is returned: the caller retries on a
 * fresh read instead of silently discarding someone's edit in Obsidian.
 */
export async function saveBoard(vaultDir, board, options) {
	const paths = await ensureLayout(vaultDir);
	if (options && typeof options.expectedMtime === 'number') {
		let current = 0;
		try {
			current = (await fs.stat(paths.board)).mtimeMs;
		} catch {
			current = 0;
		}
		if (current !== options.expectedMtime) return false;
	}
	await fs.writeFile(paths.board, renderBoard(board.projects, board.intro, board.archive), 'utf8');
	return true;
}

export { COLUMNS };

window.__ModuleLoader__.load({
	id: 'dsh-local-board',
	factory(require) {
		const React = require('react');
		const h = React.createElement;

		const COLUMNS = [
			{ status: 'todo', title: 'Todo', tone: 'idle' },
			{ status: 'doing', title: 'Doing', tone: 'brand' },
			{ status: 'done', title: 'Done', tone: 'success' }
		];
		const ROLES = ['我负责', '需跟进进度', '仅知晓'];
		const ACTION_LABELS = {
			state: '刷新',
			createProject: '新建项目',
			updateProject: '更新项目',
			deleteProject: '删除项目',
			addItem: '添加条目',
			updateItem: '修改条目',
			moveItem: '移动条目',
			assignItem: '归入项目',
			deleteItem: '删除条目',
			openFolder: '打开文件夹',
			configureVault: '选择文件夹'
		};
		const PROJECT_STATUS = ['进行中', '暂停', '已结束'];
		/** Card color stripe; keys match what the markdown stores. */
		const CARD_COLORS = [
			{ key: 'red', hex: '#e5484d', label: '红' },
			{ key: 'orange', hex: '#f76b15', label: '橙' },
			{ key: 'yellow', hex: '#e2a336', label: '黄' },
			{ key: 'green', hex: '#30a46c', label: '绿' },
			{ key: 'blue', hex: '#3b82f6', label: '蓝' },
			{ key: 'purple', hex: '#8e4ec6', label: '紫' },
			{ key: 'gray', hex: '#8d8d8d', label: '灰' }
		];
		const colorHex = (key) => (CARD_COLORS.find((color) => color.key === key) || {}).hex || '';
		/** Project status → dot tone; unknown values fall back to the idle grey. */
		const STATUS_TONE = { '进行中': 'active', '暂停': 'paused', '已结束': 'ended' };

		const CSS = `
.kb-page { display: flex; flex-direction: column; height: 100%; min-height: 0; color: var(--dsw-alias-label-primary); background: var(--dsw-alias-bg-base); }
.kb-head { display: flex; align-items: center; flex-wrap: wrap; gap: 8px 10px; padding: 12px 18px; border-bottom: 1px solid var(--dsw-alias-border-l1); flex: 0 0 auto; }
.kb-title { font-size: 16px; font-weight: 600; letter-spacing: .01em; }
.kb-sub { font-size: 12.5px; color: var(--dsw-alias-label-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; flex: 0 1 auto; }
.kb-spacer { flex: 1 1 auto; }
.kb-btn { font: inherit; font-size: 12.5px; padding: 5px 10px; border-radius: 7px; border: 1px solid var(--dsw-alias-border-l2); background: transparent; color: var(--dsw-alias-label-primary); cursor: pointer; white-space: nowrap; }
.kb-btn:hover { background: var(--dsw-alias-bg-layer-2); }
.kb-btn.primary { background: var(--dsw-alias-brand-primary); border-color: transparent; color: #fff; }
.kb-btn.ghost { border-color: transparent; color: var(--dsw-alias-label-secondary); }
.kb-btn.tiny { padding: 2px 7px; font-size: 11.5px; }
.kb-body { display: flex; flex: 1 1 auto; min-height: 0; }
.kb-rail { width: 208px; flex: 0 0 auto; border-right: 1px solid var(--dsw-alias-border-l1); padding: 10px; overflow: auto; display: flex; flex-direction: column; gap: 4px; }
.kb-rail-label { font-size: 11.5px; text-transform: uppercase; letter-spacing: .06em; color: var(--dsw-alias-label-secondary); padding: 6px 8px 2px; }
.kb-proj { display: flex; align-items: center; gap: 2px; border-radius: 8px; border: 1px solid transparent; background: transparent; }
.kb-proj:hover { background: var(--dsw-alias-bg-layer-2); }
.kb-proj.active { background: var(--dsw-alias-bg-layer-2); border-color: var(--dsw-alias-border-l2); }
.kb-proj-main { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; gap: 2px; padding: 7px 9px; border: 0; background: transparent; font: inherit; color: inherit; text-align: left; cursor: pointer; }
.kb-proj-del { flex: 0 0 auto; margin-right: 4px; width: 20px; height: 20px; line-height: 1; padding: 0; border: 0; border-radius: 5px; background: transparent; color: var(--dsw-alias-label-secondary); cursor: pointer; opacity: 0; font-size: 14px; }
.kb-proj:hover .kb-proj-del { opacity: 1; }
.kb-proj-del:hover { color: var(--dsw-alias-state-error-primary); background: var(--dsw-alias-bg-base); }
.kb-version { font-size: 11px; color: var(--dsw-alias-label-secondary); opacity: .6; padding: 10px 9px 4px; margin-top: auto; }
.kb-proj-head { display: flex; align-items: center; gap: 6px; min-width: 0; }
.kb-status-dot { width: 6px; height: 6px; border-radius: 50%; flex: 0 0 auto; }
.kb-status-dot.active { background: var(--dsw-alias-state-success-primary); }
.kb-status-dot.paused { background: var(--dsw-alias-state-warn-primary); }
.kb-status-dot.ended { background: var(--dsw-alias-state-idle-primary); }
.kb-proj-name { flex: 1 1 auto; min-width: 0; font-size: 13.5px; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.kb-proj-meta { font-size: 11.5px; color: var(--dsw-alias-label-secondary); display: flex; gap: 6px; }
.kb-board { flex: 1 1 auto; min-width: 0; display: flex; gap: 12px; padding: 14px; overflow: auto; align-items: flex-start; }
.kb-col { flex: 1 1 0; min-width: 220px; display: flex; flex-direction: column; gap: 8px; background: var(--dsw-alias-bg-layer-1); border: 1px solid var(--dsw-alias-border-l1); border-radius: 12px; padding: 10px; max-height: 100%; }
.kb-col.over { border-color: var(--dsw-alias-brand-primary); }
.kb-col-head { display: flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 600; }
.kb-dot { width: 7px; height: 7px; border-radius: 50%; }
.kb-dot.todo { background: var(--dsw-alias-state-idle-primary); }
.kb-dot.doing { background: var(--dsw-alias-brand-primary); }
.kb-dot.done { background: var(--dsw-alias-state-success-primary); }
.kb-count { margin-left: auto; font-size: 11.5px; color: var(--dsw-alias-label-secondary); font-weight: 400; }
.kb-cards { display: flex; flex-direction: column; gap: 6px; overflow: auto; }
.kb-card { position: relative; overflow: hidden; border: 1px solid var(--dsw-alias-border-l1); border-radius: 9px; padding: 8px 9px; background: var(--dsw-alias-bg-base); cursor: grab; display: flex; flex-direction: column; gap: 4px; }
.kb-colorbar { position: absolute; left: 0; top: 0; bottom: 0; width: 3px; border-radius: 9px 0 0 9px; }
.kb-card:hover { border-color: var(--dsw-alias-border-l2); }
.kb-card.done .kb-card-title { color: var(--dsw-alias-label-secondary); text-decoration: line-through; }
.kb-card.masked { border-style: dashed; background: var(--dsw-alias-bg-layer-2); }
.kb-veiled { color: var(--dsw-alias-label-secondary); letter-spacing: .08em; font-size: 12.5px; }
.kb-check { display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--dsw-alias-label-secondary); cursor: pointer; }
.kb-swatches { display: flex; align-items: center; gap: 5px; }
.kb-swatch { width: 18px; height: 18px; padding: 0; border-radius: 50%; border: 1px solid var(--dsw-alias-border-l2); cursor: pointer; font-size: 11px; line-height: 1; color: var(--dsw-alias-label-secondary); background: transparent; }
.kb-swatch.none { color: var(--dsw-alias-label-secondary); }
.kb-swatch.active { box-shadow: 0 0 0 2px var(--dsw-alias-bg-base), 0 0 0 3px var(--dsw-alias-label-primary); }
.kb-tabs { display: flex; gap: 2px; background: var(--dsw-alias-bg-layer-2); padding: 2px; border-radius: 8px; }
.kb-tab { font: inherit; font-size: 12.5px; padding: 4px 10px; border: 0; border-radius: 6px; background: transparent; color: var(--dsw-alias-label-secondary); cursor: pointer; }
.kb-tab.active { background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-primary); }
.kb-auto { flex: 1 1 auto; overflow: auto; padding: 16px 20px; display: flex; flex-direction: column; gap: 10px; }
.kb-auto-row { display: flex; align-items: center; gap: 14px; padding: 12px 14px; border: 1px solid var(--dsw-alias-border-l1); border-radius: 10px; background: var(--dsw-alias-bg-layer-1); }
.kb-auto-main { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
.kb-auto-title { font-size: 14px; font-weight: 600; display: flex; align-items: center; gap: 8px; }
.kb-auto-desc { font-size: 12.5px; color: var(--dsw-alias-label-secondary); }
.kb-auto-time { display: flex; align-items: center; gap: 6px; }
.kb-auto-time input, .kb-auto-time select { font: inherit; font-size: 12px; padding: 4px 6px; border-radius: 6px; border: 1px solid var(--dsw-alias-border-l2); background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-primary); }
.kb-badge { font-size: 11px; padding: 1px 7px; border-radius: 999px; border: 1px solid var(--dsw-alias-border-l2); color: var(--dsw-alias-label-secondary); font-weight: 400; }
.kb-badge.on { color: var(--dsw-alias-state-success-primary); border-color: currentColor; }
.kb-badge.off { color: var(--dsw-alias-state-idle-primary); }
.kb-search { font: inherit; font-size: 12.5px; padding: 5px 9px; border-radius: 7px; border: 1px solid var(--dsw-alias-border-l2); background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-primary); width: 150px; min-width: 110px; flex: 0 1 150px; }
.kb-card.overdue { border-color: var(--dsw-alias-state-error-primary); }
.kb-card.today { border-color: var(--dsw-alias-state-warn-primary); }
.kb-tag.due-overdue { color: var(--dsw-alias-state-error-primary); }
.kb-tag.due-today { color: var(--dsw-alias-state-warn-primary); }
.kb-proj.drop { outline: 1px dashed var(--dsw-alias-brand-primary); outline-offset: -2px; }
.kb-card-title { font-size: 13.5px; line-height: 1.45; word-break: break-word; }
.kb-card-note { font-size: 12px; line-height: 1.5; color: var(--dsw-alias-label-secondary); white-space: pre-wrap; word-break: break-word; padding-left: 1px; border-left: 2px solid var(--dsw-alias-border-l2); margin: 1px 0 1px 1px; padding-left: 6px; }
.kb-card-meta { display: flex; flex-wrap: wrap; gap: 5px; font-size: 11.5px; color: var(--dsw-alias-label-secondary); }
.kb-tag { padding: 1px 6px; border-radius: 999px; background: var(--dsw-alias-bg-layer-2); white-space: nowrap; }
.kb-tag.p1 { color: var(--dsw-alias-state-error-primary); }
.kb-tag.proj { border: 1px solid var(--dsw-alias-border-l2); background: transparent; }
.kb-empty { font-size: 12px; color: var(--dsw-alias-label-secondary); padding: 6px 2px; }
.kb-add { font-size: 12.5px; color: var(--dsw-alias-label-secondary); border: 1px dashed var(--dsw-alias-border-l2); border-radius: 8px; padding: 6px; background: transparent; cursor: pointer; font-family: inherit; }
.kb-add:hover { color: var(--dsw-alias-label-primary); }
.kb-setup { flex: 1 1 auto; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; padding: 40px 24px; text-align: center; }
.kb-setup-title { font-size: 17px; font-weight: 600; }
.kb-setup-text { font-size: 13px; line-height: 1.7; color: var(--dsw-alias-label-secondary); max-width: 460px; }
.kb-setup-actions { display: flex; align-items: center; gap: 10px; margin-top: 6px; }
.kb-setup-path { font-size: 11.5px; color: var(--dsw-alias-label-secondary); }
.kb-setup-hint { font-size: 11.5px; color: var(--dsw-alias-label-secondary); opacity: .75; margin-top: 10px; }
.kb-card-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; margin-top: 1px; }
.kb-select.kb-mini { width: auto; max-width: 104px; min-width: 0; font-size: 11.5px; padding: 2px 4px; border-radius: 6px; color: var(--dsw-alias-label-secondary); }
.kb-input, .kb-select, .kb-textarea { font: inherit; font-size: 12.5px; padding: 5px 7px; border-radius: 6px; border: 1px solid var(--dsw-alias-border-l2); background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-primary); width: 100%; box-sizing: border-box; }
.kb-textarea { resize: vertical; min-height: 54px; }
.kb-form { display: flex; flex-direction: column; gap: 6px; padding: 8px; border: 1px solid var(--dsw-alias-border-l1); border-radius: 9px; background: var(--dsw-alias-bg-layer-2); }
.kb-row { display: flex; gap: 6px; align-items: center; }
.kb-err { color: var(--dsw-alias-state-error-primary); font-size: 12.5px; padding: 6px 20px; }
.kb-main { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; min-height: 0; }
.kb-settings { flex: 0 0 auto; border-bottom: 1px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-layer-1); padding: 9px 14px; display: flex; flex-direction: column; gap: 7px; }
.kb-settings-row { display: flex; gap: 10px; align-items: flex-end; flex-wrap: wrap; }
.kb-field { display: flex; flex-direction: column; gap: 2px; font-size: 11.5px; color: var(--dsw-alias-label-secondary); min-width: 96px; }
.kb-field.name { min-width: 150px; max-width: 220px; }
.kb-field.grow { flex: 1 1 200px; }
.kb-field.grow.wider { flex: 2 1 320px; }
.kb-settings .kb-textarea { min-height: 34px; height: 34px; resize: vertical; }
.kb-danger:hover { color: var(--dsw-alias-state-error-primary); }
`;

		function useApi() {
			const [state, setState] = React.useState({ status: 'loading', data: null, error: '' });
			const call = React.useCallback(async (action, payload) => {
				const response = await fetch('kanban/api', {
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ action, ...(payload || {}) })
				});
				if (!response.ok) throw new Error(`请求失败 (${response.status})`);
				const body = await response.json();
				if (!body.ok) throw new Error(body.error || '操作失败');
				setState({ status: 'ready', data: body.state, error: '' });
				return body.state;
			}, []);
			/** Same transport, but the response is NOT the board: never replace the board state. */
			const request = React.useCallback(async (action, payload) => {
				const response = await fetch('kanban/api', {
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ action, ...(payload || {}) })
				});
				if (!response.ok) throw new Error(`请求失败 (${response.status})`);
				const body = await response.json();
				if (!body.ok) throw new Error(body.error || '操作失败');
				return body.state;
			}, []);
			const run = React.useCallback(async (action, payload) => {
				try {
					await call(action, payload);
					setState((prev) => ({ ...prev, error: '' }));
				} catch (error) {
					const label = ACTION_LABELS[action] || action;
					const message = error instanceof Error ? error.message : String(error);
					setState((prev) => ({ ...prev, error: `${label}失败：${message}` }));
				}
			}, [call]);
			React.useEffect(() => {
				let alive = true;
				call('state').catch((error) => {
					if (alive) setState({ status: 'error', data: null, error: error instanceof Error ? error.message : String(error) });
				});
				return () => {
					alive = false;
				};
			}, [call]);
			return { ...state, run, call, request };
		}

		function CardEditor({ item, onSubmit, onCancel }) {
			const [draft, setDraft] = React.useState({
				title: item.title,
				owner: item.owner,
				priority: item.priority,
				due: item.due,
				note: item.note || '',
				color: item.color || '',
				hidden: Boolean(item.hidden)
			});
			const field = (key, placeholder) => h('input', {
				className: 'kb-input',
				value: draft[key],
				placeholder,
				onChange: (event) => setDraft({ ...draft, [key]: event.target.value }),
				onKeyDown: (event) => {
					if (event.key === 'Escape') onCancel();
					if (event.key === 'Enter') onSubmit(draft);
				}
			});
			return h('div', { className: 'kb-form' },
				field('title', '标题'),
				h('div', { className: 'kb-row' }, field('owner', '负责人'), field('priority', '优先级 P0/P1')),
				h('div', { className: 'kb-row' },
					h('input', {
						className: 'kb-input',
						type: 'date',
						value: draft.due.slice(0, 10),
						onChange: (event) => {
							const clock = draft.due.slice(11, 16);
							setDraft({ ...draft, due: clock ? `${event.target.value} ${clock}` : event.target.value });
						}
					}),
					h('input', {
						className: 'kb-input',
						type: 'time',
						style: { maxWidth: 110 },
						value: draft.due.slice(11, 16),
						onChange: (event) => {
							const day = draft.due.slice(0, 10);
							setDraft({ ...draft, due: event.target.value ? `${day} ${event.target.value}` : day });
						}
					})
				),
				h('textarea', {
					className: 'kb-textarea',
					placeholder: '备注（换行会自动合并成「；」，保证一条记录一行）',
					value: draft.note,
					onChange: (event) => setDraft({ ...draft, note: event.target.value })
				}),
				h('div', { className: 'kb-swatches' },
					h('button', {
						className: `kb-swatch none${draft.color === '' ? ' active' : ''}`,
						title: '无颜色',
						onClick: () => setDraft({ ...draft, color: '' })
					}, '×'),
					CARD_COLORS.map((color) => h('button', {
						key: color.key,
						className: `kb-swatch${draft.color === color.key ? ' active' : ''}`,
						title: color.label,
						style: { background: color.hex },
						onClick: () => setDraft({ ...draft, color: color.key })
					}))
				),
				h('label', { className: 'kb-check' },
					h('input', {
						type: 'checkbox',
						checked: draft.hidden,
						onChange: (event) => setDraft({ ...draft, hidden: event.target.checked })
					}),
					'私密：默认打码，点「显示」才看得到'
				),
				h('div', { className: 'kb-row' },
					h('button', { className: 'kb-btn primary tiny', onClick: () => onSubmit(draft) }, '保存'),
					h('button', { className: 'kb-btn ghost tiny', onClick: onCancel }, '取消')
				)
			);
		}

		/** A 3px color bar inside the card; a plain element cannot be overridden by border styles. */
		function colorBar(item) {
			const hex = colorHex(item.color);
			if (hex === '') return null;
			return h('i', { className: 'kb-colorbar', style: { background: hex }, 'aria-hidden': true });
		}

		function Card({ item, projectName, showProject, masked, targets, onReveal, onHide, onMove, onAssign, onEdit, onDelete }) {
			const now = new Date();
			const pad = (n) => String(n).padStart(2, '0');
			const nowDate = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
			const nowClock = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
			const dueDate = String(item.due || '').slice(0, 10);
			const dueClock = String(item.due || '').slice(11, 16);
			const openItem = item.status !== 'done';
			const overdue = Boolean(dueDate) && openItem && (dueDate < nowDate || (dueDate === nowDate && dueClock !== '' && dueClock < nowClock));
			const dueToday = Boolean(dueDate) && openItem && dueDate === nowDate;
			const dueClass = overdue ? ' due-overdue' : dueToday ? ' due-today' : '';
			const dueText = `📅 ${dueDate}${dueClock ? ` ${dueClock}` : ''}`;
			const [editing, setEditing] = React.useState(false);
			const [over, setOver] = React.useState(false);

			if (editing) {
				return h('div', { className: 'kb-card' }, h(CardEditor, {
					item,
					onSubmit: (draft) => {
						setEditing(false);
						onEdit(item, draft);
					},
					onCancel: () => setEditing(false)
				}));
			}

			const dragProps = {
				draggable: true,
				onDragStart: (event) => {
					event.dataTransfer.setData('text/plain', `${item.projectId}|${item.id}`);
					event.dataTransfer.effectAllowed = 'move';
				},
				onDragEnd: () => setOver(false),
				onDragOver: (event) => {
					event.preventDefault();
					setOver(true);
				},
				onDragLeave: () => setOver(false),
				onDrop: (event) => {
					event.preventDefault();
					setOver(false);
					const raw = event.dataTransfer.getData('text/plain');
					const [fromProject, fromId] = raw.split('|');
					if (fromProject === item.projectId && fromId === item.id && item.status === 'todo') return;
					onMove(raw, item.status);
				},
				style: over ? { borderColor: 'var(--dsw-alias-brand-primary)' } : undefined
			};

			const moveTargets = targets ? targets.filter((target) => target.id !== item.projectId) : [];
			const assignPicker = moveTargets.length > 0
				? h('select', {
					className: 'kb-select kb-mini',
					title: '归入其他项目',
					value: '',
					onChange: (event) => {
						const next = event.target.value;
						event.target.value = '';
						if (next) onAssign(item, next);
					}
				},
					h('option', { value: '' }, '归入…'),
					moveTargets.map((target) => h('option', { key: target.id, value: target.id }, target.name))
				)
				: null;

			// Veiled card: title, owner and priority stay off screen until the owner asks for them.
			if (masked) {
				return h('div', { className: 'kb-card masked', ...dragProps },
					colorBar(item),
					h('div', { className: 'kb-card-title kb-veiled' }, '🔒 已隐藏'),
					h('div', { className: 'kb-card-meta' },
						showProject ? h('span', { className: 'kb-tag proj' }, projectName) : null,
						dueDate ? h('span', { className: `kb-tag${dueClass}` }, dueText) : null,
						item.doneAt ? h('span', { className: 'kb-tag' }, `✅ ${item.doneAt}`) : null
					),
					h('div', { className: 'kb-card-actions' },
						h('button', { className: 'kb-btn ghost tiny', onClick: () => onReveal(item) }, '显示内容'),
						assignPicker,
						h('button', { className: 'kb-btn ghost tiny', onClick: () => onDelete(item) }, '删除')
					)
				);
			}

			return h('div', { className: `kb-card${item.status === 'done' ? ' done' : ''}${overdue ? ' overdue' : dueToday ? ' today' : ''}`, ...dragProps },
				colorBar(item),
				h('div', { className: 'kb-card-title', onClick: () => setEditing(true), title: '点击编辑' },
					item.hidden ? '🙈 ' : null,
					item.title),
				item.note ? h('div', { className: 'kb-card-note' }, item.note) : null,
				h('div', { className: 'kb-card-meta' },
					showProject ? h('span', { className: 'kb-tag proj' }, projectName) : null,
					item.owner ? h('span', { className: 'kb-tag' }, `@${item.owner}`) : null,
					item.priority ? h('span', { className: `kb-tag${item.priority.toUpperCase().startsWith('P0') || item.priority.toUpperCase().startsWith('P1') ? ' p1' : ''}` }, `#${item.priority}`) : null,
					dueDate ? h('span', { className: `kb-tag${dueClass}` }, `${dueText}${overdue ? ' 逾期' : ''}`) : null,
					item.doneAt ? h('span', { className: 'kb-tag' }, `✅ ${item.doneAt}`) : null
				),
				h('div', { className: 'kb-card-actions' },
					assignPicker,
					item.hidden ? h('button', { className: 'kb-btn ghost tiny', onClick: () => onHide(item) }, '收起') : null,
					h('button', { className: 'kb-btn ghost tiny', onClick: () => setEditing(true) }, '编辑'),
					h('button', { className: 'kb-btn ghost tiny', onClick: () => onDelete(item) }, '删除')
				)
			);
		}

		function Column({ column, items, projectNameOf, showProject, canAdd, isMasked, targets, filterLabel, onReveal, onHide, onAssign, onAdd, onMove, onEdit, onDelete }) {
			const [adding, setAdding] = React.useState(false);
			const [over, setOver] = React.useState(false);
			return h('section', {
				className: `kb-col${over ? ' over' : ''}`,
				onDragOver: (event) => {
					event.preventDefault();
					setOver(true);
				},
				onDragLeave: () => setOver(false),
				onDrop: (event) => {
					event.preventDefault();
					setOver(false);
					const raw = event.dataTransfer.getData('text/plain');
					if (raw) onMove(raw, column.status);
				}
			},
				h('div', { className: 'kb-col-head' },
					h('span', { className: `kb-dot ${column.status}` }),
					h('span', null, column.title),
					h('span', { className: 'kb-count' }, items.length)
				),
				h('div', { className: 'kb-cards' },
					items.length === 0 && !adding
						? h('div', { className: 'kb-empty' }, filterLabel ? `没有匹配「${filterLabel}」` : '（暂无）')
						: null,
					items.map((item) => h(Card, {
						key: item.id,
						item,
						projectName: projectNameOf(item.projectId),
						showProject,
						masked: isMasked(item),
						targets,
						onReveal,
						onHide,
						onAssign,
						onMove,
						onEdit,
						onDelete
					})),
					adding ? h(CardEditor, {
						item: { title: '', owner: '', priority: '', due: '', note: '', hidden: false },
						onSubmit: (draft) => {
							setAdding(false);
							if (String(draft.title).trim() !== '') onAdd(column.status, draft);
						},
						onCancel: () => setAdding(false)
					}) : null
				),
				canAdd
					? h('button', { className: 'kb-add', onClick: () => setAdding(true) }, '+ 添加条目')
					: h('div', { className: 'kb-empty' }, '先在左侧选中一个项目再添加')
			);
		}

		const WEEKDAY_OPTIONS = [
			{ value: 1, label: '周一' }, { value: 2, label: '周二' }, { value: 3, label: '周三' },
			{ value: 4, label: '周四' }, { value: 5, label: '周五' }, { value: 6, label: '周六' }, { value: 0, label: '周日' }
		];

		function Automations({ items, error, onUpdate }) {
			if (items === null) return h('div', { className: 'kb-auto' }, h('div', { className: 'kb-sub' }, '正在读取系统里的定时任务…'));
			if (items.length === 0) return h('div', { className: 'kb-auto' }, h('div', { className: 'kb-sub' }, '还没有任何定时任务。'));
			return h('div', { className: 'kb-auto' },
				error ? h('div', { className: 'kb-err', style: { padding: 0 } }, error) : null,
				items.map((item) => {
					const clock = `${String(item.hour).padStart(2, '0')}:${String(item.minute).padStart(2, '0')}`;
					const commitTime = (value) => {
						const [hour, minute] = value.split(':').map((part) => Number.parseInt(part, 10));
						if (Number.isInteger(hour) && Number.isInteger(minute)) onUpdate(item.id, { hour, minute });
					};
					return h('div', { key: item.id, className: 'kb-auto-row' },
						h('div', { className: 'kb-auto-main' },
							h('div', { className: 'kb-auto-title' },
								item.title,
								h('span', { className: `kb-badge ${item.enabled ? 'on' : 'off'}` }, item.enabled ? '运行中' : '已停用'),
								h('span', { className: 'kb-badge' }, item.text)
							),
							h('div', { className: 'kb-auto-desc' }, item.description)
						),
						h('div', { className: 'kb-auto-time' },
							item.kind === 'weekly'
								? h('select', {
									value: item.weekday,
									onChange: (event) => onUpdate(item.id, { weekday: Number.parseInt(event.target.value, 10) })
								}, WEEKDAY_OPTIONS.map((option) => h('option', { key: option.value, value: option.value }, option.label)))
								: null,
							item.kind === 'interval'
								? h('select', {
									value: item.minutes,
									onChange: (event) => onUpdate(item.id, { intervalMinutes: Number.parseInt(event.target.value, 10) })
								}, [10, 15, 30, 60, 120].map((minutes) => h('option', { key: minutes, value: minutes }, `每 ${minutes} 分钟`)))
								: null,
							item.kind === 'interval' || item.kind === 'once' ? null : h('input', {
								type: 'time',
								value: clock,
								onChange: (event) => commitTime(event.target.value)
							}),
							h('button', {
								className: `kb-btn${item.enabled ? ' ghost' : ' primary'} tiny`,
								onClick: () => onUpdate(item.id, { enabled: !item.enabled })
							}, item.enabled ? '停用' : '启用')
						)
					);
				})
			);
		}

		function ProjectForm({ onCreate, onCancel }) {
			const [name, setName] = React.useState('');
			const [role, setRole] = React.useState(ROLES[1]);
			return h('div', { className: 'kb-form' },
				h('input', {
					className: 'kb-input',
					autoFocus: true,
					placeholder: '项目名称',
					value: name,
					onChange: (event) => setName(event.target.value),
					onKeyDown: (event) => {
						if (event.key === 'Enter' && name.trim() !== '') onCreate({ name: name.trim(), role });
						if (event.key === 'Escape') onCancel();
					}
				}),
				h('select', { className: 'kb-select', value: role, onChange: (event) => setRole(event.target.value) },
					ROLES.map((option) => h('option', { key: option, value: option }, option))),
				h('div', { className: 'kb-row' },
					h('button', { className: 'kb-btn primary tiny', onClick: () => { if (name.trim() !== '') onCreate({ name: name.trim(), role }); } }, '创建'),
					h('button', { className: 'kb-btn ghost tiny', onClick: onCancel }, '取消')
				)
			);
		}

		function Settings({ project, onChange, onDelete }) {
			const [draft, setDraft] = React.useState(project);
			React.useEffect(() => setDraft(project), [project.id, project.name, project.updated, project.role, project.status]);
			const commit = (patch) => {
				const next = { ...draft, ...patch };
				setDraft(next);
				onChange({ name: next.name, role: next.role, status: next.status });
			};
			return h('div', { className: 'kb-settings' },
				h('div', { className: 'kb-settings-row' },
					h('label', { className: 'kb-field name' }, '项目名',
						h('input', {
							className: 'kb-input',
							value: draft.name,
							onChange: (event) => setDraft({ ...draft, name: event.target.value }),
							onBlur: () => {
								const next = String(draft.name || '').trim();
								if (next !== '' && next !== project.name) commit({ name: next });
							},
							onKeyDown: (event) => {
								if (event.key === 'Enter') event.target.blur();
							}
						})),
					h('label', { className: 'kb-field' }, '角色',
						h('select', { className: 'kb-select', value: draft.role, onChange: (event) => commit({ role: event.target.value }) },
							ROLES.map((option) => h('option', { key: option, value: option }, option)))),
					h('label', { className: 'kb-field' }, '状态',
						h('select', { className: 'kb-select', value: draft.status, onChange: (event) => commit({ status: event.target.value }) },
							PROJECT_STATUS.map((option) => h('option', { key: option, value: option }, option)))),
					h('span', { className: 'kb-spacer' }),
					h('button', { className: 'kb-btn ghost tiny kb-danger', onClick: () => onDelete(project) }, '删除项目')
				)
			);
		}

		function Panel({ pickDirectory }) {
			const { status, data, error, run, call, request } = useApi();
			const [selected, setSelected] = React.useState('all');
			const [creating, setCreating] = React.useState(false);
			const [query, setQuery] = React.useState('');
			const [tab, setTab] = React.useState('board');
			const [automations, setAutomations] = React.useState(null);
			const [autoSupported, setAutoSupported] = React.useState(null);
			const [autoError, setAutoError] = React.useState('');
			const [sortMode, setSortMode] = React.useState(() => {
				try {
					return window.localStorage.getItem('kanban.sort') || 'manual';
				} catch {
					return 'manual';
				}
			});
			const setSort = (next) => {
				setSortMode(next);
				try {
					window.localStorage.setItem('kanban.sort', next);
				} catch {
					// A blocked storage write must not break sorting.
				}
			};
			const [dropTarget, setDropTarget] = React.useState('');
			// Reveal is per-view and in memory only: reopening or refreshing the board re-masks everything.
			const [revealed, setRevealed] = React.useState({});
			const isMasked = (item) => Boolean(item.hidden) && revealed[item.id] !== true;
			const reveal = (item) => setRevealed((previous) => ({ ...previous, [item.id]: true }));
			const conceal = (item) => setRevealed((previous) => ({ ...previous, [item.id]: false }));
			const loadAutomations = React.useCallback(() => {
				request('automations')
					.then((state) => {
						setAutomations(state.items || []);
						setAutoSupported(state.supported !== false);
						setAutoError('');
					})
					.catch((error) => setAutoError(error instanceof Error ? error.message : String(error)));
			}, [request]);
			React.useEffect(() => {
				if (tab === 'automations' && automations === null) loadAutomations();
			}, [tab, automations, loadAutomations]);

			if (status === 'loading') return h('div', { className: 'kb-page' }, h('style', null, CSS), h('div', { className: 'kb-sub', style: { padding: 20 } }, '正在读取本地看板…'));
			if (status === 'error') return h('div', { className: 'kb-page' }, h('style', null, CSS), h('div', { className: 'kb-err', style: { padding: 20 } }, `读取失败：${error}`));
			if (data !== null && data.needsSetup === true) {
				return h('div', { className: 'kb-page' },
					h('style', null, CSS),
					h('div', { className: 'kb-setup' },
						h('div', { className: 'kb-setup-title' }, '先选一个文件夹'),
						h('div', { className: 'kb-setup-text' }, '看板会在你选的文件夹里创建一个 Markdown 文件（看板.md），所有任务都存在里面。选一个你平时放笔记或待办的文件夹就行。'),
						h('div', { className: 'kb-setup-actions' },
							h('button', {
								className: 'kb-btn primary',
								onClick: async () => {
									if (typeof pickDirectory !== 'function') return;
									try {
										const chosen = await pickDirectory();
										if (!chosen) return;
										await call('configureVault', { path: chosen });
									} catch (failure) {
										window.alert(failure instanceof Error ? failure.message : String(failure));
									}
								}
							}, '选择文件夹'),
							data.vaultDir ? h('code', { className: 'kb-setup-path' }, data.vaultDir) : null
						),
						h('div', { className: 'kb-setup-hint' }, '也可以在这个插件的配置里填 vaultDir，直接指定目录。')
					)
				);
			}

			const projects = data.projects || [];
			const current = projects.find((project) => project.id === selected);
			// A selection whose project disappeared (renamed or deleted elsewhere) falls back to the whole board.
			const visible = selected === 'all' || !current ? projects : [current];
			const projectNameOf = (id) => (projects.find((project) => project.id === id) || {}).name || id;
			const items = [];
			for (const project of visible) for (const item of project.items) items.push(item);
			const needle = query.trim().toLowerCase();
			const shown = needle === ''
				? items
				: items.filter((item) => {
					const haystack = [item.title, item.note, item.owner, item.priority, projectNameOf(item.projectId)].join(' ').toLowerCase();
					return haystack.includes(needle);
				});
			const sortItems = (list) => {
				if (sortMode !== 'due') return list;
				return [...list].sort((a, b) => (a.due || '9999-99-99').localeCompare(b.due || '9999-99-99') || a.title.localeCompare(b.title, 'zh-Hans-CN'));
			};

			const updateAutomation = (id, patch) => {
				request('updateAutomation', { id, ...patch })
					.then((state) => {
						setAutomations(state.items || []);
						setAutoError('');
					})
					.catch((error) => setAutoError(error instanceof Error ? error.message : String(error)));
			};

			const move = (raw, nextStatus) => {
				const [projectId, itemId] = String(raw).split('|');
				if (!projectId || !itemId) return;
				const owner = projects.find((project) => project.id === projectId);
				const item = owner ? owner.items.find((candidate) => candidate.id === itemId) : null;
				if (item && item.status === nextStatus) return;
				run('moveItem', { projectId, itemId, status: nextStatus });
			};

			return h('div', { className: 'kb-page' },
				h('style', null, CSS),
				h('header', { className: 'kb-head' },
					h('div', { className: 'kb-tabs' },
						h('button', {
							className: `kb-tab${tab === 'board' ? ' active' : ''}`,
							onClick: () => {
								setTab('board');
								// Re-read on the way back: the board must never render from a stale or replaced payload.
								run('state');
							}
						}, '看板'),
						autoSupported === false ? null : h('button', {
							className: `kb-tab${tab === 'automations' ? ' active' : ''}`,
							onClick: () => {
								setTab('automations');
								loadAutomations();
							}
						}, `自动化${automations ? ` ${automations.filter((item) => item.enabled).length}` : ''}`)
					),
					h('span', { className: 'kb-sub' }, tab === 'automations'
						? `${automations ? automations.filter((item) => item.enabled).length : 0} 个自动化在运行`
						: `${projects.length} 个项目 · ${shown.filter((item) => item.status === 'doing').length} 项进行中${needle === '' ? '' : ` · 命中 ${shown.length} 条`}`),
					h('span', { className: 'kb-spacer' }),
					tab === 'board' ? h('input', {
						className: 'kb-search',
						placeholder: '搜索标题 / 备注 / 负责人',
						value: query,
						onChange: (event) => setQuery(event.target.value)
					}) : null,
					tab === 'board' ? h('button', {
						className: 'kb-btn',
						title: sortMode === 'due' ? '当前：按截止日排序，点击改回手动顺序' : '当前：手动顺序，点击改为按截止日排序',
						onClick: () => setSort(sortMode === 'due' ? 'manual' : 'due')
					}, sortMode === 'due' ? '排序 · 截止日' : '排序 · 手动') : null,
					tab === 'board' ? h('button', {
						className: 'kb-btn',
						title: data.vaultDir ? `在访达中打开：${data.vaultDir}` : '打开数据文件夹',
						onClick: () => run('openFolder')
					}, '打开文件夹') : null,
					h('button', { className: 'kb-btn', onClick: () => run('state') }, '刷新'),
					tab === 'board' ? h('button', { className: 'kb-btn primary', onClick: () => setCreating(true) }, '＋ 新建项目') : null
				),
				error ? h('div', { className: 'kb-err' }, error) : null,
				tab === 'automations'
					? h(Automations, { items: automations, error: autoError, onUpdate: updateAutomation })
					: h('div', { className: 'kb-body' },
					h('aside', { className: 'kb-rail' },
						h('div', { className: 'kb-rail-label' }, '项目'),
						h('div', { className: `kb-proj${selected === 'all' ? ' active' : ''}` },
							h('button', { className: 'kb-proj-main', onClick: () => setSelected('all') },
								h('span', { className: 'kb-proj-name' }, '全部任务'),
								h('span', { className: 'kb-proj-meta' }, `${projects.reduce((sum, project) => sum + project.items.length, 0)} 条`)
							)
						),
						creating ? h(ProjectForm, {
							onCreate: (draft) => {
								setCreating(false);
								setSelected(draft.name);
								run('createProject', draft);
							},
							onCancel: () => setCreating(false)
						}) : null,
						projects.map((project) => {
							const doing = project.items.filter((item) => item.status === 'doing').length;
							return h('div', {
								key: project.id,
								className: `kb-proj${selected === project.id ? ' active' : ''}${dropTarget === project.id ? ' drop' : ''}`,
								onDragOver: (event) => {
									event.preventDefault();
									setDropTarget(project.id);
								},
								onDragLeave: () => setDropTarget((current) => (current === project.id ? '' : current)),
								onDrop: (event) => {
									event.preventDefault();
									setDropTarget('');
									const raw = event.dataTransfer.getData('text/plain');
									const [fromProject, itemId] = raw.split('|');
									if (!fromProject || !itemId || fromProject === project.id) return;
									run('assignItem', { fromProjectId: fromProject, itemId, toProjectId: project.id });
								}
							},
								h('button', { className: 'kb-proj-main', onClick: () => setSelected(project.id) },
									h('span', { className: 'kb-proj-head' },
										h('span', { className: `kb-status-dot ${STATUS_TONE[project.status] || 'ended'}`, title: `项目状态：${project.status || '未设置'}` }),
										h('span', { className: 'kb-proj-name' }, project.name)
									),
									h('span', { className: 'kb-proj-meta' },
										h('span', null, project.role || ''),
										h('span', null, `· ${doing} 进行中`)
									)
								),
								h('button', {
									className: 'kb-proj-del',
									title: '删除项目（文件移到 看板/归档/）',
									'aria-label': `删除项目 ${project.name}`,
									onClick: () => {
										const ok = window.confirm(`删除项目「${project.name}」？\n\n它的 ${project.items.length} 条记录会被写到文件末尾的「🗄 归档」区，可以手动捡回来。`);
										if (!ok) return;
										if (selected === project.id) setSelected('all');
										run('deleteProject', { id: project.id });
									}
								}, '×')
							);
						}),
						h('span', { className: 'kb-version' }, data.version ? `看板 v${data.version}` : '')
					),
					h('div', { className: 'kb-main' },
						tab === 'board' && current ? h(Settings, {
							project: current,
							onChange: (patch) => {
								if (patch.name && patch.name !== current.name) setSelected(patch.name);
								run('updateProject', { id: current.id, patch });
							},
							onDelete: (project) => {
								if (!window.confirm(`删除项目「${project.name}」？\n\n它的 ${project.items.length} 条记录会被写到文件末尾的「🗄 归档」区，可以手动捡回来。`)) return;
								setSelected('all');
								run('deleteProject', { id: project.id });
							}
						}) : null,
					h('main', { className: 'kb-board' },
						projects.length === 0 ? h('div', { className: 'kb-empty', style: { margin: '48px auto', textAlign: 'center' } }, '还没有项目。点右上角「＋ 新建项目」，条目都建在项目里。') : COLUMNS.map((column) => h(Column, {
							key: column.status,
							column,
							items: sortItems(shown.filter((item) => item.status === column.status)),
							projectNameOf,
							filterLabel: query.trim(),
							showProject: selected === 'all',
							canAdd: current !== undefined,
							isMasked,
							targets: projects.map((project) => ({ id: project.id, name: project.name })),
							onReveal: reveal,
							onHide: conceal,
							onAssign: (item, toProjectId) => run('assignItem', { fromProjectId: item.projectId, itemId: item.id, toProjectId }),
							onAdd: (nextStatus, draft) => {
								if (!current) return;
								run('addItem', { projectId: current.id, status: nextStatus, title: draft.title, owner: draft.owner, priority: draft.priority, due: draft.due, note: draft.note || '', color: draft.color || '', hidden: Boolean(draft.hidden) });
							},
							onMove: move,
							onEdit: (item, draft) => run('updateItem', { projectId: item.projectId, itemId: item.id, patch: draft }),
							onDelete: (item) => run('deleteItem', { projectId: item.projectId, itemId: item.id })
						}))
					)
					)
				)
			);
		}

		function Icon({ size }) {
			const edge = size || 18;
			return h('svg', {
				viewBox: '0 0 20 20',
				width: edge,
				height: edge,
				fill: 'none',
				stroke: 'currentColor',
				strokeWidth: 1.6,
				strokeLinecap: 'round',
				'aria-hidden': true
			},
				h('rect', { x: 2.5, y: 3.5, width: 4, height: 13, rx: 1.2 }),
				h('rect', { x: 8, y: 3.5, width: 4, height: 8, rx: 1.2 }),
				h('rect', { x: 13.5, y: 3.5, width: 4, height: 5, rx: 1.2 })
			);
		}

		/** Render failures show a message instead of blanking the whole slot. */
		class PanelBoundary extends React.Component {
			constructor(props) {
				super(props);
				this.state = { error: null };
			}

			static getDerivedStateFromError(error) {
				return { error };
			}

			render() {
				if (this.state.error) {
					const message = this.state.error && this.state.error.message ? this.state.error.message : String(this.state.error);
					return h('div', { className: 'kb-page' },
						h('style', null, CSS),
						h('div', { className: 'kb-err', style: { padding: 20, whiteSpace: 'pre-wrap' } }, `看板渲染出错：${message}`)
					);
				}
				return this.props.children;
			}
		}

		const PANEL_ID = 'kanban';

		function apply(ctx) {
			ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: PANEL_ID }, () => h(PanelBoundary, null, h(Panel, {
				pickDirectory: () => ctx.uiWorkspace.pickDirectory()
			}))));
			ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
				name: 'sidebar.panellist',
				id: PANEL_ID,
				order: 15,
				label: () => '任务看板'
			}, Icon));
		}

		return { inject: ['slots', 'uiWorkspace'], apply };
	}
});

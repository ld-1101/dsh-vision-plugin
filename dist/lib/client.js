window.__ModuleLoader__.load({
	id: "dsh-vision-client",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");

		//#region dsh-vision-client: 视觉模型配置面板
		const inject = ["slots", "settingsScope"];

		// 与 DSH 主题一致的样式（使用设计系统 CSS 变量）
		const css = {
			card: {
				background: "var(--dsw-alias-bg-layer-2)",
				border: "1px solid var(--dsw-alias-border-l2)",
				borderRadius: 12,
				padding: "16px 20px",
				maxWidth: 680,
			},
			title: {
				color: "var(--dsw-alias-label-primary)",
				fontSize: 15,
				fontWeight: 600,
				margin: "0 0 4px",
			},
			desc: {
				color: "var(--dsw-alias-label-tertiary)",
				fontSize: 12,
				margin: "0 0 14px",
				lineHeight: 1.6,
			},
			section: {
				border: "1px solid var(--dsw-alias-border-l2)",
				borderRadius: 10,
				padding: "10px 12px",
				marginBottom: 10,
			},
			sectionTitle: {
				color: "var(--dsw-alias-label-primary)",
				fontSize: 13,
				fontWeight: 600,
				margin: "0 0 6px",
			},
			row: {
				display: "flex",
				alignItems: "center",
				gap: 8,
				padding: "4px 0",
				fontSize: 13,
				lineHeight: 1.6,
				color: "var(--dsw-alias-label-secondary)",
			},
			rowLabel: {
				width: 104,
				flexShrink: 0,
				color: "var(--dsw-alias-label-tertiary)",
			},
			input: {
				border: "1px solid var(--dsw-alias-border-l2)",
				background: "var(--dsw-alias-bg-layer-3)",
				height: 32,
				font: "inherit",
				color: "var(--dsw-alias-label-primary)",
				borderRadius: 8,
				padding: "0 10px",
				fontSize: 13,
				flex: 1,
				minWidth: 0,
			},
			inputNum: {
				border: "1px solid var(--dsw-alias-border-l2)",
				background: "var(--dsw-alias-bg-layer-3)",
				height: 32,
				font: "inherit",
				color: "var(--dsw-alias-label-primary)",
				borderRadius: 8,
				padding: "0 10px",
				fontSize: 13,
				flex: 1,
				minWidth: 0,
				maxWidth: 150,
			},
			textarea: {
				border: "1px solid var(--dsw-alias-border-l2)",
				background: "var(--dsw-alias-bg-layer-3)",
				font: "inherit",
				color: "var(--dsw-alias-label-primary)",
				borderRadius: 8,
				padding: "8px 10px",
				fontSize: 13,
				flex: 1,
				minWidth: 0,
				resize: "vertical",
				lineHeight: 1.5,
			},
			radio: {
				marginRight: 6,
			},
			modelRow: {
				display: "flex",
				alignItems: "center",
				gap: 8,
				padding: "5px 8px",
				borderRadius: 8,
				fontSize: 13,
				color: "var(--dsw-alias-label-primary)",
				cursor: "pointer",
			},
			modelRowSelected: {
				background: "var(--dsw-alias-bg-layer-3)",
			},
			modelRowText: {
				flex: 1,
				overflow: "hidden",
				textOverflow: "ellipsis",
				whiteSpace: "nowrap",
			},
			modelList: {
				maxHeight: 260,
				overflowY: "auto",
			},
			badgeOk: {
				whiteSpace: "nowrap",
				display: "inline-flex",
				alignItems: "center",
				gap: 3,
				height: 20,
				boxSizing: "border-box",
				background: "var(--dsw-alias-bg-module-platform)",
				color: "var(--dsw-alias-color-success, #2ecc71)",
				borderRadius: 999,
				padding: "0 8px",
				fontSize: 11,
				lineHeight: 1,
			},
			hint: {
				color: "var(--dsw-alias-label-tertiary)",
				fontSize: 12,
				margin: "4px 0 0 112px",
				lineHeight: 1.6,
			},
			buttonRow: {
				display: "flex",
				alignItems: "center",
				gap: 12,
				marginTop: 14,
			},
			button: {
				background: "var(--dsw-alias-brand-primary)",
				color: "#fff",
				border: "none",
				borderRadius: 8,
				padding: "8px 18px",
				fontSize: 13,
				fontWeight: 500,
				cursor: "pointer",
			},
			buttonDisabled: { opacity: 0.55, cursor: "default" },
			buttonGhost: {
				background: "transparent",
				color: "var(--dsw-alias-label-secondary)",
				border: "1px solid var(--dsw-alias-border-l2)",
				borderRadius: 8,
				padding: "8px 14px",
				fontSize: 13,
				cursor: "pointer",
			},
			ok: {
				color: "var(--dsw-alias-color-success, #2ecc71)",
				fontSize: 13,
				marginTop: 12,
				lineHeight: 1.6,
				wordBreak: "break-all",
			},
			err: {
				color: "var(--dsw-alias-label-error)",
				fontSize: 13,
				marginTop: 12,
				lineHeight: 1.6,
				wordBreak: "break-all",
			},
			muted: {
				color: "var(--dsw-alias-label-tertiary)",
				fontSize: 12,
				marginTop: 10,
				lineHeight: 1.6,
			},
			examples: {
				marginTop: 8,
				padding: "8px 12px",
				background: "var(--dsw-alias-bg-layer-3)",
				borderRadius: 8,
				fontSize: 12,
				lineHeight: 1.8,
				color: "var(--dsw-alias-label-secondary)",
			},
		};

		function Row(props) {
			return react.createElement(
				"div",
				{ style: css.row },
				react.createElement("span", { style: css.rowLabel }, props.label),
				props.children,
			);
		}

		function VisionTestSection(props) {
			var useState = react.useState;
			var useEffect = react.useEffect;
			var useMemo = react.useMemo;

			// 表单草稿：field -> 字符串 或 "CLEAR"
			var [drafts, setDrafts] = useState({});
			var [summary, setSummary] = useState(null);
			var [models, setModels] = useState({ system: [], customExamples: [], suggestions: [] });
			var [modelsError, setModelsError] = useState(null);
			var [showAdv, setShowAdv] = useState(false);
			var [showExamples, setShowExamples] = useState(false);
			var [testing, setTesting] = useState(false);
			var [result, setResult] = useState(null);
			var [saving, setSaving] = useState(false);
			var [saveFailed, setSaveFailed] = useState(false);
			var [saveError, setSaveError] = useState(null);
			var [, setTick] = useState(0);

			// 订阅 settingsScope 快照变化（host 更新/外部编辑）→ 重渲染
			useEffect(function () {
				if (!props.scope) return;
				return props.scope.subscribe(function () {
					setTick(function (t) { return t + 1; });
				});
			}, [props.scope]);

			var snapshot = useMemo(function () {
				try {
					return props.scope ? props.scope.getSnapshot() : null;
				} catch (e) {
					return null;
				}
			}, [props.scope]);
			var effective = snapshot && snapshot.value ? snapshot.value : {};

			useEffect(function () {
				var cancelled = false;
				fetch("/dsh-vision/config").then(function (r) { return r.json(); }).then(function (d) {
					if (!cancelled) setSummary(d);
				}).catch(function () {});
				fetch("/dsh-vision/models").then(function (r) { return r.json(); }).then(function (d) {
					if (!cancelled) {
						setModels({ system: d.system || [], customExamples: d.customExamples || [], suggestions: d.suggestions || [] });
						if (d.error) setModelsError("系统模型列表加载失败：" + d.error);
					}
				}).catch(function (err) {
					if (!cancelled) setModelsError("系统模型列表请求失败：" + String(err));
				});
				return function () { cancelled = true; };
			}, []);

			function valueOf(field, fallback) {
				if (field in drafts) {
					var d = drafts[field];
					return d === "CLEAR" ? "" : d;
				}
				var v = effective[field];
				return v === undefined || v === null ? (fallback === undefined ? "" : fallback) : String(v);
			}
			function stage(field, text) {
				setDrafts(function (prev) {
					var next = Object.assign({}, prev);
					next[field] = text;
					return next;
				});
				setSaveFailed(false);
				setSaveError(null);
			}
			var dirtyCount = Object.keys(drafts).length;

			function pickSystem(p, m) {
				stage("provider", "system");
				stage("systemProvider", p);
				stage("systemModel", m);
			}

			async function save() {
				if (dirtyCount === 0 || saving || !props.scope) return;
				setSaving(true);
				setSaveFailed(false);
				var ok = true;
				for (var field in drafts) {
					var d = drafts[field];
					try {
						if (d === "CLEAR") {
							await props.scope.unset(field);
						} else {
							var v = d;
							if (field === "timeoutMs" || field === "maxTokens" || field === "temperature") v = Number(d);
							await props.scope.set(field, v);
						}
					} catch (e) {
						ok = false;
					}
				}
				if (ok) {
					// read-back 校验：settingsScope 写失败是静默的，必须回读确认真正生效
					var verified = await verifySaved();
					if (verified) {
						setDrafts({});
					} else {
						setSaveFailed(true);
						setSaveError("保存未生效：配置写入被拒绝（可能原因：宿主补丁未打 / 未重启 / namespace 未暴露）。请确认已执行 patch-host.ps1 并重启 DSH。");
					}
					fetch("/dsh-vision/config").then(function (r) { return r.json(); }).then(function (d) { setSummary(d); }).catch(function () {});
				} else {
					setSaveFailed(true);
				}
				setSaving(false);
			}

			// 回读 /dsh-vision/config，确认草稿中的关键字段已写入生效
			async function verifySaved() {
				try {
					var res = await fetch("/dsh-vision/config");
					var d = await res.json();
					var checks = [];
					for (var field in drafts) {
						var expected = drafts[field] === "CLEAR" ? "" : String(drafts[field]);
						var actual = d[field] === undefined || d[field] === null ? "" : String(d[field]);
						if (field === "systemProvider" && d.systemProvider) checks.push(true);
						else if (field === "systemModel" && d.systemModel) checks.push(true);
						else checks.push(actual === expected);
					}
					return checks.every(Boolean);
				} catch (e) {
					return false;
				}
			}

			function discard() {
				setDrafts({});
				setSaveFailed(false);
				setSaveError(null);
			}

			function runTest() {
				if (testing) return;
				setTesting(true);
				setResult(null);
				fetch("/dsh-vision/test", { method: "POST" })
					.then(function (r) { return r.json(); })
					.then(function (d) { setResult(d); })
					.catch(function (err) { setResult({ ok: false, message: "请求失败: " + String(err) }); })
					.finally(function () { setTesting(false); });
			}

			// 选中态基于草稿优先的当前值（点击立即可见，保存后持久）
			var currentProvider = valueOf("provider", effective.provider || "system");
			var selectedProvider = valueOf("systemProvider", "");
			var selectedModel = valueOf("systemModel", "");

			var children = [];
			children.push(
				react.createElement("h3", { key: "t", style: css.title }, "视觉模型（dsh-vision）"),
				react.createElement("p", { key: "d", style: css.desc },
					"配置保存后立即生效（无需重启）。系统模型复用 DSH 已启用模型；自定义模型填 OpenAI 兼容端点。"),
			);

			// ── ① 系统模型 ──
			var sysSection = [];
			sysSection.push(react.createElement("div", { key: "st", style: css.sectionTitle },
				react.createElement("label", { style: { display: "flex", alignItems: "center", gap: 6, cursor: "pointer" } },
					react.createElement("input", {
						type: "radio",
						style: css.radio,
						checked: currentProvider !== "custom",
						onChange: function () {
							var first = models.system[0];
							if (first) pickSystem(first.provider, first.model);
							else stage("provider", "system");
						},
					}),
					"系统模型（复用系统 Key，无需填写）")));
			if (modelsError) {
				sysSection.push(react.createElement("div", { key: "modelserr", style: css.err }, modelsError));
			} else if (models.system.length === 0) {
				sysSection.push(react.createElement("div", { key: "empty", style: css.muted },
					"系统未检测到支持视觉的模型（在 DSH 设置 → 模型中启用带视觉能力的供应商后此处自动出现），请使用自定义模型。"));
			} else {
				sysSection.push(react.createElement("div", { key: "count", style: css.muted },
					"共 " + models.system.length + " 个视觉模型："));
				var modelRows = [];
				for (var i = 0; i < models.system.length; i++) {
					(function (m) {
						var isSel = currentProvider !== "custom" && selectedProvider === m.provider && selectedModel === m.model;
						modelRows.push(react.createElement("label", {
							key: m.provider + "/" + m.model,
							style: Object.assign({}, css.modelRow, isSel ? css.modelRowSelected : null),
						},
							react.createElement("input", {
								type: "radio",
								style: css.radio,
								checked: isSel,
								onChange: function () { pickSystem(m.provider, m.model); },
							}),
							react.createElement("span", { style: css.modelRowText }, m.modelName + " · " + m.providerName),
							react.createElement("span", { style: css.badgeOk }, "●系统凭证")));
					})(models.system[i]);
				}
				sysSection.push(react.createElement("div", { key: "list", style: css.modelList }, modelRows));
				// 建议：pi-ai 支持但 DSH 模型白名单未启用的视觉模型
				if (models.suggestions && models.suggestions.length > 0) {
					var sugRows = [];
					for (var s = 0; s < models.suggestions.length; s++) {
						(function (sug) {
							sugRows.push(react.createElement("div", { key: s },
								"· " + sug.modelName + "（" + sug.providerName + "，" + sug.model + "）"));
						})(models.suggestions[s]);
					}
					sysSection.push(react.createElement("div", { key: "sug", style: css.muted },
						"以下视觉模型可在 DSH 设置 → 模型中添加后使用：",
						react.createElement("div", { style: { marginTop: 4 } }, sugRows)));
				}
			}
			children.push(react.createElement("div", { key: "sys", style: css.section }, sysSection));

			// ── ② 自定义模型 ──
			var customRows = [];
			customRows.push(react.createElement("div", { key: "mode", style: css.row },
				react.createElement("label", { style: { display: "flex", alignItems: "center", gap: 6, cursor: "pointer" } },
					react.createElement("input", {
						type: "radio",
						style: css.radio,
						checked: currentProvider === "custom",
						onChange: function () { stage("provider", "custom"); },
					}),
					"自定义模型（OpenAI 兼容接口）")));
			var customActive = currentProvider === "custom";
			var inputStyle = Object.assign({}, css.input, customActive ? null : { opacity: 0.55 });
			customRows.push(react.createElement(Row, { key: "url", label: "API Base URL" },
				react.createElement("input", {
					style: inputStyle,
					disabled: !customActive,
					placeholder: "https://…（不含 /chat/completions 后缀）",
					value: valueOf("apiBaseUrl", ""),
					onChange: function (e) { stage("apiBaseUrl", e.target.value); },
				})));
			customRows.push(react.createElement(Row, { key: "key", label: "API Key" },
				react.createElement("input", {
					style: inputStyle,
					disabled: !customActive,
					type: "password",
					placeholder: summary && summary.provider === "custom" ? (summary.keySource === "manual" ? "已配置（输入以覆盖）" : (summary.keySource !== "none" ? "已配置（" + summary.keySource + "），输入以覆盖" : "留空则用环境变量")) : "留空则用环境变量",
					value: valueOf("apiKey", ""),
					onChange: function (e) { stage("apiKey", e.target.value); },
				})));
			customRows.push(react.createElement(Row, { key: "env", label: "Key 环境变量" },
				react.createElement("input", {
					style: inputStyle,
					disabled: !customActive,
					placeholder: "如 OPENCODE_GO_API_KEY",
					value: valueOf("apiKeyEnv", ""),
					onChange: function (e) { stage("apiKeyEnv", e.target.value); },
				})));
			customRows.push(react.createElement(Row, { key: "model", label: "模型名称" },
				react.createElement("input", {
					style: inputStyle,
					disabled: !customActive,
					placeholder: "如 glm-4v-flash",
					value: valueOf("model", ""),
					onChange: function (e) { stage("model", e.target.value); },
				})));
			customRows.push(react.createElement("div", { key: "hint", style: css.hint },
				"只支持 OpenAI 兼容接口（POST {baseUrl}/chat/completions），填 Base URL，插件自动拼接。"));
			customRows.push(react.createElement("button", {
				key: "examples",
				type: "button",
				style: Object.assign({}, css.buttonGhost, { margin: "4px 0 0 112px", padding: "4px 10px", fontSize: 12 }),
				onClick: function () { setShowExamples(!showExamples); },
			}, showExamples ? "收起示例" : "查看常见服务商端点示例"));
			if (showExamples && models.customExamples.length > 0) {
				var exampleRows = [];
				for (var j = 0; j < models.customExamples.length; j++) {
					(function (ex) {
						exampleRows.push(react.createElement("div", { key: j },
							ex.label + "：" + ex.baseUrl + "（" + ex.models + "）"));
					})(models.customExamples[j]);
				}
				customRows.push(react.createElement("div", { key: "exlist", style: css.examples }, exampleRows));
			}
			children.push(react.createElement("div", { key: "cus", style: css.section }, customRows));

			// ── ③ 提示词 ──
			var promptRows = [];
			promptRows.push(react.createElement(Row, { key: "sys", label: "系统提示词" },
				react.createElement("textarea", {
					style: css.textarea,
					rows: 2,
					placeholder: "可选：发给视觉 API 的 system 消息，留空不发送",
					value: valueOf("systemPrompt", ""),
					onChange: function (e) { stage("systemPrompt", e.target.value); },
				})));
			promptRows.push(react.createElement(Row, { key: "def", label: "默认提示词" },
				react.createElement("textarea", {
					style: css.textarea,
					rows: 4,
					placeholder: "未传入 prompt 时使用的默认视觉理解提示词",
					value: valueOf("defaultPrompt", ""),
					onChange: function (e) { stage("defaultPrompt", e.target.value); },
				})));
			children.push(react.createElement("div", { key: "prompt", style: css.section }, promptRows));

			// ── ④ 高级参数（默认折叠）──
			var advSection = [];
			advSection.push(react.createElement("div", { key: "advhead", style: css.sectionTitle },
				react.createElement("button", {
					type: "button",
					onClick: function () { setShowAdv(!showAdv); },
					style: {
						background: "transparent",
						border: "none",
						color: "var(--dsw-alias-label-primary)",
						fontSize: 13,
						fontWeight: 600,
						cursor: "pointer",
						padding: 0,
						fontFamily: "inherit",
					},
				}, (showAdv ? "▾" : "▸") + " 高级参数")));
			if (showAdv) {
				var advRows = [];
				advRows.push(react.createElement(Row, { key: "timeout", label: "超时(ms)" },
					react.createElement("input", {
						style: css.inputNum,
						type: "number",
						min: 1000,
						value: valueOf("timeoutMs", "90000"),
						onChange: function (e) { stage("timeoutMs", e.target.value); },
					})));
				advRows.push(react.createElement(Row, { key: "tokens", label: "最大 token" },
					react.createElement("input", {
						style: css.inputNum,
						type: "number",
						min: 64,
						value: valueOf("maxTokens", "2048"),
						onChange: function (e) { stage("maxTokens", e.target.value); },
					})));
				advRows.push(react.createElement(Row, { key: "temp", label: "温度" },
					react.createElement("input", {
						style: css.inputNum,
						type: "number",
						min: 0,
						max: 2,
						step: 0.1,
						value: valueOf("temperature", "0.2"),
						onChange: function (e) { stage("temperature", e.target.value); },
					})));
				advRows.push(react.createElement(Row, { key: "mode", label: "URL 图片" },
					react.createElement("select", {
						style: css.input,
						value: valueOf("remoteImageMode", "direct"),
						onChange: function (e) { stage("remoteImageMode", e.target.value); },
					},
						react.createElement("option", { value: "direct" }, "direct（直传 URL）"),
						react.createElement("option", { value: "download" }, "download（下载转 base64）"))));
				advSection.push(react.createElement("div", { key: "advrows" }, advRows));
			}
			children.push(react.createElement("div", { key: "adv", style: css.section }, advSection));

			// ── 保存 / 测试 ──
			children.push(react.createElement("div", { key: "btns", style: css.buttonRow },
				react.createElement("button", {
					type: "button",
					disabled: dirtyCount === 0 || saving,
					onClick: save,
					style: Object.assign({}, css.button, (dirtyCount === 0 || saving) ? css.buttonDisabled : null),
				}, saving ? "保存中…" : "💾 保存更改"),
				dirtyCount > 0 ? react.createElement("button", {
					type: "button",
					disabled: saving,
					onClick: discard,
					style: Object.assign({}, css.buttonGhost, saving ? css.buttonDisabled : null),
				}, "撤销改动") : null,
				dirtyCount > 0 ? react.createElement("span", { key: "dirty", style: css.muted }, dirtyCount + " 处未保存改动") : null,
				saveFailed ? react.createElement("span", { key: "fail", style: css.err }, saveError || "部分字段保存失败，请检查输入") : null,
			));
			children.push(react.createElement("div", { key: "testrow", style: css.buttonRow },
				react.createElement("button", {
					type: "button",
					disabled: testing,
					onClick: runTest,
					style: Object.assign({}, css.buttonGhost, testing ? css.buttonDisabled : null),
				}, testing ? "测试中…" : "🔌 测试连接（用已保存配置）"),
				testing ? react.createElement("span", { key: "sp", style: css.muted }, "正在向视觉模型发送请求…") : null,
			));

			if (result) {
				if (result.ok) {
					children.push(react.createElement("div", { key: "ok", style: css.ok },
						"✅ 连接成功（" + result.latencyMs + "ms）：" + result.message));
				} else {
					children.push(react.createElement("div", { key: "failr", style: css.err },
						"❌ 连接失败" + (result.latencyMs ? "（" + result.latencyMs + "ms）" : "") + "：" + result.message));
				}
			}

			return react.createElement("div", { style: css.card }, children);
		}
		//#endregion

		function apply(ctx) {
			// 只 bind 一次，组件共享同一 scope 控制器
			var scope = ctx.get("settingsScope").bind({ namespace: "dsh-vision" });
			ctx.slots.inject("settings.section", function () {
				return ctx.slots.register({
					name: "settings.section",
					id: "dsh-vision",
					order: 25,
					label: function () { return "视觉模型"; },
					inject: function () {
						return { scope: scope };
					},
				}, VisionTestSection);
			});
		}

		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

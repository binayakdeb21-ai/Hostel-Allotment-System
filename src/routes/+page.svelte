<script>
	import { slide } from 'svelte/transition';
	import * as XLSX from 'xlsx';
	import { allocateRooms, detectParticipantColumns } from '$lib/allocate.js';
	import { translations } from '$lib/translations.js';
	import BarChart from '$lib/BarChart.svelte';

	const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

	let lang = 'en';
	$: t = translations[lang];

	// --- File slots (independent of each other) ---
	let hostelFile = null;
	let participantFile = null;
	let hostelFileName = '';
	let participantFileName = '';
	let hostelDragOver = false;
	let participantDragOver = false;
	let hostelInputEl;
	let participantInputEl;

	// Raw parsed rows kept around so the "add missed participant" flow
	// can re-run the full allocation without asking the user to re-upload.
	let hostelRowsRaw = [];
	let participantRowsRaw = [];
	let extraParticipants = []; // manually-added raw rows, accumulated across sessions

	let isProcessing = false;
	let errorMessage = '';
	let summary = null;
	let resultBlobUrl = '';
	let updatedParticipantsBlobUrl = '';

	// --- Add-missed-participant panel state ---
	let showAddPanel = false;
	let extraCount = 1;
	let extraDraft = [{ name: '', gender: 'Male' }];
	let addPanelError = '';

	function isExcelFile(file) {
		return file && /\.(xlsx|xls)$/i.test(file.name);
	}

	function readSheetAsJson(file) {
		return new Promise((resolve, reject) => {
			const reader = new FileReader();
			reader.onload = (e) => {
				try {
					const data = new Uint8Array(e.target.result);
					const workbook = XLSX.read(data, { type: 'array' });
					const firstSheetName = workbook.SheetNames[0];
					const sheet = workbook.Sheets[firstSheetName];
					resolve(XLSX.utils.sheet_to_json(sheet, { defval: '' }));
				} catch (err) {
					reject(err);
				}
			};
			reader.onerror = () => reject(reader.error);
			reader.readAsArrayBuffer(file);
		});
	}

	function resetDownstreamState() {
		summary = null;
		errorMessage = '';
		extraParticipants = [];
		showAddPanel = false;
		addPanelError = '';
		extraCount = 1;
		extraDraft = [{ name: '', gender: 'Male' }];
		if (resultBlobUrl) {
			URL.revokeObjectURL(resultBlobUrl);
			resultBlobUrl = '';
		}
		if (updatedParticipantsBlobUrl) {
			URL.revokeObjectURL(updatedParticipantsBlobUrl);
			updatedParticipantsBlobUrl = '';
		}
	}

	// --- Hostel file slot ---
	function handleHostelFile(file) {
		if (!isExcelFile(file)) return;
		hostelFile = file;
		hostelFileName = file.name;
		hostelRowsRaw = [];
		resetDownstreamState();
	}
	function onHostelInputChange(e) {
		const file = e.target.files?.[0];
		if (file) handleHostelFile(file);
	}
	function dragOverHostel(e) {
		e.preventDefault();
		hostelDragOver = true;
	}
	function dragLeaveHostel() {
		hostelDragOver = false;
	}
	function dropHostel(e) {
		e.preventDefault();
		hostelDragOver = false;
		const file = e.dataTransfer?.files?.[0];
		if (file) handleHostelFile(file);
	}
	function clearHostelFile() {
		hostelFile = null;
		hostelFileName = '';
		hostelRowsRaw = [];
		if (hostelInputEl) hostelInputEl.value = '';
		resetDownstreamState();
	}

	// --- Participant file slot (fully independent of the hostel slot) ---
	function handleParticipantFile(file) {
		if (!isExcelFile(file)) return;
		participantFile = file;
		participantFileName = file.name;
		participantRowsRaw = [];
		resetDownstreamState();
	}
	function onParticipantInputChange(e) {
		const file = e.target.files?.[0];
		if (file) handleParticipantFile(file);
	}
	function dragOverParticipant(e) {
		e.preventDefault();
		participantDragOver = true;
	}
	function dragLeaveParticipant() {
		participantDragOver = false;
	}
	function dropParticipant(e) {
		e.preventDefault();
		participantDragOver = false;
		const file = e.dataTransfer?.files?.[0];
		if (file) handleParticipantFile(file);
	}
	function clearParticipantFile() {
		participantFile = null;
		participantFileName = '';
		participantRowsRaw = [];
		if (participantInputEl) participantInputEl.value = '';
		resetDownstreamState();
	}

	function openFileDialog(inputEl) {
		inputEl?.click();
	}
	function handleDropzoneKeydown(e, inputEl) {
		if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			openFileDialog(inputEl);
		}
	}

	// --- Allocation core, shared by "Run Allocation" and "Add & Re-allocate" ---
	function computeAllocation(hostelRowsIn, participantRowsIn) {
		const { results, summary: allocationSummary } = allocateRooms(hostelRowsIn, participantRowsIn);
		summary = allocationSummary;

		const exportRows = results.map(({ rowIndex, ...rest }) => rest);
		const worksheet = XLSX.utils.json_to_sheet(exportRows);
		const workbook = XLSX.utils.book_new();
		XLSX.utils.book_append_sheet(workbook, worksheet, 'Allotment Result');
		const arrayBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
		const blob = new Blob([arrayBuffer], { type: XLSX_MIME });

		if (resultBlobUrl) URL.revokeObjectURL(resultBlobUrl);
		resultBlobUrl = URL.createObjectURL(blob);
	}

	function buildParticipantsBlob(rows) {
		const worksheet = XLSX.utils.json_to_sheet(rows);
		const workbook = XLSX.utils.book_new();
		XLSX.utils.book_append_sheet(workbook, worksheet, 'Participants');
		const arrayBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
		const blob = new Blob([arrayBuffer], { type: XLSX_MIME });

		if (updatedParticipantsBlobUrl) URL.revokeObjectURL(updatedParticipantsBlobUrl);
		updatedParticipantsBlobUrl = URL.createObjectURL(blob);
	}

	async function runAllocation() {
		errorMessage = '';
		extraParticipants = [];
		showAddPanel = false;
		if (updatedParticipantsBlobUrl) {
			URL.revokeObjectURL(updatedParticipantsBlobUrl);
			updatedParticipantsBlobUrl = '';
		}

		if (!hostelFile || !participantFile) {
			errorMessage = t.errorMissingFiles;
			summary = null;
			return;
		}

		isProcessing = true;
		try {
			const [hostelRows, participantRows] = await Promise.all([
				readSheetAsJson(hostelFile),
				readSheetAsJson(participantFile)
			]);
			hostelRowsRaw = hostelRows;
			participantRowsRaw = participantRows;
			computeAllocation(hostelRowsRaw, participantRowsRaw);
		} catch (err) {
			console.error(err);
			errorMessage = t.errorProcessing;
			summary = null;
		} finally {
			isProcessing = false;
		}
	}

	// --- Add-missed-participant panel ---
	function setExtraCount(rawValue) {
		let n = Math.floor(Number(rawValue));
		if (!Number.isFinite(n) || n < 1) n = 1;
		if (n > 100) n = 100; // keep the form fluent — no runaway row counts
		extraCount = n;

		const current = extraDraft.length;
		if (n > current) {
			extraDraft = [
				...extraDraft,
				...Array.from({ length: n - current }, () => ({ name: '', gender: 'Male' }))
			];
		} else if (n < current) {
			extraDraft = extraDraft.slice(0, n);
		}
	}

	function addExtraParticipants() {
		addPanelError = '';
		const cleaned = extraDraft.map((r) => ({ name: r.name.trim(), gender: r.gender }));

		if (cleaned.some((r) => !r.name)) {
			addPanelError = t.addPanelValidation;
			return;
		}

		const { nameKey, genderKey } = detectParticipantColumns(participantRowsRaw);
		const newRawRows = cleaned.map((r) => ({ [nameKey]: r.name, [genderKey]: r.gender }));

		extraParticipants = [...extraParticipants, ...newRawRows];
		const combined = [...participantRowsRaw, ...extraParticipants];

		computeAllocation(hostelRowsRaw, combined);
		buildParticipantsBlob(combined);

		extraCount = 1;
		extraDraft = [{ name: '', gender: 'Male' }];
	}

	function toggleAddPanel() {
		showAddPanel = !showAddPanel;
		addPanelError = '';
	}
</script>

<svelte:head>
	<title>Hostel Allotment System</title>
	<link rel="preconnect" href="https://fonts.googleapis.com" />
	<link
		href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@500;700&display=swap"
		rel="stylesheet"
	/>
</svelte:head>

<div class="lang-toggle">
	<button class:active={lang === 'en'} on:click={() => (lang = 'en')}>EN</button>
	<button class:active={lang === 'hi'} on:click={() => (lang = 'hi')}>हिं</button>
</div>

<main>
	<section class="hero">
		<div class="hero-copy">
			<p class="quote">{t.quote}</p>
			<h1>{t.title}</h1>
			<p class="subtitle">{t.subtitle}</p>
		</div>
		<div class="hero-art" aria-hidden="true">
			<svg viewBox="0 0 420 420" xmlns="http://www.w3.org/2000/svg">
				<defs>
					<linearGradient id="nodeGrad" x1="0%" y1="0%" x2="100%" y2="100%">
						<stop offset="0%" stop-color="#f2994a" />
						<stop offset="100%" stop-color="#eb5757" />
					</linearGradient>
				</defs>
				<g stroke="url(#nodeGrad)" stroke-width="1.2" opacity="0.55" fill="none">
					<line x1="80" y1="90" x2="200" y2="60" />
					<line x1="200" y1="60" x2="320" y2="110" />
					<line x1="80" y1="90" x2="150" y2="200" />
					<line x1="200" y1="60" x2="150" y2="200" />
					<line x1="320" y1="110" x2="280" y2="230" />
					<line x1="150" y1="200" x2="280" y2="230" />
					<line x1="150" y1="200" x2="120" y2="320" />
					<line x1="280" y1="230" x2="230" y2="340" />
					<line x1="120" y1="320" x2="230" y2="340" />
					<line x1="280" y1="230" x2="340" y2="300" />
				</g>
				<g fill="url(#nodeGrad)">
					<circle class="node" cx="80" cy="90" r="7" />
					<circle class="node" cx="200" cy="60" r="9" style="animation-delay:.3s" />
					<circle class="node" cx="320" cy="110" r="6" style="animation-delay:.6s" />
					<circle class="node" cx="150" cy="200" r="10" style="animation-delay:.15s" />
					<circle class="node" cx="280" cy="230" r="8" style="animation-delay:.45s" />
					<circle class="node" cx="120" cy="320" r="6" style="animation-delay:.75s" />
					<circle class="node" cx="230" cy="340" r="9" style="animation-delay:.9s" />
					<circle class="node" cx="340" cy="300" r="6" style="animation-delay:1.1s" />
				</g>
			</svg>
		</div>
	</section>

	<section class="uploads">
		<div class="upload-card">
			<h2>{t.step1Title}</h2>
			<p class="hint">{t.step1Hint}</p>
			<div
				class="file-drop"
				class:filled={!!hostelFileName}
				class:drag={hostelDragOver}
				role="button"
				tabindex="0"
				aria-label={hostelFileName || t.dropHint}
				on:click={() => openFileDialog(hostelInputEl)}
				on:keydown={(e) => handleDropzoneKeydown(e, hostelInputEl)}
				on:dragover={dragOverHostel}
				on:dragleave={dragLeaveHostel}
				on:drop={dropHostel}
			>
				{#if hostelFileName}
					<span class="file-chip">
						<span class="file-name">{hostelFileName}</span>
						<button
							type="button"
							class="remove-btn"
							on:click|stopPropagation={clearHostelFile}
							aria-label={t.removeFile}
						>×</button>
					</span>
				{:else}
					<span>{t.dropHint}</span>
				{/if}
			</div>
			<input
				bind:this={hostelInputEl}
				type="file"
				accept=".xlsx,.xls"
				on:change={onHostelInputChange}
				style="display:none"
			/>
		</div>

		<div class="upload-card">
			<h2>{t.step2Title}</h2>
			<p class="hint">{t.step2Hint}</p>
			<div
				class="file-drop"
				class:filled={!!participantFileName}
				class:drag={participantDragOver}
				role="button"
				tabindex="0"
				aria-label={participantFileName || t.dropHint}
				on:click={() => openFileDialog(participantInputEl)}
				on:keydown={(e) => handleDropzoneKeydown(e, participantInputEl)}
				on:dragover={dragOverParticipant}
				on:dragleave={dragLeaveParticipant}
				on:drop={dropParticipant}
			>
				{#if participantFileName}
					<span class="file-chip">
						<span class="file-name">{participantFileName}</span>
						<button
							type="button"
							class="remove-btn"
							on:click|stopPropagation={clearParticipantFile}
							aria-label={t.removeFile}
						>×</button>
					</span>
				{:else}
					<span>{t.dropHint}</span>
				{/if}
			</div>
			<input
				bind:this={participantInputEl}
				type="file"
				accept=".xlsx,.xls"
				on:change={onParticipantInputChange}
				style="display:none"
			/>
		</div>
	</section>

	<div class="actions">
		<button class="run-btn" on:click={runAllocation} disabled={isProcessing}>
			{isProcessing ? t.runningButton : t.runButton}
		</button>
	</div>

	{#if errorMessage}
		<p class="error">{errorMessage}</p>
	{/if}

	{#if summary}
		<section class="summary">
			<h2>{t.resultTitle}</h2>

			{#if summary.anyDefaultedCapacity}
				<p class="notice">{t.defaultCapacityNote}</p>
			{/if}

			<div class="stats">
				<div class="stat">
					<span class="stat-value">{summary.totalParticipants}</span>
					<span class="stat-label">{t.statParticipants}</span>
				</div>
				<div class="stat">
					<span class="stat-value good">{summary.allotted}</span>
					<span class="stat-label">{t.statAllotted}</span>
				</div>
				<div class="stat">
					<span class="stat-value" class:bad={summary.unallotted > 0}>{summary.unallotted}</span>
					<span class="stat-label">{t.statUnallotted}</span>
				</div>
			</div>

			{#if summary.hostelOccupancy.length}
				<div class="chart-card">
					<h3>{t.chartTitle}</h3>
					<BarChart data={summary.hostelOccupancy} boysLabel={t.legendBoys} girlsLabel={t.legendGirls} />
				</div>
			{/if}

			<div class="detail-grid">
				<div class="detail-card">
					<h3>{t.seatsLeftTitle}</h3>
					{#if summary.hostelsLeft.length === 0}
						<p class="muted">{t.noSeatsLeft}</p>
					{:else}
						<ul>
							{#each summary.hostelsLeft as h}
								<li><span class="dot" class:boys={h.type === 'boys'} class:girls={h.type === 'girls'}></span>{h.hostelName} — {h.remaining}</li>
							{/each}
						</ul>
					{/if}
				</div>

				{#if summary.unallotted > 0}
					<div class="detail-card">
						<h3>{t.unallottedTitle}</h3>

						{#if summary.unallottedBoys.length}
							<p class="sub-count"><span class="dot boys"></span>{t.boysNotAllotted}: {summary.unallottedBoys.length}</p>
							<ul>
								{#each summary.unallottedBoys as name}<li>{name}</li>{/each}
							</ul>
						{/if}

						{#if summary.unallottedGirls.length}
							<p class="sub-count"><span class="dot girls"></span>{t.girlsNotAllotted}: {summary.unallottedGirls.length}</p>
							<ul>
								{#each summary.unallottedGirls as name}<li>{name}</li>{/each}
							</ul>
						{/if}

						{#if summary.unallottedOther.length}
							<p class="sub-count">{t.genderUnrecognized}: {summary.unallottedOther.length}</p>
							<ul>
								{#each summary.unallottedOther as name}<li>{name}</li>{/each}
							</ul>
						{/if}
					</div>
				{/if}
			</div>

			{#if resultBlobUrl}
				<a class="download" href={resultBlobUrl} download="hostel-allotment-result.xlsx">
					{t.downloadButton}
				</a>
			{/if}

			<div class="add-panel-toggle">
				<button class="ghost-btn" on:click={toggleAddPanel}>
					{showAddPanel ? t.closeAddPanel : t.openAddPanel}
				</button>
			</div>

			{#if showAddPanel}
				<div class="add-panel" transition:slide={{ duration: 250 }}>
					<h3>{t.addPanelTitle}</h3>
					<p class="hint">{t.addPanelSubtitle}</p>

					<label class="count-row" for="extra-count">
						{t.howManyToAdd}
						<input
							id="extra-count"
							type="number"
							min="1"
							max="100"
							value={extraCount}
							on:input={(e) => setExtraCount(e.target.value)}
						/>
					</label>

					<div class="draft-rows">
						{#each extraDraft as row, i (i)}
							<div class="draft-row">
								<input type="text" placeholder={t.participantNamePlaceholder} bind:value={row.name} />
								<select bind:value={row.gender}>
									<option value="Male">{t.male}</option>
									<option value="Female">{t.female}</option>
								</select>
							</div>
						{/each}
					</div>

					{#if addPanelError}
						<p class="error small">{addPanelError}</p>
					{/if}

					<button class="run-btn small" on:click={addExtraParticipants}>{t.addAndReallocate}</button>

					{#if extraParticipants.length > 0}
						<p class="muted small">{t.totalAdded}: {extraParticipants.length}</p>
						{#if updatedParticipantsBlobUrl}
							<a class="download secondary" href={updatedParticipantsBlobUrl} download="participants-updated.xlsx">
								{t.downloadParticipants}
							</a>
						{/if}
					{/if}
				</div>
			{/if}
		</section>
	{/if}
</main>

<style>
	:global(body) {
		margin: 0;
		background: #0b0d12;
		color: #f5f3ef;
		font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
	}

	:global(h1, h2, h3) {
		font-family: 'Space Grotesk', 'Inter', sans-serif;
	}

	main {
		max-width: 980px;
		margin: 0 auto;
		padding: 3rem 1.5rem 5rem;
	}

	.lang-toggle {
		position: fixed;
		top: 1.25rem;
		right: 1.5rem;
		display: flex;
		gap: 0.35rem;
		background: #14171f;
		border: 1px solid #232733;
		border-radius: 999px;
		padding: 0.25rem;
		z-index: 10;
	}

	.lang-toggle button {
		border: none;
		background: transparent;
		color: #8b8878;
		font-size: 0.75rem;
		font-weight: 600;
		padding: 0.35rem 0.75rem;
		border-radius: 999px;
		cursor: pointer;
	}

	.lang-toggle button.active {
		background: linear-gradient(135deg, #f2994a, #eb5757);
		color: #0b0d12;
	}

	.hero {
		display: grid;
		grid-template-columns: 1.15fr 0.85fr;
		gap: 2rem;
		align-items: center;
		min-height: 42vh;
		padding-top: 1rem;
	}

	@media (max-width: 760px) {
		.hero {
			grid-template-columns: 1fr;
			min-height: auto;
		}
		.hero-art {
			order: -1;
			max-width: 260px;
			margin: 0 auto;
		}
	}

	.quote {
		font-family: 'JetBrains Mono', monospace;
		font-size: 0.85rem;
		color: #f2994a;
		margin: 0 0 1rem;
		letter-spacing: 0.01em;
	}

	h1 {
		font-size: 2.75rem;
		line-height: 1.1;
		margin: 0 0 1rem;
		font-weight: 700;
		letter-spacing: -0.02em;
		background: linear-gradient(135deg, #ffffff 40%, #f2994a 100%);
		-webkit-background-clip: text;
		background-clip: text;
		color: transparent;
	}

	.subtitle {
		color: #a3a09a;
		font-size: 1.02rem;
		line-height: 1.6;
		max-width: 54ch;
		margin: 0;
	}

	.hero-art svg {
		width: 100%;
		height: auto;
	}

	.node {
		animation: pulse 2.4s ease-in-out infinite;
		transform-origin: center;
	}

	@keyframes pulse {
		0%, 100% { opacity: 0.75; transform: scale(1); }
		50% { opacity: 1; transform: scale(1.18); }
	}

	@media (prefers-reduced-motion: reduce) {
		.node { animation: none; }
	}

	.uploads {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 1rem;
		margin: 3rem 0 1.5rem;
	}

	@media (max-width: 620px) {
		.uploads { grid-template-columns: 1fr; }
	}

	.upload-card {
		background: #14171f;
		border: 1px solid #232733;
		border-radius: 12px;
		padding: 1.35rem;
	}

	.upload-card h2 {
		font-size: 0.95rem;
		margin: 0 0 0.35rem;
		font-weight: 600;
	}

	.hint {
		font-size: 0.8rem;
		color: #7d7a74;
		margin: 0 0 0.9rem;
		line-height: 1.4;
	}

	.file-drop {
		display: flex;
		align-items: center;
		justify-content: center;
		text-align: center;
		border: 1px dashed #3a3f4a;
		border-radius: 8px;
		padding: 1.5rem 1rem;
		font-size: 0.85rem;
		color: #c9c6c0;
		cursor: pointer;
		transition: border-color 0.15s ease, background 0.15s ease;
	}

	.file-drop:hover, .file-drop.drag {
		border-color: #f2994a;
	}

	.file-drop.filled {
		border-color: #6fcf97;
		background: rgba(111, 207, 151, 0.06);
		color: #d9f4e4;
	}

	.file-chip {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		max-width: 100%;
	}

	.file-name {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.remove-btn {
		flex-shrink: 0;
		border: none;
		background: rgba(235, 87, 87, 0.15);
		color: #f6a3a3;
		width: 20px;
		height: 20px;
		border-radius: 50%;
		font-size: 0.9rem;
		line-height: 1;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.remove-btn:hover {
		background: rgba(235, 87, 87, 0.3);
	}

	.actions {
		margin-bottom: 1.5rem;
	}

	.run-btn {
		background: linear-gradient(135deg, #f2994a, #eb5757);
		color: #0b0d12;
		border: none;
		border-radius: 8px;
		padding: 0.8rem 1.75rem;
		font-size: 0.95rem;
		font-weight: 700;
		cursor: pointer;
		transition: opacity 0.15s ease, transform 0.1s ease;
	}

	.run-btn.small {
		padding: 0.6rem 1.25rem;
		font-size: 0.85rem;
	}

	.run-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.run-btn:not(:disabled):hover {
		opacity: 0.92;
		transform: translateY(-1px);
	}

	.ghost-btn {
		background: transparent;
		border: 1px solid #3a3f4a;
		color: #c9c6c0;
		border-radius: 8px;
		padding: 0.6rem 1.1rem;
		font-size: 0.85rem;
		font-weight: 600;
		cursor: pointer;
	}

	.ghost-btn:hover {
		border-color: #f2994a;
		color: #f2994a;
	}

	.error {
		background: rgba(235, 87, 87, 0.1);
		border: 1px solid rgba(235, 87, 87, 0.35);
		color: #f6a3a3;
		padding: 0.85rem 1rem;
		border-radius: 8px;
		font-size: 0.9rem;
	}

	.error.small {
		font-size: 0.8rem;
		padding: 0.6rem 0.8rem;
		margin: 0.75rem 0;
	}

	.summary {
		margin-top: 2rem;
		background: #14171f;
		border: 1px solid #232733;
		border-radius: 12px;
		padding: 1.75rem;
	}

	.summary h2 {
		margin: 0 0 1rem;
		font-size: 1.2rem;
	}

	.notice {
		font-size: 0.85rem;
		color: #f2c49a;
		background: rgba(242, 153, 74, 0.08);
		border: 1px solid rgba(242, 153, 74, 0.25);
		padding: 0.6rem 0.9rem;
		border-radius: 8px;
		margin: 0 0 1.25rem;
	}

	.stats {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 1rem;
		margin-bottom: 1.75rem;
	}

	.stat {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.stat-value {
		font-family: 'JetBrains Mono', monospace;
		font-size: 1.9rem;
		font-weight: 700;
	}

	.stat-value.good { color: #6fcf97; }
	.stat-value.bad { color: #eb5757; }

	.stat-label {
		font-size: 0.75rem;
		color: #7d7a74;
	}

	.chart-card {
		background: #0f1218;
		border: 1px solid #232733;
		border-radius: 10px;
		padding: 1.15rem 1.15rem 0.75rem;
		margin-bottom: 1.5rem;
	}

	.chart-card h3 {
		font-size: 0.85rem;
		margin: 0 0 0.75rem;
		color: #c9c6c0;
		font-weight: 600;
	}

	.detail-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 1rem;
		margin-bottom: 1.5rem;
	}

	@media (max-width: 620px) {
		.detail-grid { grid-template-columns: 1fr; }
	}

	.detail-card {
		background: #0f1218;
		border: 1px solid #232733;
		border-radius: 10px;
		padding: 1rem 1.15rem;
	}

	.detail-card h3 {
		font-size: 0.85rem;
		margin: 0 0 0.65rem;
		color: #c9c6c0;
		font-weight: 600;
	}

	.detail-card ul {
		list-style: none;
		margin: 0 0 0.85rem;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
		font-size: 0.85rem;
		color: #d9d6d0;
		max-height: 180px;
		overflow-y: auto;
	}

	.detail-card ul:last-child {
		margin-bottom: 0;
	}

	.sub-count {
		font-size: 0.8rem;
		font-weight: 600;
		color: #e8e6e1;
		margin: 0.5rem 0 0.4rem;
		display: flex;
		align-items: center;
	}

	.sub-count:first-of-type {
		margin-top: 0;
	}

	.muted {
		font-size: 0.85rem;
		color: #7d7a74;
		margin: 0;
	}

	.muted.small {
		font-size: 0.78rem;
		margin: 0.75rem 0 0.5rem;
	}

	.dot {
		display: inline-block;
		width: 7px;
		height: 7px;
		border-radius: 50%;
		margin-right: 0.5rem;
		flex-shrink: 0;
	}

	.dot.boys { background: #56ccf2; }
	.dot.girls { background: #eb5757; }

	.download {
		display: inline-block;
		background: #6fcf97;
		color: #0b0d12;
		text-decoration: none;
		font-weight: 700;
		padding: 0.75rem 1.5rem;
		border-radius: 8px;
		font-size: 0.9rem;
	}

	.download.secondary {
		background: transparent;
		border: 1px solid #6fcf97;
		color: #6fcf97;
		padding: 0.6rem 1.2rem;
		font-size: 0.82rem;
	}

	.add-panel-toggle {
		margin-top: 1.5rem;
	}

	.add-panel {
		margin-top: 1rem;
		background: #0f1218;
		border: 1px solid #232733;
		border-radius: 10px;
		padding: 1.25rem 1.35rem;
	}

	.add-panel h3 {
		font-size: 1rem;
		margin: 0 0 0.4rem;
	}

	.count-row {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		font-size: 0.85rem;
		color: #c9c6c0;
		margin: 1rem 0;
	}

	.count-row input[type='number'] {
		width: 70px;
		background: #14171f;
		border: 1px solid #3a3f4a;
		border-radius: 6px;
		color: #f5f3ef;
		padding: 0.4rem 0.5rem;
		font-size: 0.85rem;
	}

	.draft-rows {
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
		margin-bottom: 0.5rem;
		max-height: 320px;
		overflow-y: auto;
	}

	.draft-row {
		display: grid;
		grid-template-columns: 1fr 130px;
		gap: 0.6rem;
	}

	.draft-row input[type='text'],
	.draft-row select {
		background: #14171f;
		border: 1px solid #3a3f4a;
		border-radius: 6px;
		color: #f5f3ef;
		padding: 0.5rem 0.6rem;
		font-size: 0.85rem;
	}

	.draft-row input[type='text']:focus,
	.draft-row select:focus,
	.count-row input:focus {
		outline: none;
		border-color: #f2994a;
	}
</style>

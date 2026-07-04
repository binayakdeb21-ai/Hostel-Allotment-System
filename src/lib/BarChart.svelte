<script>
	export let data = []; // [{hostelName, boys, girls}]
	export let boysLabel = 'Boys';
	export let girlsLabel = 'Girls';

	const width = 640;
	const height = 260;
	const paddingLeft = 34;
	const paddingBottom = 46;
	const paddingTop = 16;
	const paddingRight = 16;

	$: chartWidth = width - paddingLeft - paddingRight;
	$: chartHeight = height - paddingTop - paddingBottom;
	$: maxValue = Math.max(1, ...data.map((d) => Math.max(d.boys, d.girls)), 1);
	$: groupWidth = data.length ? chartWidth / data.length : 0;
	$: barWidth = Math.max(10, Math.min(30, groupWidth / 3));

	function truncate(label) {
		return label.length > 12 ? label.slice(0, 11) + '…' : label;
	}
</script>

{#if data.length}
	<svg viewBox="0 0 {width} {height}" class="bar-chart" role="img" aria-label="Students allotted per hostel, split by gender">
		{#each [0, 0.25, 0.5, 0.75, 1] as fraction}
			<line
				x1={paddingLeft}
				x2={width - paddingRight}
				y1={paddingTop + chartHeight * (1 - fraction)}
				y2={paddingTop + chartHeight * (1 - fraction)}
				stroke="#232733"
				stroke-width="1"
			/>
			<text
				x={paddingLeft - 8}
				y={paddingTop + chartHeight * (1 - fraction) + 4}
				text-anchor="end"
				font-size="10"
				fill="#7d7a74"
			>
				{Math.round(maxValue * fraction)}
			</text>
		{/each}

		{#each data as d, i}
			{@const groupX = paddingLeft + i * groupWidth}
			{@const boysHeight = (d.boys / maxValue) * chartHeight}
			{@const girlsHeight = (d.girls / maxValue) * chartHeight}
			<g>
				<rect
					x={groupX + groupWidth / 2 - barWidth - 2}
					y={paddingTop + chartHeight - boysHeight}
					width={barWidth}
					height={Math.max(boysHeight, 0)}
					fill="#56ccf2"
					rx="3"
				/>
				{#if d.boys > 0}
					<text
						x={groupX + groupWidth / 2 - barWidth - 2 + barWidth / 2}
						y={paddingTop + chartHeight - boysHeight - 6}
						text-anchor="middle"
						font-size="10"
						font-family="JetBrains Mono, monospace"
						fill="#56ccf2"
					>
						{d.boys}
					</text>
				{/if}

				<rect
					x={groupX + groupWidth / 2 + 2}
					y={paddingTop + chartHeight - girlsHeight}
					width={barWidth}
					height={Math.max(girlsHeight, 0)}
					fill="#eb5757"
					rx="3"
				/>
				{#if d.girls > 0}
					<text
						x={groupX + groupWidth / 2 + 2 + barWidth / 2}
						y={paddingTop + chartHeight - girlsHeight - 6}
						text-anchor="middle"
						font-size="10"
						font-family="JetBrains Mono, monospace"
						fill="#eb5757"
					>
						{d.girls}
					</text>
				{/if}

				<text
					x={groupX + groupWidth / 2}
					y={height - paddingBottom + 18}
					text-anchor="middle"
					font-size="10"
					fill="#c9c6c0"
				>
					{truncate(d.hostelName)}
				</text>
			</g>
		{/each}
	</svg>
	<div class="legend">
		<span class="legend-item"><i class="dot boys"></i>{boysLabel}</span>
		<span class="legend-item"><i class="dot girls"></i>{girlsLabel}</span>
	</div>
{/if}

<style>
	.bar-chart {
		width: 100%;
		height: auto;
		display: block;
	}

	.legend {
		display: flex;
		gap: 1.25rem;
		margin-top: 0.5rem;
		justify-content: center;
	}

	.legend-item {
		display: flex;
		align-items: center;
		font-size: 0.78rem;
		color: #c9c6c0;
	}

	.dot {
		display: inline-block;
		width: 8px;
		height: 8px;
		border-radius: 50%;
		margin-right: 0.4rem;
	}

	.dot.boys { background: #56ccf2; }
	.dot.girls { background: #eb5757; }
</style>

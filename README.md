# Hostel Allotment System

**🚀 Live Demo:** [hostel-allotment-system-ashy.vercel.app](https://hostel-allotment-system-ashy.vercel.app)

Built for the **ML Club NITS** recruitment drive (Task 2 — Web Development), implemented strictly in **Svelte / SvelteKit** as required by the brief.

Given two Excel sheets — hostel room availability and hackathon participants — it allocates every participant to a room automatically, by gender and by hostel capacity, and hands back a ready-to-share result sheet.

## What it does

- **Upload** the Hostel Availability Sheet (`Hostel Name`, `Room Number`, `Capacity` [optional], `Hostel Type`: Boys/Girls) and the Participant Sheet (`Participant Name`, `Gender`) — by drag-and-drop or click-to-browse. Each upload slot is independent, so replacing or removing one file never touches the other.
- **Run Allocation** to assign every participant a hostel and room.
- **Review the results**: allotted/unallotted counts, a bar chart of students per hostel split by gender, a list of remaining seats per hostel, and — if anyone couldn't be placed — their names, grouped and counted separately by gender.
- **Download** the completed allotment as an Excel file: `Participant Name`, `Gender`, `Allotted Hostel`, `Allotted Room Number`.
- **Add a participant who got missed** after the fact, without starting over — see below.
- **Switch between English and Hindi** at any time via the toggle in the top corner.

## How the allocation works

1. **Split by gender first.** Male participants only ever compete for Boys hostel seats, female participants only for Girls hostel seats — the two pools never interfere with each other.
2. **Largest hostel fills first.** Within each gender group, if there are multiple hostels, the one with the highest total capacity is filled before the others.
3. **Rooms fill in sheet order** within a hostel, until every seat is taken.
4. **Missing capacity defaults to 2 seats per room.** A notice banner appears on the results page whenever this default was used, so it's never a silent assumption.
5. **Duplicate names are never a problem.** Every participant is tracked by their row position in the sheet, not by name — three "Rahul"s in the list get three independent, correctly-tracked seats.
6. **No seat, no problem.** Anyone left over once their gender's hostels are full is marked `Unallotted` in the download and surfaced clearly in the UI, instead of crashing or being silently dropped.

## Beyond the brief

A few things added on top of the core requirement:

- **Bar chart** of allotted students per hostel, colour-coded by gender.
- **Add a missed participant** — a slide-open panel where you specify how many students to add, fill in name + gender for each, and the app re-runs allocation. Everyone already allotted keeps their exact room; new entries fill whatever's left. An updated participant sheet is downloadable right after.
- **Bilingual interface** (English/Hindi).
- **Fully client-side** — Excel files never leave the browser; no backend or database, nothing to host or leak.
- **Keyboard-accessible uploads** — drop zones work with Tab + Enter/Space, not just a mouse.

## Getting started

```bash
npm install
npm run dev
```

Open the printed local URL (usually `http://localhost:5173`).

## Build

```bash
npm run build
npm run preview
```

## Deploy

Live at **[hostel-allotment-system-ashy.vercel.app](https://hostel-allotment-system-ashy.vercel.app)**, deployed on Vercel using `@sveltejs/adapter-auto` — no platform-specific configuration was needed.

## Tech stack

- **Svelte 4 / SvelteKit 2**
- **SheetJS (`xlsx`)** for reading and writing Excel files, entirely in-browser
- **Vite** for build tooling
- Hand-rolled SVG for the bar chart — no charting library dependency

## Project structure

```
src/
  lib/
    allocate.js        # Core allocation algorithm — framework-agnostic, unit-testable
    translations.js     # English/Hindi UI strings
    BarChart.svelte      # SVG bar chart: students per hostel, by gender
  routes/
    +page.svelte          # Upload UI, allocation trigger, results, add-participant panel
```
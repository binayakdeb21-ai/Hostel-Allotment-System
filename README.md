# Hostel Allotment System

Built for the ML Club NITS recruitment task (Task 2), using **Svelte / SvelteKit** as required.

## What it does

- Upload the **Hostel Availability Sheet** (Hostel Name, Room Number, Capacity [optional], Hostel Type: Boys/Girls)
- Upload the **Participant Sheet** (Participant Name, Gender)
- Click **Run Allocation** — rooms are matched by gender → hostel type, filled in sheet order until every seat is used
- Download the result as an Excel file: Participant Name, Gender, Allotted Hostel, Allotted Room Number

Rows missing a Capacity value default to 1 seat. Participants left over once matching-type seats run out are marked `Unallotted` rather than causing an error.

## Run locally

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

This uses `@sveltejs/adapter-auto`, so pushing to Vercel or Netlify and connecting the repo will "just work" — the correct adapter is picked automatically at build time on their platform. No extra config needed for a first deploy.

## Project structure

```
src/
  lib/
    allocate.js      # allocation algorithm (framework-agnostic, easy to test)
  routes/
    +page.svelte      # upload UI, triggers allocation, offers download
```

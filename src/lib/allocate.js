// Core allocation logic for the Hostel Allotment System.
// Framework-agnostic so it can be unit-tested independently of Svelte.

function normalizeHostelRow(row, index) {
	const get = (keys) => {
		for (const k of Object.keys(row)) {
			if (keys.includes(k.trim().toLowerCase())) return row[k];
		}
		return undefined;
	};

	const capacityRaw = get(['capacity']);
	const capacityWasProvided = !(capacityRaw === undefined || capacityRaw === '' || capacityRaw === null);
	const parsedCapacity = Number(capacityRaw);

	return {
		rowIndex: index,
		hostelName: String(get(['hostel name', 'hostelname']) ?? '').trim(),
		roomNumber: String(get(['room number', 'roomnumber', 'room no']) ?? '').trim(),
		capacity: capacityWasProvided && Number.isFinite(parsedCapacity) && parsedCapacity > 0 ? parsedCapacity : 2,
		capacityWasProvided,
		hostelType: String(get(['hostel type', 'hosteltype', 'type']) ?? '')
			.trim()
			.toLowerCase()
	};
}

function normalizeParticipantRow(row, index) {
	const get = (keys) => {
		for (const k of Object.keys(row)) {
			if (keys.includes(k.trim().toLowerCase())) return row[k];
		}
		return undefined;
	};

	return {
		rowIndex: index, // true identity key so duplicate names never collide
		name: String(get(['participant name', 'name']) ?? '').trim(),
		gender: String(get(['gender']) ?? '')
			.trim()
			.toLowerCase()
	};
}

const GENDER_TO_HOSTEL_TYPE = {
	male: 'boys',
	female: 'girls'
};

/**
 * Detects which raw column keys a participant sheet used for name/gender,
 * so manually-added participants can be merged back in using the same
 * headers as the original upload (rather than forcing new ones).
 */
export function detectParticipantColumns(rows) {
	const fallback = { nameKey: 'Participant Name', genderKey: 'Gender' };
	if (!rows || !rows.length) return fallback;
	const keys = Object.keys(rows[0]);
	const nameKey =
		keys.find((k) => ['participant name', 'name'].includes(k.trim().toLowerCase())) ||
		fallback.nameKey;
	const genderKey = keys.find((k) => k.trim().toLowerCase() === 'gender') || fallback.genderKey;
	return { nameKey, genderKey };
}

/**
 * Allocates participants to hostel rooms.
 *
 * Split rule: participants are divided by gender first — Male into Boys
 * hostels, Female into Girls hostels — and each group is allocated
 * independently, so a shortage on one side never touches the other's seats.
 *
 * Priority rule: within a gender group, when multiple hostels exist, the
 * hostel with the highest total capacity (summed across its rooms —
 * defaulted rooms count as 2 seats each) is filled first. Within a hostel,
 * rooms fill in the order they appear on the sheet.
 *
 * Participants are processed by row position, not by name, so duplicate
 * participant names never get confused with each other.
 */
export function allocateRooms(hostelRows, participantRows) {
	const hostels = hostelRows
		.map(normalizeHostelRow)
		.filter((h) => h.hostelName && h.roomNumber);
	const participants = participantRows
		.map(normalizeParticipantRow)
		.filter((p) => p.name && p.gender);

	const anyDefaultedCapacity = hostels.some((h) => !h.capacityWasProvided);

	// Group rooms by hostel name within each type, preserving first-seen order.
	const hostelGroups = { boys: new Map(), girls: new Map() };
	for (const h of hostels) {
		if (h.hostelType !== 'boys' && h.hostelType !== 'girls') continue;
		const group = hostelGroups[h.hostelType];
		if (!group.has(h.hostelName)) {
			group.set(h.hostelName, { hostelName: h.hostelName, rooms: [], totalCapacity: 0 });
		}
		const entry = group.get(h.hostelName);
		entry.rooms.push(h);
		entry.totalCapacity += h.capacity;
	}

	// Sort hostels within each type by total capacity, descending (stable).
	const orderedHostels = { boys: [], girls: [] };
	for (const type of ['boys', 'girls']) {
		orderedHostels[type] = Array.from(hostelGroups[type].values()).sort(
			(a, b) => b.totalCapacity - a.totalCapacity
		);
	}

	// Build a flat seat queue per type, hostel-priority first, room order within hostel.
	const seatQueues = { boys: [], girls: [] };
	const hostelRemaining = new Map(); // key: `${type}::${hostelName}` -> remaining count

	for (const type of ['boys', 'girls']) {
		for (const hostel of orderedHostels[type]) {
			hostelRemaining.set(`${type}::${hostel.hostelName}`, hostel.totalCapacity);
			for (const room of hostel.rooms) {
				for (let seat = 0; seat < room.capacity; seat++) {
					seatQueues[type].push({ hostelName: hostel.hostelName, roomNumber: room.roomNumber, type });
				}
			}
		}
	}

	const results = [];
	const unallottedBoys = [];
	const unallottedGirls = [];
	const unallottedOther = []; // rows with unrecognized/blank gender values
	const hostelOccupancy = new Map(); // hostelName -> {hostelName, boys, girls}

	for (const p of participants) {
		const type = GENDER_TO_HOSTEL_TYPE[p.gender];
		const queue = type ? seatQueues[type] : null;
		const seat = queue && queue.length ? queue.shift() : null;

		if (seat) {
			const key = `${seat.type}::${seat.hostelName}`;
			hostelRemaining.set(key, hostelRemaining.get(key) - 1);

			if (!hostelOccupancy.has(seat.hostelName)) {
				hostelOccupancy.set(seat.hostelName, { hostelName: seat.hostelName, boys: 0, girls: 0 });
			}
			hostelOccupancy.get(seat.hostelName)[type]++;

			results.push({
				rowIndex: p.rowIndex,
				'Participant Name': p.name,
				Gender: capitalize(p.gender),
				'Allotted Hostel': seat.hostelName,
				'Allotted Room Number': seat.roomNumber
			});
		} else {
			if (type === 'boys') unallottedBoys.push(p.name);
			else if (type === 'girls') unallottedGirls.push(p.name);
			else unallottedOther.push(p.name);

			results.push({
				rowIndex: p.rowIndex,
				'Participant Name': p.name,
				Gender: capitalize(p.gender) || 'Unknown',
				'Allotted Hostel': 'Unallotted',
				'Allotted Room Number': '-'
			});
		}
	}

	const hostelsLeft = Array.from(hostelRemaining.entries())
		.map(([key, remaining]) => {
			const [type, hostelName] = key.split('::');
			return { hostelName, type, remaining };
		})
		.filter((h) => h.remaining > 0)
		.sort((a, b) => b.remaining - a.remaining);

	const totalUnallotted = unallottedBoys.length + unallottedGirls.length + unallottedOther.length;

	const summary = {
		totalParticipants: participants.length,
		allotted: participants.length - totalUnallotted,
		unallotted: totalUnallotted,
		unallottedBoys,
		unallottedGirls,
		unallottedOther,
		hostelsLeft,
		hostelOccupancy: Array.from(hostelOccupancy.values()),
		anyDefaultedCapacity
	};

	return { results, summary };
}

function capitalize(str) {
	return str ? str.charAt(0).toUpperCase() + str.slice(1) : str;
}

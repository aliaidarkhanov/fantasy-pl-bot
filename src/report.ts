import type { State } from "./state";

interface Row {
  entryId: number;
  manager: string;
  team: string;
  total: number;
  lastGw: string;
  tcUsed: number[];
}

function pad(value: string | number, width: number, right = false): string {
  const s = String(value);
  if (s.length >= width) return s;
  return right ? s.padStart(width) : s.padEnd(width);
}

export function formatReport(state: State, myId: number | null): string {
  const gwIds = Object.keys(state.gameweeks).map(Number).sort((a, b) => a - b);
  if (gwIds.length === 0) {
    return "Пока нет ни одного сыгранного игрового дня — считать нечего.";
  }
  const lastGwId = gwIds[gwIds.length - 1];
  const lastGw = state.gameweeks[lastGwId];

  const rows: Row[] = Object.entries(state.entries).map(([id, info]) => {
    let total = 0;
    const tcUsed: number[] = [];
    for (const gw of gwIds) {
      const r = state.gameweeks[gw].captains[id];
      if (!r) continue;
      total += r.points;
      if (r.tripleCaptain) tcUsed.push(gw);
    }

    const last = lastGw.captains[id];
    let lastText = "—";
    if (last?.playerName) {
      const flags = [
        last.tripleCaptain ? "TC" : "",
        last.viceUsed ? "вице" : "",
        last.pending ? "ещё играет" : "",
      ].filter(Boolean);
      lastText = `${last.playerName} ${last.basePoints}×${last.multiplier}=${last.points}`;
      if (flags.length) lastText += ` (${flags.join(", ")})`;
    } else if (last) {
      lastText = "капитан и вице не сыграли";
    }

    return { entryId: Number(id), manager: info.manager, team: info.team, total, lastGw: lastText, tcUsed };
  });

  rows.sort((a, b) => b.total - a.total || a.manager.localeCompare(b.manager));

  const wManager = Math.max(8, ...rows.map((r) => r.manager.length));
  const wTeam = Math.max(7, ...rows.map((r) => r.team.length));

  const statusLine =
    lastGw.status === "final"
      ? `GW${lastGwId} завершён`
      : `GW${lastGwId} идёт — очки предварительные (завершены дни: ${lastGw.completedDays.join(", ") || "—"})`;

  const lines = [
    `Лига: ${state.leagueName} · туры GW${gwIds[0]}–GW${lastGwId}`,
    statusLine,
    "",
    `   ${pad("#", 3, true)}  ${pad("Менеджер", wManager)}  ${pad("Команда", wTeam)}  ${pad("Очки", 5, true)}  Капитан GW${lastGwId}`,
  ];

  let place = 0;
  rows.forEach((r, i) => {
    if (i === 0 || r.total !== rows[i - 1].total) place = i + 1;
    const me = r.entryId === myId ? "►" : " ";
    const tc = r.tcUsed.length ? `  [TC: ${r.tcUsed.map((g) => `GW${g}`).join(", ")}]` : "";
    lines.push(
      `${me}  ${pad(place, 3, true)}  ${pad(r.manager, wManager)}  ${pad(r.team, wTeam)}  ${pad(r.total, 5, true)}  ${r.lastGw}${tc}`
    );
  });

  if (myId !== null && !rows.some((r) => r.entryId === myId)) {
    lines.push("", `Внимание: my_id ${myId} не найден в этой лиге.`);
  }

  return lines.join("\n");
}

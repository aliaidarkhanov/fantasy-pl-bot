import { buildStandings, type CaptainResult, type LeagueState } from "@fpl/core";

function pad(value: string | number, width: number, right = false): string {
  const s = String(value);
  if (s.length >= width) return s;
  return right ? s.padStart(width) : s.padEnd(width);
}

function describeCaptain(last: CaptainResult | null): string {
  if (!last) return "—";
  if (!last.playerName) return "капитан и вице не сыграли";
  const flags = [
    last.tripleCaptain ? "TC" : "",
    last.viceUsed ? "вице" : "",
    last.pending ? "ещё играет" : "",
  ].filter(Boolean);
  const text = `${last.playerName} ${last.basePoints}×${last.multiplier}=${last.points}`;
  return flags.length ? `${text} (${flags.join(", ")})` : text;
}

export function formatReport(state: LeagueState, myId: number | null): string {
  const standings = buildStandings(state);
  if (!standings) {
    return "Пока нет ни одного сыгранного игрового дня — считать нечего.";
  }
  const { gwIds, lastGwId, lastGw, rows } = standings;

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

  for (const r of rows) {
    const me = r.entryId === myId ? "►" : " ";
    const tc = r.tcUsed.length ? `  [TC: ${r.tcUsed.map((g) => `GW${g}`).join(", ")}]` : "";
    lines.push(
      `${me}  ${pad(r.place, 3, true)}  ${pad(r.manager, wManager)}  ${pad(r.team, wTeam)}  ${pad(r.total, 5, true)}  ${describeCaptain(r.last)}${tc}`,
    );
  }

  if (myId !== null && !rows.some((r) => r.entryId === myId)) {
    lines.push("", `Внимание: my_id ${myId} не найден в этой лиге.`);
  }

  return lines.join("\n");
}

/* High School Football Coach
   Dice-behind-the-curtain implementation
   Rules based on user's description, with minimal practical UI additions.
*/

const STORAGE_KEY = "hsfc_v1_save";

const $ = (id) => document.getElementById(id);

function nowStamp() {
  const d = new Date();
  return d.toLocaleString();
}

function rollDie() {
  return Math.floor(Math.random() * 6) + 1;
}

function roll2Dice() {
  const a = rollDie();
  const b = rollDie();
  return { a, b, sum: a + b };
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function baseScoreFrom2d6(sum) {
  // Returns { points, needsCheckDie?: true, checkType?: "sum2"|"sum3" }
  // For 2 and 3, special check die determines outcome and NO extra rolls.
  if (sum === 2) return { points: null, checkType: "sum2" };
  if (sum === 3) return { points: null, checkType: "sum3" };

  const table = {
    4: 13,
    5: 14,
    6: 16,
    7: 17,
    8: 20,
    9: 24,
    10: 27,
    11: 28,
    12: 30
  };
  return { points: table[sum], checkType: null };
}

function explodeDieRoll(logLines, label) {
  // Roll 1 die, add value; if 6 keep rolling and adding. No limit.
  let total = 0;
  let chain = [];
  while (true) {
    const r = rollDie();
    chain.push(r);
    total += r;
    if (r !== 6) break;
  }
  logLines.push(`${label}: ${chain.join(", ")} (adds ${total})`);
  return total;
}

function extraDiceTotal(logLines, howMany, labelPrefix) {
  let total = 0;
  for (let i = 1; i <= howMany; i++) {
    total += explodeDieRoll(logLines, `${labelPrefix} extra die #${i}`);
  }
  return total;
}

function computeTeamScore({
  isUser,
  offenseAdv,
  defenseAdvAgainstOpponent, // if true, opponent gets no extra dice
  label
}) {
  // Returns { score, detailLines[] }
  const lines = [];
  const { a, b, sum } = roll2Dice();
  lines.push(`${label} 2d6: ${a} + ${b} = ${sum}`);

  const base = baseScoreFrom2d6(sum);

  // Special sums (2 and 3): one check die determines base points; no extras
  if (base.checkType === "sum2") {
    const c = rollDie();
    lines.push(`${label} check die (for sum=2): ${c}`);
    const pts = (c >= 4) ? 3 : 0;
    lines.push(`${label} base points: ${pts} (no extra dice allowed)`);
    return { score: pts, detailLines: lines };
  }

  if (base.checkType === "sum3") {
    const c = rollDie();
    lines.push(`${label} check die (for sum=3): ${c}`);
    const pts = (c >= 4) ? 12 : 6;
    lines.push(`${label} base points: ${pts} (no extra dice allowed)`);
    return { score: pts, detailLines: lines };
  }

  // Base fixed points for sums 4-12
  let score = base.points;
  lines.push(`${label} base points: ${score}`);

  // Scoring note: if BASE POINTS are 0,3,6,12 => no extra rolls at all.
  // (Those only occur in the sum=2 and sum=3 paths above, so we’re good.)

  // Extra dice rules:
  // - Normal: 1 extra die
  // - If sum=12 (double sixes): 2 extra dice (instead of 1)
  // - If user has offense advantage: always 2 extra dice instead of usual 1,
  //   but sum=12 stays 2 (not 3).
  // - If defense advantage applies against this team: NO extra dice at all.
  let extraCount = (sum === 12) ? 2 : 1;

  if (isUser && offenseAdv) extraCount = Math.max(extraCount, 2);

  if (defenseAdvAgainstOpponent) {
    lines.push(`${label} (opponent has DEF advantage): no extra dice allowed.`);
    return { score, detailLines: lines };
  }

  // Apply extras
  lines.push(`${label} extra dice count: ${extraCount} (6s explode)`);
  const extras = extraDiceTotal(lines, extraCount, label);
  score += extras;
  lines.push(`${label} final score: ${score}`);

  return { score, detailLines: lines };
}

function breakTie(userScore, oppScore, logLines) {
  // One die roll each, higher gets +3. Repeat if still tied.
  let round = 1;
  while (userScore === oppScore) {
    const u = rollDie();
    const o = rollDie();
    logLines.push(`TIEBREAKER #${round}: You roll ${u}, Opponent rolls ${o}`);
    if (u > o) {
      userScore += 3;
      logLines.push(`You win tiebreaker (+3). New score: You ${userScore} - Opp ${oppScore}`);
    } else if (o > u) {
      oppScore += 3;
      logLines.push(`Opponent wins tiebreaker (+3). New score: You ${userScore} - Opp ${oppScore}`);
    } else {
      logLines.push(`Tiebreaker tied again. Rolling again...`);
    }
    round++;
  }
  return { userScore, oppScore };
}

function makeNewSeasonState(seasonNumber) {
  // 10 regular season games. Randomly mark 4 as district games.
  const games = [];
  for (let i = 1; i <= 10; i++) {
    games.push({
      type: "regular",
      number: i,
      isDistrict: false,
      played: false,
      result: null, // "W"|"L"
      userScore: null,
      oppScore: null
    });
  }
  const idxs = shuffle([0,1,2,3,4,5,6,7,8,9]).slice(0,4);
  idxs.forEach(i => games[i].isDistrict = true);

  return {
    seasonNumber,
    phase: "preseason", // preseason -> regular -> (tiebreak?) -> playoffs -> done
    games,
    tiebreakerGame: null, // {played, result, scores...} when needed
    playoffs: [], // up to 4 games
    wins: 0,
    losses: 0,
    districtWins: 0,
    districtLosses: 0,
    madePlayoffs: false,
    playoffWins: 0,
    playoffLosses: 0,
    champion: false,
    notes: []
  };
}

function makePlayoffs() {
  return [
    { type: "playoff", round: 1, name: "Playoff Game 1", played: false, result: null, userScore: null, oppScore: null },
    { type: "playoff", round: 2, name: "Playoff Game 2", played: false, result: null, userScore: null, oppScore: null },
    { type: "playoff", round: 3, name: "Playoff Game 3", played: false, result: null, userScore: null, oppScore: null },
    { type: "championship", round: 4, name: "State Championship", played: false, result: null, userScore: null, oppScore: null }
  ];
}

function defaultState() {
  return {
    version: 1,
    coachName: "",
    createdAt: nowStamp(),
    fired: false,
    seasonsWithoutPlayoffs: 0,
    seasonNumber: 0,
    // advantages currently owned going into games:
    adv: { offense: false, defense: false },
    // whether advantages were earned automatically for next season:
    pendingGain: null, // "offense"|"defense"|null (used to grant at season rollover)
    // current season
    season: null,
    // full log text
    log: []
  };
}

let state = loadState() || defaultState();
let pendingChoice = null; // {type: "pickAdvSide", source: "...", onPick(side)=>{} }

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    $("saveStatus").textContent = "Saved";
    setTimeout(() => $("saveStatus").textContent = "Ready", 600);
  } catch (e) {
    $("saveStatus").textContent = "Save failed";
  }
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function pushLog(lines) {
  if (!Array.isArray(lines)) lines = [String(lines)];
  state.log.push(`\n=== ${nowStamp()} ===\n` + lines.join("\n"));
  renderLog();
  saveState();
}

function renderLog() {
  const el = $("log");
  el.textContent = state.log.join("\n");
  el.scrollTop = el.scrollHeight;
}

function setChoicePanel(show, text, onOffense, onDefense) {
  const panel = $("choicePanel");
  panel.style.display = show ? "block" : "none";
  if (show) {
    $("choiceText").textContent = text;
    $("btnChooseOffense").onclick = () => { panel.style.display="none"; onOffense(); };
    $("btnChooseDefense").onclick = () => { panel.style.display="none"; onDefense(); };
  } else {
    $("choiceText").textContent = "";
  }
}

function advText() {
  const { offense, defense } = state.adv;
  if (offense && defense) return "Highly Skilled: OFFENSE + DEFENSE";
  if (offense) return "Highly Skilled: OFFENSE";
  if (defense) return "Highly Skilled: DEFENSE";
  return "No Highly Skilled advantage";
}

function renderAdvTags() {
  const box = $("advTags");
  box.innerHTML = "";
  const { offense, defense } = state.adv;

  box.appendChild(tagEl(offense ? "OFFENSE: ON" : "OFFENSE: off"));
  box.appendChild(tagEl(defense ? "DEFENSE: ON" : "DEFENSE: off"));
  box.appendChild(tagEl(advText()));
}

function tagEl(text) {
  const s = document.createElement("span");
  s.className = "tag";
  s.textContent = text;
  return s;
}

function renderHeaderKPIs() {
  const coach = state.coachName?.trim() || "Coach";
  $("careerStatus").textContent = state.fired ? `${coach} (Fired)` : coach;

  if (!state.season) {
    $("kpiSeason").textContent = "—";
    $("kpiRecord").textContent = "—";
    $("kpiPhase").textContent = "No season";
    $("kpiDistrict").textContent = "—";
    return;
  }

  $("kpiSeason").textContent = `Year ${state.season.seasonNumber}`;
  $("kpiRecord").textContent = `${state.season.wins}-${state.season.losses}`;

  let phaseLabel = state.season.phase;
  if (phaseLabel === "preseason") phaseLabel = "Preseason";
  if (phaseLabel === "regular") phaseLabel = "Regular Season";
  if (phaseLabel === "tiebreaker") phaseLabel = "District Tiebreaker";
  if (phaseLabel === "playoffs") phaseLabel = "Playoffs";
  if (phaseLabel === "done") phaseLabel = state.season.champion ? "Season Complete (Champion)" : "Season Complete";

  $("kpiPhase").textContent = phaseLabel;

  $("kpiDistrict").textContent = `District: ${state.season.districtWins}-${state.season.districtLosses}`;
}

function enableButtons() {
  const hasSeason = !!state.season;
  $("btnResetSeason").disabled = !hasSeason || state.season.phase === "preseason";
  $("btnNext").disabled = !hasSeason || state.fired || !!pendingChoice;
  $("btnExport").disabled = state.log.length === 0;
  $("btnClearLog").disabled = state.log.length === 0;
}

function startNewCareer() {
  state = defaultState();
  state.coachName = $("coachName").value.trim();
  pushLog([
    `NEW CAREER started for ${state.coachName || "Coach"}.`,
    `Goal: Win state championships and build a dynasty.`
  ]);
  beginNewSeason(true);
}

function beginNewSeason(isFirst = false) {
  state.seasonNumber += 1;
  state.season = makeNewSeasonState(state.seasonNumber);

  // Apply any pending gain (earned automatically from last season)
  if (state.pendingGain) {
    grantAdvantage(state.pendingGain, `Automatic award for next season: +${state.pendingGain.toUpperCase()}`);
    state.pendingGain = null;
  }

  // Preseason: roll for advantages if not retained or if no advantage.
  // If season just started and we *already* have advantages (retained), we skip rolling.
  if (state.adv.offense || state.adv.defense) {
    state.season.phase = "regular";
    pushLog([
      `Season ${state.seasonNumber} begins.`,
      `Advantages retained: ${advText()}`,
      `District games this season: ${districtGameNumbers().join(", ")}`
    ]);
  } else {
    state.season.phase = "preseason";
    pushLog([
      `Season ${state.seasonNumber} preseason.`,
      `Rolling for Highly Skilled advantage...`,
      `District games this season: ${districtGameNumbers().join(", ")}`
    ]);
    preseasonRollForAdvantage();
  }

  saveState();
  renderAll();
}

function districtGameNumbers() {
  return state.season.games
    .filter(g => g.isDistrict)
    .map(g => `Game ${g.number}`);
}

function preseasonRollForAdvantage() {
  const lines = [];
  const r1 = roll2Dice();
  lines.push(`Preseason roll #1: ${r1.a} + ${r1.b} = ${r1.sum}`);
  const good1 = (r1.a >= 5 && r1.b >= 5);

  if (!good1) {
    lines.push(`Result: No Highly Skilled advantage this season.`);
    state.season.phase = "regular";
    pushLog(lines);
    return;
  }

  lines.push(`Result: You earned a Highly Skilled advantage (one side of the ball).`);
  const r2 = roll2Dice();
  lines.push(`Preseason roll #2: ${r2.a} + ${r2.b} = ${r2.sum}`);
  const good2 = (r2.a >= 5 && r2.b >= 5);

  if (good2) {
    state.adv.offense = true;
    state.adv.defense = true;
    lines.push(`Result: Highly Skilled on BOTH offense and defense!`);
    state.season.phase = "regular";
    pushLog(lines);
    return;
  }

  lines.push(`Second roll did not repeat. Choose: OFFENSE or DEFENSE.`);
  pushLog(lines);

  pendingChoice = {
    type: "pickAdvSide",
    reason: "Preseason advantage choice",
    onPick: (side) => {
      grantAdvantage(side, "Preseason choice");
      state.season.phase = "regular";
      pendingChoice = null;
      saveState();
      renderAll();
    }
  };

  setChoicePanel(
    true,
    "You rolled Highly Skilled (one side). Which side are you Highly Skilled on?",
    () => pendingChoice.onPick("offense"),
    () => pendingChoice.onPick("defense")
  );
  renderAll();
}

function grantAdvantage(side, note) {
  const lines = [];
  if (side === "offense") {
    if (!state.adv.offense) {
      state.adv.offense = true;
      lines.push(`${note}: OFFENSE advantage granted.`);
    } else {
      lines.push(`${note}: OFFENSE advantage already owned.`);
    }
  } else {
    if (!state.adv.defense) {
      state.adv.defense = true;
      lines.push(`${note}: DEFENSE advantage granted.`);
    } else {
      lines.push(`${note}: DEFENSE advantage already owned.`);
    }
  }
  if (lines.length) pushLog(lines);
}

function playNext() {
  if (!state.season || state.fired) return;

  if (state.season.phase === "preseason") {
    // If preseason is waiting on choice, block; otherwise it should have moved to regular.
    return;
  }

  if (state.season.phase === "regular") {
    const nextGame = state.season.games.find(g => !g.played);
    if (!nextGame) {
      endRegularSeasonAndDecidePlayoffs();
      return;
    }
    playOneGame(nextGame);
    return;
  }

  if (state.season.phase === "tiebreaker") {
    if (!state.season.tiebreakerGame) return;
    playOneGame(state.season.tiebreakerGame, true);
    // After tiebreaker, decide playoffs
    if (state.season.tiebreakerGame.played) {
      if (state.season.tiebreakerGame.result === "W") {
        state.season.madePlayoffs = true;
        state.season.phase = "playoffs";
        state.season.playoffs = makePlayoffs();
        pushLog([`You won the district tiebreaker and ADVANCE to playoffs.`]);
      } else {
        state.season.madePlayoffs = false;
        pushLog([`You lost the district tiebreaker. No playoffs this season.`]);
        finalizeSeason(false);
      }
    }
    saveState();
    renderAll();
    return;
  }

  if (state.season.phase === "playoffs") {
    const nextP = state.season.playoffs.find(g => !g.played);
    if (!nextP) {
      finalizeSeason(state.season.champion);
      return;
    }
    playOnePlayoff(nextP);
    return;
  }

  if (state.season.phase === "done") {
    // start next season
    beginNewSeason(false);
  }
}

function playOneGame(gameObj, isTiebreaker = false) {
  const lines = [];
  const label = isTiebreaker ? "TIEBREAKER GAME" : (gameObj.type === "regular" ? `REG SEASON Game ${gameObj.number}` : gameObj.name);
  lines.push(`${label}${gameObj.isDistrict ? " (District)" : ""}`);

  const user = computeTeamScore({
    isUser: true,
    offenseAdv: state.adv.offense,
    defenseAdvAgainstOpponent: false,
    label: "You"
  });

  const opp = computeTeamScore({
    isUser: false,
    offenseAdv: false,
    defenseAdvAgainstOpponent: state.adv.defense, // your DEF advantage limits opponent
    label: "Opponent"
  });

  lines.push(...user.detailLines.map(s => "  " + s));
  lines.push(...opp.detailLines.map(s => "  " + s));

  let userScore = user.score;
  let oppScore = opp.score;

  if (userScore === oppScore) {
    lines.push(`Score tied at ${userScore}-${oppScore}. Settling with one-die tiebreaker (+3).`);
    const t = breakTie(userScore, oppScore, lines);
    userScore = t.userScore;
    oppScore = t.oppScore;
  }

  const win = userScore > oppScore;
  gameObj.played = true;
  gameObj.userScore = userScore;
  gameObj.oppScore = oppScore;
  gameObj.result = win ? "W" : "L";

  lines.push(`FINAL: You ${userScore} - Opponent ${oppScore}  => ${win ? "WIN" : "LOSS"}`);

  // Update season record & district
  if (win) state.season.wins++; else state.season.losses++;
  if (gameObj.isDistrict) {
    if (win) state.season.districtWins++; else state.season.districtLosses++;
  }

  pushLog(lines);

  // If finished last regular game, decide playoffs
  if (state.season.phase === "regular") {
    const remaining = state.season.games.some(g => !g.played);
    if (!remaining) endRegularSeasonAndDecidePlayoffs();
  }

  saveState();
  renderAll();
}

function playOnePlayoff(gameObj) {
  playOneGame(gameObj, false);

  // After the playoff game is played, update playoff counters and check elimination
  if (gameObj.result === "W") state.season.playoffWins++;
  else state.season.playoffLosses++;

  if (gameObj.type === "championship") {
    state.season.champion = (gameObj.result === "W");
    if (state.season.champion) pushLog([`STATE CHAMPIONS! You won the championship.`]);
    else pushLog([`You lost the State Championship.`]);
    finalizeSeason(state.season.champion);
    return;
  }

  // If any playoff loss before championship, season ends (single elimination feel)
  if (gameObj.result === "L") {
    pushLog([`Playoff loss. Season ends.`]);
    finalizeSeason(false);
  } else {
    // If just won round 3, next is championship
    const next = state.season.playoffs.find(g => !g.played);
    if (!next) finalizeSeason(false);
  }

  saveState();
  renderAll();
}

function endRegularSeasonAndDecidePlayoffs() {
  const lines = [];
  lines.push(`Regular season complete: ${state.season.wins}-${state.season.losses}`);
  lines.push(`District record: ${state.season.districtWins}-${state.season.districtLosses}`);

  const dw = state.season.districtWins;

  if (dw === 4) {
    state.season.madePlayoffs = true;
    state.season.phase = "playoffs";
    state.season.playoffs = makePlayoffs();
    lines.push(`You won the district (4-0) and ADVANCE to playoffs.`);
    pushLog(lines);
    saveState();
    renderAll();
    return;
  }

  if (dw === 3) {
    if (state.season.wins < 5) {
      state.season.madePlayoffs = false;
      lines.push(`You went 3-1 in district, but total wins < 5, so NO tiebreaker game allowed.`);
      pushLog(lines);
      finalizeSeason(false);
      return;
    }
    state.season.phase = "tiebreaker";
    state.season.tiebreakerGame = {
      type: "tiebreaker",
      name: "District Tiebreaker",
      isDistrict: true,
      played: false,
      result: null,
      userScore: null,
      oppScore: null
    };
    lines.push(`You went 3-1 in district. You get a DISTRICT TIEBREAKER game to decide playoff spot.`);
    pushLog(lines);
    saveState();
    renderAll();
    return;
  }

  state.season.madePlayoffs = false;
  lines.push(`You did not win enough district games to advance. No playoffs this season.`);
  pushLog(lines);
  finalizeSeason(false);
}

function finalizeSeason(wonChampionship) {
  if (!state.season) return;

  state.season.phase = "done";

  // Update “missed playoffs” streak & firing rule
  if (state.season.madePlayoffs) state.seasonsWithoutPlayoffs = 0;
  else state.seasonsWithoutPlayoffs += 1;

  if (state.seasonsWithoutPlayoffs >= 5) {
    state.fired = true;
    pushLog([`FIRED: You failed to make playoffs for 5 consecutive seasons.`]);
    saveState();
    renderAll();
    return;
  }

  // Retention / advantage rules:
  // - If win championship: automatically retain whatever you had.
  // - To retain into next season otherwise: must win 2 playoff games OR win 8+ regular games.
  // - If you lose retention: you lose advantages and can roll again next preseason.
  // - If you win championship with NO advantages: you automatically get one advantage next season.
  // - If you have NO advantages during season and win 8+ reg wins or 2 playoff wins: you get one advantage next season
  //   IN ADDITION to rolling for another preseason.
  const hadAnyAdvThisSeason = (state.adv.offense || state.adv.defense); // current adv represents what you played with
  const regWins = state.season.wins;
  const poWins = state.season.playoffWins;

  const lines = [];
  lines.push(`Season ${state.season.seasonNumber} complete.`);
  lines.push(`Record: ${state.season.wins}-${state.season.losses} | District: ${state.season.districtWins}-${state.season.districtLosses}`);
  if (state.season.madePlayoffs) lines.push(`Playoffs: ${state.season.playoffWins} win(s), ${state.season.playoffLosses} loss(es)`);

  if (wonChampionship) {
    // Keep advantages exactly as-is.
    if (!hadAnyAdvThisSeason) {
      // Special rule: championship with no advantages grants one for next season
      const side = $("defaultAdvSide").value;
      state.pendingGain = side;
      lines.push(`You won the championship with no advantages: you will gain ONE advantage next season (${side.toUpperCase()}).`);
    } else {
      lines.push(`Championship won: advantages automatically retained into next season.`);
    }
    pushLog(lines);
    saveState();
    renderAll();
    return;
  }

  // Not champion
  const retains = (poWins >= 2) || (regWins >= 8);

  if (hadAnyAdvThisSeason) {
    if (retains) {
      lines.push(`You retained your advantages into next season (met retention requirement).`);
    } else {
      lines.push(`You FAILED the retention requirement and lose your advantages going into next season.`);
      state.adv.offense = false;
      state.adv.defense = false;
    }
  } else {
    // No advantages this season, but may earn one for next season
    if (retains) {
      const side = $("defaultAdvSide").value;
      state.pendingGain = side;
      lines.push(`No advantages this season, but you met the requirement (8+ wins or 2 playoff wins): you will gain ONE advantage next season (${side.toUpperCase()}) in addition to preseason rolling.`);
    }
  }

  pushLog(lines);
  saveState();
  renderAll();
}

function restartCurrentSeason() {
  if (!state.season) return;
  const sn = state.season.seasonNumber;

  // Restart season, keeping current advantages as they are going into this season
  state.season = makeNewSeasonState(sn);

  // If you have advantages, start regular; else go preseason and roll
  if (state.adv.offense || state.adv.defense) {
    state.season.phase = "regular";
    pushLog([`Season ${sn} restarted. Advantages kept: ${advText()}`, `District games: ${districtGameNumbers().join(", ")}`]);
  } else {
    state.season.phase = "preseason";
    pushLog([`Season ${sn} restarted. No advantages. Rolling preseason...`, `District games: ${districtGameNumbers().join(", ")}`]);
    preseasonRollForAdvantage();
  }

  saveState();
  renderAll();
}

function exportLog() {
  const blob = new Blob([state.log.join("\n")], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "HighSchoolFootballCoach_Log.txt";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function clearLog() {
  state.log = [];
  renderLog();
  saveState();
  renderAll();
}

function renderAll() {
  // sync inputs
  $("coachName").value = state.coachName || "";
  renderLog();
  renderAdvTags();
  renderHeaderKPIs();

  const hasSeason = !!state.season;
  $("btnNext").textContent = (!hasSeason) ? "Play Next Game" :
    (state.season.phase === "done" ? "Start Next Season" : "Play Next Game");

  // Show helpful prompt if preseason and no pending choice (auto rolls already logged)
  if (state.season && state.season.phase === "preseason" && !pendingChoice) {
    // should be rare; preseasonRoll moves to regular or sets pendingChoice
  }

  enableButtons();
}

function wireUI() {
  $("btnNewCareer").onclick = () => {
    if (confirm("Start a NEW career? This will erase the current saved career.")) startNewCareer();
  };

  $("btnNext").onclick = () => playNext();

  $("btnResetSeason").onclick = () => {
    if (!state.season) return;
    if (confirm("Restart the current season? (Keeps your current advantages.)")) restartCurrentSeason();
  };

  $("coachName").addEventListener("change", () => {
    state.coachName = $("coachName").value.trim();
    saveState();
    renderAll();
  });

  $("defaultAdvSide").addEventListener("change", () => {
    saveState();
  });

  $("btnExport").onclick = exportLog;
  $("btnClearLog").onclick = () => {
    if (confirm("Clear the game log?")) clearLog();
  };
}

(function init() {
  wireUI();

  // If there is no season yet, create one.
  if (!state.season && !state.fired) {
    state.coachName = state.coachName || $("coachName").value.trim();
    state.seasonNumber = 0;
    beginNewSeason(true);
  }

  // If we reloaded mid-choice, re-open choice panel if needed (best effort)
  if (pendingChoice) pendingChoice = null; // (we don’t persist pendingChoice; log shows what happened)

  renderAll();
})();
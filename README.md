# Virtual Measurement

Just-for-fun NFL stats and minigame site: matchups, standings, player stats and charts, plus a Super Bowl simulator, a 17-0 draft game and Ultimate Team, and the data pipeline behind it all.

Source: [nflverse](https://github.com/nflverse), free and open NFL data that is updated during the season.

**Where things are:** the app lives in the [`testnfl`](testnfl) folder, and every file path and command below is relative to it (run `node …` from inside `testnfl`). Profiles are kept in a `testnfl profiles` folder next to it, which isn't in git.

## Matchup app

Double-click **`start.bat`**. It starts a small local server and opens the app at http://localhost:8765. Close the console window to stop it.

**Refreshing:** the server updates itself during the season (September to February). It re-downloads and rebuilds everything at 6 AM US Eastern on Friday, Sunday, Monday, Tuesday and Wednesday, and again at 2 PM on Friday, Monday and Tuesday in case the stats were posted late. If the server was off at one of those times, it catches up about a minute after it starts. `AUTO_REFRESH=0` turns this off. You can still click **↻ Refresh data** in the top-right corner of the Matchups page any time.

You can also open `app/index.html` directly without the server, but the refresh button is disabled that way.

**On your local network:** the server also answers other machines on the same network. When it starts, the console prints the address to use, e.g. `http://192.168.1.20:8765`. Requests from outside the local network (any non-private IP address) get **403 Forbidden**, so the site and its Refresh button stay on your network.
- **Connection refused from another machine?** Check the firewall on the machine running the server. Windows asks the first time Node.js listens on the network: allow it for **Private networks**. Or add an inbound rule for TCP port 8765.
- **Options (environment variables):** `PORT` changes the port (default 8765). `HOST=127.0.0.1` makes it this-machine-only again.
- **Running it without start.bat** (e.g. on a server): run `node server.js --no-open` from the project folder.
- **Putting it on the internet** (a VPS for you and friends): see [Hosting it online](#hosting-it-online) below.

### What's on the page
- **⭐ My team:** pick a favorite team at the top of the sidebar and the page opens on its game (its next game during a bye week). It's saved to your 👤 profile, so it follows you to any browser (signed out, the browser remembers it); its games get a ⭐. The Charts page highlights it and Ultimate Team's season mode starts on its schedule.
- **⚙ Settings:** which stats count for look-alike matching (all 24 by default, big plays, sacks and situational included), plus seasons since, home field, minimum games and minimum similarity. Saved to your profile too.
- **Sidebar:** any week of the season (◀ ▶). This week shows records, the spread and the over/under; past weeks show final scores with two pills for how Virtual Measurement did: winner ✓/✗ and spread ✓/✗. Pick any two teams at the bottom.
- **📈 Season scorecard (backdated predictions):** every finished game from week 2 on is re-picked using only what was known before kickoff (both teams' stats through their previous game, history from past seasons only), with the same blended prediction as the card. Click a past game for its scoreboard (final score, line), the same prediction card with Right/Wrong and Covered/Missed, the real 📋 box score and the Tale of the tape as of kickoff. Week 1 has no stats yet, so no picks. Changing ⚙ Settings re-scores the season.
- **◆ Archetype map:** the header button opens a side panel listing all 53 archetypes by group (whole team, offense, defense, ball security & details). It marks which of the two teams has each one, shows which teams across the league have it right now, and has filters for all, this matchup, or active now. Hover a row for its history.
- **Team colors and logos:** each matchup uses the two teams' own colors (from nflverse), adjusted so they stay readable in light and dark mode and don't clash with each other. Logos load from ESPN, so they need an internet connection; without one the page just shows the team codes.
- **Scoreboard:** every game gets the same header. Upcoming games show Virtual Measurement's **predicted score** (in italics under PREDICTED), with the predicted winner glowing green. Finished games show the **final score**. Each side shows the team, record, QB and head coach; click a team for its player stats. The middle has the date, line, O/U and venue.
- **🔮 Prediction card:** the same card for every game. It blends two reads, 20% / 80%: **similar matchups** (past games where both teams looked like these two: who won and the average score) and **points** (each offense's points per game against the other defense's points allowed, pulled 30% toward average, plus home field). In a before-kickoff backtest of 806 games from 2023–25 (run with the original default stats, big plays off), points alone picked 62.7% of winners, similar matchups alone 58.8%, and the blend 62.2%; none beat the Vegas spread. Rows: **Winner** (with win chance), **Spread** (the side the predicted score beats the line for) and **Total** (over/under vs the predicted total). **Confidence** comes from the win chance: 🟢 high at 70%+ (right about 80% of the time in the backtest), 🟡 medium at 58–70%, ⚪ toss-up under 58%. Hover it for both reads. Upcoming picks say "upcoming"; finished games get ✓/✗ pills.
- **Matchup strip:** mirrored rows under the header, label in the middle and each team's number on its own side: 📋 **Faced**, ✅ **Beat**, 🔮 **Ahead** (combined current records with a rank of 32; Ahead is labeled Brutal / Tough / Average / Soft / Cupcake), 🆚 **Last 5 meetings** (head-to-head record, results go back to 2021; hover for the games) and 🧬 **Closest match** (the past team that looked most like each side; click for its 20 closest look-alikes).
- **The board:** under the header, both teams side by side in matching rows: Team (context + whole-team archetypes), 🗯 Hot takes, Offense ◆ style, Defense ◆ style and Details (ball security, flags, kicking). Each side shows only its own chips, starting next to the middle: Team = QB · coach · form · last year; hot takes = QB · coach · team · vibes; the archetype rows show the archetypes that team has. Stat ranks live in the Tale of the tape. Labels are one or two words; hover any of them for the full story. ⚔ counters sit underneath.
- **📋 Box score (finished games):** the real box score from nflverse. Team stats mirrored (first downs, total, passing and rushing yards, yards per play, sacks, turnovers, penalties, plays; the better number of each pair is green), then each team's passing, rushing, receiving, defense, kicking, punting and returns, the top few players each with "Show all" for the rest. Click a player's name for his career stats in a pop-up, opened on that table's tab (ctrl-click opens the Players page instead). Built by `build_box.js` into `app/boxscores.js` (this season only, about 3 KB a game) on every Refresh, and loaded the first time you open a finished game. nflverse posts a week's player stats a day or two after the games, so the newest games say "not published yet" until then.
- **Tale of the tape:** every stat side by side, each number colored by its league rank (green = good, red = bad) with the rank next to it, a stat-tag tier chip next to each value (Elite = 1–3, Great 4–5, Good 6–10, Average 11–22, Bad 23–29, Bottom 3 = 30–32; hover for the exact rank) a 🥇 for anything a team leads the league in and a 💩 for dead last. Click a section header to fold it.

### Standings page
All 8 divisions with W-L-T, win %, points for/against, differential, home/away/division/conference records and current streak. Seeds 1–7 per conference are marked (division leaders first, then 3 wild cards) using simplified tiebreakers: win %, then division record, conference record and point differential. Early in the season these can differ from the NFL's official order. Click a team to open its player stats.

### Players page
Player season stats from nflverse (regular season), with NFL headshots, ESPN-style.
- **Categories:** Passing, Rushing, Receiving, Defense, Kicking, Punting, Returns and Fantasy (PPR). Each is one table of every relevant player, with all its stats as columns.
- **Sorting:** click any column header to sort by it, and click again to flip the order. Hover a header for what the abbreviation means.
- **Filters:** team (All teams or one team's roster), position, name search, and **Qualified players only** for categories with rate stats. Qualified uses NFL-style minimums per team game: 14 pass attempts, 6.25 carries, 1.875 receptions, 1 field goal attempt or 3.125 punts. Click a team in the table to filter to it; `players.html?team=KC` opens a team directly.
- **Career stats:** click a player's name for every regular season they've played since 1999: season, team (with logo) and the same stat columns as the main tables, with tabs for each category they have stats in (it opens on the tab you're viewing, or the one that fits their position) and a **Career** totals row at the bottom. Above the table is the list of teams they've played for, with years. A mid-season trade shows both teams that season (hover for games with each). Close with ×, Esc or a click outside. Career totals add up the counting stats; CPOE is weighted by attempts and target share has no career value. The pop-up is shared with the Matchups box score and the Charts page (`app/career.js`, which also holds the stat columns). The career data lives in `app/careers.js` (about 400 KB, only players on the current season's list) and loads the first time you click a player.

### Charts page
Scatter plots for receivers, quarterbacks, running backs, defenders and teams, built from four free sources: nflverse player stats (EPA, target share, air yards, WOPR, RACR…), NFL Next Gen Stats (separation, time to throw, rush yards over expected…), Pro Football Reference advanced stats (drops, broken tackles, yards before and after contact, bad throws, pressures, and the defender stats: passer rating allowed, pressures, missed tackles) and snap counts. This season (season to date or any single week) and last season.
- **23 presets**, e.g. QB EPA per dropback vs CPOE, receiver separation vs targets per snap (the free stand-in for targets per route run), WOPR vs fantasy points, RB yards before vs after contact, DB passer rating allowed vs targets, pass rusher pressures vs sacks, and team offense vs defense EPA. Or pick any two of about 100 stats for X and Y.
- **Reversed axes:** for lower-is-better stats (passer rating allowed, defense EPA allowed, points allowed…) the axis is reversed, so up and to the right is always better, and the corner labels say good/bad.
- Dots are team colors with player names (a name that would overlap is left off; hover any dot for the numbers, click a player for career stats, in the same pop-up as the Players page). Dashed lines are the average of what's shown, the gray line is the trend.
- **Filters:** season, week, position group (WR/TE/RB, or DB/LB/DL for defenders), minimum volume (targets, dropbacks, carries or snaps) and a highlighted team (defaults to your ⭐ team).
- **⬇ Save image** downloads the current chart as a sharp PNG (2000 px wide) with the title, subtitle, data credit and a Virtual Measurement footer, ready to post. It's built in the browser with no libraries; the dots are plain team colors, so nothing from another site blocks saving.
- What the free data can't do: routes run (true targets per route run), coverage grades and PFF-style grades are paid data.
- Built by `build_charts.js` into `app/chartdata.js` (about 1 MB, loaded only on the Charts page) on every Refresh.

### 📺 Stat ticker
A TV-style ticker scrolls along the bottom of every page with the week's stat leaders: passing, rushing and receiving yards, total touchdowns, sacks, tackles, interceptions and fantasy points, top 3 in each. Click an item for the Leaders page. Hovering pauses it, and so does the ❚❚ button. It keeps its place when you go to another page.
- **🚨 Breaking news:** two joke headlines ride along on each loop, and a new pair comes up every 10 minutes. Some are written from the week's real stats (a 200-yard receiver, a five-sack beating, a blowout), and the rest roast each team, starting QB and head coach. Headlines about a QB or coach only run while they still hold the job. They're all in `breaking.js`: add your own there, and keep them about football.
- **Which week it shows:** the newest week with Sunday games in the stats. After Thursday's game it still shows last week. Once Sunday's stats are in it moves to the current week ("This week · 13 of 14 games"), Monday's game completes that week, and it stays up as "Last week · Final" until the next Sunday. nflverse posts stats a little after the games, so the switch happens when they arrive.
- **Turning it off:** the ✕ on the ticker, the 👤 menu or the switch on the Leaders page. The choice is saved on your profile (signed out, in your browser).
- **🔴 Live:** while games are on, the ticker turns red and leads with live scores, game clocks and the week's top passing, rushing and receiving yards so far. It updates about every 30 seconds. The live numbers come from ESPN's public scoreboard feed (`live.js`), which isn't an official API: if it ever stops working, the ticker simply goes back to the weekly leaders.

### 🎯 Pick'em page
Pick every game of the week against the spread (in the nav's 🏈 Play group, next to Ultimate Team). It opens on the week with the next kickoff; ◀ ▶ go back to earlier weeks.
- **Picks:** click a team, then 🔒 **Lock in**. A right pick pays 100 points for free, plus 50 🪙 coins for the current Ultimate Team season (`seasonCoins` in `ultimate_api.js`; nothing when no season is on). **Locking in is final:** no changes or take-backs.
- **Stakes:** type any number of points to stake on the pick before you lock in (or leave it empty). The stake comes off your balance right away, so nobody can go below zero. A win pays it back doubled, a push gives it back, and a loss keeps it.
- **Lines:** the spread in the schedule when you lock in is the one that counts. Games with no line yet can't be picked.
- **Seeing other picks:** once you've locked in a game, you see everyone's picks on it ("2 on KC · 1 on BUF"). Everyone sees them at kickoff, when all picks lock. Live scores show during games (the ticker's feed). Picks are paid out from the final scores in the schedule, so a game settles with the next data refresh (automatic during the season).
- **Standings:** the season's W-L-P and the points everyone has won from picks: free wins plus stakes won, minus stakes lost.
- Achievements: first pick, 25 and 100 right picks, winning a 250-point stake, and a hidden one for a perfect week (8+ picks, all right).
- Server side: `pickem.js`. Each profile keeps its picks in a `pickem` section by season; routes `GET /api/pickem?pid=&week=` and `POST /api/pickem/<id>/pick {game, team, stake}`.

### Leaders page
Every week's stat leaders this season, opening on the same week as the ticker (◀ ▶ or the menu for any other week). 19 categories across offense, defense, special teams and fantasy, top 5 in each with "Show top 10". Ties share a rank. Click a player for their career stats. While games are on, a **Live now** section shows the scores. Built by `build_leaders.js` into `app/leaders.js` and `app/ticker-data.js` on every refresh.

### Super Bowl page
A just-for-fun playoff simulator. Press **🏈 Simulate the season** and it plays out every remaining regular-season game, seeds both conferences (division winners 1–4, three wild cards), and runs the playoffs, showing the full bracket with scores and the champion instantly. Each team's score comes from its offense (points per game) against the other team's defense (points allowed per game), both pulled toward the league average since early-season numbers run hot, plus a small home-field edge and plenty of randomness, so every press is a new season and upsets happen. Scores are broken into touchdowns and field goals credited to real players by their season stats (lead backs score rushing TDs most often, the starting QB throws to receivers weighted by TDs and targets, the kicker kicks the FGs). About 1 TD in 15 is a pick-six, fumble return or return TD, credited to real defenders and return men, and some TDs come with a failed extra point or a 2-point try. The plays are ordered so the game reads like real football (no late field goals when a team needs a touchdown, overtime games end on a walk-off field goal), with quarters, a game clock, 🏁 game-winning drives and 10+ point comebacks called out. Hover any bracket game for its scoring summary; the Super Bowl shows a full scoring summary and an MVP under the champion. The page keeps a tally of your simulated champions.
- **📦 Box scores:** click any bracket game (or the button under the champion) for passing, rushing, receiving (with each player's longest play), kicking and defense lines that agree with the scoring plays, built from each player's season rates. Every TD keeps its yards and they're part of that player's line, so a long TD always shows up in his yards and his long.
- **🏥 Real injuries:** the weekly NFL injury report (nflverse) decides who plays. Out players miss this week and then a recovery time drawn from typical timelines for that injury (hamstring 1–4 games, ankle 1–5, knee 1–6, concussion 1–2, ACL/Achilles usually the season), minus the games already missed. Questionable, Doubtful and players practicing again get a chance to play based on status and practice participation. Players off the report who missed their team's last two games (often injured reserve) are out a few more weeks. Return weeks are rolled fresh every sim, an injured QB1 takes his job back when healthy (Lamar over Huntley), and the champion's page lists key players who started hurt and when they came back.
- **🚑 Injuries** (checkbox): after every game, a team's starting QB (1.2%) or top playmaker (1.5%) can be lost for the season. The backup steps in, the offense loses points, and an injury report appears under the champion.
- **🗯 Callouts:** hot-take chips when a sim lands on a meme: "Regular season merchant strikes again", "Chargered", "Always the bridesmaid", "Nick Foles energy" (won with a backup QB), "Wild card champs", and more.
- **🍿 Suspense mode** (checkbox): the Super Bowl plays out one score at a time with a live scoreboard; the winner stays hidden until the end (or ⏭ Skip).
- **📊 Simulate 1,000 seasons:** runs the sim 1,000 times in about a second: playoff, reach and win % for every team next to the title-odds estimate, plus fun facts (most common Super Bowl, wild-card champions, biggest blowout, January heartbreak). Doesn't count toward the tally.

- **🌦️ Weather & venue:** playoff games are at the higher seed's stadium in January, with weather drawn from each city's typical January (domes are 72° indoors). Snow, rain, wind and cold take points off both offenses and favor the run; dome and warm-weather teams take an extra hit visiting the cold. Each bracket game shows its weather; callouts like "Snow globe game" and "Dome-dependent" react to it.
- **🎯 Pick your bracket** (checkbox): pick every playoff winner round by round; each round plays out when you lock in, with ✅/❌ marks and a score tracked for the session.
- **🔁 Run it back:** replay the Super Bowl with the same two teams; the page keeps a series score (the season's champion doesn't change).
- **🏅 Season awards:** MVP, Offensive and Defensive Player, Coach of the Year and Flop of the Year, from stats so far plus a cooled-off rest-of-season pace and the simulated records. The 1,000-season run shows who wins MVP most.

The checkboxes are remembered in your browser.

Above the bracket are the Super Bowl and conference favorites, and below it the top 5 in each conference (playoffs, reach the Super Bowl, win it), from the Virtual Measurement estimate. Reaching the Super Bowl blends record (50%), stat look-alikes (30%) and archetypes (20%), nudged by ⚔ counters. Winning it is reach × the chance to win that one game (close to a coin flip, tilted by point margin vs the likely opponent), so the two always agree. Everything is scaled so the league adds up (14 playoff teams, 2 Super Bowl teams, 100% for the title). Backtested on 2008–2025: after 10 games the eventual champion ranked about 5th on average with about 8% odds (a blind guess is 3%). The full method is written out at the bottom of the page.

### 17-0 page
Can you draft a team that goes 17-0? It works like 82-0: every pick rolls a random franchise and five-year era (1999–04, 2005–09, 2010–14, 2015–19, 2020–25), e.g. "2005–09 Colts", and you fill one open spot with one of that team's player-seasons from those years. **Eleven picks:** QB, RB, 2 WR, TE, O-line, 2 pass rushers, LB and 2 DBs. The O-line is a team-season unit, since player stats can't rate linemen; it's graded on sack rate allowed, yards per carry and rushing EPA. Spots the roll can fill are highlighted; picks are final; one season per player.
- **Grades (1–99):** how good that season was compared with every full-time season at the position since 1999. (nflverse has no targets for 2003–08, so receivers from those years qualify on catches instead: 35 for a WR, 25 for a TE.) Each season is compared within its own year first, so eras are fair. QBs are graded by EPA per game; receivers and backs by yards, TDs and EPA; defenders by sacks, TFL, takeaways and passes defended.
- **Salary cap:** a season costs more the better it was, and QBs, O-lines and pass rushers cost the most. Rookie $170M, Pro $145M, All-Madden $130M. **Cap twists:** two free rerolls per draft, then each reroll costs $5M of cap as dead money. Every pick must leave $0.5M for each other open spot so the draft can always be finished. ⏭ Finish ends the draft early, and open spots play like backups (grade 25).
- **Ratings and odds:** grades roll up into an offense grade (QB 36%, O-line 22%, receivers 24%, RB 10%, TE 8%) and a defense grade (pass rush 50%, secondary 32%, linebacker 18%), then into points scored and allowed per game. You take over a real franchise's schedule this season; each game's win chance uses your ratings against that opponent's current offense and defense, with home field and normal randomness. The odds meter updates live. In testing, a sensible drafter's median chance at 17-0 was about 30% on Rookie, 11% on Pro and 4% on All-Madden.
- **Ties:** like the real NFL, a regular-season overtime can end tied (about 1 in 12 overtime games). A tie ruins 17-0 just like a loss: 16-0-1 is "undefeated, not perfect". Playoff games always have a winner.
- **Play the season** for game-by-game results, the playoffs (as the 1 seed with 13+ wins) and your weakest links. **Play 1,000 seasons** for your 17-0 and title odds and your nemesis. Your roster is remembered in your browser.

### Profiles, achievements and points
The 👤 button at the top right of every page signs you in, switches profile or creates a new one (any name, 1–24 characters). Profiles live on the **server machine** in the `testnfl profiles` folder next to the app folder (e.g. `VirtualM\testnfl profiles` beside `VirtualM\testnfl`), one JSON file each (`<id>.json`). They sit outside the app folder, so copying a new version of the app over the old one keeps them. Back that folder up to keep everyone's progress. If the folder needs to be somewhere else, set `VM_PROFILES` to its path before starting the server.
- **🔑 PINs:** every profile has a PIN: 4 digits and 1 letter in any order, like `4821K` (not case-sensitive). You need it to create a profile and to sign in. A profile made before PINs existed shows "(no PIN)" and gets one the first time someone signs in to it, so sign in to yours first. It's only stored as a salted hash. After 8 wrong PINs a profile is locked for 10 minutes. Signing in gives that browser a token (up to 10 browsers at once); every change to a profile (points, packs, games, settings) needs it. Forgot a PIN? Delete the `"pin"` and `"tokens"` entries from that profile's JSON file and sign in again to set a new one.
- **⚙ Settings follow the profile:** the ⭐ favorite team, the matchup page's ⚙ Settings and your last Ultimate Team game plan are saved in the profile's `prefs`.
- **Achievements:** 48 of them across Getting started, Stats, the Super Bowl sim, 17-0, Ultimate Team and Pick'em, a few of them hidden. The 🏆 Achievements page shows your progress bars, points history and a leaderboard. The list is in `app/achievements.js`, and the server decides what unlocks.
- **Points:** bronze 75, silver 225, gold 600, platinum 1,500, legendary 4,500 (tripled in November 2026: anyone who'd already unlocked one got the difference, as an "Achievement bonus" in their ledger). Every change goes in the profile's ledger, and the leaderboard ranks by points earned, so spending doesn't lower anyone's rank. Points buy packs in Ultimate Team and back pick'em stakes. Card sales and stakes coming back are marked in the ledger and don't count as earned.
- **🐣 Rookie boost:** game, daily, bot, season and pick'em points pay double until a profile has earned 5,000 points, so newcomers can catch up. New players also get a free Rookie bundle in Ultimate Team.
- **For page code:** `VM.count(key)`, `VM.add(set, item)`, `VM.unlock(key)`, `VM.balance()`, `await VM.spend(amount, reason)` (refuses if the balance is too low), `VM.pref(key)` / `VM.setPref(key, value)` for per-profile settings (a `vm:prefs` event fires when they change, `vm:profile` on sign-in and sign-out) and `VM.headers()` for your own requests. Server routes: `GET/POST /api/profiles`, `GET /api/profiles/<id>`, `POST /api/profiles/<id>/<login|logout|track|spend|prefs>`.
- Achievements need the server (`start.bat`). When a page is opened as a file, nothing is tracked.

### Ultimate Team page
Collect player cards, build a team, queue it up and let someone challenge it. Needs a profile and the server. Everything here is Ultimate Team only: the 17-0 page and its player pool don't change.
- **Cards:** every player-season and O-line from the 17-0 pool, with the same 1–99 grade, plus Ultimate Team-only cards: 🧢 head coaches, 🏟️ stadiums and the full rosters of the legendary-team collections. Old cards show the team as it was then (1999 STL, not LA). Rarity goes by grade: Common under 60, Rare 60–79, Epic 80–89, Legendary 90–98 and **🌈 Mythic 99**, the best seasons ever (about 100 cards, 2007 Brady, 2021 Kupp, 2022 Mahomes…). Every rarity has its own card design, and cards tilt toward your pointer. **Mythic cards are full art:** the player fills the whole card over a moving aurora, with holographic foil that follows your pointer and an animated rainbow edge. The design sizes itself from the card's width, so the same card works in a pack reveal and in a phone's lineup.
- **📸 Photos:** player cards show a headshot cropped to the face. The page tries ESPN first (it has photos of many retired players), then NFL.com, then the team logo; coaches, stadiums and O-lines show the team logo. A few older role players have neither photo and show NFL.com's silhouette. The photos load from ESPN and NFL.com as you scroll (about 20–40 KB each), so they need an internet connection. The ids come from nflverse (`heads` in `app/perfect.js`, "espnId|nfl"); cards opened before photos existed get theirs automatically.
- **🧢 Coaches** (one card per coach-team-season since 1999, graded on win %, point differential and playoff wins within that season) add up to ±1.5 points a game on each side of the ball and make your game plan's edges bigger and its weak spots smaller (×0.75 for a grade-1 coach up to ×1.25 for a 99). No coach plays like a 40.
- **🏟️ Stadiums** (one card per stadium and home team with 3+ seasons there, graded on how much better that team did at home than on the road, plus a bump for cold outdoor places) set your home field when you host: 1.5 points with no stadium up to 3.5 for a 99, and the weather. Outdoor stadiums roll weather around their typical December temperature (snow at 34° or colder sometimes, rain, wind, frozen), which takes points off and favors the run; domes are 72° and slightly help passing.
- **Packs:**
  - Free starter pack, once: one card for every spot (coach and stadium included).
  - Free 🐣 Rookie bundle, once, for players who've earned under 5,000 points: two Premium packs (10 cards).
  - Free 🧢 Staff pack, once: a coach and a stadium (for teams that opened their starter pack before staff cards existed).
  - Standard: 100 points, 5 cards (Mythic 0.05% a card).
  - Premium: 300 points, 5 cards, at least one Epic (Mythic 0.15% a card).
  - Legend: 1,000 points, 3 cards, at least one Legendary (Mythic 0.3% a card, about 1 Legend pack in 60 has one).

  Positions come up as often as they appear in the lineup. The server opens the packs, so refreshing can't reroll them. Duplicates and spare cards sell back for 2, 6, 20, 60 or 250 points by rarity.
- **♻️ Trade-ups** (in 🗂 Cards): 5 Commons for a random Rare, 5 Rares for an Epic, 5 Epics for a Legendary. Never into Mythic. The page picks the 5 you'll miss least (extra copies first, then cards no unfinished collection needs, lowest grades first) and shows them before you confirm. Cards in your lineup and collection editions can't be traded.
- **🏆 Collections:** 45 legendary teams: every Super Bowl champion since 1999 plus famous teams that didn't win it all (Greatest Show on Turf, 2007 Patriots, 2013 Broncos, Legion of Boom, 2018 Chiefs…), 8 cards each: the star, the coach, the best players and the O-line. Each has a team pack (500 points, 5 cards): one guaranteed card from that team (any of its 8, so repeats happen) plus 4 random cards at Standard pack odds. The team cards also turn up in normal packs. Turn a full set in **once** for 2,000 points and a **Mythic 99 edition** of the team's star (e.g. "2007 Patriots edition" Randy Moss), which you can't get any other way. Sets never ask for a Mythic: a 99 in a set (2022 Mahomes, 1999 Warner, 2007 Belichick…) is needed as its Legendary **set card** (graded 95, from the team pack); the real 99 counts too, but set cards are used first so you keep it. Turning in uses up one copy of each card; a card in your lineup can't be used (swap it out or get a second copy). The Collections tab filters by in progress / not started / turned in, and each team's cards fold away. The hand-picked list is `LEGENDS` in `build_perfect.js`; champions are added from the schedule automatically.
- **🎁 Game cards:** every game against another player gives both sides a card (no daily limit). Win: Common 62%, Rare 28%, Epic 8.5%, Legendary 1.4%, Mythic 0.1%. Loss: 72 / 23 / 4.5 / 0.45 / 0.05%. The host's card shows in their replay. Bot games don't give cards.
- **Points:** claim 300 free points once a day (by the server's date). Every game pays +50 for a win and +15 for a loss.
- **Team:** the lineup screen is a field: the defense on top (two DBs deep, the linebacker, two edge rushers on the line), the line of scrimmage, then the offense (WRs split wide, O-line and TE on the line, the QB under center and the RB behind him), with the coach and stadium on the sideline. The 11 players are needed to play; the coach and stadium are optional. The team name and a 2–4 letter abbreviation are saved on the profile and shown on the scoreboard and box score. Overall, offense and defense use 17-0's weights and points formula. ⚡ Best lineup fills each spot with your best card, one card per player.
- **📋 Game plans:** before you queue, challenge or play a bot you pick an offense, a defense and a tempo. Your last plan is remembered. A queued team's plan stays secret, so the challenger picks blind. Bots pick at random.
  - Offense: ⚖️ Balanced, 🐂 Ground & pound, ✈️ Air raid, ⏱️ Quick game, 🏹 Shot plays. Defense: 🛡️ Base, ⚡ Blitz, 🧱 Stack the box, 🕸️ Cover 2 zone, 🔒 Press man. Tempo: 🏈 Normal, 💨 Hurry-up, 🐢 Clock killer.
  - Counters (points for the offense): run +1.5 vs blitz, −3 vs box, +2.5 vs zone, +1 vs man; air raid −1.5 / +2.5 / −1 / +0.5; quick game +3 / +0.5 / −1.5 / −2.5; shot plays −2.5 / +2.5 / −3 / +2. Balanced on either side has no edge and no weak spot.
  - Fit: about ±1.5 points when your cards suit the plan (run: RB and O-line; air raid: QB and WRs; quick: QB, TE, WR2; shots: QB and WR1; blitz and box: pass rushers and LB; zone: DBs and LB; man: DBs).
  - Tempo: hurry-up adds a point and a bigger swing to both teams' scoring, clock killer takes 1.2 off and shrinks the swing; hurry-up with quick or air-raid passing, and clock killer with the run, are worth +0.8. Shot plays and the blitz make games swingier.
  - Plans move the stat lines too (more carries for the run, more and shorter completions for the quick game, sacks against the blitz, fewer yards a catch against zone…). The game page shows both plans and the weather at kickoff and "How the game plans played out" at the end.
- **⚔ Competitive:** a second lineup (the 🃏 Lineup tab's "Competitive lineup") for double-point games against other players. It's just the eleven players, with no coach or stadium. Each card costs budget by rarity (Common 0, Rare 1, Epic 2, Legendary 4, Mythic 6), the total has to fit in 24, and there's at most one Mythic. So you decide where the stars go: one Mythic, three Legendaries and Rares around them, or a team of Epics. ⚡ Best lineup builds the strongest one that fits. Tick "⚔ Competitive" when you queue up; whoever challenges a ⚔ team plays their own competitive lineup, and both teams get double points. Cards in either lineup can't be sold, traded up or turned in.
- **Challenges:**
  - 📣 Queue up your team. Its lineup and game plan are frozen as they are then, and you get one open game at a time.
  - **⚖️ Balanced game** (checkbox next to Queue up): no game plans for either side. You skip the plan screen, your team is marked ⚖️ Balanced on the queue, and whoever challenges it goes straight to kickoff too. Results and replays show the ⚖️ mark. The checkbox is remembered on your profile.
  - Anyone else can ⚔ Challenge it. Each row shows their chances from both ratings (not the plans, which are secret).
  - The server plays the game right then. The host gets home field (their stadium), the same SD 9.5 as 17-0, and overtime ends on a field goal.
  - The challenger watches it 🍿 live, one scoring play at a time like the Super Bowl's suspense mode, then sees the box score.
  - The host gets a "challenged your team" banner and watches the replay. Their record and points leave that game out until they've watched it, so nothing spoils it.
- **🤖 Bots:** Rookie (45 overall, about what a starter pack makes), Easy (70), Medium (85) and Hard (95–99).
  - Each game draws a new bot team from real player-seasons near that overall, with a random game plan. You host.
  - A win pays a flat amount by bot: Rookie 10, Easy 20, Medium 30, Hall of Famers 50 (`UT.BOTS[level].pay`; points in permanent mode, doubled for rookies, coins in seasonal mode). No limit: play as many as you like. Losses pay nothing.
  - Bot games keep their own record, apart from the player record and leaderboards.
- **🎮 Live bot games** ("🎮 Live" on each bot; "▶ Sim" still goes straight to the result). A win pays double (Hall of Famers: 100), and in seasonal mode double the coins and XP.
  - The game stops at 5 key moments, 3 with your ball and 2 with theirs: 1st & goal in the red zone, 4th & 2 at midfield (or punt it), a goal-line stand, 3rd & 7, and at the end of the 4th a two-minute drill if you're behind or tied, or their last drive if you're ahead.
  - You pick a play (🐂 run, ✈️ air raid, ⏱️ quick game, 🏹 shot play) or a defense (⚡ blitz, 🧱 stack the box, 🕸️ Cover 2, 🔒 press man). The bot's call is hidden. They meet like the game plans do (`UT.VS`), with your cards for that call against theirs and the coach making the edges bigger (`UT.callOdds`). Each button shows what it beats and loses to, your cards' fit, and your chance against a random call.
  - 🔎 **Pre-snap read:** before you choose, you see what the bot's call looks like ("Eight in the box", "Four wide, shotgun"…). The read is right about 60–88% of the time: your QB reads the defense, your linebacker reads the offense, and a better grade reads it better (`UT.readOdds`). When it's wrong it shows another call's look. The recap says which reads were right.
  - The result plays out (a TD, a field goal, a stop, a turnover), and the scoring up to the next moment appears play by play. The rest of the game is a normal sim at 55% of the usual scoring, with the decided plays merged in at their times, so the box score still adds up. A tie at the end goes to an overtime field goal.
  - The server keeps the game (`ut.live` / `sea.live`) and settles each call once, so refreshing can't change a result. Close it and resume from the 🤖 Bots tab, or ⏭ Sim the rest on random calls. The final shows every call you made.
- **📅 Schedule:** once a day (by the server's date), your lineup takes over a real team's schedule this season, using the same opponents, playoff path and ties as the 17-0 page. Your coach counts, and your stadium's home field counts in home games (game plans don't apply).
  - Pays 100 points for playing, 200 for the playoffs (10+ wins), 300 for winning the Super Bowl, and a secret 1,000 for a perfect season.
  - The page reveals the weeks one at a time and keeps the points back until the end. Your last 20 seasons are saved.
- **🏅 Leaders:**
  - Record against other players (with 💍 rings from schedule runs) and best lineup by overall.
  - Every 👑 Legendary and 🌈 Mythic card (from packs, games and collections), with who got it, when and how, plus a count of who has one.
  - Legendaries opened before the log existed are added once, marked "before the log started".
  - Your own record row leaves out games you haven't watched yet.
- **🗓️ Seasonal mode:** the switch above the page ("🃏 Permanent | 🗓️ Seasonal") flips to a two-week season where everyone starts from nothing. Season 1 started Sunday, November 22, 2026 at midnight Eastern (ending December 6); a new one starts every 14 days.
  - A season has its own cards, lineup, record and 🪙 coins (not points): the same free starter pack for everyone, 500 coins to start, 200 free a day, +60 a win and +20 a loss against players, bot wins pay coins, and every right 🎯 Pick'em pick adds 50 (an edge for good pickers). The only pack is the Season pack (100 coins, Standard pack odds). Cards sell for coins. No trade-ups, collections, competitive lineups or schedule runs; the team name is shared.
  - Seasonal games have their own queue and results: a seasonal team can only be challenged from seasonal mode, and game cards go to your season collection.
  - ✨ XP: 100 a win and 40 a loss against players, 40 / 15 against bots, and your first 3 games each day count double. XP fills a milestone track whose rewards are **permanent** (your points and main collection): 500 points (250 XP), a Premium pack (600), 1,000 points (1,000), a Legend pack (1,500), 2,000 points (2,100), a "Season N Veteran" title (2,800), 2 Legend packs (3,600) and that season's 🌈 Mythic (4,500), a season-stamped 99 edition of a star.
  - 🏆 The best record against players when the season ends wins it (wins minus losses, then wins, then point differential, then XP; no minimum number of games, but at least one game against a player). The champion gets a second season Mythic, a "Season N Champion" title and the Season Champion achievement. Everyone who played gets their final rank in their profile's history.
  - The 🗓️ Season tab shows the track, both Mythics (each season's two are the same for everyone, picked from 95+ stars), the standings, the time left and last season's final.
  - 📋 **The season plan** (`SEASONS` in `app/ultimate.js`). Every season has a name, and the seasonal tab shows its rules:
    | # | Dates | Name | Special rule | Reward Mythics (track / champion) |
    |---|---|---|---|---|
    | 1 | Nov 22 – Dec 6 | 🏈 Opening Drive | none | Lamar Jackson 2019 / Marshall Faulk 2000 |
    | 2 | Dec 6 – Dec 20 | 🌈 Mythic Madness | every pack card is a Mythic 99 | 👑 Jerry Rice 1995 / Joe Montana 1989 |
    | 3 | Dec 20 – Jan 3 | ⚔ The Gauntlet | competitive lineups only, for every game | 👑 Reggie White 1987 / Lawrence Taylor 1986 |
    | 4 | Jan 3 – Jan 17 | 📼 Throwback | only 1999–2009 cards in packs | 👑 Walter Payton 1977 / Dan Marino 1984 |
    | 5 | Jan 17 – Jan 31 | 📺 Prime Time | only the newest season's cards (2025) | 👑 Barry Sanders 1997 / Deion Sanders 1994 |
    | 6 | Jan 31 – Feb 14 | 🏆 The Big Game | Super Bowl teams' players come out of packs twice as often | the two Super Bowl QBs, as 99s |
    Later seasons get names from a list (Two-Minute Warning, Hail Mary…) and more 👑 Legends (Emmitt Smith, Steve Young, Jim Brown, Ronnie Lott, Kellen Winslow, Shula, Lombardi, Walsh). 👑 Legends are all-time greats from before the data starts (1999), with their best season's real line, and only come as season rewards. The Super Bowl season reads the game from the schedule once it's set: the AFC/NFC champions' starting QBs (or each team's last starter until it's played) become the Mythics, and until then stand-ins are shown.
  - From Season 2: only the first 5 bot wins a day pay coins (every game still earns XP), and 📅 Schedule runs come to seasonal mode (half the points as coins, a quarter as XP).
  - 🏪 / 🤝 Seasonal market and trades: the same as permanent, but for this season's cards and coins (Epic and up on the market). Ask for a season card from a player's profile. Listings and open trades end with the season.
  - A season is wrapped up the first time anyone opens Ultimate Team after it ends (`finalizeSeasons`); last season's queued teams are dropped. `VM_SEASON_EPOCH` (milliseconds) moves the calendar for testing.
- **Nothing resets:** fields added later (bots, seasons, titles, staff, collections) fill in the first time an older profile is used. Cards, lineups, records, points and history stay as they are.
- **Box score:** built around the scoring plays (the Super Bowl sim's scoring and game-flow code) from each card's grade and season line and both game plans:
  - Passing, rushing and receiving (with each player's longest play), defense (tackles, sacks, INT, FF, TD) and kicking.
  - Team stats: first downs, yards, sacks, turnovers, plays and time of possession.
  - Player of the game.

  It always adds up: every TD keeps its yards and they're part of that player's line (an 80-yard TD run means 80+ rushing yards and an 80-yard long), passing yards are the sum of the catches, TD passes match TD catches, total yards are passing plus rushing, and a pick-six is on the defender's line.
- **🤝 Trade offers** (permanent collection only; the 🤝 Market tab, with a count of the trades waiting on you):
  - Ask for a card: in 🏆 Collections, a card you're missing shows "🤝 Ham has it" when another player owns it; on anyone's profile, each card in their collection has "🤝 Ask for it". You can add a points offer.
  - The owner can take the points (a straight sale), or pick up to 5 of your cards (not ones in your lineups) plus any points they want for it, or decline. You then accept or decline their ask, or withdraw your request.
  - The trade checks everything when it goes through: both cards still owned and out of lineups, and the points there. Points from a trade or sale don't count as "earned" for the one receiving them.
- **🏪 Marketplace** (the 🤝 Market tab): list a Legendary or Mythic card (not in a lineup) for any price from its sell value up to 1,000,000 points, up to 10 at once. The card leaves your collection until it sells or you take it back. Anyone else can buy it right away. Sellers get a 📰 news line when a card sells or a trade goes through. Cards from trades and the market don't go in the pull log.
- **🔄 Card backs:** every card has a ↻ button (top right, on hover) that flips it. The back shows the game plans and live calls it powers and about how many points a game it adds to them (from its grade, against a 65 average; a receiver's depends on whether it plays WR1 or WR2), its full season line and what it sells for. A coach's back shows how much bigger it makes the edges, a stadium's its home-field points and weather.
- **Files:** the sim, cards, packs, game plans, competitive rules and collections are in `app/ultimate.js` (the card design is `app/cards.js` and `app/cards.css`), shared by the page and the server. The server side is `ultimate_api.js`. The coach, stadium, collection, extra cards, photo ids and logos are built into `app/perfect.js` (`staff`, `extra`, `collections`, `heads` and `logos`, which the 17-0 page ignores). The page's 10-second check for new games asks for `?lite` and skips the collections, logos and team list, which only change with a refresh. Each profile keeps its cards, lineup, team and record in a `ut` section, and the current season's in a `sea` section (plus `seasonHistory` and won `titles`). The queue and games live in the `ultimate` folder inside `testnfl profiles`: `queue.json`, `games.json` (the last 500 results) one file per game in `games`, `pulls.json` (the Legendary and Mythic log), `market.json` (listings, holding their cards), `trades.json` (trade offers) and `seasons.json` (each finished season's final standings). Each game is stored in full, so a replay is always the same game. Routes: `GET /api/ut[/<id>][?mode=season]`, `GET /api/ut/game/<id>`, `POST /api/ut/<id>/<team|daily|open|teampack|collect|tradeup|lineup|sell|queue|challenge|seen|bot|live|season|list|unlist|buy|trade|tradeact>` (`bot {live: true}` starts a live game, `live {call}` or `live {sim: true}` plays it) (any of them with `mode: 'season'` for seasonal mode).

### 👥 Profiles page
Your own page is "⭐ My profile" in the nav's 👤 You group (and the 👤 menu). Other players' pages open from their names: on the Ultimate Team queue, the leaderboards and the pull log (`profiles.html?id=ham`). Hovering a name shows a quick card: their title, team, points, records against players and bots, pick'em record and showcase.
- **The page:** their title, team, 🗓️ last season's rank (hover for every season), points earned, record against players and bots, pick'em record, cards (Mythics, Legendaries, collections turned in) and achievements.
- **⭐ Showcase:** five cards they're proudest of (their five best until they choose).
- **Collection:** every card they own, filterable by rarity and position, so you can see what everyone has.
- **On your own page:** ✏️ pick up to 5 cards for the showcase and a title. Titles are the names of the hard achievements (gold, platinum and legendary) you've unlocked, plus the ones won in seasonal mode (Season N Veteran, Season N Champion).
- The cards are drawn by `app/cards.js` and `app/cards.css`, shared with Ultimate Team. Routes: `POST /api/profiles/<id>/showcase {cards, title}`, `GET /api/ut/art` (team logos and colors for cards).

### Abbreviations
Every page explains its abbreviations: hover CPOE, EPA, aDOT, YAC, RYOE, O/U, ATS, PK, TFL, PFR, Pct, Diff and so on for a plain-English definition. The first one of each on a page has a dotted underline; everyday ones (TD, INT, FG, yards…) have the tooltip without the underline. Each Tale of the tape stat also explains itself on hover. The list lives in `app/glossary.js`; add to it there.

### Tags
- **Context tags (from the schedule data, 1999 on):** 👑 defending champs, 🏆 Super Bowl–winning QB or coach, 🆕 rookie QB, 🎖️ veteran QB (150+ starts), 🔄 more than one starting QB this season, 🧢 first-year coach, 🔥 / 🧊 win or loss streaks of 3+, 💯 undefeated, 🫥 winless, and last season's finish.
- **Stat tags:** each team's rank out of 32 in a stat: Top 3 = 1–3, Great = 4–5, Good = 6–10, Average = 11–22, Bad = 23–29, Bottom 3 = 30–32. Hover for the exact rank and value.
- **◆ Archetypes:** compound tags built from several stat ranks. There are 53 of them, e.g. 🏅 Contender, 🥇 Front-runner, 🤝 Two-way team, 🦾 Trench bullies, ⛓️ Drive machine, 🧠 Mistake-free, 💪 Juggernaut, 🎯 Points machine, ⚖️ Balanced attack, 🩺 Surgical passing, 🏹 Deep threat, 🚫 No-fly zone, 🧱 Brick wall, 🔒 Lockdown D, 🎢 Shootout team, 🪨 Rock fight, 🐯 Paper tiger, 🦅 Ball hawks, 🕳️ Offense in a ditch, 🚜 Tank watch and 🦵 Automatic kicker. In look-alike lists, archetypes a past team shares with the current team are filled in purple. Hover one to see how past teams that looked like this at the same point in the season turned out (playoff %, average wins, Super Bowls, famous examples).
- **🗯 Hot takes:** meaningless-but-fun Twitter discourse in each team's box, e.g. Josh Allen "Regular season merchant", Justin Herbert "IF-Man", Chargers "Chargering", Falcons "28–3". They follow the current starting QB and head coach, plus team memes and a few data-flavored ones (🚨 Fraud watch for a great record with a small point differential, 💓 Cardiac kids, 🪖 Tank commander, 💍 Ringless veteran). Dashed purple chips with short labels (Merchant, IF-Man, RB1, Ref's pet...), so nobody mistakes them for stats. Most QBs, coaches and teams have 2–4 takes and one is rolled at random each time the page loads; QB and coach chips name who they're about ("Vrabel: Best LB"). Edit the `HOT_TAKES` list in `app/index.html` to add your own.
- **⚔ Counters:** a unit-vs-unit edge between the two teams, e.g. *Pass O vs weak pass D* or *Elite run D vs elite run O*. Hover for how often the team holding that edge has won.

### Look-alike matching
Similarity is based on **stats, not tags**: each stat is turned into how far a team sits above or below that season's league average at the same point in the season, and "% alike" measures how close those numbers are. Tags and archetypes are labels on top of the same numbers, so two teams can be very alike yet wear different tags if one sits just inside a cutoff. Every team is compared against all teams in the same season after the same number of games, so early-season noise and different eras are handled fairly. By default look-alikes match on all 24 stats: points, yards, turnover margin, EPA per play, the big-play, sack and situational stats, and PFR pressure/blitz rates. Turn any of them off under ⚙ Settings (each group has all / none buttons); your picks are saved to your profile. The search covers every season since 1999. Pass-rush stats (pressure, pressure allowed, blitz rate) only exist from 2018, so earlier teams are matched on the remaining stats and marked **★**. Because they're compared on fewer stats, ★ teams match a little more easily and show up somewhat more often near the top.

## Rebuilding from the command line

**On a fresh copy** (cloned from GitHub), just start the server (`start.bat`, or `node server.js`): when there's no data yet it downloads every season and builds everything by itself, which takes a few minutes. The site works once the console says "Data ready."

The downloaded data (`data/`) and the page data built from it (`app/data.js`, `players.js`, `careers.js`, `chartdata.js`, `ngs.js`, `perfect.js`, `boxscores.js`, `leaders.js`, `ticker-data.js`) aren't in git (see `.gitignore`), so a fresh clone needs this once before the site works. The first `fetch.js` downloads every season and takes a few minutes. Profiles aren't in git either.

```bash
node fetch.js && node build.js && node build_app.js && node build_perfect.js && node build_charts.js && node build_box.js && node build_leaders.js
```

`fetch.js` downloads every season from 1999 to the current one into `data/raw/` (plus the injury report and Next Gen Stats); pass `node fetch.js 2026 2026` to fetch just one season. It also trusts the operating system's certificate store, which is needed on networks that inspect HTTPS traffic. Player stats (`stats_player_reg_*.csv` and the gzipped weekly `stats_player_week_*.csv.gz`, about 50 MB for all seasons) always cover 1999 to now for the career pages, but past seasons are only downloaded if they're missing, so **↻ Refresh data** re-fetches just the current season (and fills in any missing past season once).

## Hosting it online

To put the site on a VPS for you and friends, run the server with **`PUBLIC=1`** behind a reverse proxy that adds HTTPS. With `PUBLIC=1` the server answers every address (without it, anything outside the local network gets 403). Profiles need their 🔑 PIN to change anything. **↻ Refresh data** from outside the local network needs a signed-in profile and runs at most once every `REFRESH_MINUTES` (default 10). Behind a proxy on the same machine, the visitor's real address comes from `X-Forwarded-For`. A bad request can't crash the server; it's answered with an error and logged.

**Size:** the server idles at about 80 MB of memory, but a refresh peaks at about 600 MB (the Charts build), so get **1 GB of RAM** or more (or add a swap file). The data is about 150 MB on disk. Any Linux VPS with Node.js 22 or newer works.

**Setup on Ubuntu/Debian** (replace `vm.example.com` with your domain, pointed at the VPS with a DNS A record):
1. Install Node.js (from [nodesource](https://github.com/nodesource/distributions) or `nvm`) and [Caddy](https://caddyserver.com/docs/install) (which gets HTTPS certificates by itself).
2. Copy the `testnfl` folder and the `testnfl profiles` folder next to each other, e.g. `/opt/vm/testnfl` and `/opt/vm/testnfl profiles`.
3. A systemd service, `/etc/systemd/system/vm.service`, keeps the server running and restarts it after a crash or reboot:
   ```ini
   [Unit]
   Description=Virtual Measurement
   After=network.target

   [Service]
   WorkingDirectory=/opt/vm/testnfl
   ExecStart=/usr/bin/node server.js --no-open
   Environment=PUBLIC=1 HOST=127.0.0.1 PORT=8765
   Restart=always
   User=www-data

   [Install]
   WantedBy=multi-user.target
   ```
   Then `sudo chown -R www-data /opt/vm` and `sudo systemctl enable --now vm`. `HOST=127.0.0.1` means only Caddy can reach the server directly.
4. `/etc/caddy/Caddyfile`:
   ```
   vm.example.com {
       encode zstd gzip
       reverse_proxy 127.0.0.1:8765
   }
   ```
   Then `sudo systemctl reload caddy`. Caddy passes the visitor's address along in `X-Forwarded-For`, and `encode` compresses the pages (the matchup data is about 3 MB, under 1 MB compressed).
5. Open ports 80 and 443 in the VPS firewall (and keep 8765 closed).

Back up `testnfl profiles` now and then (a nightly `tar` from cron is enough). To update the app, copy the new `testnfl` folder over the old one and `sudo systemctl restart vm`; the profiles folder isn't touched.

## Output files (`data/`)

| File | Grain | What's in it |
|---|---|---|
| `games.csv` | 1 row per game | Scores, spread/total/moneyline, rest days, QBs, coaches, roof/surface/weather |
| `team_games.csv` | 1 row per team per game | Result, margin, ATS result, plus ~140 team box-score/EPA stats and `opp_*` stats allowed |
| `team_week_situation.csv` | 1 row per team after each regular-season game | **Situation table:** record, point diff, Pythagorean win %, streak, per-game stat rates up to that point, and the season's eventual outcome (`final_wins`, `rest_of_season_wins`, `made_playoffs`, `season_finish`) |
| `team_seasons.csv` | 1 row per team-season | Final record, point diff, playoff finish, previous season's wins/finish, and all regular-season totals (`reg_*`) |
| `team_postseason_stats.csv` | 1 row per playoff team-season | Postseason stat totals |

Notes:
- Seasons before 2021 have 16 regular-season games; from 2021 on there are 17.
- Outcome columns are blank for the current season until it finishes.
- `expected_margin` is the Vegas spread from the team's point of view (positive means favored).

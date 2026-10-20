The Living Machine

Open index.html in a browser (a widescreen window works best). No build step.

- game.js: simulation, data tables and save/load (no DOM). Floors, modules, sectors, techs and rules are all data at the top.
- ui.js, style.css, index.html: the whole game is one blueprint sheet. A 16:9 sheet is scaled to the window, and extra width up to 21:9 becomes permanent side panels. Click a room for its detail drawing.
- test.js: `node test.js` checks the simulation (resources stay in range, saves round-trip, mechanics behave).
- balance.js: `node balance.js` runs a scripted player and prints a pacing timeline.
- assets/: concept artwork from an earlier version. Not used by the page right now.

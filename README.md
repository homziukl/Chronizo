# ⟁ Chronizo — Timeline Builder

Interactive timeline builder inspired by the TVA monitor from Marvel's *Loki*. Build branching chronologies for fictional universes, real-world history, or both.

## Features

- **TVA-style visualization** — glowing branching timelines on dark background
- **Multi-universe support** — create parallel timelines with custom colors
- **Flexible dating** — exact dates, approximate years, seasons, eras
- **Cross-universe connections** — branches, crossovers, merges (characters jumping between universes)
- **Multiple sort modes** — in-universe chronology, release order, custom
- **Source & reasoning** — document why each event is placed where it is
- **File-based projects** — save/load `.chronizo.json` files
- **Auto-save** — localStorage backup every 30 seconds

## Quick Start

```bash
# Clone and serve
git clone https://github.com/homziukl/Chronizo.git
cd Chronizo
python -m http.server 8080
# Open http://localhost:8080
```

Or use GitHub Pages: **https://homziukl.github.io/Chronizo/**

## Usage

1. Click **+ Universe** to create timeline lanes
2. Click **+ Event** to add events to a timeline
3. Pan (drag) and zoom (scroll) the canvas
4. Click any event dot to edit it
5. **Save** exports a `.chronizo.json` file, **Load** imports one

## File Format

Projects are saved as `.chronizo.json` — a portable JSON format:

```json
{
  "meta": { "name": "MCU Timeline", "author": "user" },
  "universes": [{ "id": "main", "name": "Sacred Timeline", "color": "#ff6b00" }],
  "events": [{ "title": "Battle of New York", "universe": "main", "date": { "approximate": "2012" } }],
  "connections": [{ "type": "crossover", "character": "Spider-Man" }]
}
```

## Tech Stack

Vanilla HTML/CSS/JS — zero dependencies. Canvas 2D rendering.

## License

MIT

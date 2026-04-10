# UFL Headball

A 2D browser-based soccer game. Control your player and headbutt the ball into the opponent's goal. First to 3 goals wins!

## Controls

| Action | Keyboard | Mobile |
|--------|----------|--------|
| Move Left | Arrow Left | ◀ button |
| Move Right | Arrow Right | ▶ button |
| Jump / Head | Space | JUMP button |

## Run Locally

Just open `index.html` in any modern browser — no build step needed.

```bash
# Option 1: double-click index.html
# Option 2: use a local server
npx serve .
# or
python3 -m http.server 8080
```

## Deploy to GitHub Pages

1. Push this folder to a GitHub repository
2. Go to **Settings → Pages**
3. Set source to **Deploy from a branch → main → / (root)**
4. Save — your game will be live at `https://<username>.github.io/<repo>/`

## Game Features

- Player vs AI
- Physics-based ball with spin
- 3-goal match format
- Endless level progression (AI gets harder each level)
- Obstacles appear from level 4+
- Coin rewards per win
- Mobile touch controls
- Synth sound effects (Web Audio API)
- No dependencies, no build tools

# Contributing

The plugin lives in `plugin/`: the hooks in `plugin/hooks/`, the roster in `plugin/hooks/characters.ts` and the baked faces in `plugin/hooks/data/faces.generated.ts`.

## How it was made

- **Faces:** `scripts/bake.py` cuts each face and its mouth frames out of the games' own Director casts, using the Director extractor of godot-director-player (a private project), and writes `plugin/hooks/data/faces.generated.ts`. `scripts/faces.json` names, per character, the cast member of the face and its mouths, as whole faces, mouth patches matched onto the face, or parts placed where the game's own score puts them. Each face comes out twice: `big`, the game's own pixels for the desktop app and editors, and `small` for the terminal's half-block cells.
- **Voices:** each character's lines were transcribed from their voice clips in that game, and their persona and catchphrases drafted from those lines. The same character is a different buddy in each game, since they speak differently in each.

No game files go in the repository: only the baked faces and the transcribed lines. CI checks this.

## Rebuilding the faces

Needs the games, a checkout of godot-director-player with them under `games/<title>/`, Godot, and Python with Pillow and numpy:

```
python3 scripts/bake.py --player <path to godot-director-player>
```

A character added to `characters.ts` shows up once `scripts/faces.json` has an entry for it and the faces are rebaked; CI checks that `faces.json` and `faces.generated.ts` list the same characters.

## README images

`docs/images/*.svg` are drawn from the roster and the baked faces, so regenerate them after either changes (plain Python, no packages):

```
python3 scripts/docs_images.py
```

## Checks

```
claude plugin validate --strict plugin
claude plugin validate --strict .
claude plugin test plugin
```

## Licence

Code contributions are MIT. The characters, face art and lines are Guillotine's: see [NOTICE](NOTICE).

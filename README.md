# Zürn Gartenanlagen

Landingpage für Zürn Gartenanlagen, Garten- und Landschaftsbau in Beilstein.

Erscheinungsbild: Corporate Design **Patina & Messing**.

- Patinagrün `#1F3A36`
- Salbeigrau `#A8B0A4`
- Messing `#B99A63`
- Kalkstein `#E8E3D9`
- Graphit `#292B2A`
- Claim: GESTALTEN. PFLANZEN. LEBENSRÄUME.
- Schrift: nur Montserrat Bold und Regular (SIL Open Font License, `public/fonts/OFL.txt`)
- Logo: `src/assets/logo/zuern-logo.svg` (vektorisiert aus der JPG-Vorlage); auf dunklem Grund: `src/assets/logo/zuern-logo-white.svg` (ganz weiß, aus dem Logo abgeleitet); Favicon: `src/assets/logo/zuern-leaf.svg`; das Blatt als Schmuck (Messing, eng beschnitten): `src/assets/logo/zuern-leaf-messing.svg`

Startseite „Schritt in den Garten“: Beim Scrollen geht man den Weg vom Haus zurück zum Teich, die Leistungen erscheinen am Weg, danach folgen Planung (die vier Phasen mit Bilderstrecke), Über mich und Kontakt. Die Filmbilder und die Werkzeuge dafür liegen unter `scrollcraft/builds/zuern-garten`.

## Entwicklung

Voraussetzungen: Node.js ≥ 22.12 und [just](https://github.com/casey/just).

```sh
just            # alle Befehle anzeigen
just dev        # Dev-Server mit Hot Reload
just typecheck  # Typprüfung mit TypeScript 7 (nativer Go-Compiler)
just build      # Typprüfung und Produktions-Build nach dist/
just preview    # Build lokal ansehen
```

## Struktur

```
index.html                                      Startseite: der Weg in den Garten (Scroll-Film)
impressum.html, datenschutz.html                Rechtliches
src/walk/                                       Startseite: Scroll-Engine, Film-Player, Wasser-Shader, Punkte und Pfeile, Phasen, Styles
public/walk/seq/                                Filmbilder (AVIF), Poster, Wassermasken (feste URLs)
src/main.ts                                     Einstieg von Impressum und Datenschutz
src/scripts/nav.ts                              Mobiles Menü von Impressum und Datenschutz
src/styles/main.css                             Styles von Impressum und Datenschutz
src/assets/                                     Logo, Favicon, Porträt (werden gehasht)
tools/images.sh                                 erzeugt die Bildvarianten aus raw/
public/fonts/                                   Montserrat (feste URLs für preload)
public/CNAME                                    Domain für GitHub Pages
```

## Bilder

Zwei Originalbilder liegen in `raw/` (steht nicht im Repo): das große Porträt und das kleine Gesicht. `just images` erzeugt daraus die Varianten in `src/assets/images/` — das Porträt in 4:5 mit 480, 800 und 1200 px Breite, das Gesicht quadratisch mit 240 px, alles WebP ohne Metadaten. Vite hängt beim Build einen Hash an die Dateinamen. Ohne ImageMagick geht es nicht; alles andere ist schon da.

```sh
just images                                  # aus raw/marcel-portrait.jpg und raw/marcel-face.jpg
tools/images.sh mein/portrait.jpg mein/gesicht.jpg   # oder zwei andere Dateien
```

Die Bilderstrecke unter den Phasen steht in `index.html` im Block `phase-show`, ein Satz Bilder je Phase in derselben Reihenfolge wie die Liste darüber. Noch Platzhalter: Standbilder aus dem Film, bis echte Fotos da sind.

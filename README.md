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
- Logo: `src/assets/logo/zuern-logo.svg` (vektorisiert aus der JPG-Vorlage), Favicon: `src/assets/logo/zuern-leaf.svg`

Gestaltung „Werkplan“: Die Seite liest sich wie ein Satz Planblätter. Heller Kalkstein-Grund, Haarlinien in Patina und Messing, nummerierte Blattköpfe (01 bis 05), alle Inhalte sichtbar. Im Einstieg eine gezeichnete Gartenskizze (Inline-SVG), in „Planung und Ablauf“ ein 3D-Beispielmodell, das erst beim Scrollen geladen wird. Texte in der Ich-Form, schlicht und ohne Gedankenstrich-Ketten.

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
index.html, impressum.html, datenschutz.html   Seiten (Vite-Einstiegspunkte)
src/main.ts                                     Einstieg, initialisiert die Module
src/scripts/nav.ts                              Mobiles Menü, aktiver Menüpunkt
src/scripts/contact-form.ts                     Validierung und mailto-Versand des Formulars
src/scripts/model-preview.ts                    Lädt das 3D-Modell, sobald es in Sicht kommt
src/scripts/garden-scene.ts                     three.js-Szene
src/styles/main.css                             Styles
src/assets/                                     Logo, Favicon, Icons (werden gehasht)
public/fonts/                                   Montserrat (feste URLs für preload)
public/models/garden-example.glb                3D-Beispielmodell
public/CNAME                                    Domain für GitHub Pages
```

## 3D-Modell austauschen

`public/models/garden-model.glb` ist ein selbst erzeugtes Architekturmodell des Gartens aus der Skizze im Einstieg (eigene Arbeit, keine Fremdlizenz). Für ein echtes Projektmodell aus Vectorworks als FBX/OBJ oder glTF/GLB exportieren, nach GLB konvertieren und `MODEL_URL` in `src/scripts/garden-scene.ts` anpassen. Das Modell wird automatisch zentriert und skaliert.

## Bilder

Fotos liegen in `src/assets/images/` in drei Breiten (480, 800, 1200 px) als AVIF, WebP und JPEG, Metadaten entfernt. Vite hängt beim Build einen Hash an die Dateinamen.

## Deployment

GitHub Actions (`.github/workflows/static.yml`) prüft die Typen, baut bei jedem Push auf `main` und veröffentlicht `dist/` auf GitHub Pages: https://bernhardrode.github.io/zuern-website/. Den Basispfad liefert `actions/configure-pages` (`BASE_PATH`). Wird die Domain zuern-gartenanlagen.de später in den Pages-Einstellungen dieses Repos eingetragen, baut die Seite automatisch für `/`.

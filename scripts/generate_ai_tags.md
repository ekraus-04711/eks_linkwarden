# Dokumentation: `generate_ai_tags.py`

Dieses Skript ergänzt vorhandene Linkwarden-Einträge automatisch um kurze, KI-generierte Tags. Es nutzt die öffentliche Linkwarden-API zum Abrufen und Aktualisieren von Links sowie ein OpenAI-kompatibles Chat-Endpoint für die Tag-Generierung.

## Ausführung
```bash
LINKWARDEN_BASE_URL="https://your-instance" \
LINKWARDEN_TOKEN="<access token>" \
LINKWARDEN_SEARCH_PATH="/api/v1/search" \
LINKWARDEN_LINK_PATH="/api/v1/links" \
OPENAI_BASE_URL="https://api.openai.com" \
OPENAI_CHAT_PATH="/v1/chat/completions" \
OPENAI_API_KEY="<api key>" \
OPENAI_MODEL="gpt-4o-mini" \
python scripts/generate_ai_tags.py
```

## Funktionen

### `require(value: Optional[str], name: str) -> str`
Verifiziert, dass eine Umgebungsvariable gesetzt ist. Fehlt der Wert, beendet das Skript mit einer Fehlermeldung. Wird genutzt, um `LINKWARDEN_TOKEN` und `OPENAI_API_KEY` vor der Laufzeit zu prüfen.

### `normalize_base_url(raw: str, name: str = "BASE_URL") -> str`
Bereitet Basis-URLs für HTTP-Anfragen auf:
- Entfernt Anführungszeichen und Whitespace.
- Versucht Tuple-Repräsentationen wie `('LINKWARDEN_BASE_URL', 'https://example.com')` zu bereinigen.
- Erzwingt ein vorhandenes Schema (`http://` oder `https://`), um Request-Fehler zu vermeiden.

### `join_url(base: str, path: str) -> str`
Fügt Basis-URL und Pfad robust zusammen. Stellt sicher, dass der Pfad mit `/` beginnt und entfernt abschließende Slashes in der Basis-URL, damit gültige Endpunkte entstehen.

### `fetch_links(session: requests.Session) -> Iterable[dict]`
Liest alle Links iterativ über das Search-Endpoint (`LINKWARDEN_SEARCH_PATH`) ein. Nutzt Cursor-Pagination, um nacheinander alle Link-Objekte zu liefern.

### `trim_text(text: str, limit: int = 1000) -> str`
Komprimiert Eingabetext, indem mehrfaches Whitespace entfernt wird, und begrenzt die Länge auf `limit` Zeichen. Dadurch wird der Token-Verbrauch für die LLM-Anfrage reduziert.

### `request_tags(text: str) -> List[str]`
Stellt eine schlanke Chat-Completion-Anfrage an das konfigurierte OpenAI-kompatible Endpoint. Eigenschaften:
- System-Prompt erzwingt eine reine JSON-Array-Antwort mit maximal fünf kurzen Tags.
- `temperature=0.1` und `max_tokens=80` halten die Antwort kompakt.
- Falls die Antwort kein direkt parsbares JSON ist, wird versucht, den Array-Teil aus dem Antworttext zu extrahieren.
- Leere Texte liefern sofort eine leere Tag-Liste.

### `build_update_payload(link: dict, tags: List[str]) -> Optional[dict]`
Erzeugt den Request-Body, um einen Link zu aktualisieren:
- Überspringt Links ohne Collection.
- Vermeidet Duplikate, indem vorhandene Tag-Namen geprüft werden.
- Trunkierte neue Tag-Namen auf 50 Zeichen.
- Übernimmt bestehende Felder wie `pinnedBy`, `color`, `icon`, `collection` und die vorhandenen Tags.
- Gibt `None` zurück, wenn keine neuen Tags notwendig sind.

### `main() -> None`
Steuert den Ablauf:
1. Prüft Pflicht-Umgebungsvariablen (`LINKWARDEN_TOKEN`, `OPENAI_API_KEY`).
2. Initialisiert eine Session mit Bearer-Auth.
3. Iteriert über alle Links aus `fetch_links` und überspringt bereits getaggte bzw. `aiTagged` Einträge.
4. Wählt eine Textquelle pro Link (Beschreibung → Volltext → Name → URL).
5. Ruft `request_tags` auf und erstellt mit `build_update_payload` den Update-Body.
6. Aktualisiert den Link via `PUT` auf `LINKWARDEN_LINK_PATH/<id>` und protokolliert erfolgreiche Updates.

## Konfiguration
- **Basis-URLs und Pfade:** Alle Endpunkte sind über Umgebungsvariablen anpassbar. Basis-URLs werden normalisiert, um Windows-Tuple-Fehler und fehlende Schemas zu vermeiden.
- **Modelleinstellungen:** `OPENAI_MODEL` kann auf ein kompatibles Modell geändert werden; Temperatur und `max_tokens` sind im Code festgelegt, um Tokens zu sparen.

## Fehlerbehandlung & Sicherheit
- Fehlende Pflicht-Variablen führen zu einem kontrollierten Abbruch mit Hinweis.
- HTTP-Fehler lösen Exceptions aus (`raise_for_status()`), damit fehlerhafte Updates sichtbar werden.
- Timeout-Werte (60s für Tag-Anfrage, 30s für Updates) verhindern hängende Requests.

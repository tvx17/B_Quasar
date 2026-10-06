# Template App (template)

## Dynamische Übersetzungen

Übersetzungen liegen als JSON-Objekte unter `src/i18n/locales/`, zum Beispiel:

```text
src/i18n/locales/
  en-US/
    common.json
    components/navigation.json
    modules/orders.json
  de-DE/
    common.json
    modules/orders.json
```

Der eindeutige Name ist der relative Pfad ohne Sprache und ohne `.json`, z. B.
`modules/orders`. Namen sind groß-/kleinschreibungssensitiv. Die Datei enthält
direkt ihre Schlüssel (`{ "title": "Orders" }`); der Loader registriert den
Namensraum automatisch. Der Übersetzungsschlüssel lautet dann `modules.orders.title`.
Vermeide Schlüssel, die mit untergeordneten Dateinamensräumen kollidieren.

Beim Start werden keine Übersetzungsdateien geladen. `loadTranslations()` lädt
nur die angeforderten Dateien für die aktuelle Sprache (standardmäßig `en-US`).
Fehlt eine Datei für diese Sprache, wird die entsprechende `en-US`-Datei verwendet.
Fehlt auch diese, wird `TranslationFileNotFoundError` geworfen. Netzwerk- und
Importfehler werden weitergegeben und können durch erneutes Laden wiederholt werden.
Gleichzeitige Anfragen teilen denselben Import; erfolgreich geladene Dateien werden
zwischengespeichert. Neue Dateien erkennt Vite über einen Lazy-Glob-Import automatisch.
Im Produktionsbuild werden die JSON-Dateien zu separat nachladbaren JS-Chunks
mit vorkompilierten Vue-I18n-Nachrichten, nicht zu einzeln bereitgestellten JSON-URLs.

In einer Single File Component (globalen Vue-I18n-Scope verwenden):

```vue
<script setup lang="ts">
import { onMounted, onUnmounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { loadTranslations, unloadTranslations } from "@/i18n";

const { t } = useI18n({ useScope: "global" });
const ready = ref(false);
const error = ref("");

onMounted(async () => {
  try {
    await loadTranslations("common", "components/navigation");
    ready.value = true;
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause);
  }
});
onUnmounted(() => unloadTranslations("components/navigation"));
</script>

<template>
  <p v-if="error">{{ error }}</p>
  <q-btn v-else-if="ready" :label="t('components.navigation.secondPage')" />
</template>
```

In einer TypeScript-Datei:

```ts
import { i18n, loadTranslations, setLocale } from "@/i18n";

await loadTranslations("common");
const text = i18n.global.t("common.success");
await setLocale("de-DE");
```

Sprachen immer über `await setLocale(...)` wechseln. Die Funktion lädt zunächst
alle bisher erfolgreich angeforderten Namensräume für die Zielsprache und
aktiviert sie danach; bei einem Fehler bleibt die aktive Sprache erhalten.
Bei gleichzeitigen Sprachwechseln gewinnt der neueste Aufruf. Der Rückgabewert
ist `false`, wenn ein neuerer Wechsel den Aufruf überholt hat, sonst `true`.
Vue-Templates aktualisieren sich über `t()` automatisch; bereits in einer
TypeScript-Variablen gespeicherte übersetzte Strings müssen neu berechnet werden.

Der Fallback gilt für fehlende **Dateien**. Eine vorhandene Sprachdatei sollte
dieselben Schlüssel wie ihre englische Version enthalten. Auch Englisch wird
nicht vorsorglich für jeden Namensraum geladen. `en` und `en-US` sind verschiedene
Sprachordner; verwende dieselben Sprachcodes beim Anlegen und Wechseln.

Die exportierte i18n-Instanz ist für die SPA und deren PWA-/Electron-Renderer
gedacht. Bei einer späteren SSR-Einbindung müssen i18n und Loader pro Anfrage
erzeugt werden, damit Sprachzustand und Nachrichten nicht zwischen Benutzern
geteilt werden.

Die Loader-Tests laufen mit `npm run test:i18n` (Node >= 22.18).

### Übersetzungen entladen

`unloadTranslations("modules/orders", "components/navigation")` entfernt die
genannten Namensräume synchron aus allen vom Loader geladenen Sprachen, einschließlich
englischer Fallback-Daten. Andere Namensräume bleiben erhalten. Leere übergeordnete
Objekte und die entsprechenden Loader-Cache-Einträge werden entfernt. Die entladenen
Dateien werden beim Sprachwechsel nicht mehr automatisch nachgeladen; ein späteres
`await loadTranslations(...)` lädt sie erneut. Wiederholtes Entladen ist erlaubt.
Auch noch laufende Imports installieren nach dem Entladen keine Nachrichten mehr.

Die Funktion wirkt global: Wird dieselbe Datei von mehreren Komponenten verwendet,
darf sie erst entladen werden, wenn keine davon sie mehr benötigt. Gemeinsame Dateien
wie `common` deshalb nicht beim Unmount einer einzelnen Komponente entladen.

Der Browser behält dynamisch importierte JavaScript-Module in seinem eigenen
Modulcache. `unloadTranslations()` entfernt Nachrichten aus Vue I18n und Referenzen
aus dem Loader, kann aber die importierten Übersetzungs-Chunks und interne
Kompilierungs-Caches von Vue I18n nicht vollständig aus dem Browser-Speicher entfernen.

## Install the dependencies

```bash
pnpm install
# or: yarn/npm/bun install
```

### Start the app in development mode (HMR, error reporting, etc.)

```bash
quasar dev
```

### Format & Lint the files

```bash
pnpm run lint
# or: yarn/npm/bun run lint
```

...or just check formatting & linting:

```bash
pnpm run lint:check
# or: yarn/npm/bun run lint:check
```

### Build the app for production

```bash
quasar build
```

### Customize the configuration

See [Configuring quasar.config.js](https://v2.quasar.dev/quasar-cli-vite/quasar-config-file).

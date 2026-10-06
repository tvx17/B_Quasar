/** JSON objects, or message objects precompiled by the Vue I18n Vite plugin. */
export type TranslationMessages = Record<string, unknown>;
type TranslationFiles = Record<string, () => Promise<TranslationMessages>>;

interface TranslationTarget {
  getLocale: () => string;
  setLocale: (locale: string) => void;
  mergeMessages: (locale: string, messages: TranslationMessages) => void;
  getMessages: (locale: string) => TranslationMessages;
  setMessages: (locale: string, messages: TranslationMessages) => void;
}

export class TranslationFileNotFoundError extends Error {
  constructor(name: string, locale: string, fallbackLocale: string) {
    super(
      `Translation file "${name}" is missing for "${locale}" and fallback "${fallbackLocale}".`
    );
    this.name = "TranslationFileNotFoundError";
  }
}

/** Each loader has its own request cache and tracks only explicitly requested names. */
export function createTranslationLoader(
  files: TranslationFiles,
  target: TranslationTarget,
  fallbackLocale = "en-US"
) {
  const requested = new Set<string>();
  const imports = new Map<string, Promise<TranslationMessages>>();
  const installed = new Map<string, { locale: string; name: string }>();
  const generations = new Map<string, object>();
  let localeRequest = 0;

  function validateName(name: string) {
    if (
      !/^[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*$/.test(name) ||
      name
        .split("/")
        .some(part => ["__proto__", "constructor", "prototype"].includes(part))
    ) {
      throw new Error(
        `Invalid translation name "${name}". Use e.g. "modules/orders".`
      );
    }
  }

  function generationFor(name: string) {
    let generation = generations.get(name);
    if (!generation) {
      generation = {};
      generations.set(name, generation);
    }
    return generation;
  }

  async function loadFile(name: string, locale: string, generation: object) {
    if (generations.get(name) !== generation) return;
    const key = JSON.stringify([locale, name]);
    if (installed.has(key)) return;

    const localPath = `./locales/${locale}/${name}.json`;
    const fallbackPath = `./locales/${fallbackLocale}/${name}.json`;
    const path = Object.hasOwn(files, localPath) ? localPath : fallbackPath;
    const importFile = Object.hasOwn(files, path) ? files[path] : undefined;
    if (!importFile)
      throw new TranslationFileNotFoundError(name, locale, fallbackLocale);

    let pending = imports.get(path);
    if (!pending) {
      pending = importFile().catch(error => {
        if (imports.get(path) === pending) imports.delete(path);
        throw error;
      });
      imports.set(path, pending);
    }
    const messages = await pending;
    // Unmount/unload may happen before a dynamic import finishes.
    if (generations.get(name) !== generation) return;
    if (!messages || typeof messages !== "object" || Array.isArray(messages)) {
      imports.delete(path);
      throw new Error(`Translation file "${path}" must contain a JSON object.`);
    }
    // Another request may have installed the same namespace while awaiting the import.
    if (installed.has(key)) return;
    const namespaced = name
      .split("/")
      .reduceRight<TranslationMessages>(
        (value, part) => ({ [part]: value }),
        messages
      );
    target.mergeMessages(locale, namespaced);
    installed.set(key, { locale, name });
  }

  async function loadTranslations(...names: string[]): Promise<void> {
    names.forEach(validateName);
    const entries = names.map(name => ({
      name,
      generation: generationFor(name)
    }));
    let locale: string;
    do {
      locale = target.getLocale();
      await Promise.all(
        entries.map(({ name, generation }) =>
          loadFile(name, locale, generation)
        )
      );
      // If the locale changed during the request, load the newly active language too.
    } while (locale !== target.getLocale());
    entries.forEach(({ name, generation }) => {
      if (generations.get(name) === generation) requested.add(name);
    });
  }

  function removeNamespace(
    messages: TranslationMessages,
    parts: string[]
  ): TranslationMessages {
    const [part, ...rest] = parts;
    if (!part || !Object.hasOwn(messages, part)) return messages;
    const result = { ...messages };
    if (!rest.length) {
      delete result[part];
    } else {
      const child = result[part];
      if (!child || typeof child !== "object" || Array.isArray(child))
        return messages;
      const remaining = removeNamespace(child as TranslationMessages, rest);
      if (Object.keys(remaining).length) result[part] = remaining;
      else delete result[part];
    }
    return result;
  }

  /** Globally removes named files from every loaded language, including English fallbacks. */
  function unloadTranslations(...names: string[]): void {
    names.forEach(validateName);
    for (const name of names) {
      generations.delete(name);
      requested.delete(name);
      for (const [key, entry] of installed) {
        if (entry.name !== name) continue;
        target.setMessages(
          entry.locale,
          removeNamespace(target.getMessages(entry.locale), name.split("/"))
        );
        installed.delete(key);
      }
      for (const path of imports.keys()) {
        const relativePath = path.slice("./locales/".length);
        if (
          relativePath.slice(relativePath.indexOf("/") + 1) === `${name}.json`
        ) {
          imports.delete(path);
        }
      }
    }
  }

  /** Returns false if a newer language switch superseded this request. */
  async function setLocale(locale: string): Promise<boolean> {
    if (!/^[a-zA-Z0-9]+(?:-[a-zA-Z0-9]+)*$/.test(locale)) {
      throw new Error(`Invalid locale "${locale}".`);
    }
    const request = ++localeRequest;
    let count: number;
    do {
      count = requested.size;
      await Promise.all(
        [...requested].map(name => loadFile(name, locale, generationFor(name)))
      );
      if (request !== localeRequest) return false;
      // Include namespaces requested by a component during the language switch.
    } while (count !== requested.size);
    target.setLocale(locale);
    return true;
  }

  return { loadTranslations, unloadTranslations, setLocale };
}

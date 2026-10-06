import assert from "node:assert/strict";
import { test } from "node:test";
import { createI18n } from "vue-i18n";
import {
  createTranslationLoader,
  TranslationFileNotFoundError
} from "../src/i18n/loader.ts";

function setup(files, initialLocale = "de-DE") {
  let locale = initialLocale;
  const merged = [];
  const i18n = createI18n({
    legacy: false,
    locale: initialLocale,
    messages: {}
  });
  const loader = createTranslationLoader(files, {
    getLocale: () => locale,
    setLocale: value => {
      locale = value;
    },
    mergeMessages: (language, messages) => {
      merged.push({ language, messages });
      i18n.global.mergeLocaleMessage(language, messages);
    },
    getMessages: language => i18n.global.getLocaleMessage(language),
    setMessages: (language, messages) =>
      i18n.global.setLocaleMessage(language, messages)
  });
  return {
    ...loader,
    merged,
    getLocale: () => locale,
    // Vue I18n creates null-prototype message objects; compare their JSON content.
    messages: language =>
      JSON.parse(JSON.stringify(i18n.global.getLocaleMessage(language)))
  };
}

void test("loads nothing initially, prefers the active language, and caches concurrent requests", async () => {
  let germanLoads = 0;
  let englishLoads = 0;
  const loader = setup({
    "./locales/de-DE/modules/orders.json": async () => {
      germanLoads++;
      return { title: "Bestellungen" };
    },
    "./locales/en-US/modules/orders.json": async () => {
      englishLoads++;
      return { title: "Orders" };
    }
  });
  assert.equal(germanLoads, 0);
  await Promise.all([
    loader.loadTranslations("modules/orders"),
    loader.loadTranslations("modules/orders")
  ]);
  await loader.loadTranslations("modules/orders");
  assert.equal(germanLoads, 1);
  assert.equal(englishLoads, 0);
  assert.deepEqual(loader.merged, [
    {
      language: "de-DE",
      messages: { modules: { orders: { title: "Bestellungen" } } }
    }
  ]);
});

void test("uses English under the active locale when that language's file is absent", async () => {
  const loader = setup({
    "./locales/en-US/common.json": async () => ({ success: "Success" })
  });
  await loader.loadTranslations("common");
  assert.deepEqual(loader.merged, [
    { language: "de-DE", messages: { common: { success: "Success" } } }
  ]);
});

void test("throws if both files are absent, without poisoning later language switches", async () => {
  const loader = setup({});
  await assert.rejects(
    loader.loadTranslations("missing"),
    TranslationFileNotFoundError
  );
  assert.equal(await loader.setLocale("fr-FR"), true);
});

void test("retains namespaces and loads them before activating a language", async () => {
  let englishLoads = 0;
  const loader = setup({
    "./locales/de-DE/common.json": async () => ({ title: "Deutsch" }),
    "./locales/en-US/common.json": async () => {
      assert.equal(loader.getLocale(), "de-DE");
      englishLoads++;
      return { title: "English" };
    },
    "./locales/en-US/unused.json": async () => {
      throw new Error("Must remain unloaded");
    }
  });
  await loader.loadTranslations("common");
  await loader.setLocale("en-US");
  await loader.setLocale("de-DE");
  assert.equal(englishLoads, 1);
  assert.equal(loader.getLocale(), "de-DE");
});

void test("does not hide import errors, and permits retry", async () => {
  let attempts = 0;
  const loader = setup({
    "./locales/de-DE/common.json": async () => {
      if (++attempts === 1) throw new Error("Network failure");
      return { title: "Deutsch" };
    },
    "./locales/en-US/common.json": async () => {
      throw new Error("Must not mask network failure");
    }
  });
  await assert.rejects(loader.loadTranslations("common"), /Network failure/);
  await loader.loadTranslations("common");
  assert.equal(attempts, 2);
});

void test("a failed language switch leaves the active language unchanged", async () => {
  const loader = setup({
    "./locales/de-DE/common.json": async () => ({ title: "Deutsch" })
  });
  await loader.loadTranslations("common");
  await assert.rejects(loader.setLocale("fr-FR"), TranslationFileNotFoundError);
  assert.equal(loader.getLocale(), "de-DE");
});

void test("the latest language switch wins when requests finish out of order", async () => {
  let finishFrench;
  const loader = setup({
    "./locales/de-DE/common.json": async () => ({ title: "Deutsch" }),
    "./locales/fr-FR/common.json": () =>
      new Promise(resolve => {
        finishFrench = resolve;
      }),
    "./locales/en-US/common.json": async () => ({ title: "English" })
  });
  await loader.loadTranslations("common");
  const french = loader.setLocale("fr-FR");
  assert.equal(await loader.setLocale("en-US"), true);
  finishFrench({ title: "Français" });
  assert.equal(await french, false);
  assert.equal(loader.getLocale(), "en-US");
});

void test("an in-flight load follows a change to the active language", async () => {
  let finishGerman;
  const loader = setup({
    "./locales/de-DE/common.json": () =>
      new Promise(resolve => {
        finishGerman = resolve;
      }),
    "./locales/en-US/common.json": async () => ({ title: "English" })
  });
  const loading = loader.loadTranslations("common");
  await loader.setLocale("en-US");
  finishGerman({ title: "Deutsch" });
  await loading;
  assert.equal(loader.merged.at(-1).language, "en-US");
});

void test("unloads all languages and fallback data, preserves siblings, and supports reloading", async () => {
  let loads = 0;
  const loader = setup({
    "./locales/en-US/modules/orders.json": async () => {
      loads++;
      return { title: "Orders" };
    },
    "./locales/en-US/modules/customers.json": async () => ({
      title: "Customers"
    })
  });
  await loader.loadTranslations("modules/orders", "modules/customers");
  await loader.setLocale("en-US");
  loader.unloadTranslations("modules/orders");
  for (const language of ["de-DE", "en-US"]) {
    assert.deepEqual(loader.messages(language), {
      modules: { customers: { title: "Customers" } }
    });
  }
  await loader.setLocale("fr-FR");
  assert.deepEqual(loader.messages("fr-FR"), {
    modules: { customers: { title: "Customers" } }
  });
  assert.equal(loads, 1);
  await loader.loadTranslations("modules/orders");
  assert.equal(loads, 2);
  loader.unloadTranslations("modules/orders", "modules/customers");
  assert.deepEqual(loader.messages("fr-FR"), {});
  loader.unloadTranslations("modules/orders"); // Repeated calls are harmless.
});

void test("unloading during a pending import prevents installation and later automatic reloading", async () => {
  let finish;
  const loader = setup({
    "./locales/en-US/common.json": () =>
      new Promise(resolve => {
        finish = resolve;
      })
  });
  const loading = loader.loadTranslations("common");
  loader.unloadTranslations("common");
  finish({ title: "English" });
  await loading;
  assert.deepEqual(loader.messages("de-DE"), {});
  await loader.setLocale("en-US");
  assert.deepEqual(loader.messages("en-US"), {});
});

void test("a fresh load after unloading is not overwritten by an older pending import", async () => {
  const finishes = [];
  const loader = setup({
    "./locales/en-US/common.json": () =>
      new Promise(resolve => {
        finishes.push(resolve);
      })
  });
  const oldLoad = loader.loadTranslations("common");
  loader.unloadTranslations("common");
  const freshLoad = loader.loadTranslations("common");
  finishes[1]({ title: "Fresh" });
  await freshLoad;
  finishes[0]({ title: "Old" });
  await oldLoad;
  assert.deepEqual(loader.messages("de-DE"), { common: { title: "Fresh" } });
});

void test("unloading while switching languages prevents installation in the target language", async () => {
  let finish;
  const loader = setup({
    "./locales/de-DE/common.json": async () => ({ title: "Deutsch" }),
    "./locales/en-US/common.json": () =>
      new Promise(resolve => {
        finish = resolve;
      })
  });
  await loader.loadTranslations("common");
  const switching = loader.setLocale("en-US");
  loader.unloadTranslations("common");
  finish({ title: "English" });
  await switching;
  assert.deepEqual(loader.messages("de-DE"), {});
  assert.deepEqual(loader.messages("en-US"), {});
});

void test("rejects invalid names and non-object translation files", async () => {
  const loader = setup({ "./locales/en-US/common.json": async () => [] });
  for (const name of [
    "../common",
    "common.json",
    "modules//orders",
    "__proto__/orders"
  ]) {
    await assert.rejects(
      loader.loadTranslations(name),
      /Invalid translation name/
    );
  }
  await assert.rejects(
    loader.loadTranslations("common"),
    /must contain a JSON object/
  );
  await assert.rejects(loader.setLocale("../en-US"), /Invalid locale/);
});

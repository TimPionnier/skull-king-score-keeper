// Partie complète de 10 manches à 3 joueurs, jouée sur desktop (1920×1080) et mobile (390×844).
// Les scores attendus sont recalculés ici, indépendamment de src/scoring.js (oracle du livret).
import { expect, test } from "@playwright/test";

const PLAYERS = ["Alice", "Bob", "Charlie"];
const signed = (n) => (n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : "0");

/** Score officiel d'une manche (bonus déjà filtrés : ils ne comptent que si le pari est réussi). */
function oracle(bet, tricks, cards, bonus) {
  if (bet === tricks) return (bet === 0 ? 10 * cards : 20 * bet) + bonus;
  return bet === 0 ? -10 * cards : -10 * Math.abs(bet - tricks);
}

/**
 * Plan de la manche r (r cartes) :
 *  - Alice prend ⌈r/2⌉ plis, pari exact, bonus « 14 de couleur » (+10) → compte.
 *  - Bob prend ⌊r/2⌋ plis, pari raté (+1, ou 0 aux manches 5 et 9 → −10 × r), bonus Pirate (+30) → ne compte pas.
 *  - Charlie ne prend aucun pli : pari 0 (+10 × r), ou 1 aux manches 3, 6, 9 (−10). Bonus verrouillé.
 */
function plan(r) {
  const a = Math.ceil(r / 2), b = Math.floor(r / 2);
  return {
    Alice: { bet: a, tricks: a, bonus: 10 },
    Bob: { bet: r === 5 || r === 9 ? 0 : b + 1, tricks: b, bonus: b > 0 ? 30 : 0 },
    Charlie: { bet: r % 3 === 0 ? 1 : 0, tricks: 0, bonus: 0 },
  };
}

/** Un seul « tap » à l'emplacement du bouton, sans les ré-essais de Playwright : reproduit le bug du premier clic ignoré. */
async function singleTap(page, locator) {
  const box = await locator.boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}

async function bump(page, label, times) {
  const btn = page.getByRole("button", { name: label, exact: true });
  for (let i = 0; i < times; i++) await btn.click();
}

test("partie complète 1 → 10 manches : Yo-Ho-Ho, paris, plis, bonus, scores, podium", async ({ page }) => {
  await page.goto("./");
  await page.evaluate(() => localStorage.clear());
  await page.reload();

  // ── Configuration : 3 joueurs ──
  await page.getByRole("button", { name: /^Retirer Keryan/ }).click();
  for (const [i, name] of PLAYERS.entries()) await page.getByLabel(`Nom du pirate ${i + 1}`).fill(name);
  await expect(page.getByText("3 pirates · 10 manches · Skull King")).toBeVisible();
  await page.getByRole("button", { name: /Hisser les voiles/ }).click();

  const totals = { Alice: 0, Bob: 0, Charlie: 0 };
  const yoho = page.getByRole("dialog", { name: /Yo-Ho-Ho/ });

  for (let r = 1; r <= 10; r++) {
    const p = plan(r);

    // ── a. Yo-Ho-Ho en début de manche ──
    await expect(yoho).toBeVisible();
    await expect(yoho).toContainText(`Manche ${r} / 10`);
    if (r % 2) await expect(yoho).toBeHidden({ timeout: 6_000 }); // fin automatique
    else { await yoho.click(); await expect(yoho).toBeHidden(); }  // « touchez pour passer »
    await expect(page.getByRole("heading", { level: 1 })).toContainText(`Manche ${r}`);

    // Régression : le premier tap sur Classement / Réglages juste après un overlay doit fonctionner.
    if (r === 1 || r === 2) {
      await singleTap(page, page.getByRole("button", { name: r === 1 ? "Classement" : "Réglages", exact: true }));
      if (r === 1) {
        await expect(page.getByRole("heading", { name: "Classement" })).toBeVisible({ timeout: 1_500 });
        await page.getByRole("button", { name: "Retour", exact: true }).click();
      } else {
        await expect(page.getByRole("heading", { name: "Skull King" })).toBeVisible({ timeout: 1_500 });
        await page.getByRole("button", { name: "Reprendre" }).click();
      }
      await expect(page.getByRole("heading", { level: 1 })).toContainText(`Manche ${r}`);
    }

    // L'ancien bouton « Yo-Ho-Ho révéler les paris » ne doit plus exister après la saisie.
    await expect(page.getByRole("button", { name: /révéler les paris/ })).toHaveCount(0);

    // ── b. Saisie des paris ──
    for (const name of PLAYERS) await bump(page, `Plus 1 · pari de ${name}`, p[name].bet);
    // ── c. Verrouillage ──
    await page.getByRole("button", { name: /Bloquer les paris & lancer la manche/ }).click();
    for (const name of PLAYERS) await expect(page.getByText(`Pari ${p[name].bet}`).first()).toBeVisible();

    // ── Plis : somme incomplète → validation bloquée ──
    const validate = page.getByRole("button", { name: /Valider la manche|à attribuer|en trop/ });
    await expect(validate).toBeDisabled();
    await expect(validate).toHaveText(new RegExp(`Encore ${r} plis? à attribuer`));

    // Manche 3 : bonus saisi puis plis remis à 0 → bonus effacé et verrouillé.
    if (r === 3) {
      await bump(page, "Plus 1 · plis de Charlie", 1);
      await page.getByRole("button", { name: "Bonus de Charlie" }).click();
      const sheet = page.getByRole("dialog", { name: "Bonus de la manche" });
      await sheet.getByRole("button", { name: "Plus 1 · 14 de couleur" }).click();
      await sheet.getByRole("button", { name: "Terminé" }).click();
      await expect(sheet).toBeHidden();
      await expect(page.getByRole("button", { name: "Bonus de Charlie" })).toHaveText(/\+10/);
      await page.getByRole("button", { name: "Moins 1 · plis de Charlie", exact: true }).click();
      await expect(page.getByRole("button", { name: "Bonus de Charlie" })).toHaveText(/^\s*Bonus\s*$/);
    }

    await bump(page, "Plus 1 · plis de Alice", p.Alice.tricks);
    if (p.Bob.tricks > 0) {
      await expect(validate).toBeDisabled(); // il manque encore les plis de Bob
      await bump(page, "Plus 1 · plis de Bob", p.Bob.tricks);
    }
    await expect(validate).toBeEnabled();
    await expect(validate).toHaveText(/Valider la manche/);
    // Somme pleine : impossible d'ajouter un pli de plus.
    for (const name of PLAYERS) await expect(page.getByRole("button", { name: `Plus 1 · plis de ${name}`, exact: true })).toBeDisabled();

    // ── Bonus : verrouillés sans pli ; comptés seulement si le pari est réussi ──
    await expect(page.getByRole("button", { name: "Bonus de Charlie" })).toBeDisabled();
    if (p.Bob.tricks === 0) await expect(page.getByRole("button", { name: "Bonus de Bob" })).toBeDisabled();

    const sheet = page.getByRole("dialog", { name: "Bonus de la manche" });
    await page.getByRole("button", { name: "Bonus de Alice" }).click();
    await sheet.getByRole("button", { name: "Plus 1 · 14 de couleur" }).click();
    await expect(sheet).toContainText(signed(oracle(p.Alice.bet, p.Alice.tricks, r, 10)));
    await sheet.getByRole("button", { name: "Terminé" }).click();
    await expect(sheet).toBeHidden();

    if (p.Bob.tricks > 0) {
      await page.getByRole("button", { name: "Bonus de Bob" }).click();
      await sheet.getByRole("button", { name: "Plus 1 · Pirate capturé par le Skull King" }).click();
      await expect(sheet).toContainText("Pari manqué : ces bonus ne comptent pas cette manche.");
      await sheet.getByRole("button", { name: "Terminé" }).click();
      await expect(sheet).toBeHidden();
    }

    // ── Validation et contrôle des scores ──
    await validate.click();
    const summary = page.getByRole("dialog", { name: "Résultats de la manche" });
    await expect(summary).toContainText(`Manche ${r} terminée`);
    for (const name of PLAYERS) {
      const { bet, tricks } = p[name];
      const bonus = bet === tricks ? p[name].bonus : 0;
      const pts = oracle(bet, tricks, r, bonus);
      totals[name] += pts;
      const row = summary.locator("div.rounded-\\[14px\\]").filter({ hasText: name });
      await expect(row).toContainText(signed(pts));
      await expect(row).toContainText(`= ${totals[name]}`);
    }
    await summary.getByRole("button", { name: r < 10 ? `Manche ${r + 1} · ${r + 1} cartes` : /Voir le podium/ }).click();
  }

  // ── Fin de partie ──
  const ranking = Object.entries(totals).sort((x, y) => y[1] - x[1]);
  await expect(page.getByText("Capitaine des Sept Mers")).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(ranking[0][0]);
  await expect(page.getByText(`${ranking[0][1]} pts · 10/10 paris réussis`)).toBeVisible();

  // Tableau récapitulatif : totaux Σ.
  await page.getByRole("button", { name: "Détail des scores" }).click();
  await expect(page.getByRole("heading", { name: "Classement" })).toBeVisible();
  for (const [i, [name, pts]] of ranking.entries()) {
    await expect(page.locator("ol > li").nth(i)).toContainText(name);
    await expect(page.locator("ol > li").nth(i)).toContainText(String(pts));
  }
  await page.getByRole("button", { name: "Manche par manche" }).click();
  const sumRow = page.locator("tr").filter({ hasText: "Σ" });
  for (const name of PLAYERS) await expect(sumRow).toContainText(String(totals[name]));
  console.log("Totaux finaux :", JSON.stringify(totals));
});

test("extension Butin : alliance réussie possible avec 0 pli, captures verrouillées", async ({ page }) => {
  await page.goto("./");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole("button", { name: /^Retirer Keryan/ }).click();
  for (const [i, name] of PLAYERS.entries()) await page.getByLabel(`Nom du pirate ${i + 1}`).fill(name);
  await page.getByRole("button", { name: /Cartes Butin/ }).click();
  await page.getByRole("button", { name: /Hisser les voiles/ }).click();
  await page.getByRole("dialog", { name: /Yo-Ho-Ho/ }).click();

  // Manche 1 : Alice parie 1 et gagne le pli ; Charlie parie 0, a posé un Butin dans le pli d'Alice.
  await page.getByRole("button", { name: "Plus 1 · pari de Alice", exact: true }).click();
  await page.getByRole("button", { name: /Bloquer les paris/ }).click();
  await page.getByRole("button", { name: "Plus 1 · plis de Alice", exact: true }).click();

  const charlie = page.getByRole("button", { name: "Bonus de Charlie" });
  await expect(charlie).toBeEnabled();
  await charlie.click();
  const sheet = page.getByRole("dialog", { name: "Bonus de la manche" });
  await expect(sheet).toContainText("Aucun pli gagné : seule l'alliance Butin peut rapporter des points.");
  for (const label of ["14 de couleur", "Sirène capturée par un Pirate", "Pirate capturé par le Skull King"])
    await expect(sheet.getByRole("button", { name: `Plus 1 · ${label}`, exact: true })).toBeDisabled();
  await expect(sheet.getByRole("button", { name: /14 noir/ })).toBeDisabled();
  await expect(sheet.getByRole("button", { name: /Skull King capturé par une Sirène/ })).toBeDisabled();
  await sheet.getByRole("button", { name: "Plus 1 · Alliance Butin réussie", exact: true }).click();
  await expect(sheet).toContainText("+30");
  await sheet.getByRole("button", { name: "Terminé" }).click();
  await expect(sheet).toBeHidden();

  // Alice aussi a réussi son alliance.
  await page.getByRole("button", { name: "Bonus de Alice" }).click();
  await sheet.getByRole("button", { name: "Plus 1 · Alliance Butin réussie", exact: true }).click();
  await sheet.getByRole("button", { name: "Terminé" }).click();
  await expect(sheet).toBeHidden();

  await page.getByRole("button", { name: /Valider la manche/ }).click();
  const summary = page.getByRole("dialog", { name: "Résultats de la manche" });
  const row = (name) => summary.locator("div.rounded-\\[14px\\]").filter({ hasText: name });
  await expect(row("Alice")).toContainText("+40");   // 20 × 1 + alliance 20
  await expect(row("Bob")).toContainText("+10");     // zéro tenu
  await expect(row("Charlie")).toContainText("+30"); // zéro tenu + alliance 20
});

test("Kraken (1 pli détruit au plus) et Harry le Géant (pari ±1)", async ({ page }) => {
  await page.goto("./");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole("button", { name: /^Retirer Keryan/ }).click();
  for (const [i, name] of PLAYERS.entries()) await page.getByLabel(`Nom du pirate ${i + 1}`).fill(name);
  await page.getByRole("button", { name: /Kraken & Baleine/ }).click();
  await page.getByRole("button", { name: /Pouvoirs des pirates/ }).click();
  await page.getByRole("button", { name: /Hisser les voiles/ }).click();
  const yoho = page.getByRole("dialog", { name: /Yo-Ho-Ho/ });
  const validate = page.getByRole("button", { name: /Valider la manche|à attribuer|en trop/ });
  const kraken = page.getByRole("button", { name: /^Kraken joué/ });
  const whale = page.getByRole("button", { name: /^Baleine blanche joué/ });
  const summary = page.getByRole("dialog", { name: "Résultats de la manche" });
  const row = (name) => summary.locator("div.rounded-\\[14px\\]").filter({ hasText: name });

  // Manche 1 (1 carte) : tout le monde parie 0, le Kraken dévore l'unique pli.
  await yoho.click();
  await page.getByRole("button", { name: /Bloquer les paris/ }).click();
  await expect(validate).toHaveText(/Encore 1 pli à attribuer/);
  await kraken.click();
  await expect(kraken).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("1 pli perdu en mer")).toBeVisible();
  await expect(whale).toBeDisabled(); // plus aucun pli à perdre
  await expect(validate).toBeEnabled();
  for (const name of PLAYERS) await expect(page.getByRole("button", { name: `Plus 1 · plis de ${name}`, exact: true })).toBeDisabled();
  await validate.click();
  for (const name of PLAYERS) await expect(row(name)).toContainText("+10");
  await summary.getByRole("button", { name: /Manche 2/ }).click();

  // Manche 2 (2 cartes) : Alice parie 2, le Kraken détruit un pli → un seul pli à attribuer.
  await yoho.click();
  await page.getByRole("button", { name: "Plus 1 · pari de Alice", exact: true }).click();
  await page.getByRole("button", { name: "Plus 1 · pari de Alice", exact: true }).click();
  await page.getByRole("button", { name: /Bloquer les paris/ }).click();
  await expect(kraken).toHaveAttribute("aria-pressed", "false"); // réinitialisé à chaque manche
  await kraken.click();
  await page.getByRole("button", { name: "Plus 1 · plis de Alice", exact: true }).click();
  await expect(page.getByRole("button", { name: "Plus 1 · plis de Alice", exact: true })).toBeDisabled(); // un seul pli détruit, pas deux
  await expect(validate).toBeEnabled();

  // Harry : impossible sans pli ; Alice l'utilise pour descendre son pari à 1.
  await expect(page.getByRole("button", { name: "Harry le Géant · Bob" })).toBeDisabled();
  await page.getByRole("button", { name: "Harry le Géant · Alice" }).click();
  await page.getByRole("radiogroup", { name: /Pari de Alice modifié par Harry/ }).getByRole("radio", { name: "−1 → 1" }).click();
  await expect(page.getByText("Pari 2 → 1")).toBeVisible();
  await validate.click();
  await expect(row("Alice")).toContainText("+20");
  await expect(row("Alice")).toContainText("1 annoncé (Harry)");
  await expect(row("Bob")).toContainText("+20");
  await expect(row("Charlie")).toContainText("+20");
  await summary.getByRole("button", { name: /Manche 3/ }).click();

  // Manche 3 (3 cartes) : chacun fait 1 pli. Harry étant une carte unique, un seul joueur peut l'activer.
  await yoho.click();
  await page.getByRole("button", { name: "Plus 1 · pari de Alice", exact: true }).click();
  for (let k = 0; k < 2; k++) await page.getByRole("button", { name: "Plus 1 · pari de Bob", exact: true }).click();
  await page.getByRole("button", { name: "Plus 1 · pari de Charlie", exact: true }).click();
  await page.getByRole("button", { name: /Bloquer les paris/ }).click();
  for (const name of PLAYERS) await page.getByRole("button", { name: `Plus 1 · plis de ${name}`, exact: true }).click();
  const harryOf = (name) => page.getByRole("button", { name: `Harry le Géant · ${name}` });
  const pickers = page.getByRole("radiogroup", { name: /modifié par Harry/ });

  await harryOf("Alice").click();
  await expect(harryOf("Alice")).toHaveAttribute("aria-pressed", "true");
  await expect(harryOf("Bob")).toBeDisabled();
  await expect(harryOf("Charlie")).toBeDisabled();
  await expect(pickers).toHaveCount(1);

  await harryOf("Alice").click(); // Alice rend la carte…
  await expect(harryOf("Alice")).toHaveAttribute("aria-pressed", "false");
  await expect(pickers).toHaveCount(0);
  await harryOf("Bob").click();   // …c'était Bob qui l'avait.
  await expect(harryOf("Alice")).toBeDisabled();
  await expect(pickers).toHaveCount(1);
  await pickers.getByRole("radio", { name: "−1 → 1" }).click();
  await expect(page.getByText("Pari 2 → 1")).toBeVisible();

  await validate.click();
  await expect(row("Alice")).toContainText("+20");
  await expect(row("Bob")).toContainText("+20");
  await expect(row("Bob")).toContainText("1 annoncé (Harry)");
  await expect(row("Charlie")).toContainText("+20");
});

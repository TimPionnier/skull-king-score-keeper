# Skull King — Carnet de score

## Lancer en local
```bash
npm install
npm run dev        # puis ouvrir http://localhost:5173
```
Sur téléphone (même Wi-Fi) : `npm run dev -- --host`, puis ouvrir l'adresse « Network » affichée.

## Sur téléphone
- Ouvrir le site dans Safari › Partager › « Sur l'écran d'accueil » : l'app s'ouvre en plein écran.
- La partie est sauvegardée automatiquement : verrouiller le téléphone ou recharger ne fait rien perdre.
- L'écran reste allumé pendant une manche (si le navigateur le permet).

## Publier sur GitHub Pages
1. Créer un dépôt sur GitHub, puis :
   ```bash
   git init && git add . && git commit -m "Skull King"
   git branch -M main
   git remote add origin https://github.com/<pseudo>/<depot>.git
   git push -u origin main
   ```
2. Sur GitHub : Settings › Pages › Source : **GitHub Actions**.
3. Chaque push sur `main` redéploie : `https://<pseudo>.github.io/<depot>/`

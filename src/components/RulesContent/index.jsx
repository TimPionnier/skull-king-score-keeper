import { Coins, Flame, Skull, Swords, Target, Waves } from "lucide-react";

const SECTIONS = [
  {
    title: "Principe",
    Icon: Target,
    accent: "#2DD4BF",
    items: [
      ["Manche", "À la manche N, chacun reçoit N cartes. Avant de jouer, tout le monde annonce en secret le nombre de plis qu'il pense remporter."],
      ["Score", "Pari réussi : 20 points par pli annoncé, ou 10 points par carte de la manche pour un pari à zéro. Pari raté : 10 points perdus par pli d'écart, ou 10 points par carte pour un zéro raté."],
      ["Bonus", "Les bonus ci-dessous ne comptent que si le pari est réussi."],
    ],
  },
  {
    title: "Qui gagne le pli",
    Icon: Swords,
    accent: "#F2B544",
    items: [
      ["Couleurs", "Jaune, vert et violet, de 1 à 14. Il faut fournir la couleur demandée si on le peut."],
      ["Atout noir", "Le drapeau pirate (noir) bat toutes les couleurs."],
      ["Pirates", "Battent les cartes numérotées et les Sirènes."],
      ["Sirènes", "Battent les cartes numérotées et le Skull King, mais perdent contre les Pirates."],
      ["Skull King", "Bat les Pirates et les cartes numérotées, mais perd contre une Sirène."],
      ["Fuite", "Ne gagne jamais, sauf si tout le monde fuit : le premier à avoir joué une Fuite emporte le pli."],
      ["Tigresse", "Se joue au choix comme un Pirate ou comme une Fuite."],
    ],
  },
  {
    title: "Bonus de pli",
    Icon: Skull,
    accent: "#E05168",
    items: [
      ["14 de couleur", "+10 points par 14 vert, violet ou jaune remporté."],
      ["14 noir", "+20 points pour le 14 de l'atout noir."],
      ["Sirène capturée par un Pirate", "+20 points par Sirène."],
      ["Pirate capturé par le Skull King", "+30 points par Pirate, Tigresse incluse."],
      ["Skull King capturé par une Sirène", "+40 points."],
    ],
  },
  {
    title: "Cartes Butin",
    Icon: Coins,
    accent: "#F2B544",
    items: [
      ["Alliance", "Celui qui joue un Butin s'allie au gagnant du pli. Si les deux réussissent leur pari, chacun gagne 20 points, même sans pli remporté."],
    ],
  },
  {
    title: "Kraken et Baleine blanche",
    Icon: Waves,
    accent: "#2DD4BF",
    items: [
      ["Kraken", "Le pli où il est joué est détruit : personne ne le remporte."],
      ["Baleine blanche", "Les cartes spéciales perdent leur pouvoir. Dans l'application, le pli est compté comme défaussé."],
      ["Dans l'application", "Cochez la carte jouée : le nombre de plis à attribuer baisse d'un."],
    ],
  },
  {
    title: "Pouvoirs des pirates",
    Icon: Flame,
    accent: "#E05168",
    items: [
      ["Flambeur (Rascal de Roatán)", "Son détenteur mise 0, 10 ou 20 points : gagnés si son pari est exact, perdus sinon."],
      ["Harry le Géant", "Après le dernier pli, son détenteur peut modifier son pari de 1 en plus ou en moins. La carte est unique : un seul joueur la détient."],
      ["Autres pouvoirs", "Les autres pirates ont des effets de jeu qui ne changent pas le décompte."],
    ],
  },
  {
    title: "Variante Rascal",
    Icon: Target,
    accent: "#A78BFA",
    items: [
      ["Chevrotine", "10 points par carte : tout si le pari est exact, la moitié s'il est à un pli près, rien sinon. Les bonus suivent la même proportion."],
      ["Boulet de canon", "Choisi par joueur à chaque manche : 15 points par carte si le pari est exact, sinon rien."],
    ],
  },
];

/** Aide-mémoire des règles affiché depuis les réglages. */
export function RulesContent() {
  return (
    <div className="flex flex-col gap-5 pt-1">
      <h2 className="m-0 font-['Pirata_One'] text-[28px] font-normal leading-none text-[#F2B544]">Règles du jeu</h2>
      {SECTIONS.map(({ title, Icon, accent, items }) => (
        <section key={title} className="flex flex-col gap-2">
          <h3 className="m-0 flex items-center gap-2 font-['Pirata_One'] text-[22px] font-normal leading-none">
            <Icon size={18} strokeWidth={2} className="flex-none" style={{ color: accent }} aria-hidden="true" />
            {title}
          </h3>
          <dl className="m-0 flex flex-col divide-y divide-[#1E2A43] rounded-2xl border border-[#1E2A43] bg-[#0B1322]">
            {items.map(([term, definition]) => (
              <div key={term} className="px-3 py-2.5">
                <dt className="text-[14px] font-bold leading-tight text-[#E8ECF4]">{term}</dt>
                <dd className="m-0 mt-0.5 text-[13.5px] leading-snug text-[#94A0B8]">{definition}</dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </div>
  );
}

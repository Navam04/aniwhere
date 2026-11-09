"""Story (chronological) watch orders for franchises where it differs from release order.

Each guide lists AniList romaji titles in story order. A franchise collection uses the guide whose
titles it contains most; titles are matched exactly (ignoring case and punctuation), so a renamed or
missing entry is just skipped. Entries a guide doesn't mention (spin-offs, recaps, alternate cuts)
are listed after it by the frontend."""
import re

GUIDES = {
    "Naruto": ["NARUTO", "NARUTO: Shippuuden", "THE LAST: NARUTO THE MOVIE", "BORUTO: NARUTO THE MOVIE",
               "BORUTO: NARUTO NEXT GENERATIONS", "BORUTO: NARUTO NEXT GENERATIONS Part 2"],
    "Jujutsu Kaisen": ["Jujutsu Kaisen 0", "Jujutsu Kaisen", "Jujutsu Kaisen 2nd Season",
                       "Jujutsu Kaisen: Shimetsu Kaiyuu - Zenpen", "Jujutsu Kaisen: Shimetsu Kaiyuu - Kouhen"],
    "Demon Slayer": ["Kimetsu no Yaiba", "Kimetsu no Yaiba: Mugen Ressha-hen", "Kimetsu no Yaiba: Yuukaku-hen",
                     "Kimetsu no Yaiba: Katanakaji no Sato-hen", "Kimetsu no Yaiba: Hashira Geiko-hen",
                     "Kimetsu no Yaiba: Mugenjou-hen Movie 1 - Akaza Sairai", "Kimetsu no Yaiba: Mugenjou-hen Movie 2",
                     "Kimetsu no Yaiba: Mugenjou-hen Movie 3"],
    "Fate": ["Fate/Zero", "Fate/Zero 2nd Season", "Fate/stay night", "Fate/stay night: Unlimited Blade Works",
             "Fate/stay night: Unlimited Blade Works 2nd Season", "Fate/stay night [Heaven's Feel] I. presage flower",
             "Fate/stay night [Heaven's Feel] II. lost butterfly", "Fate/stay night [Heaven's Feel] III. spring song"],
    "Monogatari": ["Kizumonogatari I: Tekketsu-hen", "Kizumonogatari II: Nekketsu-hen", "Kizumonogatari III: Reiketsu-hen",
                   "Nekomonogatari (Kuro)", "Bakemonogatari", "Nisemonogatari", "Monogatari Series: Second Season",
                   "Tsukimonogatari", "Owarimonogatari", "Koyomimonogatari", "Owarimonogatari (Ge)", "Hanamonogatari",
                   "Zoku Owarimonogatari", "Monogatari Series: Off & Monster Season"],
    "Steins;Gate": ["Steins;Gate", "Steins;Gate: Kyoukaimenjou no Missing Link - Divide By Zero", "Steins;Gate 0",
                    "Steins;Gate: Fuka Ryouiki no Déjà vu"],
    "Code Geass": ["Code Geass: Hangyaku no Lelouch", "Code Geass: Hangyaku no Lelouch R2", "Code Geass: Fukkatsu no Lelouch"],
    "Evangelion": ["Shin Seiki Evangelion", "Shin Seiki Evangelion Movie: Air / Magokoro wo, Kimi ni",
                   "Evangelion Shin Movie: Jo", "Evangelion Shin Movie: Ha", "Evangelion Shin Movie: Kyuu",
                   "Shin Evangelion Movie:||"],
    "Sword Art Online": ["Sword Art Online: Progressive - Hoshinaki Yoru no Aria",
                         "Sword Art Online: Progressive - Kuraki Yuuyami no Scherzo", "Sword Art Online",
                         "Sword Art Online: Extra Edition", "Sword Art Online II", "Sword Art Online: Ordinal Scale",
                         "Sword Art Online: Alicization", "Sword Art Online: Alicization - War of Underworld",
                         "Sword Art Online: Alicization - War of Underworld Part 2"],
    "My Hero Academia": ["Boku no Hero Academia", "Boku no Hero Academia 2", "Boku no Hero Academia 3",
                         "Boku no Hero Academia THE MOVIE: Futari no Hero", "Boku no Hero Academia 4",
                         "Boku no Hero Academia THE MOVIE: Heroes:Rising", "Boku no Hero Academia 5",
                         "Boku no Hero Academia THE MOVIE: World Heroes' Mission", "Boku no Hero Academia 6",
                         "Boku no Hero Academia 7", "Boku no Hero Academia THE MOVIE: YOU'RE NEXT",
                         "Boku no Hero Academia FINAL SEASON"],
    "Dragon Ball": ["Dragon Ball", "Dragon Ball Z", "Dragon Ball DAIMA", "Dragon Ball Super", "Dragon Ball Super: Broly",
                    "Dragon Ball Super: Super Hero", "Dragon Ball GT"],
}


def _norm(s):
    return re.sub(r"[^a-z0-9]+", "", (s or "").lower())


def story_order(items):
    """(guide name, [anilist ids in story order]) for a franchise's media, or (None, None)."""
    by_title = {}
    for m in items:
        t = m.get("title") or {}
        for name in (t.get("romaji"), t.get("english")):
            if name:
                by_title.setdefault(_norm(name), m["id"])
    best = (None, [])
    for name, titles in GUIDES.items():
        ids = [by_title[_norm(t)] for t in titles if _norm(t) in by_title]
        ids = list(dict.fromkeys(ids))
        if len(ids) > len(best[1]):
            best = (name, ids)
    name, ids = best
    return (name, ids) if len(ids) >= 3 else (None, None)

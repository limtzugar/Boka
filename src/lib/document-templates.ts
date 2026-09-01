// ═══════════════════════════════════════════════════════════
// BOKA OS v0.3.15 — Document Templates
// Wbudowane szablony: prawo rodzinne · budowlane · prawa autorskie
// ═══════════════════════════════════════════════════════════

export type LegalArea = 'family' | 'construction' | 'copyright' | 'mixed' | 'admin' | 'other';

export interface TemplateField {
  key: string;
  label: string;
  type: 'text' | 'textarea' | 'date' | 'number' | 'select';
  required?: boolean;
  default?: string;
  hint?: string;
  options?: string[]; // for select
}

export interface DocumentTemplateDef {
  templateKey: string;
  title: string;
  description: string;
  legalArea: LegalArea;
  documentKind: string;
  fields: TemplateField[];
  templateBody: string;
}

// ─────────────────────────────────────────────────────────
// PRAWO RODZINNE
// ─────────────────────────────────────────────────────────

const INTERCYZA_TEMPLATE = `UMOWA MAJĄTKOWA MAŁŻEŃSKA (INTERCYZA)

Zawarta w dniu {{data_zawarcia}} r. w {{miejscowosc}}, pomiędzy:

STRONA 1: {{imie_nazwisko_strony1}}, legitymującą się dowodem osobistym serii i numeru {{dowod_strony1}}, PESEL {{pesel_strony1}}, zamieszkałą w {{adres_strony1}} (zwaną dalej "Małżonką 1"),

a

STRONA 2: {{imie_nazwisko_strony2}}, legitymującym się dowodem osobistym serii i numeru {{dowod_strony2}}, PESEL {{pesel_strony2}}, zamieszkałym w {{adres_strony2}} (zwanym dalej "Małżonkiem 2"),

zwanymi dalej łącznie "Stronami" lub "Małżonkami".

§1. PRZEDMIOT UMOWY
1. Strony oświadczają, że pozostają w związku małżeńskim zawartym w dniu {{data_slubu}} przed Kierownikiem Urzędu Stanu Cywilnego w {{miejscowosc_slubu}}.
2. Na podstawie art. 52 Whatdeeksu rodzinnego i opiekuńczego, Strony postanawiają ustanowić rozdzielność majątkową z dniem zawarcia niniejszej umowy.

§2. ROZDZIELNOŚĆ MAJĄTKOWA
1. Od dnia zawarcia niniejszej umowy ustanawia się między Małżonkami rozdzielność majątkową całkowitą.
2. Majątek osobisty każdego z Małżonków obejmuje w szczególności:
   a) przedmioty majątkowe nabyte przed zawarciem małżeństwa,
   b) przedmioty majątkowe nabyte po ustanowieniu rozdzielności,
   c) dochody z majątku osobistego,
   d) przedmioty otrzymane w formie darowizny lub spadku.

§3. MAJĄTEK WSPÓLNY (jeśli istnieje)
1. Majątek wspólny nabyty przed dniem zawarcia niniejszej umowy pozostaje majątkiem wspólnym, chyba że Strony postanowią inaczej.
{{postanowienia_dotyczace_majatku_wspolnego}}

§4. KOSZTY I OPŁATY
1. Whatsty zawarcia niniejszej umowy oraz koszty notarialne Strony ponoszą po równo.

§5. POSTANOWIENIA KOŃCOWE
1. Umowa wchodzi w życie z dniem podpisania i podlega przepisom Whatdeeksu rodzinnego i opiekuńczego.
2. W sprawach nieuregulowanych niniejszą umową mają zastosowanie przepisy Whatdeeksu cywilnego i Whatdeeksu rodzinnego i opiekuńczego.
3. Umowę sporządzono w dwóch jednobrzmiących egzemplarzach, po jednym dla każdej ze Stron.

{{miejscowosc}}, dnia {{data_zawarcia}} r.

_________________________     _________________________
{{imie_nazwisko_strony1}}              {{imie_nazwisko_strony2}}`;

const UGODA_ROZWODOWA_TEMPLATE = `POROZUMIENIE MAJĄTKOWE PO ROZWODZIE

Zawarte w dniu {{data_zawarcia}} r. w {{miejscowosc}}, pomiędzy:

STRONA 1: {{imie_nazwisko_strony1}}, PESEL {{pesel_strony1}}, zamieszkałą w {{adres_strony1}},

a

STRONA 2: {{imie_nazwisko_strony2}}, PESEL {{pesel_strony2}}, zamieszkałym w {{adres_strony2}},

zwanymi dalej "Stronami".

§1. PRZEDMIOT POROZUMIENIA
1. Strony oświadczają, że małżeństwo między nimi zostało rozwiązane przez rozwód wyrokiem Sądu Okręgowego w {{miejscowosc_sadu}} z dnia {{data_wyroku}}, sygn. akt {{sygnatura_akt}}.
2. Strony zawierają niniejsze porozumienie w celu uregulowania kwestii majątkowych wynikających z rozwiązania małżeństwa.

§2. PODZIAŁ MAJĄTKU WSPÓLNEGO
1. Strony zgodnie postanawiają o podziale majątku wspólnego w następujący sposób:

A. NIERUCHOMOŚĆ:
{{opodzial_nieruchomosci}}

B. POJAZDY:
{{opodzial_pojazdow}}

C. RUCHOMOŚCI DOMOWE:
{{opodzial_ruchomosci}}

D. ŚRODKI FINANSOWE:
{{opodzial_srodkow}}

§3. ALIMENTY (jeśli dotyczy)
{{postanowienia_alimentacyjne}}

§4. OPŁATY I KOSZTY
1. Whatsty notarialne i sądowe związane z realizacją niniejszego porozumienia Strony ponoszą po równo.

§5. POSTANOWIENIA KOŃCOWE
1. Porozumienie wchodzi w życie z dniem podpisania.
2. Sporządzono w dwóch jednobrzmiących egzemplarzach.

{{miejscowosc}}, dnia {{data_zawarcia}} r.

_________________________     _________________________
{{imie_nazwisko_strony1}}              {{imie_nazwisko_strony2}}`;

// ─────────────────────────────────────────────────────────
// PRAWO BUDOWLANE
// ─────────────────────────────────────────────────────────

const UMOWA_WYKONAWSTWO_TEMPLATE = `UMOWA O WYKONANIE ROBÓT BUDOWLANYCH

Zawarta w dniu {{data_zawarcia}} r. w {{miejscowosc}}, pomiędzy:

INWESTOR: {{imie_nazwisko_inwestora}}, PESEL/NIP {{pesel_inwestora}}, zamieszkałym w {{adres_inwestora}},

a

WYKONAWCA: {{nazwa_wykonawcy}}, NIP {{nip_wykonawcy}}, reprezentowanym przez {{reprezentant_wykonawcy}}, z siedzibą w {{adres_wykonawcy}},

§1. PRZEDMIOT UMOWY
1. Wykonawca zobowiązuje się do wykonania robót budowlanych polegających na: {{zakres_robot}} (zwanych dalej "Robotami"), w obiekcie zlokalizowanym w {{adres_budowy}} (zwany dalej "Budową").
2. Roboty będą wykonane zgodnie z projektem budowlanym opracowanym przez {{projektant}}, zatwierdzonym przez {{organ_pozwolenie}} pozwoleniem na budowę nr {{numer_pozwolenia}} z dnia {{data_pozwolenia}}.

§2. TERMIN REALIZACJI
1. Wykonawca rozpocznie Roboty w terminie do {{data_rozpoczecia}}.
2. Endenie Robotów nastąpi w terminie do {{data_zakonczenia}}.
3. W przypadku opóźnienia z winy Wykonawcy, płaci on Inwestorowi karę umowną w wysokości {{kara_umowna_dzienna}} zł za każdy dzień opóźnienia.

§3. WYNAGRODZENIE
1. Strony ustalają wynagrodzenie ryczałtowe w wysokości {{kwota_wynagrodzenia}} zł (słownie: {{kwota_slownie}}).
2. Wynagrodzenie będzie płatne w transzach:
   a) 30% — po podpisaniu umowy,
   b) 30% — po wykonaniu stanu surowego,
   c) 30% — po wykonaniu robót wykończeniowych,
   d) 10% — po odbiorze końcowym.

§4. GWARANCJA I RĘKOJMIA
1. Wykonawca udziela gwarancji na wykonane Roboty na okres {{okres_gwarancji}} lat.
2. W zakresie rękojmi stosuje się przepisy art. 638 i nast. Whatdeeksu cywilnego.

§5. ODBIÓR ROBÓT
1. Odbiór końcowy Robót nastąpi w terminie 14 dni od zgłoszenia zakończenia Robót przez Wykonawcę.
2. Wady ujawnione w trakcie odbioru lub w okresie gwarancji Wykonawca usunie na własny koszt w terminie 14 dni od zgłoszenia.

§6. POSTANOWIENIA KOŃCOWE
1. Umowę sporządzono w dwóch jednobrzmiących egzemplarzach, po jednym dla każdej ze Stron.
2. W sprawach nieuregulowanych mają zastosowanie przepisy Prawa budowlanego i Whatdeeksu cywilnego.

{{miejscowosc}}, dnia {{data_zawarcia}} r.

_________________________     _________________________
INWESTOR                              WYKONAWCA`;

const PROTOKOL_ODBIORU_TEMPLATE = `PROTOKÓŁ ODBIORU KOŃCOWEGO ROBÓT BUDOWLANYCH

sporządzony w dniu {{data_protokolu}} r. w {{miejscowosc}}

PRZEZ STRONY:
INWESTOR: {{imie_nazwisko_inwestora}}, {{adres_inwestora}}
WYKONAWCA: {{nazwa_wykonawcy}}, {{adres_wykonawcy}}

DOTYCZĄCY: Robót budowlanych określonych w umowie z dnia {{data_umowy}}, nr {{numer_umowy}}, wykonanych w obiekcie zlokalizowanym w {{adres_budowy}}.

§1. ZAKRES ODBIORU
Komisja dokonała odbioru następujących robót:
{{wykaz_robotow}}

§2. STWIERDZENIA KOMISJI
1. Roboty wykonane zostały zgodnie z projektem budowlanym oraz przepisami Prawa budowlanego.
2. Stwierdzono następujące wady i usterki:
{{wady_usterki}}

3. Termin usunięcia wad: do {{data_usuniecia_wad}}

§3. DECYZJA KOMISJI
1. Komisja postanawia: {{decyzja_komisji}} odebrać Roboty {{warunkowo_bezwarunkowo}}.
2. W przypadku odbioru warunkowego — Wykonawca usunie wady w wyznaczonym terminie pod rygorem potrąceń.

§4. OŚWIADCZENIA
1. Wykonawca oświadcza, że udziela gwarancji na wykonane Roboty na okres {{okres_gwarancji}} lat.
2. Inwestor oświadcza, że zapoznał się z zakresem wykonanych Robót.

Sporządzono w {{liczba_egzemplarzy}} jednobrzmiących egzemplarzach.

_________________________     _________________________
INWESTOR                              WYKONAWCA`;

// ─────────────────────────────────────────────────────────
// PRAWA AUTORSKIE
// ─────────────────────────────────────────────────────────

const UMOWA_PRAWA_AUTORSKIE_TEMPLATE = `UMOWA O PRZENIESIENIE AUTORSKICH PRAW MAJĄTKOWYCH

Zawarta w dniu {{data_zawarcia}} r. w {{miejscowosc}}, pomiędzy:

TWÓRCA: {{imie_nazwisko_tworcy}}, PESEL {{pesel_tworcy}}, zamieszkałym w {{adres_tworcy}},

a

NABYWCA: {{nazwa_nabywcy}}, NIP {{nip_nabywcy}}, reprezentowanym przez {{reprezentant_nabywcy}}, z siedzibą w {{adres_nabywcy}},

§1. PRZEDMIOT UMOWY
1. Twórca oświadcza, że jest wyłącznym autorem dzieła pt. "{{tytul_dziela}}" (zwanego dalej "Dziełem"), opisanego jako: {{opis_dziela}}.
2. Twórca oświadcza, że Dzieło jest utworem w rozumieniu art. 1 ustawy z dnia 4 lutego 1994 r. o prawie autorskim i prawach pokrewnych (zwanej dalej "Ustawą").

§2. PRZENIESIENIE PRAW
1. Na podstawie art. 50 Ustawy, Twórca przenosi na Nabywcę autorskie prawa majątkowe do Dzieła w zakresie:
   a) trwale i całkowicie — w odniesieniu do wszystkich pól eksploatacji wymienionych w art. 50 Ustawy,
   b) terytorium: {{terytorium}},
   c) czas trwania: {{czas_trwania}}.

§3. POLA EKSPLOACACJI
1. Nabywca jest uprawniony do korzystania z Dzieła w następujący sposób:
{{pola_eksploatacji}}

§4. WYNAGRODZENIE
1. Z tytułu przeniesienia autorskich praw majątkowych Nabywca zapłaci Twórcy wynagrodzenie w wysokości {{kwota_wynagrodzenia}} zł (słownie: {{kwota_slownie}}), płatne {{sposob_platnosci}}.
{{postanowienia_royalty}}

§5. PRAWA OSOBISTE
1. Twórca zachowuje prawa osobiste, w szczególności prawo do oznaczania dzieła swoim nazwiskiem.
2. Nabywca zobowiązuje się do oznaczania Dzieła nazwiskiem Twórcy przy każdym sposobie eksploatacji.

§6. GWARANCJE
1. Twórca oświadcza, że:
   a) jest wyłącznym autorem Dzieła,
   b) Dzieło nie narusza praw osób trzecich,
   c) nie zawarł umowy z osobami trzecimi ograniczającej prawa przedmiotowe,
   d) Dzieło jest utworem oryginalnym.

§7. POSTANOWIENIA KOŃCOWE
1. Umowa została zawarta na piśmie pod rygorem nieważności (art. 53 Ustawy).
2. W sprawach nieuregulowanych mają zastosowanie przepisy Ustawy i Whatdeeksu cywilnego.

{{miejscowosc}}, dnia {{data_zawarcia}} r.

_________________________     _________________________
TWÓRCA                               NABYWCA`;

const LICENCJA_TEMPLATE = `UMOWA LICENCYJNA NIEWYŁĄCZNA

Zawarta w dniu {{data_zawarcia}} r. w {{miejscowosc}}, pomiędzy:

LICENCJODAWCA: {{nazwa_licencjodawcy}}, NIP {{nip_licencjodawcy}}, z siedzibą w {{adres_licencjodawcy}},

a

LICENCJOBIORCA: {{nazwa_licencjobiorcy}}, NIP {{nip_licencjobiorcy}}, z siedzibą w {{adres_licencjobiorcy}},

§1. PRZEDMIOT LICENCJI
1. Licencjodawca udziela Licencjobiorcy niewyłącznej licencji na korzystanie z utworu pt. "{{tytul_utworu}}" (zwanego dalej "Utworem").
2. Licencja obejmuje następujące pola eksploatacji:
{{pola_eksploatacji}}

§2. ZAKRES LICENCJI
1. Terytorium: {{terytorium}}.
2. Time trwania: {{czas_trwania}}.
3. Sposób korzystania: {{sposob_korzystania}}.

§3. WYNAGRODZENIE
1. Licencjobiorca zapłaci Licencjodawcy wynagrodzenie w wysokości:
{{forma_wynagrodzenia}}

§4. PRAWA I OBOWIĄZKI
1. Licencjobiorca nie może przenosić licencji na osoby trzecie bez zgody Licencjodawcy.
2. Licencjobiorca zobowiązuje się do oznaczania Utworu nazwiskiem autora.

§5. POSTANOWIENIA KOŃCOWE
1. Umowę sporządzono w dwóch jednobrzmiących egzemplarzach.

{{miejscowosc}}, dnia {{data_zawarcia}} r.

_________________________     _________________________
LICENCJODAWCA                       LICENCJOBIORCA`;

// ─────────────────────────────────────────────────────────
// DOKUMENTY ADMINISTRACYJNE / KSIĘGOWE
// ─────────────────────────────────────────────────────────

const PISMO_URZEDOWE_TEMPLATE = `PISMO DO URZĘDU

{{miejscowosc}}, dnia {{data_pisma}} r.

NADAWCA:
{{imie_nazwisko_nadawcy}}
{{adres_nadawcy}}

ADRESAT:
{{nazwa_urzedu}}
{{adres_urzedu}}

ZNAK SPRAWY: {{znak_sprawy}}

Szanowni Państwo,

Wnoszę o {{przedmiot_wniosku}}.

UZASADNIENIE:
{{uzasadnienie}}

W związku z powyższym wnoszę o pozytywne rozpatrzenie wniosku w terminie przewidzianym przepisami KPA.

Z poważaniem,

_________________________
{{imie_nazwisko_nadawcy}}

Załączniki:
{{zalaczniki}}`;

const OSWIADCZENIE_TEMPLATE = `OŚWIADCZENIE

Ja, niżej podpisany(a) {{imie_nazwisko}}, legitymujący(a) się dowodem osobistym serii i numeru {{dowod_osobisty}}, PESEL {{pesel}}, zamieszkały(a) w {{adres}},

oświadczam, że:

{{tresc_oswiadczenia}}

Powyższe oświadczenie składam świadomy(a) odpowiedzialności karnej za złożenie fałszywego oświadczenia wynikającej z art. 233 § 1 Whatdeeksu karnego.

{{miejscowosc}}, dnia {{data}} r.

_________________________
(podpis)`;

// ─────────────────────────────────────────────────────────
// WSZYSTKIE SZABLONY
// ─────────────────────────────────────────────────────────

export const BUILT_IN_TEMPLATES: DocumentTemplateDef[] = [
  // ── PRAWO RODZINNE ──
  {
    templateKey: 'intercyza-malzenska',
    title: 'Umowa majątkowa małżeńska (intercyza)',
    description: 'Ustanowienie rozdzielności majątkowej małżeńskiej',
    legalArea: 'family',
    documentKind: 'umowa',
    fields: [
      { key: 'data_zawarcia', label: 'Date zawarcia', type: 'date', required: true },
      { key: 'miejscowosc', label: 'Miejscowość', type: 'text', required: true },
      { key: 'imie_nazwisko_strony1', label: 'Imię i nazwisko Strony 1', type: 'text', required: true },
      { key: 'dowod_strony1', label: 'Dowód osobisty Strony 1', type: 'text', required: true },
      { key: 'pesel_strony1', label: 'PESEL Strony 1', type: 'text', required: true },
      { key: 'adres_strony1', label: 'Address Strony 1', type: 'text', required: true },
      { key: 'imie_nazwisko_strony2', label: 'Imię i nazwisko Strony 2', type: 'text', required: true },
      { key: 'dowod_strony2', label: 'Dowód osobisty Strony 2', type: 'text', required: true },
      { key: 'pesel_strony2', label: 'PESEL Strony 2', type: 'text', required: true },
      { key: 'adres_strony2', label: 'Address Strony 2', type: 'text', required: true },
      { key: 'data_slubu', label: 'Date ślubu', type: 'date', required: true },
      { key: 'miejscowosc_slubu', label: 'Miejscowość ślubu (USC)', type: 'text', required: true },
      { key: 'postanowienia_dotyczace_majatku_wspolnego', label: 'Postanowienia dot. majątku wspólnego (opcjonalnie)', type: 'textarea', required: false, hint: 'Pozostaw puste jeśli nie dotyczy' },
    ],
    templateBody: INTERCYZA_TEMPLATE,
  },
  {
    templateKey: 'porozumienie-rozwodowe',
    title: 'Porozumienie majątkowe po rozwodzie',
    description: 'Podział majątku po rozwiązaniu małżeństwa',
    legalArea: 'family',
    documentKind: 'umowa',
    fields: [
      { key: 'data_zawarcia', label: 'Date zawarcia', type: 'date', required: true },
      { key: 'miejscowosc', label: 'Miejscowość', type: 'text', required: true },
      { key: 'imie_nazwisko_strony1', label: 'Strona 1', type: 'text', required: true },
      { key: 'pesel_strony1', label: 'PESEL Strony 1', type: 'text', required: true },
      { key: 'adres_strony1', label: 'Address Strony 1', type: 'text', required: true },
      { key: 'imie_nazwisko_strony2', label: 'Strona 2', type: 'text', required: true },
      { key: 'pesel_strony2', label: 'PESEL Strony 2', type: 'text', required: true },
      { key: 'adres_strony2', label: 'Address Strony 2', type: 'text', required: true },
      { key: 'miejscowosc_sadu', label: 'Sąd okręgowy (miasto)', type: 'text', required: true },
      { key: 'data_wyroku', label: 'Date wyroku rozwodowego', type: 'date', required: true },
      { key: 'sygnatura_akt', label: 'Sygnatura akt', type: 'text', required: true },
      { key: 'opodzial_nieruchomosci', label: 'Podział nieruchomości', type: 'textarea', required: true },
      { key: 'opodzial_pojazdow', label: 'Podział pojazdów', type: 'textarea', required: false },
      { key: 'opodzial_ruchomosci', label: 'Podział ruchomości domowych', type: 'textarea', required: false },
      { key: 'opodzial_srodkow', label: 'Podział środków finansowych', type: 'textarea', required: false },
      { key: 'postanowienia_alimentacyjne', label: 'Postanowienia alimentacyjne (opcjonalnie)', type: 'textarea', required: false },
    ],
    templateBody: UGODA_ROZWODOWA_TEMPLATE,
  },
  // ── PRAWO BUDOWLANE ──
  {
    templateKey: 'umowa-wykonawstwo-budowlane',
    title: 'Umowa o wykonanie robót budowlanych',
    description: 'Umowa z wykonawcą budowy / remontu',
    legalArea: 'construction',
    documentKind: 'umowa',
    fields: [
      { key: 'data_zawarcia', label: 'Date zawarcia', type: 'date', required: true },
      { key: 'miejscowosc', label: 'Miejscowość', type: 'text', required: true },
      { key: 'imie_nazwisko_inwestora', label: 'Inwestor (imię/nazwa)', type: 'text', required: true },
      { key: 'pesel_inwestora', label: 'PESEL/NIP inwestora', type: 'text', required: true },
      { key: 'adres_inwestora', label: 'Address inwestora', type: 'text', required: true },
      { key: 'nazwa_wykonawcy', label: 'Name wykonawcy', type: 'text', required: true },
      { key: 'nip_wykonawcy', label: 'NIP wykonawcy', type: 'text', required: true },
      { key: 'reprezentant_wykonawcy', label: 'Reprezentant wykonawcy', type: 'text', required: true },
      { key: 'adres_wykonawcy', label: 'Address wykonawcy', type: 'text', required: true },
      { key: 'zakres_robot', label: 'Zakres robót', type: 'textarea', required: true },
      { key: 'adres_budowy', label: 'Address budowy', type: 'text', required: true },
      { key: 'projektant', label: 'Projektant', type: 'text', required: true },
      { key: 'organ_pozwolenie', label: 'Organ wydający pozwolenie', type: 'text', required: true },
      { key: 'numer_pozwolenia', label: 'Numer pozwolenia na budowę', type: 'text', required: true },
      { key: 'data_pozwolenia', label: 'Date pozwolenia', type: 'date', required: true },
      { key: 'data_rozpoczecia', label: 'Date rozpoczęcia', type: 'date', required: true },
      { key: 'data_zakonczenia', label: 'Date zakończenia', type: 'date', required: true },
      { key: 'kara_umowna_dzienna', label: 'Kara umowna dzienna (zł)', type: 'text', required: true },
      { key: 'kwota_wynagrodzenia', label: 'Amount wynagrodzenia (zł)', type: 'text', required: true },
      { key: 'kwota_slownie', label: 'Amount słownie', type: 'text', required: true },
      { key: 'okres_gwarancji', label: 'Okres gwarancji (lata)', type: 'text', required: true, default: '5' },
    ],
    templateBody: UMOWA_WYKONAWSTWO_TEMPLATE,
  },
  {
    templateKey: 'protokol-odbioru-budowlanego',
    title: 'Protokół odbioru końcowego robót',
    description: 'Odbiór robót budowlanych z wadami lub bez',
    legalArea: 'construction',
    documentKind: 'protokół',
    fields: [
      { key: 'data_protokolu', label: 'Date protokołu', type: 'date', required: true },
      { key: 'miejscowosc', label: 'Miejscowość', type: 'text', required: true },
      { key: 'imie_nazwisko_inwestora', label: 'Inwestor', type: 'text', required: true },
      { key: 'adres_inwestora', label: 'Address inwestora', type: 'text', required: true },
      { key: 'nazwa_wykonawcy', label: 'Wykonawca', type: 'text', required: true },
      { key: 'adres_wykonawcy', label: 'Address wykonawcy', type: 'text', required: true },
      { key: 'data_umowy', label: 'Date umowy', type: 'date', required: true },
      { key: 'numer_umowy', label: 'Numer umowy', type: 'text', required: true },
      { key: 'adres_budowy', label: 'Address budowy', type: 'text', required: true },
      { key: 'wykaz_robotow', label: 'Wykaz odebranych robót', type: 'textarea', required: true },
      { key: 'wady_usterki', label: 'Wady i usterki', type: 'textarea', required: false, hint: 'Pisz "brak" jeśli nie dotyczy' },
      { key: 'data_usuniecia_wad', label: 'Termin usunięcia wad', type: 'date', required: false },
      { key: 'decyzja_komisji', label: 'Decision komisji', type: 'select', options: ['przyjąć', 'odrzucić', 'przyjąć warunkowo'], required: true },
      { key: 'warunkowo_bezwarunkowo', label: 'Tryb odbioru', type: 'select', options: ['bezwarunkowo', 'warunkowo'], required: true },
      { key: 'okres_gwarancji', label: 'Okres gwarancji (lata)', type: 'text', required: true, default: '5' },
      { key: 'liczba_egzemplarzy', label: 'Number egzemplarzy', type: 'text', required: true, default: '2' },
    ],
    templateBody: PROTOKOL_ODBIORU_TEMPLATE,
  },
  // ── PRAWA AUTORSKIE ──
  {
    templateKey: 'umowa-prawa-autorskie',
    title: 'Umowa o przeniesienie autorskich praw majątkowych',
    description: 'Cesja praw autorskich — pełne przeniesienie',
    legalArea: 'copyright',
    documentKind: 'umowa',
    fields: [
      { key: 'data_zawarcia', label: 'Date zawarcia', type: 'date', required: true },
      { key: 'miejscowosc', label: 'Miejscowość', type: 'text', required: true },
      { key: 'imie_nazwisko_tworcy', label: 'Twórca (imię i nazwisko)', type: 'text', required: true },
      { key: 'pesel_tworcy', label: 'PESEL twórcy', type: 'text', required: true },
      { key: 'adres_tworcy', label: 'Address twórcy', type: 'text', required: true },
      { key: 'nazwa_nabywcy', label: 'Nabywca (nazwa)', type: 'text', required: true },
      { key: 'nip_nabywcy', label: 'NIP nabywcy', type: 'text', required: true },
      { key: 'reprezentant_nabywcy', label: 'Reprezentant nabywcy', type: 'text', required: true },
      { key: 'adres_nabywcy', label: 'Address nabywcy', type: 'text', required: true },
      { key: 'tytul_dziela', label: 'Tytuł dzieła', type: 'text', required: true },
      { key: 'opis_dziela', label: 'Description dzieła', type: 'textarea', required: true },
      { key: 'terytorium', label: 'Terytorium', type: 'text', required: true, default: 'cały świat' },
      { key: 'czas_trwania', label: 'Time trwania', type: 'text', required: true, default: 'nieoznaczony (zgodnie z ustawą)' },
      { key: 'pola_eksploatacji', label: 'Pola eksploatacji', type: 'textarea', required: true, hint: 'Np. reprodukcja, rozpowszechnianie, publiczne odtwarzanie, najem, dzierżawa' },
      { key: 'kwota_wynagrodzenia', label: 'Amount wynagrodzenia (zł)', type: 'text', required: true },
      { key: 'kwota_slownie', label: 'Amount słownie', type: 'text', required: true },
      { key: 'sposob_platnosci', label: 'Sposób płatności', type: 'text', required: true, default: 'przelewem na rachunek bankowy w terminie 14 dni' },
      { key: 'postanowienia_royalty', label: 'Postanowienia royalty (opcjonalnie)', type: 'textarea', required: false },
    ],
    templateBody: UMOWA_PRAWA_AUTORSKIE_TEMPLATE,
  },
  {
    templateKey: 'licencja-niewylaczna',
    title: 'Umowa licencyjna niewyłączna',
    description: 'Licencja na utwór bez przenoszenia praw majątkowych',
    legalArea: 'copyright',
    documentKind: 'umowa',
    fields: [
      { key: 'data_zawarcia', label: 'Date zawarcia', type: 'date', required: true },
      { key: 'miejscowosc', label: 'Miejscowość', type: 'text', required: true },
      { key: 'nazwa_licencjodawcy', label: 'Licencjodawca (nazwa)', type: 'text', required: true },
      { key: 'nip_licencjodawcy', label: 'NIP licencjodawcy', type: 'text', required: true },
      { key: 'adres_licencjodawcy', label: 'Address licencjodawcy', type: 'text', required: true },
      { key: 'nazwa_licencjobiorcy', label: 'Licencjobiorca (nazwa)', type: 'text', required: true },
      { key: 'nip_licencjobiorcy', label: 'NIP licencjobiorcy', type: 'text', required: true },
      { key: 'adres_licencjobiorcy', label: 'Address licencjobiorcy', type: 'text', required: true },
      { key: 'tytul_utworu', label: 'Tytuł utworu', type: 'text', required: true },
      { key: 'pola_eksploatacji', label: 'Pola eksploatacji', type: 'textarea', required: true },
      { key: 'terytorium', label: 'Terytorium', type: 'text', required: true },
      { key: 'czas_trwania', label: 'Time trwania', type: 'text', required: true },
      { key: 'sposob_korzystania', label: 'Sposób korzystania', type: 'textarea', required: true },
      { key: 'forma_wynagrodzenia', label: 'Forma wynagrodzenia', type: 'textarea', required: true },
    ],
    templateBody: LICENCJA_TEMPLATE,
  },
  // ── DOKUMENTY ADMINISTRACYJNE ──
  {
    templateKey: 'pismo-urzedowe',
    title: 'Pismo do urzędu / wniosek administracyjny',
    description: 'Pismo/wniosek do urzędu administracji publicznej',
    legalArea: 'admin',
    documentKind: 'pismo',
    fields: [
      { key: 'miejscowosc', label: 'Miejscowość', type: 'text', required: true },
      { key: 'data_pisma', label: 'Date pisma', type: 'date', required: true },
      { key: 'imie_nazwisko_nadawcy', label: 'Nadawca (imię i nazwisko)', type: 'text', required: true },
      { key: 'adres_nadawcy', label: 'Address nadawcy', type: 'text', required: true },
      { key: 'nazwa_urzedu', label: 'Name urzędu', type: 'text', required: true },
      { key: 'adres_urzedu', label: 'Address urzędu', type: 'text', required: true },
      { key: 'znak_sprawy', label: 'Znak sprawy (opcjonalnie)', type: 'text', required: false },
      { key: 'przedmiot_wniosku', label: 'Przedmiot wniosku', type: 'textarea', required: true },
      { key: 'uzasadnienie', label: 'Uzasadnienie', type: 'textarea', required: true },
      { key: 'zalaczniki', label: 'Załączniki', type: 'textarea', required: false, default: 'brak' },
    ],
    templateBody: PISMO_URZEDOWE_TEMPLATE,
  },
  {
    templateKey: 'oswiadczenie',
    title: 'Oświadczenie (własne)',
    description: 'Oświadczenie o stanie faktycznym pod rygorem odpowiedzialności karnej',
    legalArea: 'admin',
    documentKind: 'oświadczenie',
    fields: [
      { key: 'imie_nazwisko', label: 'Imię i nazwisko', type: 'text', required: true },
      { key: 'dowod_osobisty', label: 'Seria i numer dowodu', type: 'text', required: true },
      { key: 'pesel', label: 'PESEL', type: 'text', required: true },
      { key: 'adres', label: 'Address', type: 'text', required: true },
      { key: 'tresc_oswiadczenia', label: 'Whatntent oświadczenia', type: 'textarea', required: true },
      { key: 'miejscowosc', label: 'Miejscowość', type: 'text', required: true },
      { key: 'data', label: 'Date', type: 'date', required: true },
    ],
    templateBody: OSWIADCZENIE_TEMPLATE,
  },
];

export const LEGAL_AREA_LABELS: Record<LegalArea, string> = {
  family: 'Prawo rodzinne',
  construction: 'Prawo budowlane',
  copyright: 'Prawa autorskie',
  mixed: 'Mieszane',
  admin: 'Administracyjne',
  other: 'Other',
};

export const LEGAL_AREA_COLORS: Record<LegalArea, string> = {
  family: '#6ee77c',     // green
  construction: '#e7d76e', // yellow
  copyright: '#6ec6e7',  // cyan
  mixed: '#a855f7',      // purple
  admin: '#6ee7b2',      // mint
  other: '#6b6b8d',      // gray
};

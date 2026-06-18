# Rozkład zajęć APOL — wersja na Androida (PWA)

Aplikacja webowa robi dokładnie to samo co exe na Windows: pobiera plan rocznika
z `wu.apol.edu.pl`, wyrzuca obce grupy ćwiczeniowe i obce seminaria, rysuje
graficzny rozkład i pozwala go zapisać/udostępnić jako PNG. Działa po
„zainstalowaniu na ekranie głównym” jak natywna apka — pełnoekranowo, z ikoną.

## Pliki w tym folderze (`pwa/`)
- `index.html` — interfejs
- `app.js` — cała logika (pobieranie, filtr, rysowanie canvas)
- `manifest.webmanifest` — metadane PWA (nazwa, ikony, kolor)
- `sw.js` — service worker (cache powłoki = działanie offline)
- `icon-192.png`, `icon-512.png` — ikony

---

## Trzy sposoby uruchomienia — wybierz jeden

### 1) Najprościej: hosting na GitHub Pages (5 minut, za darmo, zalecane)
1. Załóż konto na github.com (jeśli nie masz).
2. Utwórz nowe publiczne repozytorium, np. `plan-apol`.
3. Wgraj **całą zawartość folderu `pwa/`** (przeciągnij pliki w przeglądarce).
4. W repo: **Settings → Pages → Source: `Deploy from a branch` → Branch: `main` → `/ (root)` → Save**.
5. Po ~minucie GitHub pokaże adres typu `https://<twoj-login>.github.io/plan-apol/`.
6. Otwórz ten adres w **Chrome na telefonie** → menu „⋮” → **„Dodaj do ekranu głównego”**.
7. Masz ikonę na pulpicie. Otwiera się pełnoekranowo. Działa offline (sama
   powłoka; pobranie planu wymaga internetu).

### 2) Test bez hostingu (komputer + telefon w tej samej sieci Wi-Fi)
W folderze `pwa/`, w terminalu/PowerShellu:
```
python -m http.server 8000
```
Otwórz `http://<IP-komputera>:8000` w telefonie. Plan zadziała, ale
„Dodaj do ekranu głównego” i offline będą działać tylko po HTTPS — czyli po
zrobieniu pkt. 1.

### 3) Prawdziwy plik `.apk` (jeśli koniecznie chcesz APK)
Najprostsza znana droga to **PWABuilder** (Microsoft, darmowy, online).
1. Wykonaj najpierw krok 1 (hosting na GitHub Pages — PWABuilder wymaga URL).
2. Wejdź na `https://www.pwabuilder.com`.
3. Wklej swój adres `https://<twoj-login>.github.io/plan-apol/` → **Start**.
4. PWABuilder przeskanuje aplikację. Kliknij **Package For Stores → Android**.
5. W „Package options” możesz zostawić domyślne. Opcja **„Signing key: New”**
   wygeneruje klucz podpisujący — pobierz go i zachowaj.
6. **Download** → dostajesz ZIP z plikiem `.apk` (i `.aab` dla Google Play).
7. Przerzuć `.apk` na telefon, otwórz menedżerem plików, zezwól na instalację
   z nieznanego źródła i zainstaluj.

Wynik: prawdziwa apka Androida (technicznie tzw. „TWA” — Trusted Web Activity:
chowa pasek przeglądarki, pokazuje ikonę w szufladzie aplikacji, działa jak
natywna). Nie wymaga konta deweloperskiego ani publikacji w Google Play.

---

## Ważne: CORS (potencjalna pułapka)
Skrypty webowe podlegają polityce CORS — przeglądarka pyta serwer APOL,
czy zezwala na zapytania z innych domen. **Nie wiem z góry, czy serwer
uczelni to robi** (nie mogłem tego zdalnie sprawdzić). Aplikacja radzi sobie
tak:

- **Domyślnie**: próba bezpośrednia → jeśli CORS zablokuje, automatyczny
  fallback przez `corsproxy.io` (publiczne, darmowe proxy trzeciej strony).
- W „Ustawieniach” możesz wymusić jedno ze źródeł:
  - **Tylko bezpośrednio** — gdy nie chcesz proxy.
  - **Tylko przez proxy** — gdy bezpośrednio nie działa.
  - **Wklej JSON ręcznie** — aplikacja pokaże URL; otwierasz go w przeglądarce,
    kopiujesz odpowiedź i wklejasz. Zero zależności od proxy.

Plan zajęć jest publiczny (parametr `widok=STUDENT`, brak logowania), więc
przekazywanie URL przez proxy nie ujawnia haseł ani danych prywatnych.

## Konfiguracja w kodzie (góra pliku `app.js`)
- `GROUP_IDS` — komplet grup rocznika.
- W oknie aplikacji ustawiasz grupę ćwiczeniową (`sskp2024II_F1`) i nazwisko
  promotora (`Bekulard`); zostają zapamiętane przez przeglądarkę między
  uruchomieniami (chyba że wyczyścisz dane strony).

## Uwagi
- Render i logika filtrowania są jeden-do-jeden z wersją exe (ten sam test
  10/15 zajęć przepuściłem przez oba kody — wyniki identyczne).
- Plakietki „ZASTĘPSTWO” / „ODWOŁANE”, równoległe grupy obok siebie, skracanie
  zbyt długich nazw z przypisami pod planem — wszystko zachowane.
- Przycisk **„Udostępnij”** używa Web Share API (na Androidzie otworzy
  systemowe menu udostępniania — Messenger, WhatsApp, mail). Na pulpicie
  fallback to zapis PNG.

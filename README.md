# Plan zajęć — semestr zimowy 2026/2027

Interaktywna strona planu na podstawie pliku `plan_sem3.xls` i zrzutu ekranu z terminami zjazdów. Domyślnie pokazuje plan grupy Z301; można przełączyć się na Z302–Z305. Zawiera wybór jednego z ośmiu zjazdów, informację o grupach przy wspólnych przedmiotach, wyszukiwanie zajęć, aktualne komunikaty uczelni oraz trzy motywy: jasny, monochromatyczny E-ink i ciemny. Wybrany motyw jest zapamiętywany w przeglądarce.

## Budowanie i lokalne podglądanie

Build pobiera aktualny kanał RSS i tworzy katalog publikacji `dist/`:

```sh
npm run build
```

Uruchom podgląd z katalogu publikacji:

```sh
cd dist
python3 -m http.server 8000
```

Otwórz `http://localhost:8000`.

## Wdrożenie na Render

Utwórz usługę **New → Static Site**, połącz repozytorium i wybierz gałąź `main`:

- **Build Command:** `npm install && npm run build`
- **Publish Directory:** `dist`

Alternatywnie wybierz **New → Blueprint** — Render odczyta te same ustawienia z `render.yaml`.

## Dane i aktualizacje

`data/schedule.json` jest statycznym wyciągiem planu grup Z301–Z305 z dostarczonego arkusza. Godziny pokazują pełne, zwykle dwugodzinne bloki zajęć, zgodnie ze scalonymi komórkami w arkuszu. Terminy zjazdów są zapisane w `app.js` na podstawie dostarczonego zrzutu ekranu. Przy zmianie planu zaktualizuj dane w tych plikach i ponownie wdroż stronę.

Komunikaty są pobierane z publicznego kanału RSS `https://student.wwsi.edu.pl/feed/` podczas budowania strony. Statyczna witryna pokazuje migawkę z ostatniego builda; aby pobrać najnowsze wpisy, wybierz w Render **Manual Deploy → Deploy latest commit**. Jeżeli pobranie RSS nie powiedzie się, build użyje zapisanej migawki z `data/announcements.json` i wyświetli ostrzeżenie z jej datą. Gdy ani RSS, ani poprawna migawka nie będą dostępne, build zakończy się błędem. Strona `https://student.wwsi.edu.pl/komunikaty/` może przekierować do logowania; publiczne wpisy są dostępne przez kanał RSS.

Arkusz źródłowy zawiera zajęcia oznaczone numerami zjazdów 1–7; terminy ósmego zjazdu pochodzą ze zrzutu ekranu i pozostają widoczne w kalendarzu. Dla ósmego zjazdu strona wyświetla informację o braku danych w arkuszu zamiast zakładać, że zajęć nie ma — sprawdź wtedy komunikaty uczelni.

Parser i generowanie statycznego katalogu można przetestować lokalnie komendą `npm test`.

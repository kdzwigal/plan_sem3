# Plan zajęć — semestr zimowy 2026/2027

Interaktywna strona planu na podstawie pliku `plan_sem3.xls` i zrzutu ekranu z terminami zjazdów. Domyślnie pokazuje plan grupy Z301; można przełączyć się na Z302–Z305. Zawiera wybór jednego z ośmiu zjazdów, informację o grupach przy wspólnych przedmiotach, wyszukiwanie zajęć, aktualne komunikaty uczelni oraz trzy motywy: jasny, monochromatyczny E-ink i ciemny. Wybrany motyw jest zapamiętywany w przeglądarce.

## Budowanie i lokalne uruchamianie

Build tworzy pliki witryny w katalogu `dist/`:

```sh
npm run build
```

Uruchom serwer aplikacji:

```sh
npm start
```

Otwórz `http://localhost:3000`. Serwer podaje frontend i udostępnia endpoint `/api/announcements`, który pobiera kanał RSS na każde żądanie.

## Wdrożenie na Render

Utwórz usługę **New → Web Service**, połącz repozytorium i wybierz gałąź `feature/live-rss-web-service`:

- **Build Command:** `npm install && npm run build`
- **Start Command:** `npm start`

Alternatywnie wybierz **New → Blueprint** — Render odczyta ustawienia z `render.yaml`. Obecnej usługi Static Site nie da się zamienić na Web Service przez zmianę samego pliku; utwórz nową usługę Web Service z tej gałęzi.

## Dane i aktualizacje

`data/schedule.json` jest statycznym wyciągiem planu grup Z301–Z305 z dostarczonego arkusza. Godziny pokazują pełne, zwykle dwugodzinne bloki zajęć, zgodnie ze scalonymi komórkami w arkuszu. Terminy zjazdów są zapisane w `app.js` na podstawie dostarczonego zrzutu ekranu. Przy zmianie planu zaktualizuj dane w tych plikach i ponownie wdroż stronę.

Komunikaty są pobierane z publicznego kanału RSS `https://student.wwsi.edu.pl/feed/` przez serwer przy każdym wejściu na stronę. Dzięki temu lista jest aktualna bez ponownego wdrażania. Jeżeli RSS jest chwilowo niedostępny, serwer pokaże ostatnią zapisaną migawkę, oznaczając ją jako nieaktualną; po udanym pobraniu RSS przy kolejnych żądaniach korzysta z ostatnich danych z pamięci procesu. Strona `https://student.wwsi.edu.pl/komunikaty/` może przekierować do logowania; publiczne wpisy są dostępne przez kanał RSS.

Arkusz źródłowy zawiera zajęcia oznaczone numerami zjazdów 1–7; terminy ósmego zjazdu pochodzą ze zrzutu ekranu i pozostają widoczne w kalendarzu. Dla ósmego zjazdu strona wyświetla informację o braku danych w arkuszu zamiast zakładać, że zajęć nie ma — sprawdź wtedy komunikaty uczelni.

Parser RSS, endpoint serwera i build można przetestować lokalnie komendą `npm test`.

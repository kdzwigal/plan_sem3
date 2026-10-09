# Plan zajęć — semestr zimowy 2026/2027

Interaktywna strona planu na podstawie pliku `plan_sem3.xls` i zrzutu ekranu z terminami zjazdów. Domyślnie pokazuje plan grupy Z301, wybór jednego z ośmiu zjazdów, informację o grupach przy wspólnych przedmiotach, wyszukiwanie zajęć i aktualne komunikaty uczelni.

## Uruchomienie lokalne

Strona i endpoint komunikatów wymagają Node.js. Uruchom aplikację komendą:

```sh
npm start
```

Otwórz `http://localhost:3000`.

## Wdrożenie na Render

Repozytorium zawiera `render.yaml`. W Render wybierz **New → Blueprint**, połącz repozytorium i zatwierdź utworzenie usługi Node `plan-zajec-z301`. Serwer udostępnia stronę oraz bezpieczny, same-origin endpoint `/api/announcements`, który pobiera kanał RSS uczelni i buforuje odpowiedź przez pięć minut.

## Dane i aktualizacje

`data/schedule.json` jest statycznym wyciągiem planu grup Z301–Z305 z dostarczonego arkusza. Terminy zjazdów są zapisane w `app.js` na podstawie dostarczonego zrzutu ekranu. Przy zmianie planu zaktualizuj dane w tych plikach i ponownie wdroż stronę.

Komunikaty są pobierane z publicznego kanału RSS `https://student.wwsi.edu.pl/feed/`. Strona `https://student.wwsi.edu.pl/komunikaty/` może przekierować do logowania, dlatego służy jako odnośnik do ręcznego sprawdzenia wpisów. Gdy kanał RSS jest niedostępny, aplikacja pokazuje błąd i umożliwia ponowienie pobierania.

Arkusz źródłowy zawiera zajęcia oznaczone numerami zjazdów 1–7; terminy ósmego zjazdu pochodzą ze zrzutu ekranu i pozostają widoczne w kalendarzu. Dla ósmego zjazdu strona wyświetla informację o braku danych w arkuszu zamiast zakładać, że zajęć nie ma — sprawdź wtedy komunikaty uczelni.

Parser i endpoint można przetestować lokalnie komendą `npm test`.

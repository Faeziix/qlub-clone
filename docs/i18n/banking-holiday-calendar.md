# Iranian Banking Holiday Calendar

## Source

Iranian public holidays sourced from official government calendar announcements published at
Nowruz by the Cabinet of Iran and the Office of the Supreme Leader. The 1403 and 1404 lunar
holiday dates reflect the announced observance dates (which may differ by 1-2 days from
astronomical calculations due to moon-sighting criteria). The 1405 lunar holiday dates are
estimated by subtracting approximately 10-11 days from the 1404 official dates and must be
replaced with official 1405 government-published dates at Nowruz 1405 (March 2026).

The static calendar is in `src/lib/banking-holidays.ts` as `IRANIAN_BANKING_HOLIDAYS`.

## Banking Week Structure

| Day (Gregorian) | Persian | Banking status |
|---|---|---|
| Saturday | شنبه | Open |
| Sunday | یکشنبه | Open |
| Monday | دوشنبه | Open |
| Tuesday | سه‌شنبه | Open |
| Wednesday | چهارشنبه | Open |
| **Thursday** | **پنجشنبه** | **Closed (weekend)** |
| **Friday** | **جمعه** | **Closed (weekend)** |

## Holiday Categories

1. **Nowruz (عید نوروز)**: 1 Farvardin through 4 Farvardin (4 days)
2. **Islamic Republic Day**: 12 Farvardin
3. **Sizdah Bedar**: 13 Farvardin
4. **Imam Khomeini death anniversary**: 14 Khordad
5. **15 Khordad**: 15 Khordad
6. **Lunar religious holidays** (shift ~10-11 days each Jalali year):
   - Tasua (9th Muharram)
   - Ashura (10th Muharram)
   - Arbaeen
   - Prophet's death / Imam Hassan martyrdom
   - Imam Reza martyrdom
   - Imam Muhammad Taqi martyrdom
   - Imam Ali al-Naqi martyrdom
   - Prophet's birthday / Imam Sadiq birthday
   - Fatimah Zahra martyrdom
   - Eid al-Fitr / عید فطر (2 days)
   - Eid al-Adha / عید قربان (2 days)
   - Eid al-Ghadir / عید غدیر
   - Mab'ath / مبعث
7. **Islamic Revolution Victory**: 22 Bahman
8. **Nationalisation of Oil Industry**: 29 Esfand

## Maintenance

Religious holidays are based on the lunar Hijri calendar and shift approximately 10-11 days
earlier each Jalali year. **The calendar must be updated at the start of each new Jalali year
(Nowruz)** with the official government-published holiday list for the coming year.

The Jalali date key format is `YYYY-MM-DD` (zero-padded month and day).

## Settlement Math Usage

See `settlementDueDate()` and `addBankingDays()` in `src/lib/banking-holidays.ts`.

The exact T+N settlement delay (T+1, T+2, or batch) depends on the chosen payment facilitator's
contract and must be verified in Phase 4. The calendar module provides the correct day skipping;
the caller provides the delay count.

## API Functions

| Function | Description |
|---|---|
| `isBankingHoliday(date)` | true if Thursday, Friday, or official holiday |
| `isIranianWeekend(date)` | true if Thursday or Friday |
| `isOfficialHoliday(date)` | true if in the static calendar |
| `nextBankingDay(date)` | first open banking day after `date` |
| `addBankingDays(date, n)` | add `n` banking days |
| `settlementDueDate(paymentTs)` | first banking day after payment (T+1) |

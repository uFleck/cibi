package holidays

import "time"

// easterDate computes the Easter Sunday date for the given year using the
// Anonymous Gregorian algorithm.
func easterDate(year int) time.Time {
	a := year % 19
	b := year / 100
	c := year % 100
	d := b / 4
	e := b % 4
	f := (b + 8) / 25
	g := (b - f + 1) / 3
	h := (19*a + b - d - g + 15) % 30
	i := c / 4
	k := c % 4
	l := (32 + 2*e + 2*i - h - k) % 7
	m := (a + 11*h + 22*l) / 451
	month := (h + l - 7*m + 114) / 31
	day := ((h + l - 7*m + 114) % 31) + 1
	return time.Date(year, time.Month(month), day, 0, 0, 0, 0, time.UTC)
}

// IsHoliday returns true if t falls on a Brazilian national holiday.
// Covers all fixed-date national holidays and the moveable holidays
// (Carnaval, Sexta-feira Santa, Corpus Christi) derived from Easter.
func IsHoliday(t time.Time) bool {
	t = t.UTC()
	month := t.Month()
	day := t.Day()

	// Fixed national holidays.
	switch {
	case month == time.January && day == 1:
		return true // Confraternização Universal
	case month == time.April && day == 21:
		return true // Tiradentes
	case month == time.May && day == 1:
		return true // Dia do Trabalho
	case month == time.September && day == 7:
		return true // Independência do Brasil
	case month == time.October && day == 12:
		return true // Nossa Senhora Aparecida
	case month == time.November && day == 2:
		return true // Finados
	case month == time.November && day == 15:
		return true // Proclamação da República
	case month == time.November && day == 20:
		return true // Consciência Negra (national since 2024)
	case month == time.December && day == 25:
		return true // Natal
	}

	// Moveable holidays derived from Easter.
	easter := easterDate(t.Year())
	carnaval := easter.AddDate(0, 0, -47)     // Carnaval (terça-feira)
	sextaSanta := easter.AddDate(0, 0, -2)    // Sexta-feira Santa
	corpusChristi := easter.AddDate(0, 0, 60) // Corpus Christi

	tDate := time.Date(t.Year(), t.Month(), t.Day(), 0, 0, 0, 0, time.UTC)
	if tDate.Equal(carnaval) || tDate.Equal(sextaSanta) || tDate.Equal(corpusChristi) {
		return true
	}

	return false
}

// AdjustToBusinessDay shifts t backward to the nearest weekday that is not
// a Brazilian national holiday. Saturday shifts to Friday; Sunday shifts to
// Friday; a holiday shifts to the day before (applied recursively until a
// business day is found).
func AdjustToBusinessDay(t time.Time) time.Time {
	t = time.Date(t.Year(), t.Month(), t.Day(), 0, 0, 0, 0, time.UTC)
	for {
		wd := t.Weekday()
		if wd == time.Saturday {
			t = t.AddDate(0, 0, -1) // Saturday → Friday
			continue
		}
		if wd == time.Sunday {
			t = t.AddDate(0, 0, -2) // Sunday → Friday
			continue
		}
		if IsHoliday(t) {
			t = t.AddDate(0, 0, -1) // Holiday → day before
			continue
		}
		return t
	}
}

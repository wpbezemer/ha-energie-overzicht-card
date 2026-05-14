# ha-energie-overzicht-card

[![hacs_badge](https://img.shields.io/badge/HACS-Custom-orange.svg)](https://github.com/hacs/integration)
[![License: MIT](https://img.shields.io/badge/license-MIT-green)](LICENSE)
[![HA](https://img.shields.io/badge/Home%20Assistant-Lovelace-blue)](https://www.home-assistant.io/)

Home Assistant Lovelace custom card voor een **volledig energie-overzicht**. Combineert gridverbruik, solar productie en teruglevering in één kaart — met een SVG arc gauge, live percentages, zelfvoorzieningsgraad en bronverdeling.

---

## Schermafbeelding

> *(voeg hier een screenshot toe van je dashboard)*

---

## Functies

| Functie | Details |
|---------|---------|
| **Hero totaalverbruik** | Groot weergegeven totaal verbruik met uitsplitsing grid vs solar |
| **Chips** | Live badges voor % solar, % grid en actuele teruglevering |
| **SVG arc gauge** | Halve cirkel die solar direct gebruikt en teruglevering visualiseert t.o.v. het ingestelde maximum |
| **Eigen gebruik %** | Percentage van de solar productie dat direct thuis verbruikt wordt |
| **Zelfvoorzieningsgraad** | Percentage van het totale verbruik dat uit solar komt |
| **Bronverdeling** | Twee voortgangsbalken met solar- en grid-aandeel in het totale verbruik |
| **Automatische berekeningen** | `solar_used`, `pct_solar`, `pct_grid`, `selfpct` en `eigen_pct` worden automatisch berekend |
| **Visuele editor** | Volledig configureerbaar via de HA kaarteditor — geen YAML verplicht |
| **W en kW** | Sensor-eenheid instelbaar (`W` of `kW`) |

---

## Berekeningen

De card berekent automatisch de volgende waarden op basis van drie sensoren:

| Waarde | Berekening | Omschrijving |
|--------|-----------|-------------|
| `solar_used` | `solar_production − solar_return` | Solar direct thuis verbruikt |
| `total_use` | `grid_consume + solar_used` | Totaal thuisverbruik |
| `pct_solar` | `solar_used / total_use × 100` | Aandeel solar in verbruik |
| `pct_grid` | `grid_consume / total_use × 100` | Aandeel grid in verbruik |
| `eigen_pct` | `solar_used / solar_production × 100` | Eigen gebruik van productie |
| `return_pct` | `solar_return / solar_production × 100` | Teruglevering van productie |
| `zelfvoorzienend` | `solar_used / total_use × 100` | Zelfvoorzieningsgraad |

---

## Installatie

### Via HACS (aanbevolen)

1. Ga in Home Assistant naar **HACS → Frontend**
2. Klik op **⋮ → Aangepaste repositories**
3. Voeg toe: `https://github.com/wpbezemer/ha-energie-overzicht-card` — categorie: **Lovelace**
4. Zoek op **Energie Overzicht** en klik op **Downloaden**
5. Herlaad de browser (**Ctrl+Shift+R**)

### Handmatig

1. Download `energie-overzicht-card.js`
2. Kopieer het bestand naar `/config/www/energie-overzicht-card.js`
3. Ga naar **Instellingen → Dashboards → ⋮ → Bronnen beheren → Toevoegen**:
   - URL: `/local/energie-overzicht-card.js`
   - Type: **JavaScript module**
4. Herlaad de browser (**Ctrl+Shift+R**)
5. Voeg een nieuwe kaart toe en zoek op **Energie Overzicht**

---

## Configuratie

### Minimale configuratie

```yaml
type: custom:energie-overzicht-card
entities:
  grid_consume:     sensor.dsmr_reading_electricity_currently_delivered
  solar_production: sensor.p1_solar_production
  solar_return:     sensor.dsmr_reading_electricity_currently_returned
```

### Volledige configuratie (YAML)

```yaml
type: custom:energie-overzicht-card
unit: kW          # kW of W — moet overeenkomen met je sensoren
max_solar: 8      # max verwachte solar productie in dezelfde eenheid als unit
                  # gebruikt voor de schaal van de arc gauge
entities:
  grid_consume:     sensor.dsmr_reading_electricity_currently_delivered
  solar_production: sensor.p1_solar_production
  solar_return:     sensor.dsmr_reading_electricity_currently_returned
```

---

## Configuratieopties

| Optie | Standaard | Omschrijving |
|-------|-----------|-------------|
| `unit` | `kW` | Eenheid van de sensoren (`kW` of `W`) |
| `max_solar` | `8` | Maximum verwachte solar productie — bepaalt de schaal van de arc gauge |
| `entities.grid_consume` | `sensor.dsmr_reading_electricity_currently_delivered` | Totaal gridverbruik sensor |
| `entities.solar_production` | `sensor.p1_solar_production` | Totale solar productie sensor |
| `entities.solar_return` | `sensor.dsmr_reading_electricity_currently_returned` | Totale teruglevering sensor |

> **Tip:** Stel `max_solar` in op het piek vermogen van je installatie (bijv. `8` voor 8 kWp). De arc gauge schaalt hier op.

---

## Hoe werkt de arc gauge?

De halve cirkel visualiseert de solar productie in twee segmenten:

- 🟢 **Groen segment** — solar direct thuis verbruikt (`solar_used`)
- 🔵 **Blauw segment** — teruggeleverd aan het net (`solar_return`)
- **Witte stip** — huidige positie van de totale productie op de balk
- **Percentage in het midden** — eigen gebruik als % van de totale productie

De boog loopt van 0% (links) tot 100% van `max_solar` (rechts). Wanneer er geen solar productie is, is de boog leeg.

---

## Benodigde sensoren

De card heeft drie sensoren nodig:

| Sensor | Omschrijving | Voorbeeld |
|--------|-------------|---------|
| `grid_consume` | Actueel totaal gridverbruik | `sensor.dsmr_reading_electricity_currently_delivered` |
| `solar_production` | Actuele totale solar productie | `sensor.solaredge_current_power` |
| `solar_return` | Actuele totale teruglevering | `sensor.dsmr_reading_electricity_currently_returned` |

> De card werkt met elke sensor die een numerieke waarde geeft in W of kW. Compatibel met DSMR-integratie, SolarEdge, Enphase, Fronius en andere omvormers.

---

## Combineren met de 3-fase card

Deze card geeft het totaalplaatje. Gebruik de [ha-energie-card-3fase](https://github.com/wpbezemer/ha-energie-card-3fase) ernaast voor het detail per fase:

```yaml
# Overzicht bovenaan
- type: custom:energie-overzicht-card
  unit: kW
  max_solar: 8
  entities:
    grid_consume:     sensor.dsmr_reading_electricity_currently_delivered
    solar_production: sensor.solaredge_current_power
    solar_return:     sensor.dsmr_reading_electricity_currently_returned

# Detail per fase eronder
- type: custom:energie-card-3fase
  phases:
    L1:
      power_consume: sensor.dsmr_reading_electricity_currently_delivered_l1
      power_return:  sensor.p1_power_return_l1
      ...
```

---

## Credits

Gemaakt als aanvulling op de [esp8266_p1meter](https://github.com/wpbezemer/esp8266_p1meter) firmware die DSMR5 P1 data via MQTT naar Home Assistant stuurt.

---

*Licentie: MIT*

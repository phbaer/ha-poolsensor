# Pool Water Quality Card

A Home Assistant Lovelace card for showing pool-water measurements from entities you already have. It does not create, transform, or aggregate entities, so your existing integrations and automations remain the source of truth.

## Installation

### HACS

1. In HACS, open the three-dot menu and choose **Custom repositories**.
2. Add this repository's GitHub URL and select **Dashboard** as its type.
3. Install **Pool Water Quality Card**.
4. Add the card resource in your Lovelace dashboard:

```yaml
resources:
  - url: /hacsfiles/ha-poolsensor/ha-poolsensor.js
    type: module
```

### Manual installation

Copy [`ha-poolsensor.js`](ha-poolsensor.js) to `config/www/`, then add it as `/local/ha-poolsensor.js` with type `module`.

### Lovelace card

Configure the entities that provide the measurements you want to display:

```yaml
type: custom:poolsensor-water-quality-card
title: Pool Water Quality
ph: sensor.pool_ph
free_chlorine: sensor.pool_cl
orp: sensor.pool_orp
temperature: sensor.pool_temperature
salinity: sensor.pool_salinity
tds: sensor.pool_tds
ec: sensor.pool_ec
```

## Customization

You can override acceptable ranges in the card configuration:

```yaml
type: custom:poolsensor-water-quality-card
title: Pool Status
ph: sensor.pool_ph
free_chlorine: sensor.pool_cl
ranges:
  ph: '6.5 - 7.3'
  free_chlorine: '0.3 - 0.6'
```

Each configured target is displayed as a range bar: the green centre is the target region, the faded red sections are outside it, and the dot is the current reading. Measurements without a configured entity are omitted. Values are read directly from Home Assistant and are never persisted or modified by the card.

The default targets are pH (6.5–7.3), free chlorine (0.3–0.6 mg/L), ORP (650–750 mV), and a temperature comfort range (24–30 °C). The pH/free-chlorine pair follows [German Federal Environment Agency guidance](https://www.umweltbundesamt.de/sites/default/files/medien/419/dokumente/49_s_926-937_hygieneanforderungen_an_baeder.pdf). It is not an EU-wide legal limit: set your own range for local rules, stabiliser use, pool type, and equipment instructions. Salinity, TDS, and EC have no default target: configure them only from your chlorinator manual, pool type, and source-water test results, using the same unit as the entity. ORP is a supporting signal, not a chemical-dosing target by itself.

### Guidance

When one or more readings are outside their targets, the card shows one prioritized, conservative next step. It does not calculate chemical dosages. Hover a status dot to see whether that reading is above, below, or within its target. You can replace a message for a measurement and direction with `guidance`:

```yaml
guidance:
  salinity:
    low: Follow the salt chlorinator manual before adding salt.
```

Always confirm an out-of-range reading with a reliable water test and follow the instructions for your equipment and pool chemicals.

### Measured status grade

The card shows a **Measured status** grade, not a declaration that the water is safe to swim in. It requires valid pH and free-chlorine readings:

- **A**: all configured readings that have a target are on target.
- **B**: pH and free chlorine are on target, but a supporting reading is not.
- **C/D**: one/multiple primary readings need attention.
- **F**: free chlorine is below its configured minimum, or a configured critical range is exceeded.
- **—**: pH/free chlorine are not configured or do not have valid readings.

By default, pH and free chlorine are the primary readings. You can set a hard pH boundary that produces an F:

```yaml
grading:
  primary:
    - ph
    - free_chlorine
  critical_ranges:
    ph: '6.3 - 7.5'
```

Set `grading.enabled: false` to hide the grade.

## Visual editor

When adding or editing the card from a Home Assistant dashboard, choose **Pool Water Quality Card** and select the title and measurement entities in the visual editor. Range overrides remain available through the YAML editor.

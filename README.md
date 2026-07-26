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

HACS installs a versioned release. The release asset is a single, self-contained
`ha-poolsensor.js` file: it includes the translations and does not require a
separate `translations.js` file. The default branch is deliberately not offered
for installation because it contains the unbundled development sources.

### Manual installation

Download `ha-poolsensor.js` from the chosen [release](../../releases), copy it to `config/www/`, then add `/local/ha-poolsensor.js` as a `module` resource.

### Lovelace card

Configure the entities that provide the measurements you want to display:

```yaml
type: custom:poolsensor-water-quality-card
title: Pool Water Quality
ph: sensor.pool_ph
free_chlorine: sensor.pool_cl
orp: sensor.pool_orp
temperature: sensor.pool_temperature
ambient_temperature: sensor.outdoor_temperature
salinity: sensor.pool_salinity
tds: sensor.pool_tds
ec: sensor.pool_ec
language: de
filter: switch.pool_filter
filter_power: sensor.pool_filter_power
heating: switch.pool_heating
heating_power: sensor.pool_heating_power
```

The optional filter/heating badges use icons and color to show on/off state; `filter_power` and `heating_power` are normalized to one decimal place in watts. Click a badge to open the configured filter/heating entity’s standard Home Assistant details dialog. Equipment state does not affect the water-quality grade.

`ambient_temperature` is optional. It is shown beside the water-temperature reading and, when water temperature is configured, includes the water–air temperature difference. It does not affect the water-quality grade.

### History graphs

The card intentionally focuses on current water status and remains compact on mobile. For responsive trends, use Home Assistant’s native `statistics-graph` below it. It uses Recorder statistics and can show the minimum, maximum, and mean for sensors with long-term statistics.

```yaml
type: statistics-graph
title: Pool temperatures
chart_type: line
days_to_show: 1
period: 5minute
stat_types:
  - min
  - max
  - mean
entities:
  - sensor.pool_temperature
  - sensor.outdoor_temperature
```

For pH and free chlorine, create separate statistics graphs because they use different units and practical scales. Development dependencies are defined in `package.json`; run `npm ci && npm run build` after changing the authored source files in the repository root to create a local `dist/ha-poolsensor.js`.

### Graphable pH and free-chlorine helpers

If the source entities do not expose long-term statistics, mirror them with modern template sensors that explicitly declare `state_class: measurement`. Add the following under `template:` in `configuration.yaml`, replacing the source entity IDs if necessary, then restart Home Assistant or reload template entities.

```yaml
template:
  - sensor:
      - name: Pool pH graph
        unique_id: pool_ph_graph
        unit_of_measurement: pH
        state_class: measurement
        availability: "{{ is_number(states('sensor.pool_ph')) }}"
        state: "{{ states('sensor.pool_ph') | float }}"

      - name: Pool free chlorine graph
        unique_id: pool_free_chlorine_graph
        unit_of_measurement: mg/L
        state_class: measurement
        availability: "{{ is_number(states('sensor.pool_cl')) }}"
        state: "{{ states('sensor.pool_cl') | float }}"
```

Use `sensor.pool_ph_graph` and `sensor.pool_free_chlorine_graph` in the statistics graphs. Statistics begin collecting after these helper entities are created; they do not backfill historical data.

### HACS graph alternatives

Install either **Mini Graph Card** or **ApexCharts Card** from HACS before using the corresponding example. Both examples use 20-minute median buckets over the last 24 hours, so they are directly comparable.

#### Mini Graph Card

This is the more compact option, suited to a mobile dashboard.

```yaml
type: custom:mini-graph-card
name: Pool temperatures
hours_to_show: 24
points_per_hour: 3
aggregate_func: median
group_by: interval
line_width: 2
height: 130
show:
  icon: false
  state: false
  fill: false
  points: false
  labels: hover
  legend: true
entities:
  - entity: sensor.pool_temperature
    name: Water
    color: var(--primary-color)
  - entity: sensor.outdoor_temperature
    name: Ambient
    color: var(--secondary-text-color)
```

#### ApexCharts Card

This option is better when you want pH and free chlorine in one chart with their own axes and a richer touch tooltip.

```yaml
type: custom:apexcharts-card
header:
  show: true
  title: Pool water quality
graph_span: 24h
update_interval: 5min
all_series_config:
  type: line
  curve: smooth
  stroke_width: 2
  group_by:
    func: median
    duration: 20min
    fill: last
yaxis:
  - id: ph
    min: 6
    max: 9
    decimals: 2
  - id: chlorine
    opposite: true
    min: 0
    max: 3
    decimals: 2
apex_config:
  chart:
    height: 220
    toolbar:
      show: false
  legend:
    position: bottom
  tooltip:
    shared: true
    intersect: false
series:
  - entity: sensor.pool_ph
    name: pH
    yaxis_id: ph
    color: var(--info-color)
    show:
      extremas: true
  - entity: sensor.pool_cl
    name: Free chlorine
    yaxis_id: chlorine
    color: var(--warning-color)
    show:
      extremas: true
```

ApexCharts Card can show min/max values in the header (`show.extremas`), but its standard Home Assistant entity-series configuration cannot create a true shaded min–max envelope. Mini Graph Card likewise has no min/max band feature. For the median/mean line with a genuine min/max band, use the native `statistics-graph` example above with `stat_types: [min, max, mean]`.

### Renovate

Renovate updates the source dependencies and lockfile. The release workflows build the distributable, so dependency-update PRs need no generated bundle or special Renovate command permission.

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

All range bars share one normalized scale: the configured target always occupies the central 40–60% of the bar, so equal relative deviations look equal across pH, chlorine, ORP, and other measurements. Readings beyond the displayed scale use a directional arrow at the relevant edge; the exact value remains visible beside the bar.

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

## Languages

Select the card language in the visual editor or set `language` in YAML. Supported values are `en`, `de`, `fr`, `it`, and `es`. This translates the card labels, range/status tooltips, overall recommendation, and grade explanation.

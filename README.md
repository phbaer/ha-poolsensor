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
eds: sensor.pool_eds
temperature: sensor.pool_temperature
alkalinity: sensor.pool_alkalinity
salinity: sensor.pool_salinity
hardness: sensor.pool_hardness
```

## Customization

You can override acceptable ranges in the card configuration:

```yaml
type: custom:poolsensor-water-quality-card
title: Pool Status
ph: sensor.pool_ph
free_chlorine: sensor.pool_cl
ranges:
  ph: '7.2 - 7.6'
  free_chlorine: '1.5 - 2.5'
```

Measurements without a configured entity are omitted. Values are read directly from Home Assistant and are never persisted or modified by the card.

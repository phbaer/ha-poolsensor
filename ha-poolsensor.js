class PoolWaterQualityCard extends HTMLElement {
  constructor() {
    super();
    this._fields = [];
  }

  setConfig(config) {
    if (!config) {
      throw new Error('Configuration required');
    }

    const entities = config.entities || {};
    this.config = {
      title: config.title || 'Pool Water Quality',
      ph: entities.ph || config.ph,
      free_chlorine: entities.free_chlorine || config.free_chlorine,
      eds: entities.eds || config.eds,
      temperature: entities.temperature || config.temperature,
      turbidity: entities.turbidity || config.turbidity,
      alkalinity: entities.alkalinity || config.alkalinity,
      salinity: entities.salinity || config.salinity,
      hardness: entities.hardness || config.hardness,
      ranges: config.ranges || {},
    };

    if (!Object.entries(this.config).some(([key, value]) => key !== 'title' && key !== 'ranges' && value)) {
      throw new Error('Configure at least one pool measurement entity');
    }
  }

  getCardSize() {
    return 1 + (this._fields?.length || 0);
  }

  set hass(hass) {
    this._hass = hass;
    this.render();
  }

  render() {
    if (!this._hass) {
      return;
    }

    this._fields = [
      { key: 'ph', label: 'pH', entity: this.config.ph },
      { key: 'free_chlorine', label: 'Free Chlorine', entity: this.config.free_chlorine },
      { key: 'eds', label: 'EDS', entity: this.config.eds },
      { key: 'temperature', label: 'Temperature', entity: this.config.temperature },
      { key: 'turbidity', label: 'Turbidity', entity: this.config.turbidity },
      { key: 'alkalinity', label: 'Alkalinity', entity: this.config.alkalinity },
      { key: 'salinity', label: 'Salinity', entity: this.config.salinity },
      { key: 'hardness', label: 'Hardness', entity: this.config.hardness },
    ].filter((item) => item.entity);

    const card = document.createElement('ha-card');
    card.header = this.config.title;

    const style = document.createElement('style');
    style.textContent = `
      .pool-values { display: grid; gap: 12px; }
      .pool-row { display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: 12px; padding: 8px 0; border-bottom: 1px solid var(--divider-color); }
      .pool-row:last-child { border-bottom: none; }
      .label { font-weight: 500; color: var(--primary-text-color); }
      .value { text-align: right; font-variant-numeric: tabular-nums; }
      .status-dot { width: 12px; height: 12px; border-radius: 50%; display: inline-block; margin-left: 8px; }
      .status-ok { background: var(--success-color); }
      .status-warning { background: var(--warning-color); }
      .status-unknown { background: var(--disabled-text-color); }
      .range { font-size: 0.86em; color: var(--secondary-text-color); }
    `;

    const content = document.createElement('div');
    content.className = 'pool-values';

    this._fields.forEach((field) => {
      const state = this._getState(field.entity);
      const value = this._getValue(state);
      const range = this._getRange(field.key);
      const status = this._getStatus(field.key, value);
      const formattedValue = this._formatValue(value, state);

      const row = document.createElement('div');
      row.className = 'pool-row';

      const label = document.createElement('span');
      label.className = 'label';
      label.textContent = field.label;

      const valueWrap = document.createElement('span');
      valueWrap.className = 'value';
      valueWrap.textContent = formattedValue;

      const statusDot = document.createElement('span');
      statusDot.className = `status-dot status-${status}`;
      const rangeLine = document.createElement('span');
      rangeLine.className = 'range';
      rangeLine.textContent = range ? `Ideal: ${range}` : '';

      row.appendChild(label);
      row.appendChild(valueWrap);
      row.appendChild(statusDot);
      if (range) {
        row.appendChild(rangeLine);
      }
      content.appendChild(row);
    });

    card.innerHTML = '';
    card.appendChild(style);
    card.appendChild(content);

    this.innerHTML = '';
    this.appendChild(card);
  }

  _getValue(state) {
    if (!state) {
      return null;
    }
    const raw = state.state;
    return raw === undefined || raw === null ? null : raw;
  }

  _getState(entity) {
    return this._hass.states[entity] || null;
  }

  _formatValue(value, state) {
    if (value === null || value === 'unknown' || value === 'unavailable') {
      return 'unavailable';
    }
    const unit = state?.attributes?.unit_of_measurement;
    return unit ? `${value} ${unit}` : value;
  }

  _getStatus(fieldKey, rawValue) {
    const value = this._normalizeValue(rawValue);
    const range = this._getRange(fieldKey);
    if (value === null || !range) {
      return 'unknown';
    }
    const [min, max] = range.split(' - ').map(Number);
    if (Number.isNaN(min) || Number.isNaN(max)) {
      return 'unknown';
    }
    if (value < min || value > max) {
      return 'warning';
    }
    return 'ok';
  }

  _normalizeValue(rawValue) {
    if (rawValue === null || rawValue === undefined) {
      return null;
    }
    const num = Number(rawValue);
    return Number.isFinite(num) ? num : null;
  }

  _getRange(fieldKey) {
    const rangeOverride = this.config.ranges?.[fieldKey];
    if (rangeOverride) {
      return rangeOverride;
    }
    const defaults = {
      ph: '7.2 - 7.8',
      free_chlorine: '1.0 - 3.0',
      eds: '400 - 1200',
      temperature: '24.0 - 30.0',
      turbidity: '0.0 - 5.0',
      alkalinity: '80.0 - 120.0',
      salinity: '2500 - 3500',
      hardness: '200 - 400',
    };
    return defaults[fieldKey] || null;
  }
}

customElements.define('poolsensor-water-quality-card', PoolWaterQualityCard);

window.customCards = window.customCards || [];
window.customCards.push({
  type: 'poolsensor-water-quality-card',
  name: 'Pool Water Quality Card',
  description: 'Displays pool-water measurements from existing Home Assistant entities.',
});

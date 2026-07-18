const MEASUREMENTS = [
  { key: 'ph', label: 'pH' },
  { key: 'free_chlorine', label: 'Free chlorine' },
  { key: 'orp', label: 'ORP' },
  { key: 'temperature', label: 'Temperature' },
  { key: 'salinity', label: 'Salinity' },
  { key: 'tds', label: 'TDS' },
  { key: 'ec', label: 'EC' },
];

const FIELD_LABELS = {
  title: 'Title',
  ...Object.fromEntries(MEASUREMENTS.map(({ key, label }) => [key, label])),
};

// The default pH/free-chlorine pair follows German public-pool guidance.
// Salinity, TDS, and EC targets depend on the chlorinator, source water, and
// pool type, so they intentionally require a user-supplied range.
const DEFAULT_RANGES = {
  ph: '6.5 - 7.3',
  free_chlorine: '0.3 - 0.6',
  orp: '650 - 750',
  temperature: '24 - 30',
};

const DEFAULT_GUIDANCE = {
  ph: {
    low: 'pH is low. Confirm with a drop test, then use a pool-specific pH increaser according to its label. Retest before making another adjustment.',
    high: 'pH is high. Confirm with a drop test, then use a pool-specific pH reducer according to its label. Retest before making another adjustment.',
  },
  free_chlorine: {
    low: 'Free chlorine is low. Confirm with a DPD test, then raise it with your chlorinator or a labelled chlorine product. Circulate and retest.',
    high: 'Free chlorine is high. Pause chlorination and retest before swimming; follow the chemical label and local guidance.',
  },
  orp: {
    low: 'ORP is low. Verify pH and free chlorine with a reliable test and correct those values rather than dosing from ORP alone.',
    high: 'ORP is high. Verify free chlorine and pH with a reliable test before changing chlorinator settings.',
  },
  temperature: {
    low: 'Temperature is below the configured comfort target. Adjust heating if your pool has it.',
    high: 'Temperature is above the configured comfort target. Reduce heating or adjust cover use as appropriate.',
  },
  salinity: {
    low: 'Salinity is below your configured target. Follow your salt chlorinator manufacturer’s instructions before adding salt.',
    high: 'Salinity is above your configured target. Follow your chlorinator manufacturer’s instructions; dilution may be required.',
  },
  tds: {
    low: 'TDS is outside your configured target. Use it as a trend indicator and confirm overall balance with a proper water test.',
    high: 'TDS is outside your configured target. Use it as a trend indicator and confirm overall balance with a proper water test.',
  },
  ec: {
    low: 'EC is outside your configured target. Check probe calibration and use a proper water test before adjusting chemicals.',
    high: 'EC is outside your configured target. Check probe calibration and use a proper water test before adjusting chemicals.',
  },
};

class PoolWaterQualityCard extends HTMLElement {
  constructor() {
    super();
    this._fields = [];
  }

  static getConfigElement() {
    return document.createElement('poolsensor-water-quality-card-editor');
  }

  static getStubConfig() {
    return { title: 'Pool Water Quality' };
  }

  setConfig(config) {
    if (!config) {
      throw new Error('Configuration required');
    }

    const entities = config.entities || {};
    this.config = {
      title: config.title || 'Pool Water Quality',
      ...Object.fromEntries(MEASUREMENTS.map(({ key }) => [key, config[key] || entities[key]])),
      ranges: config.ranges || {},
      guidance: config.guidance || {},
      grading: {
        enabled: config.grading?.enabled !== false,
        primary: config.grading?.primary || ['ph', 'free_chlorine'],
        critical_ranges: config.grading?.critical_ranges || {},
      },
    };
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

    this._fields = MEASUREMENTS
      .map((measurement) => ({ ...measurement, entity: this.config[measurement.key] }))
      .filter((item) => item.entity);

    const card = document.createElement('ha-card');
    card.className = 'poolsensor-card';

    const style = document.createElement('style');
    style.textContent = `
      .card-header { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 10px 14px 4px; }
      .card-title { color: var(--primary-text-color); font-size: 1.1em; font-weight: 500; }
      .pool-values { display: grid; gap: 0; padding: 0 14px 8px; }
      .pool-row { display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: 4px 8px; padding: 5px 0; border-bottom: 1px solid var(--divider-color); }
      .pool-row:last-child { border-bottom: none; }
      .label { font-weight: 500; color: var(--primary-text-color); }
      .value { text-align: right; font-variant-numeric: tabular-nums; }
      .status-dot { width: 12px; height: 12px; border-radius: 50%; display: inline-block; margin-left: 8px; cursor: help; }
      .status-ok { background: var(--success-color); }
      .status-warning { background: var(--warning-color); }
      .status-unknown { background: var(--disabled-text-color); }
      .grade { display: inline-grid; place-items: center; flex: 0 0 auto; width: 26px; height: 26px; border-radius: 50%; color: var(--text-primary-color); font-size: .95em; font-weight: 700; cursor: help; }
      .grade-a { background: var(--success-color); }
      .grade-b { background: color-mix(in srgb, var(--success-color) 65%, var(--warning-color)); }
      .grade-c, .grade-d { background: var(--warning-color); }
      .grade-f { background: var(--error-color); }
      .grade-unknown { background: var(--disabled-text-color); }
      .range-meter { grid-column: 1 / -1; }
      .range-track { position: relative; height: 6px; border-radius: 99px; background: linear-gradient(to right, color-mix(in srgb, var(--error-color) 46%, transparent) 0%, color-mix(in srgb, var(--error-color) 34%, var(--success-color)) var(--good-start), color-mix(in srgb, var(--success-color) 38%, transparent) 50%, color-mix(in srgb, var(--error-color) 34%, var(--success-color)) var(--good-end), color-mix(in srgb, var(--error-color) 46%, transparent) 100%); }
      .range-marker { position: absolute; top: 50%; left: var(--marker-position); width: 10px; height: 10px; border: 2px solid var(--card-background-color); border-radius: 50%; background: var(--primary-text-color); box-sizing: border-box; transform: translate(-50%, -50%); }
      .overall-guidance { margin: 0 14px 8px; font-size: 0.86em; line-height: 1.3; color: var(--secondary-text-color); padding: 5px 7px; border-left: 3px solid var(--warning-color); background: color-mix(in srgb, var(--warning-color) 10%, transparent); }
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
      statusDot.title = this._getStatusTooltip(field.key, value, range, status);
      statusDot.setAttribute('aria-label', statusDot.title);
      row.appendChild(label);
      row.appendChild(valueWrap);
      row.appendChild(statusDot);
      const meter = this._createRangeMeter(value, range);
      if (meter) {
        row.appendChild(meter);
      }
      content.appendChild(row);
    });

    card.innerHTML = '';
    card.appendChild(style);

    const header = document.createElement('div');
    header.className = 'card-header';
    const title = document.createElement('div');
    title.className = 'card-title';
    title.textContent = this.config.title;
    header.appendChild(title);

    if (this.config.grading.enabled) {
      const grade = this._getGrade();
      const badge = document.createElement('span');
      badge.className = `grade grade-${grade.value === '—' ? 'unknown' : grade.value.toLowerCase()}`;
      badge.textContent = grade.value;
      badge.title = `Measured status ${grade.value}: ${grade.reason}`;
      badge.setAttribute('aria-label', badge.title);
      header.appendChild(badge);
    }

    card.appendChild(header);
    card.appendChild(content);

    const overallGuidance = this._getOverallGuidance();
    if (overallGuidance) {
      const guidance = document.createElement('div');
      guidance.className = 'overall-guidance';
      guidance.textContent = `Recommended next step: ${overallGuidance}`;
      card.appendChild(guidance);
    }

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
    if (value < range.min || value > range.max) {
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
    const rangeValue = this.config.ranges?.[fieldKey] || DEFAULT_RANGES[fieldKey];
    if (!rangeValue) {
      return null;
    }
    const [min, max] = String(rangeValue).split(' - ').map(Number);
    if (!Number.isFinite(min) || !Number.isFinite(max) || min >= max) {
      return null;
    }
    return { min, max, label: `${min} - ${max}` };
  }

  _createRangeMeter(rawValue, range) {
    const value = this._normalizeValue(rawValue);
    if (value === null || !range) {
      return null;
    }

    const span = range.max - range.min;
    const displayMin = Math.max(0, range.min - span / 2);
    const displayMax = range.max + span / 2;
    const toPercent = (number) => Math.max(0, Math.min(100,
      ((number - displayMin) / (displayMax - displayMin)) * 100));

    const meter = document.createElement('div');
    meter.className = 'range-meter';

    const track = document.createElement('div');
    track.className = 'range-track';
    track.title = `Target: ${range.label}`;
    track.setAttribute('aria-label', track.title);
    track.style.setProperty('--good-start', `${toPercent(range.min)}%`);
    track.style.setProperty('--good-end', `${toPercent(range.max)}%`);
    track.style.setProperty('--marker-position', `${toPercent(value)}%`);

    const marker = document.createElement('span');
    marker.className = 'range-marker';
    track.appendChild(marker);

    meter.appendChild(track);
    return meter;
  }

  _getStatusTooltip(fieldKey, rawValue, range, status) {
    const label = FIELD_LABELS[fieldKey];
    const value = this._normalizeValue(rawValue);
    if (status === 'unknown') {
      return `${label}: no valid reading or target configured`;
    }
    const direction = value < range.min ? 'below' : value > range.max ? 'above' : 'within';
    return `${label}: ${direction} target (${range.label})`;
  }

  _getOverallGuidance() {
    const warnings = this._fields
      .map((field) => this._getMeasurementStatus(field.key))
      .filter((measurement) => measurement.status === 'warning');
    if (!warnings.length) {
      return null;
    }

    const byKey = Object.fromEntries(warnings.map((measurement) => [measurement.key, measurement]));
    const chlorine = byKey.free_chlorine;
    const ph = byKey.ph;
    if (chlorine?.value < chlorine.range.min) {
      const phNote = ph ? ' Also correct pH after confirming both readings.' : '';
      return this.config.guidance?.free_chlorine?.low
        || `${DEFAULT_GUIDANCE.free_chlorine.low}${phNote}`;
    }
    if (ph) {
      const direction = ph.value < ph.range.min ? 'low' : 'high';
      return this.config.guidance?.ph?.[direction] || DEFAULT_GUIDANCE.ph[direction];
    }

    const priority = ['orp', 'salinity', 'tds', 'ec', 'temperature'];
    const next = priority.find((key) => byKey[key]) || warnings[0];
    const direction = next.value < next.range.min ? 'low' : 'high';
    return this.config.guidance?.[next.key]?.[direction]
      || DEFAULT_GUIDANCE[next.key]?.[direction]
      || 'Confirm this reading with a reliable water test before adjusting treatment.';
  }

  _getGrade() {
    const primaryKeys = this.config.grading.primary.filter((key) => this.config[key]);
    if (!primaryKeys.includes('ph') || !primaryKeys.includes('free_chlorine')) {
      return { value: '—', reason: 'configure pH and free chlorine to calculate a grade' };
    }

    const primary = primaryKeys.map((key) => this._getMeasurementStatus(key));
    if (primary.some((measurement) => measurement.status === 'unknown')) {
      return { value: '—', reason: 'waiting for valid pH and free-chlorine readings' };
    }

    const chlorine = primary.find((measurement) => measurement.key === 'free_chlorine');
    if (chlorine.value < chlorine.range.min) {
      return { value: 'F', reason: 'free chlorine is below its configured minimum' };
    }

    const critical = primary.find((measurement) => {
      const range = this._getConfiguredRange(this.config.grading.critical_ranges[measurement.key]);
      return range && (measurement.value < range.min || measurement.value > range.max);
    });
    if (critical) {
      return { value: 'F', reason: `${FIELD_LABELS[critical.key]} is outside its critical range` };
    }

    const primaryWarnings = primary.filter((measurement) => measurement.status === 'warning').length;
    if (primaryWarnings > 1) {
      return { value: 'D', reason: 'multiple primary readings need attention' };
    }
    if (primaryWarnings === 1) {
      return { value: 'C', reason: 'one primary reading needs attention' };
    }

    const supportingWarnings = this._fields
      .filter((field) => !primaryKeys.includes(field.key))
      .map((field) => this._getMeasurementStatus(field.key))
      .filter((measurement) => measurement.status === 'warning');
    if (supportingWarnings.length) {
      return { value: 'B', reason: 'primary readings are on target; a supporting reading needs attention' };
    }
    return { value: 'A', reason: 'all configured readings with targets are on target' };
  }

  _getMeasurementStatus(key) {
    const value = this._normalizeValue(this._getValue(this._getState(this.config[key])));
    const range = this._getRange(key);
    return {
      key,
      value,
      range,
      status: value === null || !range
        ? 'unknown'
        : value < range.min || value > range.max ? 'warning' : 'ok',
    };
  }

  _getConfiguredRange(rangeValue) {
    if (!rangeValue) {
      return null;
    }
    const [min, max] = String(rangeValue).split(' - ').map(Number);
    return Number.isFinite(min) && Number.isFinite(max) && min < max ? { min, max } : null;
  }
}

customElements.define('poolsensor-water-quality-card', PoolWaterQualityCard);

class PoolWaterQualityCardEditor extends HTMLElement {
  setConfig(config) {
    this._config = { ...(config.entities || {}), ...config };
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
    this._render();
  }

  _render() {
    if (!this._config || !this._hass) {
      return;
    }

    const form = document.createElement('ha-form');
    form.hass = this._hass;
    form.data = this._config;
    form.schema = Object.keys(FIELD_LABELS).map((name) => ({
      name,
      selector: name === 'title' ? { text: {} } : { entity: {} },
    }));
    form.computeLabel = (schema) => FIELD_LABELS[schema.name] || schema.name;
    form.addEventListener('value-changed', (event) => {
      event.stopPropagation();
      this._config = { ...this._config, ...event.detail.value };
      this.dispatchEvent(new CustomEvent('config-changed', {
        detail: { config: this._config },
        bubbles: true,
        composed: true,
      }));
    });

    this.replaceChildren(form);
  }
}

customElements.define('poolsensor-water-quality-card-editor', PoolWaterQualityCardEditor);

window.customCards = window.customCards || [];
window.customCards.push({
  type: 'poolsensor-water-quality-card',
  name: 'Pool Water Quality Card',
  description: 'Displays pool-water measurements from existing Home Assistant entities.',
  configurable: true,
});

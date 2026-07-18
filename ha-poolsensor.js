import { TRANSLATIONS, LANGUAGE_OPTIONS, translate } from './translations.js';

const MEASUREMENTS = ['ph', 'free_chlorine', 'orp', 'temperature', 'salinity', 'tds', 'ec'];
const EQUIPMENT = [
  { key: 'filter', powerKey: 'filter_power' },
  { key: 'heating', powerKey: 'heating_power' },
];
const EDITOR_FIELDS = ['title', 'language', ...MEASUREMENTS, ...EQUIPMENT.flatMap(({ key, powerKey }) => [key, powerKey])];


// The default pH/free-chlorine pair follows German public-pool guidance.
// Salinity, TDS, and EC targets depend on the chlorinator, source water, and
// pool type, so they intentionally require a user-supplied range.
const DEFAULT_RANGES = {
  ph: '6.5 - 7.3',
  free_chlorine: '0.3 - 0.6',
  orp: '650 - 750',
  temperature: '24 - 30',
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
    return { title: TRANSLATIONS.en.card_title };
  }

  setConfig(config) {
    if (!config) {
      throw new Error('Configuration required');
    }

    const language = TRANSLATIONS[config.language] ? config.language : 'en';
    const entities = config.entities || {};
    this.config = {
      title: config.title || translate(language, 'card_title'),
      language,
      ...Object.fromEntries(MEASUREMENTS.map((key) => [key, config[key] || entities[key]])),
      ...Object.fromEntries(EQUIPMENT.flatMap(({ key, powerKey }) => [
        [key, config[key] || entities[key]],
        [powerKey, config[powerKey] || entities[powerKey]],
      ])),
      ranges: config.ranges || {},
      guidance: config.guidance || {},
      grading: {
        enabled: config.grading?.enabled !== false,
        primary: config.grading?.primary || ['ph', 'free_chlorine'],
        critical_ranges: config.grading?.critical_ranges || {},
      },
    };
  }

  _t(key, values) {
    return translate(this.config.language, key, values);
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
      .map((key) => ({ key, label: this._t(key), entity: this.config[key] }))
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
      .status-arrow { display: inline-flex; align-items: center; justify-content: center; width: 16px; height: 16px; margin-left: 4px; color: var(--warning-color); font-size: 1.25em; font-weight: 700; line-height: 1; cursor: help; }
      .status-ok { background: var(--success-color); }
      .status-warning { background: var(--warning-color); }
      .status-unknown { background: var(--disabled-text-color); }
      .grade { display: inline-flex; align-items: center; justify-content: center; flex: 0 0 auto; box-sizing: border-box; width: 26px; height: 26px; padding: 0; border-radius: 50%; color: var(--text-primary-color); font-size: .95em; font-weight: 700; line-height: 1; cursor: help; }
      .grade-a { background: var(--success-color); }
      .grade-b { background: color-mix(in srgb, var(--success-color) 65%, var(--warning-color)); }
      .grade-c, .grade-d { background: var(--warning-color); }
      .grade-f { background: var(--error-color); }
      .grade-unknown { background: var(--disabled-text-color); }
      .range-meter { grid-column: 1 / -1; display: grid; grid-template-columns: 1fr auto; align-items: center; gap: 8px; }
      .range-track { position: relative; height: 6px; border-radius: 99px; background: linear-gradient(to right, color-mix(in srgb, var(--error-color) 46%, transparent) 0%, color-mix(in srgb, var(--error-color) 34%, var(--success-color)) var(--good-start), color-mix(in srgb, var(--success-color) 38%, transparent) 50%, color-mix(in srgb, var(--error-color) 34%, var(--success-color)) var(--good-end), color-mix(in srgb, var(--error-color) 46%, transparent) 100%); }
      .range-marker { position: absolute; top: 50%; left: var(--marker-position); width: 10px; height: 10px; border: 2px solid var(--card-background-color); border-radius: 50%; background: var(--primary-text-color); box-sizing: border-box; transform: translate(-50%, -50%); }
      .range-label { color: var(--secondary-text-color); font-size: 0.78em; white-space: nowrap; }
      .overall-guidance { margin: 0 14px 8px; font-size: 0.86em; line-height: 1.3; color: var(--secondary-text-color); padding: 5px 7px; border-left: 3px solid var(--warning-color); background: color-mix(in srgb, var(--warning-color) 10%, transparent); }
      .equipment { display: grid; gap: 0; padding: 4px 14px 8px; border-top: 1px solid var(--divider-color); }
      .equipment-row { display: grid; grid-template-columns: 1fr auto auto; align-items: center; gap: 8px; padding: 4px 0; font-size: 0.9em; }
      .equipment-state { font-weight: 500; }
      .equipment-on { color: var(--success-color); }
      .equipment-off { color: var(--secondary-text-color); }
      .equipment-power { color: var(--secondary-text-color); font-variant-numeric: tabular-nums; }
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
      const valueNumber = this._normalizeValue(value);
      const isOutOfRange = status === 'warning' && range;
      statusDot.className = isOutOfRange
        ? 'status-arrow'
        : `status-dot status-${status}`;
      if (isOutOfRange) {
        statusDot.textContent = valueNumber < range.min ? '←' : '→';
      }
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
      badge.title = `${grade.value}: ${grade.reason}`;
      badge.setAttribute('aria-label', badge.title);
      header.appendChild(badge);
    }

    card.appendChild(header);
    card.appendChild(content);

    const equipment = this._createEquipmentSection();
    if (equipment) {
      card.appendChild(equipment);
    }

    const overallGuidance = this._getOverallGuidance();
    if (overallGuidance) {
      const guidance = document.createElement('div');
      guidance.className = 'overall-guidance';
      guidance.textContent = `${this._t('recommendation')}: ${overallGuidance}`;
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

  _createEquipmentSection() {
    const configured = EQUIPMENT.filter(({ key, powerKey }) => this.config[key] || this.config[powerKey]);
    if (!configured.length) {
      return null;
    }

    const section = document.createElement('div');
    section.className = 'equipment';
    configured.forEach(({ key, powerKey }) => {
      const row = document.createElement('div');
      row.className = 'equipment-row';

      const label = document.createElement('span');
      label.textContent = this._t(key);
      row.appendChild(label);

      if (this.config[key]) {
        const state = this._getState(this.config[key]);
        const unavailable = !state || ['unknown', 'unavailable'].includes(String(state.state).toLowerCase());
        const active = this._isActive(state?.state);
        const stateLabel = document.createElement('span');
        stateLabel.className = `equipment-state equipment-${active ? 'on' : 'off'}`;
        stateLabel.textContent = unavailable ? '—' : this._t(active ? 'on' : 'off');
        row.appendChild(stateLabel);
      }

      if (this.config[powerKey]) {
        const powerState = this._getState(this.config[powerKey]);
        const power = document.createElement('span');
        power.className = 'equipment-power';
        power.textContent = this._formatValue(this._getValue(powerState), powerState);
        row.appendChild(power);
      }
      section.appendChild(row);
    });
    return section;
  }

  _isActive(value) {
    return ['on', 'open', 'active', 'running', 'true', '1'].includes(String(value).toLowerCase());
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
    track.title = `${this._t('target')}: ${range.label}`;
    track.setAttribute('aria-label', track.title);
    track.style.setProperty('--good-start', `${toPercent(range.min)}%`);
    track.style.setProperty('--good-end', `${toPercent(range.max)}%`);
    track.style.setProperty('--marker-position', `${toPercent(value)}%`);

    const marker = document.createElement('span');
    marker.className = 'range-marker';
    track.appendChild(marker);

    const label = document.createElement('span');
    label.className = 'range-label';
    label.textContent = `${this._t('target')}: ${range.label}`;

    meter.appendChild(track);
    meter.appendChild(label);
    return meter;
  }

  _getStatusTooltip(fieldKey, rawValue, range, status) {
    const label = this._t(fieldKey);
    const value = this._normalizeValue(rawValue);
    if (status === 'unknown') {
      return this._t('unknown', { label });
    }
    const direction = value < range.min ? 'below' : value > range.max ? 'above' : 'within';
    return this._t(direction, { label, range: range.label });
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
      const phNote = ph ? this._t('also_ph') : '';
      return this.config.guidance?.free_chlorine?.low
        || `${this._t('chlorine_low')}${phNote}`;
    }
    if (ph) {
      const direction = ph.value < ph.range.min ? 'low' : 'high';
      return this.config.guidance?.ph?.[direction] || this._t(`ph_${direction}`);
    }

    const priority = ['orp', 'salinity', 'tds', 'ec', 'temperature'];
    const next = priority.find((key) => byKey[key]) || warnings[0];
    const direction = next.value < next.range.min ? 'low' : 'high';
    const guidanceKey = next.key === 'free_chlorine'
      ? `chlorine_${direction}`
      : `${next.key}_${direction}`;
    return this.config.guidance?.[next.key]?.[direction]
      || this._t(guidanceKey);
  }

  _getGrade() {
    const primaryKeys = this.config.grading.primary.filter((key) => this.config[key]);
    if (!primaryKeys.includes('ph') || !primaryKeys.includes('free_chlorine')) {
      return { value: '—', reason: this._t('grade_missing') };
    }

    const primary = primaryKeys.map((key) => this._getMeasurementStatus(key));
    if (primary.some((measurement) => measurement.status === 'unknown')) {
      return { value: '—', reason: this._t('grade_waiting') };
    }

    const chlorine = primary.find((measurement) => measurement.key === 'free_chlorine');
    if (chlorine.value < chlorine.range.min) {
      return { value: 'F', reason: this._t('grade_chlorine_low') };
    }

    const critical = primary.find((measurement) => {
      const range = this._getConfiguredRange(this.config.grading.critical_ranges[measurement.key]);
      return range && (measurement.value < range.min || measurement.value > range.max);
    });
    if (critical) {
      return { value: 'F', reason: this._t('grade_critical', { label: this._t(critical.key) }) };
    }

    const primaryWarnings = primary.filter((measurement) => measurement.status === 'warning').length;
    if (primaryWarnings > 1) {
      return { value: 'D', reason: this._t('grade_multiple') };
    }
    if (primaryWarnings === 1) {
      return { value: 'C', reason: this._t('grade_one') };
    }

    const supportingWarnings = this._fields
      .filter((field) => !primaryKeys.includes(field.key))
      .map((field) => this._getMeasurementStatus(field.key))
      .filter((measurement) => measurement.status === 'warning');
    if (supportingWarnings.length) {
      return { value: 'B', reason: this._t('grade_support') };
    }
    return { value: 'A', reason: this._t('grade_all') };
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
    this._config = { language: 'en', ...(config.entities || {}), ...config };
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
    form.schema = EDITOR_FIELDS.map((name) => ({
      name,
      selector: name === 'title'
        ? { text: {} }
        : name === 'language' ? { select: { options: LANGUAGE_OPTIONS } } : { entity: {} },
    }));
    form.computeLabel = (schema) => translate(this._config.language || 'en', schema.name);
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

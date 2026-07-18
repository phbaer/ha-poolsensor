// Keep this cache-buster in sync whenever translations.js changes. Home
// Assistant refreshes the card resource independently from its submodules.
import { TRANSLATIONS, LANGUAGE_OPTIONS, translate } from './translations.js';
import uPlot from 'uplot';

const MEASUREMENTS = ['ph', 'free_chlorine', 'orp', 'temperature', 'salinity', 'tds', 'ec'];
const EQUIPMENT = [
  { key: 'filter', powerKey: 'filter_power', icon: 'mdi:air-filter' },
  { key: 'heating', powerKey: 'heating_power', icon: 'mdi:radiator' },
];
const AMBIENT_TEMPERATURE = 'ambient_temperature';
const HISTORY_FIELDS = ['show_history'];
const HISTORY_BUCKETS = 72;
const HISTORY_NORMALIZED_LIMIT = 3;
const HISTORY_LIMITS = {
  temperature: { min: 16, max: 35 },
  ambient_temperature: { min: 16, max: 40 },
  ph: { min: 5.5, max: 9.5 },
  free_chlorine: { min: 0, max: 10 },
};
const EDITOR_FIELDS = ['title', 'language', ...MEASUREMENTS, AMBIENT_TEMPERATURE, ...HISTORY_FIELDS, ...EQUIPMENT.flatMap(({ key, powerKey }) => [key, powerKey])];
const QUALITY_LABELS = { en: 'Quality', de: 'Qualität', fr: 'Qualité', it: 'Qualità', es: 'Calidad' };


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
    this._plotResizers = [];
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
      [AMBIENT_TEMPERATURE]: config[AMBIENT_TEMPERATURE] || entities[AMBIENT_TEMPERATURE],
      show_history: config.show_history !== false,
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
    this._loadHistory();
  }

  _t(key, values) {
    return translate(this.config.language, key, values);
  }

  getCardSize() {
    return 1 + (this._fields?.length || 0);
  }

  set hass(hass) {
    this._hass = hass;
    this._loadHistory();
    this.render();
  }

  render() {
    if (!this._hass) {
      return;
    }

    this._plots?.forEach((plot) => plot.destroy());
    this._plotResizers.forEach((observer) => observer.disconnect());
    this._plots = [];
    this._plotResizers = [];
    this._pendingCharts = [];

    this._fields = MEASUREMENTS
      .map((key) => ({ key, label: this._t(key), entity: this.config[key] }))
      .filter((item) => item.entity);

    const card = document.createElement('ha-card');
    card.className = 'poolsensor-card';

    const style = document.createElement('style');
    style.textContent = `
      .card-header { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 10px 14px 4px; }
      .card-title { color: var(--primary-text-color); font-size: 1.1em; font-weight: 500; }
      .header-actions, .equipment-badges { display: flex; align-items: center; justify-content: flex-end; flex-wrap: wrap; gap: 6px; }
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
      hui-entity-badge { cursor: help; }
      .range-meter { grid-column: 1 / -1; display: block; }
      .range-track { position: relative; width: 100%; height: 6px; border-radius: 99px; background: linear-gradient(to right, color-mix(in srgb, var(--error-color) 46%, transparent) 0%, color-mix(in srgb, var(--error-color) 34%, var(--success-color)) var(--good-start), color-mix(in srgb, var(--success-color) 38%, transparent) var(--good-middle), color-mix(in srgb, var(--error-color) 34%, var(--success-color)) var(--good-end), color-mix(in srgb, var(--error-color) 46%, transparent) 100%); }
      .range-marker { position: absolute; top: 50%; left: var(--marker-position); width: 10px; height: 10px; border: 2px solid var(--card-background-color); border-radius: 50%; background: var(--primary-text-color); box-sizing: border-box; transform: translate(-50%, -50%); }
      .range-marker-offscale { width: auto; height: auto; border: 0; border-radius: 0; background: transparent; color: var(--warning-color); font-size: 1.35em; font-weight: 700; line-height: 1; }
      .range-label { display: block; margin-top: 2px; color: var(--secondary-text-color); font-size: 0.78em; text-align: right; }
      .ambient-context { color: var(--secondary-text-color); font-size: 0.78em; font-weight: 400; white-space: nowrap; }
      .history-section { margin: 0 0 10px; }
      .history-heading { margin: 4px 0 5px; padding: 0 14px; color: var(--primary-text-color); font-size: 0.86em; font-weight: 500; }
      .history-chart { margin-top: 6px; }
      .history-chart:first-of-type { margin-top: 0; }
      .history-chart-label { display: flex; justify-content: space-between; margin-bottom: 2px; padding: 0 14px; color: var(--secondary-text-color); font-size: 0.75em; }
      .history-legend { display: flex; flex-wrap: wrap; gap: 8px; }
      .history-legend-item { display: inline-flex; align-items: center; gap: 4px; }
      .history-swatch { width: 14px; height: 0; border-top: 2px solid currentColor; }
      .history-swatch.history-water { color: var(--primary-color); }
      .history-swatch.history-ambient { color: var(--secondary-text-color); border-top-style: dashed; }
      .history-swatch.history-ph { color: var(--info-color, var(--primary-color)); }
      .history-swatch.history-chlorine { color: var(--warning-color); }
      .history-chart svg { display: block; width: 100%; height: 58px; overflow: visible; }
      .history-plot { position: relative; width: 100%; min-height: 150px; overflow: hidden; }
      .uplot, .uplot * { box-sizing: border-box; }
      .uplot { font-family: var(--paper-font-body1_-_font-family, sans-serif); font-size: .75em; }
      .u-wrap, .u-over, .u-under { position: absolute; }
      .u-wrap { position: relative; user-select: none; }
      .u-over, .u-under { position: absolute; }
      .uplot canvas { display: block; }
      .u-axis { position: absolute; color: var(--secondary-text-color); }
      .u-cursor-x { position: absolute; top: 0; height: 100%; border-left: 1px dashed var(--secondary-text-color); pointer-events: none; }
      .history-tooltip { position: absolute; z-index: 2; top: 4px; right: 4px; max-width: calc(100% - 8px); padding: 3px 5px; border-radius: 4px; background: color-mix(in srgb, var(--card-background-color) 92%, transparent); color: var(--primary-text-color); font-size: .72em; pointer-events: none; }
      .history-grid { stroke: var(--divider-color); stroke-width: 1; opacity: .7; }
      .history-target { fill: var(--success-color); opacity: .14; }
      .history-water { fill: none; stroke: var(--primary-color); stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
      .history-ambient { fill: none; stroke: var(--secondary-text-color); stroke-width: 1.5; stroke-linecap: round; stroke-linejoin: round; stroke-dasharray: 3 2; }
      .history-ph { fill: none; stroke: var(--info-color, var(--primary-color)); stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
      .history-chlorine { fill: none; stroke: var(--warning-color); stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
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
      if (field.key === 'temperature') {
        const ambient = this._createAmbientContext();
        if (ambient) {
          valueWrap.append(' · ', ambient);
        }
      }

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

    const actions = document.createElement('div');
    actions.className = 'header-actions';
    const equipmentChips = this._createEquipmentChips();
    if (equipmentChips) {
      actions.appendChild(equipmentChips);
    }

    if (this.config.grading.enabled) {
      const grade = this._getGrade();
      actions.appendChild(this._createEntityBadge({
        id: 'sensor.poolsensor_water_quality',
        label: QUALITY_LABELS[this.config.language] || QUALITY_LABELS.en,
        value: grade.value,
        icon: 'mdi:flask',
        color: this._getGradeColor(grade.value),
        tooltip: `${grade.value}: ${grade.reason}`,
      }));
    }

    header.appendChild(actions);
    card.appendChild(header);
    card.appendChild(content);

    const history = this._createHistoryCharts();
    if (history) {
      card.appendChild(history);
    }

    const overallGuidance = this._getOverallGuidance();
    if (overallGuidance) {
      const guidance = document.createElement('div');
      guidance.className = 'overall-guidance';
      guidance.textContent = `${this._t('recommendation')}: ${overallGuidance}`;
      card.appendChild(guidance);
    }

    queueMicrotask(() => this._renderHistoryCharts());

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

  _createEquipmentChips() {
    const configured = EQUIPMENT.filter(({ key, powerKey }) => this.config[key] || this.config[powerKey]);
    if (!configured.length) {
      return null;
    }

    const chips = document.createElement('div');
    chips.className = 'equipment-badges';
    configured.forEach(({ key, powerKey, icon }) => {
      let active = false;
      let unavailable = !this.config[key];

      if (this.config[key]) {
        const state = this._getState(this.config[key]);
        unavailable = !state || ['unknown', 'unavailable'].includes(String(state.state).toLowerCase());
        active = this._isActive(state?.state);
      }

      let powerText = '';
      if (this.config[powerKey]) {
        const powerState = this._getState(this.config[powerKey]);
        powerText = this._formatPower(powerState);
      }
      const stateText = unavailable ? '—' : this._t(active ? 'on' : 'off');
      const value = powerText || stateText;
      const tooltip = powerText ? `${this._t(key)}: ${stateText}, ${powerText}` : `${this._t(key)}: ${stateText}`;
      chips.appendChild(this._createEntityBadge({
        id: `sensor.poolsensor_${key}_status`,
        label: this._t(key),
        value,
        icon,
        color: unavailable ? 'var(--disabled-text-color)' : active ? 'var(--success-color)' : 'var(--secondary-text-color)',
        tooltip,
        detailsEntity: this.config[key] || this.config[powerKey],
      }));
    });
    return chips;
  }

  _isActive(value) {
    return ['on', 'open', 'active', 'running', 'true', '1'].includes(String(value).toLowerCase());
  }

  _formatPower(state) {
    const value = this._normalizeValue(this._getValue(state));
    if (value === null) {
      return '—';
    }
    const unit = String(state?.attributes?.unit_of_measurement || 'W').toLowerCase();
    const multipliers = { w: 1, kw: 1000, mw: 1000000 };
    const watts = value * (multipliers[unit] || 1);
    return `${watts.toFixed(1)} W`;
  }

  _createEntityBadge({ id, label, value, icon, color, tooltip, detailsEntity }) {
    const badge = document.createElement('hui-entity-badge');
    const now = new Date().toISOString();
    const state = {
      entity_id: id,
      state: String(value),
      attributes: { friendly_name: label, icon },
      last_changed: now,
      last_updated: now,
      context: {},
    };

    // Entity badges read their value from hass.states. Supply a private,
    // display-only entity so a badge can combine a switch state and its power.
    badge.hass = { ...this._hass, states: { ...this._hass.states, [id]: state } };
    badge.setConfig({
      type: 'entity',
      entity: id,
      name: label,
      icon,
      color,
      show_name: true,
      show_state: true,
      show_icon: true,
      tap_action: { action: 'none' },
      hold_action: { action: 'none' },
      double_tap_action: { action: 'none' },
    });
    const description = detailsEntity ? `${tooltip}. ${this._t('open_details')}` : tooltip;
    badge.title = description;
    badge.setAttribute('aria-label', description);
    if (detailsEntity) {
      badge.style.cursor = 'pointer';
      badge.setAttribute('role', 'button');
      badge.setAttribute('tabindex', '0');
      const openDetails = () => this._openMoreInfo(detailsEntity);
      badge.addEventListener('click', openDetails);
      badge.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          openDetails();
        }
      });
    }
    return badge;
  }

  _openMoreInfo(entityId) {
    this.dispatchEvent(new CustomEvent('hass-more-info', {
      detail: { entityId },
      bubbles: true,
      composed: true,
    }));
  }

  _getGradeColor(grade) {
    if (['A', 'B'].includes(grade)) {
      return 'var(--success-color)';
    }
    if (['C', 'D'].includes(grade)) {
      return 'var(--warning-color)';
    }
    if (grade === 'F') {
      return 'var(--error-color)';
    }
    return 'var(--disabled-text-color)';
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

    const targetHalfSpan = (range.max - range.min) / 2;
    const targetMidpoint = (range.min + range.max) / 2;
    // All bars share this relative scale: the target occupies 40–60%, and
    // every 10% beyond it represents one additional target half-range.
    const normalized = (value - targetMidpoint) / targetHalfSpan;
    const rawPosition = 50 + (normalized * 10);
    const isOffScale = rawPosition < 0 || rawPosition > 100;
    const markerPosition = Math.max(0, Math.min(100, rawPosition));

    const meter = document.createElement('div');
    meter.className = 'range-meter';

    const track = document.createElement('div');
    track.className = 'range-track';
    track.title = `${this._t('target')}: ${range.label}`;
    track.setAttribute('aria-label', track.title);
    track.style.setProperty('--good-start', '40%');
    track.style.setProperty('--good-end', '60%');
    track.style.setProperty('--good-middle', '50%');
    track.style.setProperty('--marker-position', `${markerPosition}%`);

    const marker = document.createElement('span');
    marker.className = isOffScale ? 'range-marker range-marker-offscale' : 'range-marker';
    if (isOffScale) {
      marker.textContent = rawPosition < 0 ? '←' : '→';
    }
    track.appendChild(marker);

    const label = document.createElement('span');
    label.className = 'range-label';
    label.textContent = `${this._t('target')}: ${range.label}`;

    meter.appendChild(track);
    meter.appendChild(label);
    return meter;
  }

  _loadHistory() {
    if (!this._hass || !this.config?.show_history || typeof this._hass.callApi !== 'function') {
      return;
    }
    const entities = [this.config.temperature, this.config[AMBIENT_TEMPERATURE], this.config.ph, this.config.free_chlorine]
      .filter(Boolean);
    if (!entities.length) {
      return;
    }

    const bucket = Math.floor(Date.now() / (15 * 60 * 1000));
    const key = `${bucket}:${entities.join(',')}`;
    if (this._historyKey === key || this._historyLoadingKey === key) {
      return;
    }
    this._historyLoadingKey = key;
    const end = new Date();
    const start = new Date(end.getTime() - (24 * 60 * 60 * 1000));
    const query = new URLSearchParams({
      filter_entity_id: entities.join(','),
      end_time: end.toISOString(),
      minimal_response: '',
      no_attributes: '',
    });
    const path = `history/period/${start.toISOString()}?${query}`;

    this._hass.callApi('GET', path).then((result) => {
      if (this._historyLoadingKey !== key) {
        return;
      }
      this._historyKey = key;
      this._historyWindow = { start: start.getTime(), end: end.getTime() };
      this._historyData = Object.fromEntries(entities.map((entity, index) => [entity, result[index] || []]));
      this._historyLoadingKey = undefined;
      this.render();
    }).catch(() => {
      if (this._historyLoadingKey === key) {
        // Avoid retrying on every state update when Recorder is disabled or
        // the current user is not permitted to read history.
        this._historyKey = key;
        this._historyLoadingKey = undefined;
      }
    });
  }

  _createHistoryCharts() {
    if (!this.config.show_history || !this._historyData || !this._historyWindow) {
      return null;
    }
    const section = document.createElement('div');
    section.className = 'history-section';
    const heading = document.createElement('div');
    heading.className = 'history-heading';
    heading.textContent = this._t('history_24h');
    section.appendChild(heading);

    const temperatureSeries = [
      { entity: this.config.temperature, key: 'temperature', className: 'history-water', label: this._t('temperature') },
      { entity: this.config[AMBIENT_TEMPERATURE], key: AMBIENT_TEMPERATURE, className: 'history-ambient', label: this._t(AMBIENT_TEMPERATURE) },
    ].map((series) => ({ ...series, points: this._getHistoryPoints(series.entity, HISTORY_LIMITS[series.key]) }))
      .filter((series) => series.points.length);
    if (temperatureSeries.length) {
      const unit = this._getState(this.config.temperature)?.attributes?.unit_of_measurement
        || this._getState(this.config[AMBIENT_TEMPERATURE])?.attributes?.unit_of_measurement
        || '°C';
      section.appendChild(this._createHistoryChart({
        label: temperatureSeries.map((series) => series.label).join(' · '),
        detail: unit,
        series: temperatureSeries,
        yRange: this._getHistoryScale(temperatureSeries.flatMap((series) => series.points.map((point) => point.median)), { min: 16, max: 45, minimumSpan: 4 }),
      }));
    }

    const qualitySeries = ['ph', 'free_chlorine'].map((key) => {
      const range = this._getRange(key);
      const midpoint = range ? (range.min + range.max) / 2 : null;
      const halfSpan = range ? (range.max - range.min) / 2 : null;
      return {
        key,
        className: key === 'ph' ? 'history-ph' : 'history-chlorine',
        label: this._t(key),
        points: this._getHistoryPoints(this.config[key], HISTORY_LIMITS[key]),
        range,
        midpoint,
        halfSpan,
      };
    }).filter((series) => series.range && series.points.length);
    if (qualitySeries.length) {
      section.appendChild(this._createHistoryChart({
        label: qualitySeries.map((series) => series.label).join(' · '),
        detail: this._t('normalized_target'),
        series: qualitySeries.map((series) => ({
          ...series,
          points: series.points.map((point) => this._normalizeHistoryPoint(point, series)),
        })),
        target: true,
        yRange: [-HISTORY_NORMALIZED_LIMIT, HISTORY_NORMALIZED_LIMIT],
      }));
    }
    return section.children.length > 1 ? section : null;
  }

  _getHistoryPoints(entity, limits) {
    if (!entity) {
      return [];
    }
    const readings = (this._historyData?.[entity] || []).map((state) => ({
      time: new Date(state.last_changed || state.last_updated).getTime(),
      value: this._normalizeValue(state.state),
    })).filter((point) => Number.isFinite(point.time) && point.value !== null
      && (!limits || (point.value >= limits.min && point.value <= limits.max)))
      .sort((a, b) => a.time - b.time);
    if (!readings.length) {
      return [];
    }

    // Use the same number of evenly spaced points for every entity. A bucket
    // mean smooths high-frequency sensors while the last known value carries
    // sparse readings forward, yielding calm, directly comparable 24 h lines.
    const { start, end } = this._historyWindow;
    const bucketSize = (end - start) / HISTORY_BUCKETS;
    let readingIndex = 0;
    let lastValue = readings[0].value;
    return Array.from({ length: HISTORY_BUCKETS + 1 }, (_, bucket) => {
      const bucketEnd = start + (bucket * bucketSize);
      const values = [];
      while (readingIndex < readings.length && readings[readingIndex].time <= bucketEnd) {
        lastValue = readings[readingIndex].value;
        values.push(lastValue);
        readingIndex += 1;
      }
      let min = lastValue;
      let max = lastValue;
      let median = lastValue;
      if (values.length) {
        const sorted = [...values].sort((a, b) => a - b);
        min = sorted[0];
        max = sorted[sorted.length - 1];
        const middle = Math.floor(sorted.length / 2);
        median = sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
        lastValue = median;
      }
      return { time: bucketEnd, value: lastValue, min, max, median };
    });
  }

  _normalizeHistoryPoint(point, series) {
    const normalize = (value) => (value - series.midpoint) / series.halfSpan;
    const median = normalize(point.median);
    const isVisible = Math.abs(median) <= HISTORY_NORMALIZED_LIMIT;
    const min = normalize(point.min);
    const max = normalize(point.max);
    return {
      ...point,
      rawMin: point.min,
      rawMax: point.max,
      rawMedian: point.median,
      // A single bad probe reading must not inflate the min/max envelope or
      // flatten the rest of the chart. Keep the bucket median and discard
      // only the outlying edge of its envelope.
      min: !isVisible ? null : Math.abs(min) <= HISTORY_NORMALIZED_LIMIT ? min : median,
      max: !isVisible ? null : Math.abs(max) <= HISTORY_NORMALIZED_LIMIT ? max : median,
      median: isVisible ? median : null,
      value: isVisible ? median : null,
      normalized: median,
    };
  }

  _getHistoryScale(values, { min, max, minimumSpan }) {
    const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
    if (!sorted.length) {
      return [min, max];
    }
    const percentile = (fraction) => sorted[Math.round((sorted.length - 1) * fraction)];
    const lower = percentile(0.05);
    const upper = percentile(0.95);
    const span = Math.max(minimumSpan, upper - lower);
    const padding = Math.max(0.5, span * 0.15);
    const scaleMin = Math.max(min, lower - padding);
    const scaleMax = Math.min(max, upper + padding);
    return scaleMax - scaleMin >= minimumSpan ? [scaleMin, scaleMax] : [
      Math.max(min, scaleMin - ((minimumSpan - (scaleMax - scaleMin)) / 2)),
      Math.min(max, scaleMax + ((minimumSpan - (scaleMax - scaleMin)) / 2)),
    ];
  }

  _createHistoryChart({ label, detail, series, target = false, yRange }) {
    const chart = document.createElement('div');
    chart.className = 'history-chart';
    const caption = document.createElement('div');
    caption.className = 'history-chart-label';
    const legend = document.createElement('span');
    legend.className = 'history-legend';
    series.forEach((item) => {
      const legendItem = document.createElement('span');
      legendItem.className = 'history-legend-item';
      const swatch = document.createElement('span');
      swatch.className = `history-swatch ${item.className}`;
      const text = document.createElement('span');
      text.textContent = item.label;
      legendItem.append(swatch, text);
      legend.appendChild(legendItem);
    });
    const detailLabel = document.createElement('span');
    detailLabel.textContent = detail;
    caption.append(legend, detailLabel);
    const plot = document.createElement('div');
    plot.className = 'history-plot';
    plot.setAttribute('role', 'img');
    plot.setAttribute('aria-label', `${label}, ${this._t('history_24h')}`);
    const tooltip = document.createElement('div');
    tooltip.className = 'history-tooltip';
    tooltip.hidden = true;
    plot.appendChild(tooltip);
    this._pendingCharts.push({ plot, tooltip, series, detail, target, yRange });
    chart.append(caption, plot);
    return chart;
  }

  _renderHistoryCharts() {
    if (!uPlot || !this._pendingCharts?.length) {
      return;
    }
    const palette = getComputedStyle(this);
    const colors = {
      'history-water': palette.getPropertyValue('--primary-color').trim(),
      'history-ambient': palette.getPropertyValue('--secondary-text-color').trim(),
      'history-ph': palette.getPropertyValue('--info-color').trim() || palette.getPropertyValue('--primary-color').trim(),
      'history-chlorine': palette.getPropertyValue('--warning-color').trim(),
    };
    this._pendingCharts.forEach(({ plot, tooltip, series, detail, target, yRange }) => {
      const data = [series[0].points.map((point) => point.time / 1000)];
      const plotSeries = [{}];
      if (target) {
        data.push(data[0].map(() => -1), data[0].map(() => 1));
        plotSeries.push({ label: '', band: true, stroke: 'transparent', fill: 'rgba(76, 175, 80, .14)', show: true }, { label: '', band: true, stroke: 'transparent', fill: 'rgba(76, 175, 80, .14)', show: true });
      }
      const tooltipRows = [];
      series.forEach((item) => {
        const color = colors[item.className] || palette.getPropertyValue('--primary-color').trim();
        data.push(item.points.map((point) => point.min ?? point.value));
        data.push(item.points.map((point) => point.max ?? point.value));
        data.push(item.points.map((point) => point.median ?? point.value));
        plotSeries.push(
          { label: `${item.label} min`, band: true, stroke: 'transparent', fill: this._transparentColor(color), points: { show: false }, show: true },
          { label: `${item.label} max`, band: true, stroke: 'transparent', fill: this._transparentColor(color), points: { show: false }, show: true },
          {
            label: item.label,
            stroke: color,
            width: 2,
            dash: item.className === 'history-ambient' ? [4, 3] : [],
            points: { show: false },
            spanGaps: false,
            value: (_, value) => value == null ? '' : value.toFixed(2),
          },
        );
        tooltipRows.push(item);
      });
      const options = {
        width: Math.max(1, Math.floor(plot.getBoundingClientRect().width)),
        height: 150,
        pxAlign: true,
        legend: { show: false },
        cursor: { points: { show: false } },
        series: plotSeries,
        scales: { y: { range: yRange } },
        axes: [
          { stroke: palette.getPropertyValue('--secondary-text-color').trim(), grid: { stroke: palette.getPropertyValue('--divider-color').trim() } },
          { stroke: palette.getPropertyValue('--secondary-text-color').trim(), grid: { stroke: palette.getPropertyValue('--divider-color').trim() } },
        ],
        hooks: { setCursor: [(u) => {
          const index = u.cursor.idx;
          if (index == null || index < 0) { tooltip.hidden = true; return; }
          const when = new Date(data[0][index] * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          tooltip.textContent = `${when} · ${tooltipRows.map((item) => {
            const point = item.points[index];
            const median = target ? point.rawMedian : point.median;
            const min = target ? point.rawMin : point.min;
            const max = target ? point.rawMax : point.max;
            return `${item.label}: ${median.toFixed(2)} (${min.toFixed(2)}–${max.toFixed(2)})`;
          }).join(' · ')}`;
          tooltip.hidden = false;
        }] },
      };
      const chart = new uPlot(options, data, plot);
      this._plots.push(chart);
      const observer = new ResizeObserver(([entry]) => {
        const width = Math.max(1, Math.floor(entry.contentRect.width));
        if (width !== chart.width) {
          chart.setSize({ width, height: chart.height });
        }
      });
      observer.observe(plot);
      this._plotResizers.push(observer);
    });
    this._pendingCharts = [];
  }

  _transparentColor(color, alpha = 0.16) {
    const hex = color.trim();
    if (/^#[0-9a-f]{6}$/i.test(hex)) {
      const value = Number.parseInt(hex.slice(1), 16);
      return `rgba(${value >> 16}, ${(value >> 8) & 255}, ${value & 255}, ${alpha})`;
    }
    const match = hex.match(/^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/i);
    return match ? `rgba(${match[1]}, ${match[2]}, ${match[3]}, ${alpha})` : `rgba(128, 128, 128, ${alpha})`;
  }

  _createAmbientContext() {
    const state = this._getState(this.config[AMBIENT_TEMPERATURE]);
    const ambient = this._normalizeValue(this._getValue(state));
    if (ambient === null) {
      return null;
    }

    const context = document.createElement('span');
    context.className = 'ambient-context';
    const ambientValue = this._formatValue(ambient, state);
    const water = this._normalizeValue(this._getValue(this._getState(this.config.temperature)));
    if (water === null) {
      context.textContent = `${this._t(AMBIENT_TEMPERATURE)}: ${ambientValue}`;
      return context;
    }

    const delta = water - ambient;
    const sign = delta > 0 ? '+' : '';
    const unit = this._getState(this.config.temperature)?.attributes?.unit_of_measurement
      || state?.attributes?.unit_of_measurement
      || '°C';
    context.textContent = `${this._t(AMBIENT_TEMPERATURE)}: ${ambientValue} · ${this._t('water_air_delta')}: ${sign}${delta.toFixed(1)} ${unit}`;
    return context;
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
    if (this._form) {
      this._form.data = this._config;
      return;
    }
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
    if (this._form) {
      this._form.hass = hass;
      return;
    }
    this._render();
  }

  _render() {
    if (!this._config || !this._hass) {
      return;
    }

    const form = document.createElement('ha-form');
    this._form = form;
    form.hass = this._hass;
    form.data = this._config;
    form.schema = EDITOR_FIELDS.map((name) => ({
      name,
      selector: name === 'title'
        ? { text: {} }
        : name === 'language' ? { select: { options: LANGUAGE_OPTIONS } }
          : name === 'show_history' ? { boolean: {} } : { entity: {} },
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
